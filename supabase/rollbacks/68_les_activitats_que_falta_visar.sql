-- Rollback de la migració 68. NO és a `migrations/` a posta: un fitxer aquí
-- dins el desfaria el mateix `db push` que acaba d'aplicar-lo.
--
-- Torna `admin_hores_pendents()` a només el recompte, sense la llista, i
-- retorna l'EXECUTE de les quatre funcions de `private` al que hi havia després
-- de la 67 —que era el defecte de Postgres, EXECUTE a PUBLIC—. Si es desfà
-- això, la pantalla d'hores torna a tenir el número de la feina sense cap camí
-- per anar-hi.

create or replace function public.admin_hores_pendents()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_des_de timestamptz;
  v_fins_a timestamptz;
  v_acts   int;
  v_minuts int;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  select pc.des_de, pc.fins_a into v_des_de, v_fins_a from private.periode_curs() pc;

  with pendents as (
    select e.id, e.starts_at, e.minuts_memoria
      from public.events e
     where e.a_la_uni
       and e.hores_verificat_at is null
       and e.starts_at < now()
       and (v_des_de is null or e.starts_at >= v_des_de)
       and (v_fins_a is null or e.starts_at <  v_fins_a)
  )
  select count(distinct p.id)::int,
         coalesce(sum(
           private.minuts_persona(
             p.starts_at, p.minuts_memoria,
             a.checked_in_at, a.exit_photo_at, a.minuts_memoria
           )
         ), 0)::int
    into v_acts, v_minuts
    from pendents p
    left join public.attendances a
      on a.event_id = p.id
     and a.estado = 'asistio';

  return jsonb_build_object('activitats', v_acts, 'minuts', v_minuts);
end $fn$;

alter function public.admin_hores_pendents() owner to postgres;
revoke all on function public.admin_hores_pendents() from public, anon;
grant execute on function public.admin_hores_pendents() to authenticated;

grant execute on function private.memoria_a_la_uni_defecte(text) to public;
grant execute on function private.memoria_minuts(text, timestamptz, timestamptz) to public;
grant execute on function private.minuts_persona(timestamptz, int, timestamptz, timestamptz, int) to public;
grant execute on function private.periode_curs() to public;
