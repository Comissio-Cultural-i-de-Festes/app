-- The degree list, edited without the dashboard.
--
-- Same story as the scale and the calendar: migration 20 put the degrees in
-- rows precisely because the university changes them without warning, and then
-- left the editing to the one person with a Supabase account.
--
-- The one thing here that is not bookkeeping is the rename.

create or replace function public.admin_save_grau(
  p_escola text,
  p_nom text,
  p_ordre int default 0,
  p_id uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nom   text := btrim(coalesce(p_nom, ''));
  v_abans public.graus%rowtype;
  v_id    uuid;
  v_gent  int := 0;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  if p_escola not in ('politecnica', 'empresa', 'salut') then
    raise exception 'escola invalida' using errcode = '22023';
  end if;
  if length(v_nom) < 2 or length(v_nom) > 120 then
    raise exception 'el nom del grau ha de tenir entre 2 i 120 caracters'
      using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.graus (escola, nom, ordre)
    values (p_escola, v_nom, coalesce(p_ordre, 0))
    returning id into v_id;

    insert into public.audit_log (actor_id, accio, target_id, detall)
    values (
      (select auth.uid()),
      'save_grau',
      v_id,
      jsonb_build_object('escola', p_escola, 'nom', v_nom, 'nou', true)
    );
    return v_id;
  end if;

  select * into v_abans from public.graus where id = p_id for update;
  if not found then
    raise exception 'aquest grau no existeix' using errcode = 'P0002';
  end if;

  -- ── the rename, which is the reason this is an RPC and not a PATCH ────────
  -- `profiles.grau` holds the NAME and not a reference, on purpose: rows
  -- already written stay valid, nobody is orphaned, and the exchange student
  -- on a programme that is not listed can still type theirs.
  --
  -- The cost of that choice is here. Fix a typo in the list and the twenty
  -- people who picked it keep the typo forever, on the card the door reads.
  -- No constraint will ever surface it, because there is no constraint. So the
  -- rename carries them along.
  --
  -- Matched on the OLD school and the OLD name together. The pair is unique in
  -- this table, which is what stops a rename in one school touching somebody
  -- who typed the same words in another.
  if v_nom is distinct from v_abans.nom then
    update public.profiles
       set grau = v_nom
     where grau = v_abans.nom
       and escola = v_abans.escola;
    get diagnostics v_gent = row_count;
  end if;

  update public.graus
     set escola = p_escola,
         nom = v_nom,
         ordre = coalesce(p_ordre, ordre)
   where id = p_id;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    (select auth.uid()),
    'save_grau',
    p_id,
    jsonb_build_object(
      'escola', p_escola,
      'nom', v_nom,
      'abans', v_abans.nom,
      'gent_reanomenada', v_gent
    )
  );

  return p_id;
end $$;

comment on function public.admin_save_grau(text, text, int, uuid) is
  'Adds or edits a degree. A rename carries profiles.grau with it — the column '
  'stores the name as free text, so without this the list and the people on it '
  'drift apart permanently and nothing would ever report it. Audited, with how '
  'many people were carried.';

create or replace function public.admin_delete_grau(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_abans public.graus%rowtype;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  select * into v_abans from public.graus where id = p_id;
  if not found then
    raise exception 'aquest grau no existeix' using errcode = 'P0002';
  end if;

  -- Deliberately NOT touching profiles. Somebody's degree is their answer, not
  -- a foreign key into a list the junta is tidying, and blanking it would lose
  -- information to fix a presentation problem. They keep it; the picker just
  -- stops offering it to the next person.
  delete from public.graus where id = p_id;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    (select auth.uid()),
    'delete_grau',
    p_id,
    jsonb_build_object('escola', v_abans.escola, 'nom', v_abans.nom)
  );
end $$;

comment on function public.admin_delete_grau(uuid) is
  'Takes a degree off the picker. Leaves profiles.grau alone: the people on it '
  'keep it, because their answer is not a reference into this list. Audited '
  'with the name, so it can be put back.';

alter function public.admin_save_grau(text, text, int, uuid) owner to postgres;
alter function public.admin_delete_grau(uuid) owner to postgres;
revoke all on function public.admin_save_grau(text, text, int, uuid) from public, anon;
revoke all on function public.admin_delete_grau(uuid) from public, anon;
grant execute on function public.admin_save_grau(text, text, int, uuid) to authenticated;
grant execute on function public.admin_delete_grau(uuid) to authenticated;

-- The functions first, then the old way out. Same order and same reason as the
-- two migrations before this one.
drop policy if exists graus_write_admin on public.graus;
revoke insert, update, delete on public.graus from authenticated;
