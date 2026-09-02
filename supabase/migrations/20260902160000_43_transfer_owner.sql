-- El traspàs de la propietat, en una sola operació.
--
-- PER QUÈ NO ES POT FER AMB EL QUE JA HI HA. `admin_set_member_role` sap pujar
-- algú a owner, però només això: refusa `p_user_id = v_actor`, o sigui que qui
-- la dóna no es pot baixar a si mateix per aquell camí. En dues crides —pujar
-- l'altre, baixar-te tu— la segona no existeix, i el que queda és una
-- associació amb dos owners. Si algun dia existís, entre les dues crides hi
-- hauria una finestra amb dos owners i, si la segona falla, l'estat hi queda
-- per sempre.
--
-- Per això és una funció i no dues, i per això `admin_set_member_role` es
-- queda exactament com és: la seva regla —ningú no es toca el propi rol— és
-- bona per a tot el que fa, i el traspàs és l'excepció que necessita el seu
-- propi lloc on dir-ho.
--
-- SEMPRE EXACTAMENT UN OWNER. És la invariant que aquesta migració defensa, i
-- la que la base no pot expressar amb una restricció: `role` és una columna de
-- text amb un CHECK, i «com a màxim una fila amb aquest valor» seria un índex
-- únic parcial que trencaria el bootstrap. Es defensa aquí i als tests.
--
-- NOMÉS A UN ADMIN. Passar la propietat a algú que no porta res seria donar-la
-- a qui no sap que la té, i el juny que ve ningú no sabria a qui reclamar. La
-- pantalla ja només llista admins; això és el que ho fa cert.

create or replace function public.admin_transfer_owner(p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role  text;
  v_estat text;
begin
  -- L'autorització, primera sentència del cos, i l'actor sempre de
  -- `auth.uid()` i no d'un paràmetre.
  if not private.is_owner() then
    raise exception 'nomes owner pot traspassar la propietat' using errcode = '42501';
  end if;
  if p_user_id = v_actor then
    raise exception 'ja la tens' using errcode = '42501';
  end if;

  -- Les dues files bloquejades abans de tocar-ne cap: dos owners traspassant a
  -- la vegada, o un traspàs contra una baixa, s'han de serialitzar o el
  -- recompte final depèn de qui arribi segon. En ordre d'id per no encreuar-se
  -- amb una altra transacció que faci el mateix a l'inrevés.
  perform 1 from public.profiles
   where id in (v_actor, p_user_id)
   order by id
     for update;

  select role, estat into v_role, v_estat
    from public.profiles where id = p_user_id;

  if not found then
    raise exception 'perfil inexistent' using errcode = '42501';
  end if;
  if v_estat <> 'actiu' then
    raise exception 'el desti no es un soci actiu' using errcode = '42501';
  end if;
  if v_role <> 'admin' then
    raise exception 'el desti ha de ser admin' using errcode = '42501';
  end if;

  update public.profiles set role = 'owner' where id = p_user_id;
  update public.profiles set role = 'admin' where id = v_actor;

  -- Una sola línia i no dues: és un acte, i el juny que ve la pregunta serà
  -- «qui la va donar i a qui», no «quantes files es van escriure».
  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    v_actor,
    'transfer_owner',
    p_user_id,
    jsonb_build_object('de', v_actor, 'a', p_user_id)
  );
end $$;

comment on function public.admin_transfer_owner(uuid) is
  'Puja un admin a owner i baixa el cridant a admin en una transacció. Dues '
  'crides separades deixarien l''associació amb dos owners o amb cap, i '
  'admin_set_member_role no ho pot fer perquè refusa canviar el propi rol. '
  'Només un owner, només cap a un admin actiu, i auditat.';

alter function public.admin_transfer_owner(uuid) owner to postgres;
revoke all on function public.admin_transfer_owner(uuid) from public, anon;
grant execute on function public.admin_transfer_owner(uuid) to authenticated;
