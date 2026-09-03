-- El registre deixa de parlar sol, i el cron deixa de créixer sense fre.
--
-- Dues coses que la migració 47 va deixar anar i que no es veuen fins que la
-- feina està engegada de debò a producció.
--
-- LA PRIMERA. `send_reveal_pushes` escrivia una línia a `audit_log` a cada
-- execució, dins o fora de si havia enviat res, i el job corre cada minut:
-- 1.440 files al dia amb `{"enviats": 0}`. Tres quarts d'hora després
-- d'engegar-lo, el soroll ja superava onze dies d'accions humanes de tot
-- l'històric.
--
-- Això no és estètica. `audit_log` és el que la junta mira per respondre qui
-- va fer què, i el que ha de poder respondre si algú pregunta què consta
-- d'ell —ho diu la capçalera de `src/features/junta/auditApi.ts`. La pantalla
-- no té filtre i pagina de quaranta en quaranta, així que la primera pàgina
-- eren quaranta línies de màquina; i `reveal_push` no té ni etiqueta a la
-- i18n, o sigui que sortien com «Ha passat una cosa: reveal_push». Amb la
-- retenció de vint-i-quatre mesos, res no se n'anava fins al 2028.
--
-- LA SEGONA. `cron.job_run_details` no té cap retenció —és una taula de
-- l'extensió, no nostra— i el mateix job la va omplint a raó de 1.440 files
-- al dia. El job de purga que ja hi és s'encarrega també d'això.
--
-- Les files que ja s'han acumulat no les esborra aquesta migració. Esborrar
-- d'una taula d'auditoria és una decisió del mantenidor i no d'un script.

CREATE OR REPLACE FUNCTION private.send_reveal_pushes()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_url    text;
  v_token  text;
  v_event  record;
  v_body   jsonb;
  v_sent   int := 0;
begin
  -- Els dos secrets. Si no hi són, no s'envia res i es diu: una funció
  -- programada que falla en silenci cada minut és pitjor que una que no hi és.
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'reveal_push_url';
  select decrypted_secret into v_token
    from vault.decrypted_secrets where name = 'reveal_push_token';

  if v_url is null or v_token is null then
    raise warning
      'reveal_push_url o reveal_push_token no son al vault: no s''envia cap avis';
    return 0;
  end if;

  -- Els que s'acaben de revelar i encara no s'han avisat. Amb una finestra:
  -- un esdeveniment revelat fa tres mesos que ningú no havia avisat no ha de
  -- disparar un avís el dia que això s'apliqui.
  for v_event in
    select e.id
      from public.events e
     where e.published
       and e.avisat_at is null
       and e.reveal_at is not null
       and e.reveal_at <= now()
       and e.reveal_at > now() - interval '2 days'
       and e.starts_at > now()
     order by e.reveal_at
     limit 20
     for update of e skip locked
  loop
    v_body := private.reveal_push_payload(v_event.id);

    -- Sense ningú a qui avisar no s'encua res, però es marca igualment: si no,
    -- el cron el tornaria a mirar cada minut per sempre.
    if jsonb_array_length(v_body -> 'subscripcions') > 0 then
      -- `net.http_post` i no `extensions.http_post`: pg_net posa les seves
      -- funcions a l'esquema `net` encara que l'extensió es creï en un altre,
      -- i amb `search_path = ''` cal qualificar-ho sencer.
      perform net.http_post(
        url := v_url,
        body := v_body,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-reveal-token', v_token
        )
      );
      v_sent := v_sent + 1;
    end if;

    -- A la mateixa transacció que l'encuada, i per tant al més una vegada.
    -- Vegeu la nota de dalt: un avís duplicat no el cobreix res.
    update public.events set avisat_at = now() where id = v_event.id;
  end loop;

  -- NOMÉS QUAN S'HA ENVIAT ALGUNA COSA. Aquesta línia era fora de tota
  -- condició, i el cron corre cada minut: 1.440 files al dia dient
  -- «enviats: 0». En tres quarts d'hora a producció ja n'hi havia més que
  -- accions humanes de tot l'històric, i el registre de la junta —que és
  -- l'eina per respondre «qui va nomenar aquell admin?» i què consta d'una
  -- persona concreta— sortia ple de files que no diuen res, sense filtre ni
  -- etiqueta i amb dos anys de retenció al davant.
  --
  -- Una fila per execució i no per esdeveniment, que és el que la de sota
  -- volia dir: el resum del que ha fet aquesta passada.
  if v_sent > 0 then
    insert into public.audit_log (actor_id, accio, detall)
    values (null, 'reveal_push', jsonb_build_object('enviats', v_sent));
  end if;

  return v_sent;
end $function$;

-- ── i el que el cron es guarda d'ell mateix ──────────────────────────────────
-- `cron.job_run_details` és de l'extensió i no en té cap retenció: hi queda
-- una fila per execució per sempre, i amb un job que corre cada minut són
-- 1.440 al dia. No té conseqüències visibles cap dia en concret, que és
-- exactament per què creix fins que un dia les té.
--
-- Va al job de purga que ja existeix en comptes de fer-ne un de nou: és la
-- mateixa feina —treure el que ja no serveix— i un job diari a les 4.30 ja hi
-- és. Set dies de detall de cron és molt més del que ningú mira mai; el que es
-- vol saber a llarg termini és què va passar, i això és a `audit_log`.
--
-- `pg_cron` guarda els seus registres a la base de dades on està instal·lat,
-- i esborrar-ne files antigues és el que la seva pròpia documentació recomana.
create or replace function private.purge_audit_log()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_deleted integer;
begin
  delete from public.audit_log
   where created_at < now() - interval '24 months';
  get diagnostics v_deleted = row_count;

  -- El detall de les execucions del cron, que no és auditoria de ningú.
  delete from cron.job_run_details
   where end_time < now() - interval '7 days';

  return v_deleted;
end $$;

comment on function private.purge_audit_log() is
  'Treu el que ja no serveix: audit_log passats vint-i-quatre mesos, i el '
  'detall d''execucions de pg_cron passada una setmana. El segon no es '
  'auditoria de ningu i el job que el genera corre cada minut.';
