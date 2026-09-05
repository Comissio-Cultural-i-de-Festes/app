-- L'acta no s'esborra per tornar a tancar la reunió.
--
-- EL QUE PASSAVA, i s'ha reproduït sencer. La pantalla de tancar no llegia mai
-- l'acta desada: el textarea tornava en blanc. Si algú hi entrava a corregir
-- una assistència —que és el que la mateixa pantalla convida a fer, «es pot
-- tornar a obrir mentre no acabi el trimestre»— i premia «Tanca-la», el client
-- no enviava `p_acta`, aquí arribava el DEFAULT NULL, i
--
--   on conflict (event_id) do update set acta = excluded.acta
--
-- deixava l'acta a NULL. Sense error, sense avís, i amb el registre dient-ho
-- massa tard: `close_meeting amb_acta=false` darrere de dos `amb_acta=true`.
--
-- Que dolgui depèn de qui la llegeix, i la llegeixen els socis: `events_public`
-- porta la columna i `Meeting.tsx` la pinta en tancar-se la reunió. O sigui que
-- el segon tancament esborrava l'acta de tothom.
--
-- LA REGLA, ARA, I SÓN TRES CASOS I NO DOS:
--
--   `p_acta` absent (NULL)  → no toquis l'acta que ja hi ha.
--   `p_acta` buida ('')     → esborra-la, que això sí que ho ha demanat algú.
--   `p_acta` amb text       → desa-la.
--
-- La diferència entre «no me l'has dita» i «me l'has dita buida» és tota la
-- correcció. Abans les dues acabaven a NULL pel `nullif`, i per això ometre el
-- paràmetre esborrava. Un client que no sàpiga res de l'acta —i qualsevol que
-- no sigui aquesta pantalla— ara no la pot perdre sense demanar-ho.
--
-- L'ALTRA MEITAT VA AL CLIENT i no serveix de res sense aquesta: la pantalla
-- carrega l'acta desada al textarea (ja la té, `fetchEvent` porta la columna) i
-- envia sempre `p_acta`. Amb només la meitat del client, qualsevol altre camí
-- cap a la RPC segueix esborrant; amb només aquesta, la junta segueix
-- reescrivint a cegues perquè no veu el que hi havia. Calen les dues.
--
-- I `amb_acta` del registre passa a dir si al final HI HA acta, no si n'han
-- enviat una. Era la línia que ho hauria explicat el dia que va passar.

create or replace function public.admin_close_meeting(
  p_event_id uuid,
  p_user_ids uuid[],
  p_acta text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_event  public.events%rowtype;
  v_punts  int := 0;
  v_gent   int := 0;
  v_acta   text;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'esdeveniment inexistent' using errcode = 'P0002';
  end if;
  if v_event.tipo <> 'reunio' then
    raise exception 'nomes es tanquen reunions' using errcode = '22023';
  end if;

  -- Qui hi era. `on conflict` perquè la majoria ja hi tindran una fila del
  -- «hi seré», i el que canvia és l'estat.
  insert into public.attendances (user_id, event_id, estado)
  select u, p_event_id, 'asistio'
    from unnest(coalesce(p_user_ids, '{}'::uuid[])) as u
  on conflict (user_id, event_id) do update set estado = 'asistio';

  -- I qui NO hi era torna a 'no', perquè tancar-la dues vegades amb una llista
  -- diferent ha de deixar l'estat que diu la segona: sense això, treure algú de
  -- la llista el deixaria comptant com a assistent.
  update public.attendances
     set estado = 'no'
   where event_id = p_event_id
     and estado = 'asistio'
     and not (user_id = any (coalesce(p_user_ids, '{}'::uuid[])));

  select count(*)::int into v_gent
    from public.attendances
   where event_id = p_event_id and estado = 'asistio';

  -- Els punts, només si la reunió és de tota la comi. Una de junta no en
  -- reparteix: vegeu la nota de dalt del fitxer.
  if v_event.abast = 'comi' and v_event.puntos > 0 then
    insert into public.points_log (user_id, event_id, motivo, puntos, granted_by)
    select u, p_event_id, 'asistencia', v_event.puntos, v_actor
      from unnest(coalesce(p_user_ids, '{}'::uuid[])) as u
    on conflict do nothing;

    select count(*)::int * v_event.puntos into v_punts
      from public.points_log
     where event_id = p_event_id and motivo = 'asistencia';
  end if;

  -- L'acta. Els tres casos de la nota de dalt: absent no toca res, buida
  -- esborra, amb text desa.
  insert into public.event_details as d (event_id, acta)
  values (p_event_id, nullif(btrim(coalesce(p_acta, '')), ''))
  on conflict (event_id) do update
     set acta = case when p_acta is null then d.acta
                     else nullif(btrim(p_acta), '') end
  returning d.acta into v_acta;

  update public.events set tancada_at = now() where id = p_event_id;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    v_actor,
    'close_meeting',
    p_event_id,
    jsonb_build_object(
      'abast', v_event.abast,
      'hi_eren', v_gent,
      'punts_per_persona', case when v_event.abast = 'comi' then v_event.puntos else 0 end,
      -- Si al final HI HA acta, no si n'han enviat una en aquesta passada.
      'amb_acta', v_acta is not null
    )
  );

  return jsonb_build_object('hi_eren', v_gent, 'punts', v_punts);
end $$;

revoke all on function public.admin_close_meeting(uuid, uuid[], text) from public, anon;
grant execute on function public.admin_close_meeting(uuid, uuid[], text) to authenticated;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
-- A supabase/rollbacks/62_l_acta_no_s_esborra_sola.sql, que torna a posar el
-- `set acta = excluded.acta` de sempre. Desfer-ho torna a deixar que tancar
-- dues vegades esborri l'acta.
