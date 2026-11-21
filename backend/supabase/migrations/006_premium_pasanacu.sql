begin;

create table public.suscripciones (
  perfil_id uuid primary key references public.perfiles(id) on delete cascade,
  vigente_hasta timestamptz not null
);

create table public.pagos_premium (
  referencia text primary key check (char_length(referencia) between 1 and 120),
  perfil_id uuid not null references public.perfiles(id),
  registrado_en timestamptz not null default now()
);

create function public.activar_premium(p_perfil uuid, p_referencia text)
returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  v_hasta timestamptz;
begin
  insert into public.pagos_premium (referencia, perfil_id)
  values (btrim(p_referencia), p_perfil)
  on conflict (referencia) do nothing;

  if found then
    insert into public.suscripciones (perfil_id, vigente_hasta)
    values (p_perfil, now() + interval '1 month')
    on conflict (perfil_id) do update
      set vigente_hasta = greatest(public.suscripciones.vigente_hasta, now()) + interval '1 month'
    returning vigente_hasta into v_hasta;
  else
    if not exists (
      select 1 from public.pagos_premium
      where referencia = btrim(p_referencia) and perfil_id = p_perfil
    ) then raise exception 'La referencia ya está asociada a otra cuenta.'; end if;
    select vigente_hasta into v_hasta from public.suscripciones where perfil_id = p_perfil;
  end if;
  return v_hasta;
end;
$$;

alter table public.pagos_premium enable row level security;
revoke all on public.pagos_premium from public, anon, authenticated;
revoke execute on function public.activar_premium(uuid, text) from public, anon, authenticated;

create function public.tiene_premium()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.suscripciones
    where perfil_id = auth.uid() and vigente_hasta > now()
  );
$$;

create table public.pasanacus (
  id uuid primary key default gen_random_uuid(),
  creador_id uuid not null references public.perfiles(id),
  nombre text not null check (char_length(nombre) between 1 and 80),
  cuota numeric(12,2) not null check (cuota > 0),
  cupos integer not null check (cupos between 2 and 25),
  estado text not null default 'abierto' check (estado in ('abierto', 'activo', 'completado')),
  turno integer not null default 1,
  codigo uuid unique default gen_random_uuid(),
  codigo_expira timestamptz not null default (now() + interval '7 days'),
  fecha_creacion timestamptz not null default now()
);

create table public.pasanacu_miembros (
  grupo_id uuid not null references public.pasanacus(id),
  perfil_id uuid not null references public.perfiles(id),
  posicion integer not null,
  primary key (grupo_id, perfil_id),
  unique (grupo_id, posicion)
);

create table public.pasanacu_aportes (
  grupo_id uuid not null references public.pasanacus(id),
  turno integer not null,
  aportante_id uuid not null,
  registrado_en timestamptz not null default now(),
  confirmado_en timestamptz,
  primary key (grupo_id, turno, aportante_id),
  foreign key (grupo_id, turno) references public.pasanacu_miembros(grupo_id, posicion),
  foreign key (grupo_id, aportante_id) references public.pasanacu_miembros(grupo_id, perfil_id)
);

