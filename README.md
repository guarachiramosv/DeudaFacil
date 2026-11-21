# DeudaFácil

Aplicación móvil pensada para ayudar a comerciantes a registrar y organizar las deudas y ventas fiadas de sus clientes. La idea contempla el registro manual y, en una etapa futura, la transcripción de deudas dictadas por voz para que el comerciante revise los datos antes de guardarlos.

## Estado actual

Este repositorio contiene únicamente la estructura inicial y la descripción del proyecto. La aplicación y sus funciones todavía no están implementadas.

## Estructura propuesta

```text
.
├── assets/                         # Recursos visuales de la aplicación
├── lib/
│   ├── app/                        # Configuración y composición de la app
│   └── features/
│       └── deudas/
│           ├── data/               # Persistencia y fuentes de datos
│           ├── domain/             # Modelos y reglas del negocio
│           └── presentation/       # Pantallas y componentes de deudas
└── test/                           # Pruebas futuras
```

La estructura sigue una organización por funcionalidad para mantener separadas la interfaz, las reglas de negocio y el acceso a datos. Se completará al iniciar el proyecto Flutter.

## Tecnologías previstas

- Flutter y Dart
- `speech_to_text` para transcribir voz directamente a texto, sujeto a permisos y disponibilidad del dispositivo
