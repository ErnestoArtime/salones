# Lavía · SaaS de gestión para salones

MVP multiempresa autoalojado. Nombre e identidad provisionales: se pueden sustituir sin cambiar el modelo de negocio. Datos de ejemplo claramente identificados.

## Aplicaciones

| Aplicación        | URL local                                         | Uso                                                    |
| ----------------- | ------------------------------------------------- | ------------------------------------------------------ |
| Gestión           | https://lavia.eav-labs.com/                            | Propiedad, gerencia, recepción y profesionales         |
| Reservas          | https://lavia.eav-labs.com/booking/?salon=estudio-demo | Reservar sin cuenta y cancelar mediante enlace privado |
| Plataforma        | https://lavia.eav-labs.com/admin/                      | Planes y suspensión de negocios                        |
| Correo de pruebas | http://localhost:8131/                            | Confirmaciones de cuentas y recuperación de contraseña |

El despliegue del VPS está publicado mediante Cloudflare Tunnel en `https://lavia.eav-labs.com`, con cookies seguras y autenticación propia. Los puertos siguen ligados a `127.0.0.1`; Mailpit permanece privado y puede abrirse con `ssh -L 8131:127.0.0.1:8131 usuario@servidor`. Los checkouts nuevos usan los valores locales de `pnpm setup`.

## Arranque

Requisitos: Node 24, pnpm 9.15 y Docker Compose. El proyecto genera sus propios secretos y usa volúmenes con el prefijo de `COMPOSE_PROJECT_NAME`.

```sh
pnpm install --frozen-lockfile
pnpm run configure
bash tools/deploy.sh
pnpm run seed
```

`seed` es opcional y crea un negocio de demostración. Sus credenciales aleatorias se guardan en `.local/demo.json` con permisos privados. Si se ejecuta después del primer despliegue, recrea la API (`docker compose up -d --force-recreate api`) para aplicar el administrador demo. No hay contraseña pública fija. Sustituye `PLATFORM_ADMIN_EMAILS` por el correo verificado del administrador real antes del piloto.

No uses `pnpm setup`: ese es un comando propio del gestor pnpm. Utiliza `pnpm run configure`.

## Alcance funcional

- Registro con confirmación por correo, acceso, renovación de sesión y recuperación de contraseña.
- Creación de negocios, cambio de negocio y varias sedes según el plan.
- Roles de propietario, gerente, recepción y profesional; una cuenta puede pertenecer a varios negocios.
- Servicios con duración, preparación, precio, moneda y desactivación.
- Profesionales, asignación de servicios, horarios semanales partidos y ausencias.
- Clientes, notas e historial de citas. En la primera versión el listado carga hasta 2.000 fichas por salón.
- Agenda diaria, lista y vista semanal; reserva, cambio, cancelación, completado y ausencia del cliente.
- Personalización por salón: portada y fotos de servicios propias, textos, categorías y biblioteca con permisos de propietario/gerente.
- Portal público con portada fotográfica, categorías editables y búsqueda de servicios; disponibilidad, reserva con consentimiento registrado, exportación de calendario y enlace privado de cancelación.
- Planes manuales: prueba (3 profesionales / 1 sede), Essential (10 / 1), Studio (30 / 5). Los límites se aplican en la API.
- Administración de planes y suspensión de negocios, con auditoría de cambios.

El valor de servicios completados es informativo; no representa caja cobrada ni facturación. No hay cobro automático de suscripciones, pagos online, caja, inventario, comisiones, recordatorios, WhatsApp ni push en esta entrega. Los correos de autenticación llegan al buzón local; el portal avisa expresamente de que no envía confirmaciones de citas. El portal es una SPA responsive: SSR y páginas SEO individuales quedan para una fase posterior. La app móvil tiene integración y preparación de Capacitor; los binarios y la verificación en dispositivos requieren Android Studio/Xcode y un dominio HTTPS.

## Estudio virtual

Se ha añadido un catálogo de trabajos propios del salón, carga privada de retratos con consentimiento, tareas de generación, cuotas, comparador antes/después, historial y vínculo con citas. La API externa está preparada con Replicate y FLUX.2 Pro; **no hay clave configurada y no se generan imágenes reales todavía**. Consulta [Virtual Studio](docs/virtual-studio.md) para activarlo y conocer su alcance.

## Estructura

```text
apps/
  salon-app/          Angular + Ionic, configuración de Capacitor
  booking-web/        Angular, reservas públicas
  superadmin/         Angular, administración de plataforma
  api/src/modules/    NestJS: auth, tenants, catalog, team, customers,
                      appointments, public-booking y platform
libs/
  contracts/          Contratos TypeScript
  data-access/        Cliente HTTP, renovación de sesión y transporte nativo
  ui/                 Autenticación, iconos y estilos compartidos
infra/                Dockerfiles, Caddy, inicialización de Supabase
  systemd/            Ejemplo de respaldo programado
database/             Migraciones SQL versionadas
tools/                Configuración, despliegue, datos demo, backup y restore
tests/                Integración real y recorridos de navegador
```

Nx orquesta compilaciones y servidores. Angular CLI compila las tres aplicaciones web. El backend es un monolito modular, con un motor de reservas compartido. PostgreSQL se usa mediante `pg` y SQL parametrizado: permite controlar RLS, transacciones y restricciones de exclusión explícitamente. No se introduce Prisma en esta implementación.

## Desarrollo y comprobaciones

```sh
pnpm run infra:up
pnpm run db:migrate
pnpm exec nx run api:build
pnpm run dev
# 4300 gestión, 4301 reservas y 4302 plataforma; API 4310
pnpm run build
pnpm run test
pnpm exec playwright install chromium
pnpm run test:e2e
```

La API en modo desarrollo ejecuta el código compilado con `node --watch`; después de modificar TypeScript recompila con `pnpm exec tsc -p apps/api/tsconfig.json --watch` en otro terminal. Los frontends tienen recarga automática. Las pruebas de integración generan usuarios y negocios temporales y los eliminan; las de navegador usan exclusivamente el negocio demo. Debe estar arrancado el despliegue de Compose y creado el demo para ejecutarlas.

Más información: [arquitectura](docs/architecture.md), [operación y migración](docs/operations.md), [móvil](docs/mobile.md) y [verificación](docs/verification.md).

Portal visual y categorías: [documentación](docs/public-catalog.md).

Personalización: [guía de uso y almacenamiento](docs/page-personalization.md).