create function public.puede_ver_pasanacu(p_grupo uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.tiene_premium() and exists (
    select 1 from public.pasanacu_miembros
    where grupo_id = p_grupo and perfil_id = auth.uid()
  );
$$;

alter table public.suscripciones enable row level security;
alter table public.pasanacus enable row level security;
alter table public.pasanacu_miembros enable row level security;
alter table public.pasanacu_aportes enable row level security;

revoke all on public.suscripciones, public.pasanacus, public.pasanacu_miembros,
  public.pasanacu_aportes from public, anon, authenticated;
grant select on public.suscripciones, public.pasanacu_miembros, public.pasanacu_aportes to authenticated;
grant select (id, creador_id, nombre, cuota, cupos, estado, turno, fecha_creacion)
  on public.pasanacus to authenticated;

create policy suscripcion_propia on public.suscripciones for select to authenticated
  using (perfil_id = (select auth.uid()));
create policy grupo_visible on public.pasanacus for select to authenticated
  using (public.puede_ver_pasanacu(id));
create policy miembros_visibles on public.pasanacu_miembros for select to authenticated
  using (public.puede_ver_pasanacu(grupo_id));
create policy aportes_visibles on public.pasanacu_aportes for select to authenticated
  using (public.puede_ver_pasanacu(grupo_id));

create function public.estado_plan()
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'plan', case when public.tiene_premium() then 'premium' else 'gratis' end,
    'vigente_hasta', (select vigente_hasta from public.suscripciones where perfil_id = auth.uid()),
    'precio_mensual', 10,
    'moneda', 'BOB'
  );
$$;

create function public.crear_pasanacu(p_nombre text, p_cuota numeric, p_cupos integer)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_grupo uuid;
begin
  if not public.tiene_premium() then raise sqlstate 'PT403' using message = 'El plan premium está inactivo.'; end if;
  if p_nombre is null or char_length(btrim(p_nombre)) not between 1 and 80
    or p_cuota is null or p_cuota <= 0 or p_cuota >= 10000000000 or p_cuota <> round(p_cuota, 2)
    or p_cupos is null or p_cupos not between 2 and 25 then
    raise sqlstate 'PT400' using message = 'Revisa el nombre, la cuota y los cupos.';
  end if;
  insert into public.pasanacus (creador_id, nombre, cuota, cupos)
  values (auth.uid(), btrim(p_nombre), p_cuota, p_cupos) returning id into v_grupo;
  insert into public.pasanacu_miembros values (v_grupo, auth.uid(), 1);
  return v_grupo;
end;
$$;

