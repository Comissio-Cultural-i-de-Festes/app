-- La junta pot contestar a les seves pròpies reunions.
--
-- LA MIGRACIÓ 50 VA POSAR UNA TANCA MASSA AMPLA, i se n'ha adonat provant-ho a
-- producció: prémer «Hi seré» a una reunió de junta no escrivia res i la
-- pantalla no deia res.
--
-- Aquella tanca —`not private.event_is_junta_only(event_id)` a
-- `att_insert_self` i `att_update_self`— havia d'impedir que un soci de fora
-- s'apuntés a una reunió que no pot ni veure. Però `attendances` no té cap
-- política d'INSERT per a administradors: la junta passa per la mateixa que
-- tothom, i per tant els vaig tancar fora de la seva pròpia reunió.
--
-- El que la prova no deia. `340_reunions` comprovava que un soci fos refusat, i
-- això segueix sent cert; el que no comprovava és que qui hi és convocat pugui
-- contestar. Era la mateixa cosa que ja havia passat amb `check_in_here`, on el
-- control positiu —una festa al mateix punt i a la mateixa hora ha d'entrar—
-- és el que fa que les assercions provin alguna cosa. Aquesta vegada faltava a
-- l'altre costat: no que el forat estigui tapat, sinó que la porta s'obri.
--
-- Per això la condició és «o ets de la junta» i no una política nova per a
-- administradors: la regla que es vol dir és «qui hi és convocat pot
-- contestar», i a una reunió de junta els convocats són els administradors. Amb
-- una política a part caldria mantenir les dues meitats en dos llocs i el dia
-- que una es toqués, l'altra quedaria enrere.
--
-- `att_select_public_si` no hi surt: per a llegir, la junta ja té
-- `att_select_admin`, i per tant la tanca de la 50 no els treu res.

drop policy att_insert_self on public.attendances;

create policy att_insert_self on public.attendances
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.is_active_member())
    and estado = any (array['si', 'potser', 'no', 'espera', 'sollicitat'])
    and private.event_is_published(event_id)
    and (
      not private.event_is_junta_only(event_id)
      or (select private.is_admin())
    )
    and (estado <> 'si' or (private.event_has_room(event_id)
                            and not private.event_needs_confirming(event_id)))
    and (estado <> 'espera' or not private.event_has_room(event_id))
    and (estado <> 'sollicitat' or private.event_needs_confirming(event_id))
  );

drop policy att_update_self on public.attendances;

create policy att_update_self on public.attendances
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and (select private.is_active_member())
    and estado <> all (array['asistio', 'cancelado'])
  )
  with check (
    user_id = (select auth.uid())
    and estado = any (array['si', 'potser', 'no', 'espera', 'sollicitat'])
    and (
      not private.event_is_junta_only(event_id)
      or (select private.is_admin())
    )
    and (estado <> 'si' or (private.event_has_room(event_id)
                            and not private.event_needs_confirming(event_id)))
    and (estado <> 'espera' or not private.event_has_room(event_id))
    and (estado <> 'sollicitat' or private.event_needs_confirming(event_id))
  );

-- ── i el mateix parany, a la porta del costat ───────────────────────────────
-- `rides_insert_driver` va rebre la mateixa tanca a la migració 53 i té la
-- mateixa forma: `rides` tampoc no té política d'INSERT per a administradors.
-- Avui no hi ha cap reunió amb cotxes i per tant no ha molestat ningú, però
-- deixar-hi el parany quan ja el conec seria pitjor que no haver-lo vist.
drop policy rides_insert_driver on public.rides;

create policy rides_insert_driver on public.rides
  for insert to authenticated
  with check (
    driver_id = (select auth.uid())
    and (select private.is_active_member())
    and private.event_is_revealed(event_id)
    and (
      not private.event_is_junta_only(event_id)
      or (select private.is_admin())
    )
    and private.event_needs_cars(event_id)
  );

-- `event_interest` es queda com la 53 el va deixar. Una reunió no es teasereja
-- —no té `reveal_at`, o sigui que està revelada des del primer moment— i per
-- tant «Avisa'm» no li surt a ningú, junta inclosa: no hi ha cap porta que
-- obrir perquè no hi ha cap pantalla que hi porti.
