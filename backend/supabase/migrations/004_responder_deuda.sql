begin;

create function public.responder_deuda(p_deuda uuid, p_confirmar boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_estado text;
begin
  if v_usuario is null or p_confirmar is null then
    raise exception 'La respuesta requiere una sesión y una decisión.';
  end if;

  update public.deudas
  set estado = case when p_confirmar then 'confirmada' else 'en_revision' end
  where id = p_deuda
    and estado = 'pendiente'
    and creada_por <> v_usuario
    and v_usuario in (deudor_id, acreedor_id)
    and public.es_participante_deuda(id)
  returning estado into v_estado;

  if not found then
    raise exception 'La deuda ya fue respondida o no puedes responderla.';
  end if;
  return v_estado;
end;
$$;

revoke insert, update on public.deudas from public, anon, authenticated;
grant insert (id, creada_por, deudor_id, acreedor_id, monto_inicial, motivo)
  on public.deudas to authenticated;
drop policy deudas_actualizar_participantes on public.deudas;
revoke all on function public.responder_deuda(uuid, boolean) from public, anon;
grant execute on function public.responder_deuda(uuid, boolean) to authenticated;

commit;