create function public.invitar_pasanacu(p_grupo uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_codigo uuid;
begin
  if not public.tiene_premium() then raise sqlstate 'PT403' using message = 'El plan premium está inactivo.'; end if;
  update public.pasanacus set
    codigo = case when codigo_expira > now() then codigo else gen_random_uuid() end,
    codigo_expira = case when codigo_expira > now() then codigo_expira else now() + interval '7 days' end
  where id = p_grupo and creador_id = auth.uid() and estado = 'abierto'
  returning codigo into v_codigo;
  if not found then raise sqlstate 'PT404' using message = 'Grupo abierto no encontrado.'; end if;
  return v_codigo;
end;
$$;

create function public.unirse_pasanacu(p_codigo uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_grupo public.pasanacus%rowtype;
  v_miembros integer;
begin
  if not public.tiene_premium() then raise sqlstate 'PT403' using message = 'El plan premium está inactivo.'; end if;
  select * into v_grupo from public.pasanacus
  where codigo = p_codigo and codigo_expira > now() and estado = 'abierto' for update;
  if not found then raise sqlstate 'PT404' using message = 'Invitación inválida o vencida.'; end if;
  if public.puede_ver_pasanacu(v_grupo.id) then return v_grupo.id; end if;
  select count(*) into v_miembros from public.pasanacu_miembros where grupo_id = v_grupo.id;
  if v_miembros >= v_grupo.cupos then raise sqlstate 'PT409' using message = 'El grupo está lleno.'; end if;
  insert into public.pasanacu_miembros values (v_grupo.id, auth.uid(), v_miembros + 1);
  return v_grupo.id;
end;
$$;

create function public.iniciar_pasanacu(p_grupo uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_grupo public.pasanacus%rowtype;
begin
  if not public.tiene_premium() then raise sqlstate 'PT403' using message = 'El plan premium está inactivo.'; end if;
  select * into v_grupo from public.pasanacus
  where id = p_grupo and creador_id = auth.uid() and estado = 'abierto' for update;
  if not found then raise sqlstate 'PT404' using message = 'Grupo abierto no encontrado.'; end if;
  if (select count(*) from public.pasanacu_miembros where grupo_id = p_grupo) <> v_grupo.cupos then
    raise sqlstate 'PT409' using message = 'Faltan participantes para iniciar.';
  end if;
  update public.pasanacus set estado = 'activo', codigo = null where id = p_grupo;
  return 'activo';
end;
$$;

create function public.registrar_aporte_pasanacu(p_grupo uuid, p_turno integer)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_turno integer;
  v_posicion integer;
begin
  if not public.puede_ver_pasanacu(p_grupo) then raise sqlstate 'PT403' using message = 'Acceso al grupo denegado.'; end if;
  select turno into v_turno from public.pasanacus
  where id = p_grupo and estado = 'activo' and turno = p_turno for update;
  select posicion into v_posicion from public.pasanacu_miembros where grupo_id = p_grupo and perfil_id = auth.uid();
  if v_turno is null or v_turno = v_posicion then
    raise sqlstate 'PT409' using message = 'No corresponde registrar un aporte en este turno.';
  end if;
  insert into public.pasanacu_aportes (grupo_id, turno, aportante_id)
  values (p_grupo, v_turno, auth.uid()) on conflict do nothing;
  return v_turno;
end;
$$;

create function public.confirmar_aporte_pasanacu(p_grupo uuid, p_turno integer, p_aportante uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_grupo public.pasanacus%rowtype;
begin
  if not public.puede_ver_pasanacu(p_grupo) then raise sqlstate 'PT403' using message = 'Acceso al grupo denegado.'; end if;
  select * into v_grupo from public.pasanacus where id = p_grupo and estado = 'activo' and turno = p_turno for update;
  if not found or not exists (
    select 1 from public.pasanacu_miembros where grupo_id = p_grupo and posicion = p_turno and perfil_id = auth.uid()
  ) then raise sqlstate 'PT409' using message = 'Solo el beneficiario del turno vigente puede confirmar.'; end if;

  update public.pasanacu_aportes set confirmado_en = coalesce(confirmado_en, now())
  where grupo_id = p_grupo and turno = p_turno and aportante_id = p_aportante;
  if not found then raise sqlstate 'PT404' using message = 'Aporte no encontrado.'; end if;

  if (select count(*) from public.pasanacu_aportes
      where grupo_id = p_grupo and turno = p_turno and confirmado_en is not null) = v_grupo.cupos - 1 then
    if p_turno = v_grupo.cupos then
      update public.pasanacus set estado = 'completado' where id = p_grupo;
      return 'completado';
    end if;
    update public.pasanacus set turno = turno + 1 where id = p_grupo;
  end if;
  return 'activo';
end;
$$;

revoke execute on function public.estado_plan(), public.tiene_premium(), public.puede_ver_pasanacu(uuid),
  public.crear_pasanacu(text, numeric, integer), public.invitar_pasanacu(uuid), public.unirse_pasanacu(uuid),
  public.iniciar_pasanacu(uuid), public.registrar_aporte_pasanacu(uuid, integer),
  public.confirmar_aporte_pasanacu(uuid, integer, uuid) from public, anon;
grant execute on function public.estado_plan(), public.tiene_premium(), public.puede_ver_pasanacu(uuid),
  public.crear_pasanacu(text, numeric, integer), public.invitar_pasanacu(uuid), public.unirse_pasanacu(uuid),
  public.iniciar_pasanacu(uuid), public.registrar_aporte_pasanacu(uuid, integer),
  public.confirmar_aporte_pasanacu(uuid, integer, uuid) to authenticated;

-- Centraliza la escritura de deudas y participantes en la función validada de 003.
alter function public.registrar_deuda(uuid, text, numeric, text) security definer;
revoke insert on public.deudas, public.participantes_deuda from public, anon, authenticated;
revoke insert (id, creada_por, deudor_id, acreedor_id, monto_inicial, motivo)
  on public.deudas from authenticated;

commit;
