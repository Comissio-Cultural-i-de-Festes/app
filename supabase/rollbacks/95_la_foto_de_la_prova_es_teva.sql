-- Rollback de la migració 95. NO és a `migrations/` a posta: un fitxer aquí
-- dins el desfaria el mateix `db push` que acaba d'aplicar-lo.
--
-- Torna `submit_prova` a la de la migració 40, que desa el camí tal com arriba.
-- La signatura no ha canviat, o sigui que un `create or replace` n'hi ha prou i
-- el client no ho nota: amb aquest fitxer aplicat, la pista `prova_foto` no
-- surt mai i la frase que la tradueix es queda sense fer servir.
--
-- QUÈ TORNA A OBRIR: un soci pot tornar a enviar una prova amb el camí d'una
-- foto d'un altre o d'una altra prova, i la junta la veu i la pot validar. Les
-- files que la 95 va deixar entrar són bones amb totes dues versions.

create or replace function public.submit_prova(
  p_prova_id uuid,
  p_path text,
  p_client_request_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me      uuid := (select auth.uid());
  v_prova   public.gimcana_proves%rowtype;
  v_team    uuid;
  v_estat   text;
begin
  if not private.is_active_member() then
    raise exception 'nomes socis' using errcode = '42501';
  end if;

  select * into v_prova from public.gimcana_proves where id = p_prova_id;
  if not found then
    return jsonb_build_object('estat', 'no_hi_es');
  end if;

  if not private.gimcana_is_open(v_prova.gimcana_id) then
    return jsonb_build_object('estat', 'tancada');
  end if;

  -- La xarxa de seguretat del mode lliure: qui envia sense haver triat cau al
  -- més petit en comptes de rebre un error que no sap arreglar.
  v_team := private.gimcana_join_smallest(v_prova.gimcana_id, v_me);
  if v_team is null then
    return jsonb_build_object('estat', 'sense_equip');
  end if;

  perform pg_advisory_xact_lock(hashtext('prova:' || p_prova_id::text));

  -- Reenviar la mateixa cua no ha de fer dues files.
  if p_client_request_id is not null and exists (
    select 1 from public.gimcana_enviaments where client_request_id = p_client_request_id
  ) then
    return jsonb_build_object('estat', 'ja_enviada');
  end if;

  select s.estat into v_estat
  from public.gimcana_enviaments s
  where s.prova_id = p_prova_id and s.equip_id = v_team and s.estat in ('validada', 'pendent')
  limit 1;

  if v_estat = 'validada' then
    return jsonb_build_object('estat', 'ja_feta');
  end if;
  if v_estat = 'pendent' then
    return jsonb_build_object('estat', 'ja_enviada');
  end if;

  insert into public.gimcana_enviaments
    (prova_id, user_id, equip_id, path, client_request_id)
  values (p_prova_id, v_me, v_team, p_path, p_client_request_id);

  return jsonb_build_object('estat', 'enviada');
end;
$$;

alter function public.submit_prova(uuid, text, uuid) owner to postgres;
revoke all on function public.submit_prova(uuid, text, uuid) from public, anon;
grant execute on function public.submit_prova(uuid, text, uuid) to authenticated, service_role;
