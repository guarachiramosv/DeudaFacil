-- Crear el perfil básico en cuanto Supabase Auth registra un usuario.
-- El trigger permite que el perfil exista incluso si el correo debe confirmarse
-- antes de que la app reciba una sesión autenticada.

create or replace function public.crear_perfil_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, nombre, telefono)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Usuario'
    ),
    nullif(trim(new.raw_user_meta_data ->> 'telefono'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.crear_perfil_usuario() from public, anon, authenticated;

drop trigger if exists auth_user_crear_perfil on auth.users;
create trigger auth_user_crear_perfil
  after insert on auth.users
  for each row execute function public.crear_perfil_usuario();
