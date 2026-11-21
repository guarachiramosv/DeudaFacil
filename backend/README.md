# Backend — Node.js y Supabase

La API de Node.js consulta PostgreSQL a través de la API REST de Supabase. Las reglas de acceso y las operaciones de negocio viven en las migraciones SQL. Supabase Auth emite el token de sesión.

## Ejecutar la API

1. Usa Node.js 22 o superior. Desde `backend/`, copia `.env.example` a `.env`.
2. Coloca la URL del proyecto y su clave publicable en `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`.
3. Ejecuta `npm start`. Comprueba la conexión en `http://127.0.0.1:3000/salud`.

Las rutas `/api` reciben el `access_token` de Supabase Auth en `Authorization: Bearer <token>`. Las solicitudes POST usan `Content-Type: application/json`. Las respuestas correctas devuelven un objeto con `data`.

| Método y ruta | Cuerpo o resultado |
| --- | --- |
| `GET /api/perfil` | Perfil de la sesión |
| `GET /api/deudas` | Deudas visibles para la sesión |
| `POST /api/deudas` | `contraparte` (UUID), `rol` (`deudor` o `acreedor`), `monto`, `motivo` opcional |
| `POST /api/deudas/:id/respuesta` | `confirmar` (booleano) |
| `GET /api/deudas/:id/saldo` | Saldo visible para la sesión |
| `GET /api/deudas/:id/abonos` | Historial de abonos |
| `POST /api/deudas/:id/abonos` | `monto`, `nota` opcional |
| `POST /api/abonos/:id/respuesta` | `confirmar` (booleano) |
| `GET /api/plan` | `plan` (`gratis` o `premium`), `vigente_hasta`, `precio_mensual` y `moneda` |
| `GET /api/pasanacus` | Grupos visibles para la sesión |
| `POST /api/pasanacus` | `nombre`, `cuota` en Bs, `cupos` (2 a 25) |
| `POST /api/pasanacus/:id/invitacion` | Envía `{}`. Devuelve el código de invitación al creador |
| `POST /api/pasanacus/unirse` | `codigo` (UUID). Devuelve el ID del grupo |
| `POST /api/pasanacus/:id/inicio` | Envía `{}`. Devuelve `activo` cuando el creador inicia el grupo lleno |
| `GET /api/pasanacus/:id` | Lista con el grupo, sus miembros ordenables por `posicion` y su historial de aportes |
| `POST /api/pasanacus/:id/aportes` | `turno`. Registra el aporte del usuario autenticado y devuelve el número de turno |
| `POST /api/pasanacus/:id/aportes/confirmacion` | `turno`, `aportante` (UUID). Devuelve `activo` o `completado` |

Las consultas devuelven listas. Crear una deuda o un abono devuelve su UUID. Responder devuelve el nuevo estado.

### Integración del frontend

- Inicia sesión por correo con Supabase Auth. Pasa `session.access_token` en cada solicitud y renueva la sesión con el SDK de Supabase.
- Usa las URL y claves del proyecto Supabase vinculado al backend. La URL base de Node.js es independiente. Desde el mismo PC usa `http://127.0.0.1:3000`. Para un dispositivo físico configura una dirección accesible desde ese dispositivo.
- Los montos aceptan números o texto decimal con hasta dos decimales. Puedes enviar `"30.50"`. Todas las operaciones son en BOB.
- Las rutas devuelven `{ "data": ... }`; los errores devuelven `{ "error": "...", "codigo": "..." }` cuando Supabase aporta un código. Maneja `401` solicitando una sesión nueva. Un arreglo vacío indica que el recurso no está visible.
- Deudas y abonos constituyen el plan gratis. Para un Pasanacu, consulta primero `GET /api/plan`. Cada miembro necesita premium vigente. El beneficiario del turno se identifica comparando `posicion` con `turno`. Los otros miembros registran una cuota cada uno y el beneficiario confirma su recepción. Tras confirmar todas las cuotas, vuelve a consultar el grupo para mostrar el siguiente turno.

### Activar Premium después de verificar el pago

En **SQL Editor**, un administrador puede activar o renovar un mes por cada referencia de pago verificada de Bs 10:

```sql
select public.activar_premium('UUID-DEL-PERFIL'::uuid, 'REFERENCIA-UNICA-DEL-PAGO');
```

Repetir la misma referencia para la misma cuenta devuelve el vencimiento sin dar otro mes. Pasanacu registra aportes y confirmaciones de transferencias hechas por los usuarios. El cobro automático y las transferencias requieren una integración de pagos aparte.

## Autenticación por correo

Habilita **Email** en **Authentication → Sign In / Providers** y conserva la confirmación de correo. El servicio de correo integrado permite probar con direcciones de miembros del equipo. Para enviar confirmaciones a usuarios externos, configura SMTP propio.

## Migraciones

`supabase/migrations/` contiene, en orden:

1. `001_esquema_inicial.sql`: perfiles, deudas, participantes, movimientos, confirmaciones, políticas RLS y vista de saldos.
2. `002_perfil_automatico_al_registrar.sql`: crea el perfil cuando se registra una cuenta en Supabase Auth.
3. `003_registrar_deuda.sql`: registra una deuda pendiente y sus dos participantes en una sola transacción.

4. `004_responder_deuda.sql`: permite que la contraparte confirme una deuda pendiente o la marque en revisión.
5. `005_abonos.sql`: registra abonos en deudas confirmadas y permite que la contraparte confirme o reporte cada abono. La vista `saldos_deuda` descuenta únicamente los abonos confirmados.
6. `006_premium_pasanacu.sql`: activa planes, agrega los grupos y turnos de Pasanacu y centraliza las escrituras de deudas en su función SQL.

En un proyecto Supabase nuevo, ejecuta los archivos en el orden indicado desde **SQL Editor**. En un proyecto existente, ejecuta solo los archivos pendientes.

## Seguridad

Node.js reenvía a Supabase el token de cada usuario para aplicar RLS y los permisos de las funciones SQL. La configuración usa la clave publicable. Si un cliente web se sirve desde otro origen, configura su URL exacta en `ALLOWED_ORIGIN`.

Las futuras funciones de servidor pueden agregarse en `functions/` como Supabase Edge Functions.
