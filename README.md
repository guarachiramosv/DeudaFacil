# DeudaFácil

Prototipo de aplicación móvil para gestionar deudas entre comerciantes y clientes.

## Estructura

- `frontend/`: app móvil Expo + React Native, autenticación y perfil.
- `backend/supabase/migrations/`: esquema PostgreSQL, políticas RLS y funciones SQL para el proyecto alojado en Supabase.
- `backend/functions/`: espacio para futuras Supabase Edge Functions. La autenticación y la base de datos viven en Supabase.

## Ejecutar la app

1. Abre una terminal en `frontend/`.
2. Ejecuta `npm install` si aún no están instaladas las dependencias.
3. Copia `.env.example` como `.env` y configura `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
4. Ejecuta `npm start` y abre el proyecto con Expo Go.

## Acceso con celular

El registro e inicio de sesión usan número boliviano (+591) y contraseña. En Supabase, habilita **Authentication → Sign In / Providers → Phone**. Si la confirmación telefónica está activada, también configura un proveedor de SMS (por ejemplo, Twilio); la app incluye una pantalla para ingresar el código recibido. Para una demo sin SMS se puede desactivar la confirmación telefónica, pero no se recomienda para cuentas reales porque no verifica que la persona controle ese número.

Las instrucciones de backend están en `backend/README.md`. No coloques claves `secret` o `service_role` en el frontend.
