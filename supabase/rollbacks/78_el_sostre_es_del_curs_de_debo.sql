-- Rollback de la migració 78. NO és a `migrations/` a posta: un fitxer aquí
-- dins el desfaria el mateix `db push` que acaba d'aplicar-lo.
--
-- Torna `avisa()` a la versió de la 73: el sostre del curs torna a comptar cada
-- fila de `points_log` pel seu propi `created_at`, i per tant retirar un avís
-- d'un curs anterior torna a obrir marge en aquest. Res més no canvia —cap
-- firma, cap grant, cap fila—, o sigui que això es pot aplicar sol i en
-- qualsevol moment.
--
-- ORDRE: NO DEPÈN DE RES I NO EN DESFÀ RES. La 78 és, ara mateix, l'última
-- migració que escriu `avisa()`, o sigui que el cos d'aquí no pot passar per
-- sobre de cap correcció posterior —que és el defecte que el rollback de la 76
-- va portar una temporada—. El `btrim` d'un sol argument de la nota és el que
-- la base té avui a `avisa()`: la 77 el va corregir a `award_points` i deixa
-- escrit que aquesta és una de les quatre que queden. Aquest fitxer no el pot
-- arreglar, perquè no el desfà ell. `tests/rollbacks-cos-al-dia.test.ts`
-- comprova les dues coses per a tot el directori.
--
-- QUÈ ÉS INDEPENDENT I QUÈ NO. La 82 llegeix la parella avís/retirada amb la
-- mateixa regla que aquesta migració, però des d'`admin_dashboard` i no des
-- d'`avisa()`: són dues funcions diferents i cap dels dos rollbacks no toca la
-- de l'altre. Es poden aplicar en qualsevol ordre, o un sol. El que sí que
-- passa és que, amb aquest aplicat i la 82 no, el sostre i el panell tornaran a
-- comptar els avisos de dues maneres diferents.
--
-- Les files ja escrites no es toquen ni es poden tocar: `points_log` és
-- append-only per disparador. El que desfà això és la regla cap endavant.

create or replace function public.avisa(
  p_user_id  uuid,
  p_tipus    text,
  p_nota     text,
  p_punts    int  default 0,
  p_event_id uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_id            uuid;
  v_gravetat      int;
  v_nota          text := btrim(coalesce(p_nota, ''));
  v_punts         int  := coalesce(p_punts, 0);
  v_punts_event   uuid;
  v_points_log_id uuid;
  v_sostre        int;
  v_ja            int;
  v_des_de        timestamptz;
  v_fins_a        timestamptz;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  if length(v_nota) = 0 then
    raise exception 'un avis sense motiu escrit no es un avis' using errcode = '22023';
  end if;
  if length(v_nota) > 500 then
    raise exception 'la nota es massa llarga' using errcode = '22023';
  end if;

  select t.gravetat into v_gravetat
    from public.avis_tipus t
   where t.clau = p_tipus and t.actiu;
  if not found then
    raise exception 'tipus d''avis desconegut' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.profiles p
     where p.id = p_user_id and p.estat in ('actiu', 'baixa')
  ) then
    raise exception 'aquesta persona no es de l''associacio' using errcode = '22023';
  end if;

  if v_punts > 0 then
    raise exception 'un avis no dona punts' using errcode = '22023';
  end if;
  if abs(v_punts) > 500 then
    raise exception 'punts fora de rang' using errcode = '22023';
  end if;

  if v_punts < 0 then
    select pv.punts into v_sostre
      from public.point_values pv
     where pv.mena = 'avisos' and pv.clau = 'sostre_curs';

    if coalesce(v_sostre, 0) > 0 then
      select pc.des_de, pc.fins_a into v_des_de, v_fins_a from private.periode_curs() pc;

      select coalesce(sum(pl.puntos), 0)::int into v_ja
        from public.points_log pl
       where pl.user_id = p_user_id
         and pl.motivo in ('avis', 'avis_retirat')
         and (v_des_de is null or pl.created_at >= v_des_de)
         and (v_fins_a is null or pl.created_at <  v_fins_a);

      if abs(v_ja + v_punts) > v_sostre then
        raise exception 'sostre de punts del curs' using errcode = '22023';
      end if;
    end if;
  end if;

  if v_punts <> 0 then
    v_punts_event := p_event_id;
    if v_punts_event is not null and exists (
      select 1 from public.events e where e.id = v_punts_event and e.abast = 'junta'
    ) then
      v_punts_event := null;
    end if;

    insert into public.points_log (user_id, event_id, motivo, puntos, nota, granted_by)
    values (p_user_id, v_punts_event, 'avis', v_punts, v_nota, (select auth.uid()))
    returning id into v_points_log_id;
  end if;

  insert into public.avisos (user_id, tipus, gravetat, nota, event_id, points_log_id, created_by)
  values (p_user_id, p_tipus, v_gravetat, v_nota, p_event_id, v_points_log_id, (select auth.uid()))
  returning id into v_id;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    (select auth.uid()),
    'avis',
    p_user_id,
    jsonb_build_object(
      'avis', v_id, 'tipus', p_tipus, 'gravetat', v_gravetat,
      'punts', v_punts, 'esdeveniment', p_event_id
    )
  );

  return v_id;
end $fn$;

comment on function public.avisa(uuid, text, text, int, uuid) is
  'Registra un avis i, si en resta, la fila de punts que el paga. La nota es '
  'obligatoria. Copia la gravetat del cataleg en comptes de resoldre-la per '
  'join, i respecta el sostre de punts del curs. L''avis es queda amb '
  'l''esdeveniment on va passar encara que la fila de punts no hi pugui anar.';

alter function public.avisa(uuid, text, text, int, uuid) owner to postgres;
revoke all on function public.avisa(uuid, text, text, int, uuid) from public, anon;
grant execute on function public.avisa(uuid, text, text, int, uuid) to authenticated;
