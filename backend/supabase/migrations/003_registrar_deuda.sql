begin;

create function public.registrar_deuda(
  p_contraparte uuid,
  p_rol text,
  p_monto numeric,
  p_motivo text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_deuda uuid := gen_random_uuid();
  v_deudor uuid;
  v_acreedor uuid;
begin
  if v_usuario is null then
    raise exception 'Inicia sesión para registrar una deuda.';
  end if;
  if p_contraparte is null or p_contraparte = v_usuario then
    raise exception 'Ingresa el ID de otra cuenta.';
  end if;
  if p_rol is null or p_rol not in ('deudor', 'acreedor') then
    raise exception 'Selecciona tu rol en la deuda.';
  end if;
  if p_monto is null or p_monto <= 0 or p_monto >= 10000000000
    or p_monto <> round(p_monto, 2) then
    raise exception 'Ingresa un monto válido con hasta dos decimales.';
  end if;

  v_deudor := case when p_rol = 'deudor' then v_usuario else p_contraparte end;
  v_acreedor := case when p_rol = 'acreedor' then v_usuario else p_contraparte end;

  insert into public.deudas (id, creada_por, deudor_id, acreedor_id, monto_inicial, motivo)
  values (v_deuda, v_usuario, v_deudor, v_acreedor, p_monto, nullif(btrim(p_motivo), ''));

  insert into public.participantes_deuda (deuda_id, perfil_id, rol)
  values (v_deuda, v_deudor, 'deudor'), (v_deuda, v_acreedor, 'acreedor');

  return v_deuda;
exception
  when foreign_key_violation then
    raise exception 'No se encontró el perfil de una de las cuentas.';
end;
$$;

revoke all on function public.registrar_deuda(uuid, text, numeric, text) from public, anon;
grant execute on function public.registrar_deuda(uuid, text, numeric, text) to authenticated;

commit;
