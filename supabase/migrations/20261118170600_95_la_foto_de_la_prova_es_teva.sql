-- La foto d'una prova és de qui l'envia i d'aquella prova.
--
-- `submit_prova` (migració 40) desava `p_path` tal com arribava. La política
-- d'insert del bucket `gimcana-photos` obliga que la foto sigui a la carpeta
-- de qui la puja, però res no lligava aquella pujada amb l'enviament: amb la
-- consola del navegador, un soci podia enviar una prova amb el camí de la foto
-- d'un altre soci, o d'una altra prova seva, i la junta la veia i la validava.
--
-- ARA EL CAMÍ HA DE SER EXACTAMENT EL QUE FA EL CLIENT:
-- `<p_prova_id>/<auth.uid()>/<uuid>.jpg`, i la foto ha de ser al bucket. Tots
-- els formats que ha tingut mai `api.ts` són aquest —el camí no es desa a la
-- cua del mòbil, es torna a fer a cada intent amb la sessió d'aquell moment—,
-- o sigui que cap foto que esperi en una cua ara mateix es queda fora.
--
-- NO HI HAVIA MANERA SENSE MIGRACIÓ. La comprovació ha de viure on es decideix
-- si l'enviament compta, i això és aquesta funció; validar-ho al client no
-- serveix de res contra qui crida l'RPC a mà.
--
-- ═══ ON VA LA COMPROVACIÓ, I PER QUÈ ALLÀ ══════════════════════════════════
--
-- Just després de «nomes socis» i abans de tota la resta. No és per no
-- escriure res abans de refusar —un `raise` desfà també el que hagi escrit
-- `gimcana_join_smallest`—, sinó pel que contesta:
--
--   ABANS DE L'IDEMPOTÈNCIA. Un reenviament legítim de la cua porta el mateix
--   camí que el primer cop i la foto ja hi és (la pujada torna 409 i el client
--   segueix), o sigui que passa igual i continua rebent `ja_enviada`. Posar-la
--   després hauria fet que un `client_request_id` d'algú altre, amb qualsevol
--   camí, contestés «ja enviada» en comptes de dir que no.
--
--   ABANS DE «TANCADA» I «NO HI ÉS». La forma només depèn dels arguments i de
--   qui crida: una petició mal feta és mal feta sigui quin sigui l'estat del
--   joc. Una foto legítima d'una prova esborrada o d'una gimcana tancada passa
--   aquesta comprovació —el client l'acaba de pujar— i rep el seu estat com
--   abans, que és el que la treu de la cua.
--
-- ═══ ERROR AMB NOM, I NO UN ESTAT NOU ══════════════════════════════════════
--
-- 22023 amb la pista `prova_foto`, el patró de la migració 81. Un estat nou
-- (`{"estat": "foto_no_valida"}`) hauria fet que el client tragués la foto de
-- la cua i tornés enrere com si res, perquè `SubmitScreen` només coneix els
-- tres que tornen enrere. Amb el 22023:
--
--   EL BOTÓ ho diu amb una frase pròpia («torna a triar la foto»), perquè
--   `isPermanent` el marca com a refús i `errorKey` llegeix la pista.
--
--   LA CUA no s'encalla: `flushProves` treu de la cua tot el que és classe 22,
--   i no el reintenta cada quinze segons per sempre.
--
-- Un client que fa el que fa `api.ts` no hi arriba mai: el camí surt de la
-- mateixa sessió que signa la crida i la pujada passa just abans, dins del
-- mateix `send`. Si mai hi arribés —la foto esborrada entre la pujada i la
-- crida—, la frase demana tornar-la a triar, que és el que la torna a pujar.

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

  -- La carpeta de la prova i la de qui crida, i un nom que no pot ser `..` ni
  -- portar cap barra. Un null a qualsevol banda fa null la comparació, i el
  -- coalesce el compta com a no.
  if not coalesce(
    p_path ~ ('^' || p_prova_id::text || '/' || v_me::text
              || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'),
    false)
  then
    raise exception 'cami de foto no valid' using errcode = '22023', hint = 'prova_foto';
  end if;

  -- I que hi sigui: la forma bona amb una foto que mai s'ha pujat deixaria la
  -- junta davant d'un requadre buit.
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'gimcana-photos' and o.name = p_path
  ) then
    raise exception 'foto inexistent' using errcode = '22023', hint = 'prova_foto';
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

-- `create or replace` conserva els permisos; es repeteixen perquè el fitxer
-- es llegeixi sencer, com la 40.
alter function public.submit_prova(uuid, text, uuid) owner to postgres;
revoke all on function public.submit_prova(uuid, text, uuid) from public, anon;
grant execute on function public.submit_prova(uuid, text, uuid) to authenticated, service_role;
