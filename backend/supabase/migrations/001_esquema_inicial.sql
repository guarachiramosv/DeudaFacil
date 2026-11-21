-- DeudaFacil: esquema inicial para Supabase/PostgreSQL
-- Ejecutar en el proyecto correcto desde Supabase SQL Editor.
-- No insertar registros personales hasta configurar el inicio de sesión.

create extension if not exists pgcrypto;

create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  telefono text,
  fecha_creacion timestamptz not null default now()
);

create table if not exists public.deudas (
  id uuid primary key default gen_random_uuid(),
  creada_por uuid not null references public.perfiles(id),
  deudor_id uuid not null references public.perfiles(id),
  acreedor_id uuid not null references public.perfiles(id),
  monto_inicial numeric(12,2) not null check (monto_inicial > 0),
  moneda text not null default 'BOB' check (moneda = 'BOB'),
  motivo text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','confirmada','en_revision','pagada','cancelada')),
  fecha_creacion timestamptz not null default now(),
  check (deudor_id <> acreedor_id)
);

create table if not exists public.participantes_deuda (
  deuda_id uuid not null references public.deudas(id) on delete cascade,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  rol text not null check (rol in ('deudor','acreedor')),
  fecha_union timestamptz not null default now(),
  primary key (deuda_id, perfil_id),
  unique (deuda_id, rol)
);

create table if not exists public.movimientos (
  id uuid primary key default gen_random_uuid(),
  deuda_id uuid not null references public.deudas(id) on delete cascade,
  registrado_por uuid not null references public.perfiles(id),
  tipo text not null check (tipo in ('abono','ajuste')),
  monto numeric(12,2) not null check (monto > 0),
  nota text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','confirmado','reportado')),
  fecha_creacion timestamptz not null default now()
);

create table if not exists public.confirmaciones (
  id uuid primary key default gen_random_uuid(),
  movimiento_id uuid not null references public.movimientos(id) on delete cascade,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  estado text not null check (estado in ('confirmado','reportado')),
  comentario text,
  fecha_confirmacion timestamptz not null default now(),
  unique (movimiento_id, perfil_id)
);

create index if not exists deudas_deudor_idx on public.deudas(deudor_id);
create index if not exists deudas_acreedor_idx on public.deudas(acreedor_id);
create index if not exists movimientos_deuda_fecha_idx on public.movimientos(deuda_id, fecha_creacion desc);
create index if not exists participantes_perfil_idx on public.participantes_deuda(perfil_id);

-- Funciones pequeñas SECURITY DEFINER para que las políticas RLS puedan comprobar
-- membresía y creador sin exponer tablas ni provocar recursión entre políticas.
create or replace function public.es_participante_deuda(p_deuda_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.participantes_deuda p
    where p.deuda_id = p_deuda_id and p.perfil_id = (select auth.uid())
  );
$$;

create or replace function public.es_creador_deuda(p_deuda_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.deudas d
    where d.id = p_deuda_id and d.creada_por = (select auth.uid())
  );
$$;

revoke all on function public.es_participante_deuda(uuid) from public, anon;
revoke all on function public.es_creador_deuda(uuid) from public, anon;
grant execute on function public.es_participante_deuda(uuid) to authenticated;
grant execute on function public.es_creador_deuda(uuid) to authenticated;

alter table public.perfiles enable row level security;
alter table public.deudas enable row level security;
alter table public.participantes_deuda enable row level security;
alter table public.movimientos enable row level security;
alter table public.confirmaciones enable row level security;

-- Privilegios mínimos para el cliente autenticado; no habilitar anon.
revoke all on public.perfiles, public.deudas, public.participantes_deuda,
  public.movimientos, public.confirmaciones from anon, authenticated;
grant select, insert, update on public.perfiles to authenticated;
grant select, insert, update on public.deudas to authenticated;
grant select, insert on public.participantes_deuda to authenticated;
grant select, insert on public.movimientos to authenticated;
grant select, insert, update on public.confirmaciones to authenticated;

-- Perfiles: cada usuario administra solamente su perfil.
create policy perfiles_ver_propio on public.perfiles
  for select to authenticated using (id = (select auth.uid()));
