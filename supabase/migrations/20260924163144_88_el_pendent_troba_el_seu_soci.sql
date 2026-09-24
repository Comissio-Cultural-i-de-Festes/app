-- Un avís pendent troba sol el seu soci quan el soci té compte i telèfon.
--
-- QUAN ES MIRA. Hi ha dos moments que poden ser l'últim dels dos que falten, i
-- tots dos es miren:
--
--   QUAN ES DESA O CANVIA `profile_contact.telefon`. És el cas normal: el soci
--   acaba l'onboarding i hi escriu el número.
--
--   QUAN `profiles.estat` CANVIA. L'onboarding es pot acabar mentre el perfil
--   encara és `pendent` —el redempt de la invitació corre en paral·lel, o la
--   junta l'aprova més tard— i llavors el telèfon ja hi és però el soci encara
--   no ho és. I també quan un perfil passa a `baixa`: si compartia número amb un
--   altre, el que queda deixa de ser ambigu.
--
-- I QUAN NEIX UN PENDENT: si la persona ja té compte, no cal esperar res.
--
-- `handle_new_user()` NO SERVEIX PER A AIXÒ, i no es toca: quan `auth.users`
-- rep la fila nova, `profile_contact` neix sense telèfon i el perfil és
-- `pendent`. No hi ha res a comparar fins molt després.
--
-- ═══ NOMÉS SI HI HA EXACTAMENT UN ═════════════════════════════════════════
--
-- Els nou dígits es comparen contra els perfils `actiu`, i només si n'hi ha
-- exactament un s'enganxa. Amb dos, el pendent es queda a la llista marcat com a
-- `ambigu` perquè el decideixi la junta a mà: posar un avís a la persona
-- equivocada és pitjor que no posar-lo sol.
--
-- ELS DE `baixa` NO COMPTEN. Hi ha comptes duplicats donats de baixa que
-- comparteixen número amb el bo —algú que va entrar amb dos correus—, i
-- comptar-los faria ambigu el cas més normal que hi ha.
--
-- ═══ EL CAMÍ AUTOMÀTIC NO POT FER FALLAR MAI QUI EL DISPARA ════════════════
--
-- Qui dispara aquests disparadors és un soci que desa el seu telèfon, o la
-- invitació que el fa actiu. Si l'enganxada petés, petaria amb ell: no podria
-- acabar l'onboarding per un avís que ni tan sols sap que existeix. Per això:
--
--   CADA PENDENT VA DINS DEL SEU `begin … exception when others`, que és un
--   savepoint: si un peta, els seus canvis es desfan, l'error es desa al
--   pendent —`motiu` i `motiu_codi`— i els altres continuen. El sostre del curs
--   (`avis_sostre`) i la finestra (`avis_fora_del_curs`) surten amb el seu nom;
--   qualsevol altra cosa, com a `error` amb el SQLSTATE.
--
--   I TOT PLEGAT VA DINS D'UN ALTRE, per si peta el que hi ha al voltant —el
--   recompte dels perfils, la cerca—. Llavors es marquen com a `error` els
--   pendents d'aquells dígits, i si ni això es pot, es deixa passar. Callar aquí
--   és a posta: l'alternativa és que un soci no pugui desar el seu número.
--
--   L'ENLLAÇ MANUAL (87) NO HO FA: allà l'error puja a la junta que ha premut
--   el botó, que és qui ho ha de saber.
--
-- ═══ QUI HO EXECUTA I QUÈ VEU ═════════════════════════════════════════════
--
-- Els disparadors corren com l'usuari que desa, i per això les funcions són
-- `security definer` a `private`, amb `search_path` buit i sense EXECUTE per a
-- ningú. No tornen res, no llancen cap avís i no deixen cap rastre visible per
-- a qui les dispara: el soci no pot saber per aquí que hi havia un pendent amb
-- el seu número, ni menys encara veure els d'altres persones. L'únic que veurà
-- és l'avís que li toca, al seu perfil, que és el que ha de veure.

