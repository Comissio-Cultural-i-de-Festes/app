-- Rollback de la migració 69. NO és a `migrations/` a posta: un fitxer aquí
-- dins el desfaria el mateix `db push` que acaba d'aplicar-lo.
--
-- Treu les dues portes públiques —`member_streak()` i `member_badges()`— i
-- torna el recompte de la ratxa a dins de `my_streak()`, que és on vivia des de
-- la migració 37. L'ORDRE IMPORTA: primer es torna a escriure `my_streak()` amb
-- el bucle a dins, i només després es pot deixar caure `private.streak_of()`;
-- a l'inrevés hi hauria un instant en què la ratxa de tothom peta amb «function
-- private.streak_of(uuid) does not exist».
--
-- Si es desfà això, `/soci/:id` es queda sense la ratxa i sense les insígnies.
-- La capçalera i la llista d'activitats continuen funcionant: no tenien cap
-- migració al darrere.

-- ── la ratxa, amb el recompte una altra vegada a dins ──────────────────────
create or replace function public.my_streak()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_me       uuid := (select auth.uid());
  r          record;
  v_run      int := 0;
  v_actual   int := 0;
  v_millor   int := 0;
  v_perduda  int := 0;
  v_trencada timestamptz;
  v_compten  int := 0;
  v_hi_vas   int := 0;
begin
  if not private.is_active_member() then
    raise exception 'nomes socis' using errcode = '42501';
  end if;

  for r in select * from private.streak_rows(v_me) loop
    v_compten := v_compten + 1;
    if r.hi_va_anar then
      v_run := v_run + 1;
      v_hi_vas := v_hi_vas + 1;
      if v_run > v_millor then v_millor := v_run; end if;
    else
      if v_run > 0 then
        v_perduda  := v_run;
        v_trencada := r.starts_at;
      end if;
      v_run := 0;
    end if;
  end loop;

  v_actual := v_run;

  if v_actual > 0 then
    v_perduda  := 0;
    v_trencada := null;
  end if;

  return jsonb_build_object(
    'actual',      v_actual,
    'millor',      v_millor,
    'perduda',     v_perduda,
    'trencada_el', v_trencada,
    'compten',     v_compten,
    'hi_has_anat', v_hi_vas
  );
end;
$fn$;

alter function public.my_streak() owner to postgres;
revoke all on function public.my_streak() from public, anon;
grant execute on function public.my_streak() to authenticated, service_role;

comment on function public.my_streak() is
  'La teva ratxa: `actual`, `millor`, i si s''ha trencat, quant valia i quan. '
  'Es calcula sempre, mai es desa. No diu res de si esta «en perill»: aixo '
  'depen de si hi ha una activitat oberta, cosa que la pantalla ja sap.';

-- ── i fora les tres coses que la 69 va afegir ──────────────────────────────
drop function if exists public.member_badges(uuid);
drop function if exists public.member_streak(uuid);
drop function if exists private.streak_of(uuid);
