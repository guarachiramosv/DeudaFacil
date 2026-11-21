# Backend — Supabase

La autenticación y la base de datos PostgreSQL se alojan en Supabase. Esta carpeta contiene el esquema SQL versionado para revisar y mantener los cambios.

## Autenticación por celular

La app usa teléfono boliviano y contraseña. El proveedor **Phone** debe estar habilitado en **Authentication → Sign In / Providers**. Con la confirmación de teléfonos activada (recomendado para usuarios reales), Supabase necesita un proveedor de SMS configurado para enviar el código OTP. Para una demo se puede desactivar la confirmación, pero los números no quedarán verificados.

## Migraciones

`supabase/migrations/` contiene, en orden:

1. `001_esquema_inicial.sql`: perfiles, deudas, participantes, movimientos, confirmaciones, políticas RLS y vista de saldos.
2. `002_perfil_automatico_al_registrar.sql`: crea el perfil cuando se registra una cuenta en Supabase Auth.

Estas migraciones ya se ejecutaron en el proyecto Supabase DeudaFacil desde SQL Editor. No las vuelvas a ejecutar manualmente salvo que estés reconstruyendo una base limpia; mantén sincronizado el historial de migraciones remotas.

## Seguridad

La app se conecta con una clave publicable y políticas RLS. Nunca uses una clave `secret` o `service_role` en el frontend ni la guardes en este repositorio.

Las futuras funciones de servidor pueden agregarse en `functions/` como Supabase Edge Functions.