-- ── la cerca ───────────────────────────────────────────────────────────────
create or replace function private.enganxa_per_digits(p_digits text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_quants int;
  v_user   uuid;
  v_p      record;
  v_hint   text;
  v_codi   text;
begin
  if p_digits is null then
    return;
  end if;

  begin
    select count(*)::int, (array_agg(p.id))[1]
      into v_quants, v_user
      from public.profiles p
      join public.profile_contact c on c.id = p.id
     where p.estat = 'actiu'
       and private.darrers_9(c.telefon) = p_digits;

    if v_quants = 0 then
      -- Ningú: si abans era ambigu, ja no ho és. Espera, i prou.
      update public.avisos_pendents
         set motiu = null, motiu_codi = null
       where telefon_9 = p_digits
         and enllacat_at is null and retirat_at is null
         and motiu = 'ambigu';
      return;
    end if;

    if v_quants > 1 then
      update public.avisos_pendents
         set motiu = 'ambigu', motiu_codi = null
       where telefon_9 = p_digits
         and enllacat_at is null and retirat_at is null;
      return;
    end if;

    -- Per ordre de falta: amb un sostre a prop, les d'abans passen primer, que
    -- és l'ordre en què haurien passat si la persona hagués tingut compte.
    for v_p in
      select id from public.avisos_pendents
       where telefon_9 = p_digits
         and enllacat_at is null and retirat_at is null
       order by falta_at, created_at
         for update
    loop
      begin
        perform private.enganxa_pendent(v_p.id, v_user, 'telefon', null);
      exception when others then
        get stacked diagnostics v_hint = pg_exception_hint, v_codi = returned_sqlstate;
        update public.avisos_pendents
           set motiu = case when v_hint in ('avis_sostre', 'avis_fora_del_curs') then v_hint else 'error' end,
               motiu_codi = v_codi
         where id = v_p.id;
      end;
    end loop;
  exception when others then
    get stacked diagnostics v_codi = returned_sqlstate;
    begin
      update public.avisos_pendents
         set motiu = 'error', motiu_codi = v_codi
       where telefon_9 = p_digits
         and enllacat_at is null and retirat_at is null;
    exception when others then
      null;
    end;
  end;
end $fn$;

comment on function private.enganxa_per_digits(text) is
  'Busca els avisos pendents amb aquests nou digits i, si hi ha exactament un '
  'perfil actiu amb el mateix telefon, els hi converteix en avisos. Amb mes d''un, '
  'els marca ambigus. No falla mai: cada error es desa al pendent.';

alter function private.enganxa_per_digits(text) owner to postgres;
revoke all on function private.enganxa_per_digits(text) from public, anon, authenticated;

-- ── el telèfon ─────────────────────────────────────────────────────────────
-- Els dígits nous i també els vells: qui deixa un número que compartia amb un
-- altre en desfà l'ambigüitat.
create or replace function private.enganxa_pel_telefon()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if tg_op = 'UPDATE' and new.telefon is not distinct from old.telefon then
    return null;
  end if;

  perform private.enganxa_per_digits(private.darrers_9(new.telefon));

  if tg_op = 'UPDATE'
     and private.darrers_9(old.telefon) is distinct from private.darrers_9(new.telefon) then
    perform private.enganxa_per_digits(private.darrers_9(old.telefon));
  end if;

  return null;
end $fn$;

alter function private.enganxa_pel_telefon() owner to postgres;
revoke all on function private.enganxa_pel_telefon() from public, anon, authenticated;

create trigger profile_contact_enganxa_pendents
  after insert or update of telefon on public.profile_contact
  for each row execute function private.enganxa_pel_telefon();

-- ── l'estat ────────────────────────────────────────────────────────────────
-- Qualsevol canvi d'estat i no només cap a `actiu`: una baixa també pot decidir
-- una ambigüitat.
create or replace function private.enganxa_per_l_estat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  perform private.enganxa_per_digits(
    (select private.darrers_9(c.telefon) from public.profile_contact c where c.id = new.id)
  );
  return null;
end $fn$;

alter function private.enganxa_per_l_estat() owner to postgres;
revoke all on function private.enganxa_per_l_estat() from public, anon, authenticated;

create trigger profiles_enganxa_pendents
  after update of estat on public.profiles
  for each row
  when (old.estat is distinct from new.estat)
  execute function private.enganxa_per_l_estat();

-- ── i el pendent que neix ──────────────────────────────────────────────────
-- Un disparador i no una línia dins de `crea_avis_pendent`, perquè la RPC de la
-- 87 no s'hagi de reescriure i perquè qualsevol camí que insereixi un pendent
-- —també una migració futura— hi passi igual.
create or replace function private.enganxa_el_pendent_nou()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  perform private.enganxa_per_digits(new.telefon_9);
  return null;
end $fn$;

alter function private.enganxa_el_pendent_nou() owner to postgres;
revoke all on function private.enganxa_el_pendent_nou() from public, anon, authenticated;

create trigger avisos_pendents_enganxa_en_neixer
  after insert on public.avisos_pendents
  for each row execute function private.enganxa_el_pendent_nou();
