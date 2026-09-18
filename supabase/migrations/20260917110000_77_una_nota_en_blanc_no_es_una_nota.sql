-- Un tabulador no és una nota, i amb ell queia la verja sencera del negatiu.
--
-- EL FORAT. La 72 va escriure `nullif(btrim(coalesce(p_nota, '')), '')` i el
-- seu comentari deia, amb tota la raó, que «una nota de tres espais és una nota
-- buida amb una altra cara». El que no diu enlloc la documentació de Postgres
-- al lloc on la buscaries: `btrim(text)` amb UN sol argument no treu «els
-- blancs», treu **U+0020 i prou**. Ni el tabulador, ni el retorn de carro, ni
-- el salt de línia, ni l'espai dur. La 76 va copiar la línia tal qual —havia de
-- copiar-la, que era justament el que li tocava fer— i el forat la va seguir.
--
-- PER QUÈ NO ÉS UN CAMP LLEIG. La nota obligatòria no és cosmètica: és l'ÚNICA
-- condició que la 72 posa per obrir el negatiu a tota la junta. Ho diu ella
-- mateixa —«el que ha canviat és que ara una resta per `manual` no pot existir
-- sense nota i sense fila al registre, i és això —no el rol de qui la fa— el
-- que contesta la discussió del març»—. Amb un sol tabulador, un admin que no
-- és l'owner resta 500 punts per crida i la fila del llibre major i la del
-- registre surten amb el «per què» en blanc: exactament el «-20 muntatge sense
-- text» que aquella migració declara impossible. La verja no s'aguantava en el
-- rol ni en el codi, s'aguantava en una funció que no fa el que sembla.
--
-- I NO ÉS TEÒRIC. El formulari no hi arriba —`String.prototype.trim()` de
-- JavaScript sí que treu els tabuladors—, però `award_points` té el grant per a
-- `authenticated` sencer: es crida des de la consola del navegador, o amb curl
-- i el token de qualsevol de la junta. Reproduït per Kong i PostgREST amb
-- `p_motivo:'manual'`, `p_puntos:-250`, `p_nota:'\t'` → 200 i la fila escrita.
--
-- ── LA REGLA PASSA A VIURE EN UN SOL LLOC ───────────────────────────────────
--
-- `private.nota_neta` no és una comoditat. La mateixa expressió escrita a mà
-- surt a cinc llocs del repositori —aquí, `admin_decide_proposal` (29),
-- `avisa` (73), l'acta (48 i 62) i l'etiqueta d'`avis_tipus` (73)— i és
-- EQUIVOCADA A TOTES CINC, perquè es va copiar cinc vegades en comptes de
-- cridar-se cinc vegades. Una regla que cadascú torna a escriure és una regla
-- que cadascú torna a equivocar. Aquí només se'n corregeix una —la d'aquesta
-- issue—; les altres quatre ja tenen on cridar, i la que les toqui no ha de
-- tornar a decidir què és un blanc.
--
-- DESCARTAT: `btrim(coalesce(p_nota, ''), E' \t\r\n')`, que és la correcció
-- que demana el cos i són sis caràcters. Tapa el tabulador i el salt de línia i
-- deixa passar l'espai dur (U+00A0) —el que queda enganxat quan algú copia el
-- text d'un processador de textos—, l'espai ideogràfic i la vintena llarga de
-- blancs d'Unicode. Una verja que es pot saltar amb un caràcter que es pot
-- enganxar sense voler no és cap verja, i pagar-ho amb una llista explícita val
-- la pena una sola vegada.
--
-- DESCARTAT TAMBÉ: `p_nota ~ '\S'`, que és curt i llegible. `\S` és
-- `[^[:space:]]` i `[[:space:]]` el decideix el LC_CTYPE de la base: la regla
-- canviaria de significat el dia que la base es restaurés amb una altra
-- configuració regional, i una garantia de seguretat no pot dependre d'això.
-- Mesurat en aquesta base: U+00A0 NO satisfà `\S` —o sigui que allà funciona—,
-- però U+FEFF SÍ que el satisfà, i una nota que és una marca d'ordre de bytes
-- és una nota que no es veu. La llista explícita no depèn de la configuració i
-- els agafa tots dos.
--
-- LA LLISTA. `[[:space:]]` (que ja cobreix l'espai, el tabulador, el salt de
-- línia, el retorn, el tabulador vertical i el salt de pàgina) més els blancs
-- d'Unicode que no hi entren sempre: espai dur, espai d'ogham, la família
-- U+2000–U+200B, els dos separadors de línia i paràgraf, l'espai estret dur,
-- l'espai matemàtic mitjà, l'espai ideogràfic i la marca d'ordre de bytes.
--
-- UN SOL PATRÓ I NO DOS. S'escriu com una alternança ancorada als dos extrems
-- —`^blancs+|blancs+$`— amb la bandera `g`, en comptes de fer dos
-- `regexp_replace` o un `btrim` amb la llista repetida: la llista de blancs
-- apareix una vegada i no se'n poden desincronitzar dues còpies. Si el text
-- sencer és blanc, el primer tros se'l menja tot, queda '' i el `nullif` el
-- torna null.
--
-- LA SIGNATURA D'`award_points` NO CANVIA, i per això és un `create or
-- replace` i prou. Un paràmetre nou amb valor per defecte crearia una
-- SOBRECÀRREGA i PostgREST contestaria PGRST203 a totes les crides, també a les
-- de la porta.
--
-- EL COS ÉS EL DE LA 76, línia per línia, amb la línia de `v_nota` canviada i
-- res més: `conduir` continua fora de l'allowlist, la nota continua sent
-- obligatòria per a `manual` i la resta per als altres motius continua sent de
-- l'owner. La 73 explica per què això s'escriu: una versió seva anterior
-- reescrivia `award_points` i hauria desfet en silenci la regla de la 72.

-- ── la regla, un cop ────────────────────────────────────────────────────────
create or replace function private.nota_neta(p_text text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select nullif(
    regexp_replace(
      p_text,
      '^[[:space:]   -​    　﻿]+'
      || '|[[:space:]   -​    　﻿]+$',
      '',
      'g'),
    '')
$$;

comment on function private.nota_neta(text) is
  'La nota tal com s''ha de desar, o null si no en queda res. Treu els blancs '
  'dels dos extrems —tots, no nomes l''espai— i torna null quan el text sencer '
  'era blanc. Viu a `private` perque es una regla interna i no una RPC.';

-- Cap grant per a `authenticated`: no la crida ningú des de fora, i les
-- funcions que la criden són `security definer` i l'executen com a postgres.
-- Postgres regala EXECUTE a PUBLIC en cada funció nova, i aquí es retira.
revoke all on function private.nota_neta(text) from public, anon, authenticated;

-- ── i el lloc on la seva absència costava 500 punts ─────────────────────────
create or replace function public.award_points(
  p_user_id uuid,
  p_event_id uuid,
  p_motivo text,
  p_puntos int,
  p_nota text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id   uuid;
  v_nota text := private.nota_neta(coalesce(p_nota, ''));
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;
  -- Sense `conduir`: portar gent és l'únic motiu de cotxe que es pot donar.
  -- El CHECK de `points_log` sí que l'accepta encara, i és a posta: el que
  -- pot existir i el que es pot crear avui no són la mateixa llista.
  if p_motivo not in ('asistencia', 'montaje', 'trajo_gente', 'propuso', 'manual') then
    raise exception 'motiu invalid' using errcode = '22023';
  end if;
  if p_puntos = 0 or abs(p_puntos) > 500 then
    raise exception 'punts fora de rang' using errcode = '22023';
  end if;
  -- Un ajust a mà sense el per què és un número que ha aparegut. I un per què
  -- que no es veu és un per què que no s'hi ha escrit: ho decideix
  -- `private.nota_neta`, no `btrim`.
  if p_motivo = 'manual' and v_nota is null then
    raise exception 'un ajust a ma vol una nota' using errcode = '22023';
  end if;
  -- Restar per un dels motius de la porta continua sent cosa de l'owner: allà
  -- no hi ha cap lloc on escriure per què, i una resta muda no es pot
  -- respondre. Per `manual` hi ha nota obligatòria dues línies més amunt, i
  -- amb nota la junta sencera hi arriba.
  if p_puntos < 0 and p_motivo <> 'manual' and not private.is_owner() then
    raise exception 'nomes owner pot restar punts' using errcode = '42501';
  end if;

  insert into public.points_log (user_id, event_id, motivo, puntos, nota, granted_by)
  values (p_user_id, p_event_id, p_motivo, p_puntos, v_nota, (select auth.uid()))
  returning id into v_id;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    (select auth.uid()),
    'award_points',
    p_user_id,
    jsonb_build_object(
      'motiu', p_motivo,
      'punts', p_puntos,
      'esdeveniment', p_event_id,
      'nota', v_nota
    )
  );

  return v_id;
end $$;

comment on function public.award_points(uuid, uuid, text, int, text) is
  'Escriu una fila al llibre major. Cinc motius: `conduir` ja no es pot crear '
  '—el CHECK de points_log encara l''accepta, que l''historic no es reescriu—. '
  '`manual` exigeix nota —una nota que es vegi, no un blanc— i es l''unic motiu '
  'pel qual un admin pot restar; per als altres, restar continua sent de '
  'l''owner.';

-- `create or replace` conserva els privilegis, però es tornen a escriure aquí
-- perquè la frase que importa —qui pot executar-la— es llegeixi al mateix
-- fitxer que canvia què fa.
revoke all on function public.award_points(uuid, uuid, text, int, text) from public, anon;
grant execute on function public.award_points(uuid, uuid, text, int, text) to authenticated;