create policy perfiles_crear_propio on public.perfiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy perfiles_editar_propio on public.perfiles
  for update to authenticated using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Deudas: solo sus participantes y la persona creadora pueden leer/actualizar.
create policy deudas_ver_participantes on public.deudas
  for select to authenticated
  using (public.es_participante_deuda(id) or creada_por = (select auth.uid()));
create policy deudas_crear_usuario on public.deudas
  for insert to authenticated
  with check (creada_por = (select auth.uid()));
create policy deudas_actualizar_participantes on public.deudas
  for update to authenticated
  using (public.es_participante_deuda(id) or creada_por = (select auth.uid()))
  with check (public.es_participante_deuda(id) or creada_por = (select auth.uid()));

-- Participantes: el usuario ve su propia relación; solo el creador agrega participantes.
create policy participantes_ver_propio on public.participantes_deuda
  for select to authenticated
  using (perfil_id = (select auth.uid()) or public.es_creador_deuda(deuda_id));
create policy participantes_agregar_creador on public.participantes_deuda
  for insert to authenticated
  with check (public.es_creador_deuda(deuda_id));

-- Movimientos: solo participantes registran y consultan movimientos.
create policy movimientos_ver_participantes on public.movimientos
  for select to authenticated using (public.es_participante_deuda(deuda_id));
create policy movimientos_crear_participantes on public.movimientos
  for insert to authenticated
  with check (registrado_por = (select auth.uid()) and public.es_participante_deuda(deuda_id));

-- Confirmaciones: un participante solo puede confirmar en su propio nombre.
create policy confirmaciones_ver_participantes on public.confirmaciones
  for select to authenticated
  using (exists (
    select 1 from public.movimientos m
    where m.id = movimiento_id and public.es_participante_deuda(m.deuda_id)
  ));
create policy confirmaciones_crear_propia on public.confirmaciones
  for insert to authenticated
  with check (
    perfil_id = (select auth.uid()) and exists (
      select 1 from public.movimientos m
      where m.id = movimiento_id and public.es_participante_deuda(m.deuda_id)
    )
  );
create policy confirmaciones_editar_propia on public.confirmaciones
  for update to authenticated
  using (perfil_id = (select auth.uid()) and exists (
    select 1 from public.movimientos m
    where m.id = movimiento_id and public.es_participante_deuda(m.deuda_id)
  ))
  with check (perfil_id = (select auth.uid()) and exists (
    select 1 from public.movimientos m
    where m.id = movimiento_id and public.es_participante_deuda(m.deuda_id)
  ));

-- Al crear una deuda desde la app, crear también dos filas en participantes_deuda
-- (deudor y acreedor). El saldo se calcula: monto_inicial - abonos confirmados.

-- Mantener estado del movimiento según las confirmaciones de ambas partes.
create or replace function public.actualizar_estado_movimiento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_movimiento_id uuid := coalesce(new.movimiento_id, old.movimiento_id);
  v_estado text;
begin
  if exists (
    select 1 from public.confirmaciones c
    where c.movimiento_id = v_movimiento_id and c.estado = 'reportado'
  ) then
    v_estado := 'reportado';
  elsif (
    select count(distinct c.perfil_id) from public.confirmaciones c
    where c.movimiento_id = v_movimiento_id and c.estado = 'confirmado'
  ) >= 2 then
    v_estado := 'confirmado';
  else
    v_estado := 'pendiente';
  end if;
  update public.movimientos set estado = v_estado where id = v_movimiento_id;
  return new;
end;
$$;
revoke all on function public.actualizar_estado_movimiento() from public, anon, authenticated;
create trigger confirmaciones_actualizar_estado_movimiento
  after insert or update on public.confirmaciones
  for each row execute function public.actualizar_estado_movimiento();

-- Vista de saldo calculado: solo resta los abonos confirmados.
create or replace view public.saldos_deuda
with (security_invoker = true)
as
select
  d.id as deuda_id,
  greatest(d.monto_inicial - coalesce(sum(case
    when m.tipo = 'abono' and m.estado = 'confirmado' then m.monto
    else 0
  end), 0), 0)::numeric(12,2) as saldo_pendiente,
  d.moneda
from public.deudas d
left join public.movimientos m on m.deuda_id = d.id
group by d.id, d.monto_inicial, d.moneda;
grant select on public.saldos_deuda to authenticated;
