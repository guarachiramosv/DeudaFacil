begin;

create function public.registrar_abono(p_deuda uuid, p_monto numeric, p_nota text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_deuda public.deudas%rowtype;
  v_abono uuid;
  v_saldo numeric;
begin
  if p_monto is null or p_monto <= 0 or p_monto >= 10000000000
    or p_monto <> round(p_monto, 2) then
    raise exception 'Ingresa un monto válido con hasta dos decimales.';
  end if;

  select * into v_deuda from public.deudas
  where id = p_deuda and estado = 'confirmada'
    and v_usuario in (deudor_id, acreedor_id)
    and public.es_participante_deuda(id)
  for update;
  if not found then
    raise exception 'Solo los participantes pueden registrar abonos en una deuda confirmada.';
  end if;

  select saldo_pendiente into v_saldo from public.saldos_deuda where deuda_id = v_deuda.id;
  if p_monto > v_saldo then
    raise exception 'El abono supera el saldo pendiente.';
  end if;

  insert into public.movimientos (deuda_id, registrado_por, tipo, monto, nota)
  values (v_deuda.id, v_usuario, 'abono', p_monto, nullif(btrim(p_nota), ''))
  returning id into v_abono;

  insert into public.confirmaciones (movimiento_id, perfil_id, estado)
  values (v_abono, v_usuario, 'confirmado');
  return v_abono;
end;
$$;

create function public.responder_abono(p_abono uuid, p_confirmar boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_abono public.movimientos%rowtype;
  v_saldo numeric;
  v_estado text;
begin
  if p_confirmar is null then
    raise exception 'Selecciona una respuesta.';
  end if;

  -- Las respuestas de una misma deuda comparten el bloqueo para evitar sobrepagos.
  perform 1 from public.deudas d
  join public.movimientos m on m.deuda_id = d.id
  where m.id = p_abono and m.tipo = 'abono'
    and d.estado = 'confirmada' and v_usuario in (d.deudor_id, d.acreedor_id)
    and m.registrado_por in (d.deudor_id, d.acreedor_id)
    and v_usuario <> m.registrado_por and public.es_participante_deuda(d.id)
  for update of d;
  if not found then
    raise exception 'Solo la contraparte puede responder este abono.';
  end if;

  select * into v_abono from public.movimientos where id = p_abono;
  if v_abono.estado <> 'pendiente' then
    raise exception 'El abono ya fue respondido.';
  end if;

  select saldo_pendiente into v_saldo from public.saldos_deuda where deuda_id = v_abono.deuda_id;
  if p_confirmar and v_abono.monto > v_saldo then
    raise exception 'El abono supera el saldo pendiente actual.';
  end if;

  -- Registra la aceptación implícita del autor también para abonos anteriores.
  insert into public.confirmaciones (movimiento_id, perfil_id, estado)
  values (p_abono, v_abono.registrado_por, 'confirmado')
  on conflict (movimiento_id, perfil_id) do nothing;

  insert into public.confirmaciones (movimiento_id, perfil_id, estado)
  values (p_abono, v_usuario, case when p_confirmar then 'confirmado' else 'reportado' end)
  on conflict (movimiento_id, perfil_id) do update
    set estado = excluded.estado, fecha_confirmacion = now();

  select estado into v_estado from public.movimientos where id = p_abono;
  return v_estado;
end;
$$;

revoke insert on public.movimientos from public, anon, authenticated;
revoke insert, update on public.confirmaciones from public, anon, authenticated;
revoke all on function public.registrar_abono(uuid, numeric, text) from public, anon;
revoke all on function public.responder_abono(uuid, boolean) from public, anon;
grant execute on function public.registrar_abono(uuid, numeric, text) to authenticated;
grant execute on function public.responder_abono(uuid, boolean) to authenticated;

commit;
