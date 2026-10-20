# Decisiones de arquitectura

## Núcleo compartido, aplicaciones por actor

Un único backend NestJS ofrece reglas de negocio comunes. Los módulos de negocio están en `apps/api/src/modules/`; cada uno tiene su controlador. `CoreModule` comparte autenticación y acceso a PostgreSQL. `BookingEngineModule` comparte disponibilidad y creación de citas. Se pueden extraer servicios cuando exista una necesidad de despliegue independiente, manteniendo los contratos HTTP.

Las aplicaciones no comparten componentes de negocio completos indiscriminadamente: comparten contratos, cliente HTTP, identidad visual y autenticación. La gestión y el portal tienen recorridos distintos. Añadir una aplicación no exige duplicar datos ni reglas de reservas.

## Multiempresa y autorización

`tenants` representa el negocio; `branches`, sus sedes. `memberships` permite distintos roles por persona y negocio. Los profesionales pueden existir sin cuenta: recepción puede gestionar sus citas. Para dar acceso, la persona se registra y confirma su correo; el propietario la vincula en Mi salón → Accesos del equipo. Retirar la pertenencia se aplica a la siguiente petición, sin esperar a la expiración del JWT.

GoTrue (Supabase Auth) valida los usuarios. La API verifica la sesión con `/user`; los tokens se transportan en cookies HttpOnly. Nunca se usa metadata editable del usuario para autorizar. Los administradores de plataforma se determinan mediante una lista de correos verificados en configuración del servidor, no desde el navegador. Cerrar sesión borra cookies y revoca la renovación en GoTrue; un access token ya emitido puede seguir siendo válido hasta su expiración de una hora.

El rol PostgreSQL `salon_api` no es propietario, superusuario ni BYPASSRLS. Todas las tablas de `salon` tienen RLS forzado. El contexto de usuario y tenant se establece con `set_config(..., true)` dentro de cada transacción y desaparece al terminar. Las relaciones incluyen `tenant_id` en sus claves foráneas, evitando referencias cruzadas entre empresas.

La API verifica la pertenencia y el rol antes de cada operación privada. La autorización por rol está en la API; RLS protege el aislamiento entre tenants. El acceso público usa un contexto de transacción resuelto por slug y se limita a los controladores públicos. Esta conexión es de confianza de la API: no se entregan sus credenciales al navegador ni se permite enviar contexto de base de datos desde HTTP. El esquema `salon` no se expone mediante PostgREST. PostgREST y Storage tampoco tienen puertos públicos.

Las únicas funciones propias SECURITY DEFINER están en el esquema privado: `owns_tenant` y `find_confirmed_user`. Tienen `search_path` vacío, ejecución revocada de PUBLIC y comprobaciones explícitas de propiedad; permiten mostrar miembros y vincular una cuenta confirmada sin dar acceso general a `auth.users`.

## Integridad de la agenda

La disponibilidad combina horarios locales, servicios asignados, duración, preparación posterior, bloqueos y citas activas. Los instantes se guardan como TIMESTAMPTZ y se presentan en la zona IANA de la sede. Se ofrecen comienzos cada 15 minutos, desde cinco minutos en el futuro y hasta 120 días.

La creación toma un bloqueo transaccional del profesional, valida la disponibilidad y conserva precio, moneda y nombre del servicio como fotografía del momento de reserva. Un EXCLUDE GiST sobre el intervalo `[starts_at, blocked_until)` impide solapamientos entre citas confirmadas y completadas incluso si hubiera otro escritor. Canceladas y no asistidas liberan el intervalo.

Los bloqueos de agenda toman el mismo bloqueo del profesional y rechazan solapamientos con citas activas. Cambiar horarios conserva las citas ya registradas. Los cambios de precio o servicio no alteran el histórico.

Cada reserva lleva una clave UUID de idempotencia y un hash del contenido. Un reintento devuelve la misma cita; reutilizar la clave con otros datos produce 409. El cambio de cita cancela la anterior y crea una nueva dentro de una única transacción; si falla, la anterior permanece intacta. Los reintentos del cambio también son idempotentes.

La cancelación pública requiere un token específico, del que solo se almacena el hash. El token viaja en el fragmento del enlace, no en la URL enviada al servidor. El navegador retira el fragmento al abrirlo. Cancelar sigue funcionando cuando el salón ha desactivado nuevas reservas o está suspendido.

## Infraestructura portable

Compose ejecuta Database, Auth, REST y Storage de Supabase, además de API, frontends, Caddy y Mailpit. Se omiten Studio, analítica, Realtime y Edge Functions para reducir consumo. La referencia de infraestructura está fijada a Supabase self-hosted/v0.8.3; las imágenes tienen versiones explícitas.

El núcleo de gestión no depende de Vercel, Supabase Cloud, servicios de correo externos ni SDKs de pagos. Virtual Studio añade una conexión opcional a Replicate, activada únicamente al configurar la clave del servidor y obtener el consentimiento correspondiente. Mailpit retiene correos únicamente para pruebas. Los archivos de fuentes también se sirven desde el VPS.

Las migraciones SQL propias se aplican una sola vez con checksum y bloqueo de exclusión. No mezclar este historial con `supabase db push`: el directorio es propio de la aplicación. Cada cambio se añade como una migración nueva.

## Extensiones previstas

Entitlements por módulo más detallados; caja, suscripciones cobradas y auditoría exportable; invitaciones por correo; notificaciones transaccionales con outbox y trabajador; recursos compartidos por servicio; paginación y fusión de clientes; páginas públicas con SSR; marca por salón y dominios propios. El MVP reserva un profesional por cita y permite una sede por profesional. No incluye marketplace ni aplicaciones móviles separadas por cliente comercial.

## Referencias verificadas

- https://supabase.com/docs/guides/self-hosting/docker
- https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail
- https://nx.dev/docs/technologies/angular/introduction
- https://docs.nestjs.com/security/authentication
- https://capacitorjs.com/docs/apis/http
- https://capacitorjs.com/docs/apis/cookies


## Páginas propias de cada salón

`PagesModule` concentra la configuración publicada, categorías y biblioteca de
fotos del negocio. Las tablas `salon_pages`, `service_categories` y `page_assets`
tienen FORCE RLS; las relaciones por categoría e imagen incluyen el tenant.
El contexto público solo permite leer las fotos referenciadas actualmente por
la página habilitada, una categoría visible o un servicio activo. Los objetos
permanecen en el bucket privado `salon-pages` del Storage local, separado de los
retratos y resultados de Virtual Studio. No se entregan claves de Storage al
navegador. La API normaliza los archivos y los sirve con acceso comprobado.

La edición de textos y categorías se publica en una transacción con revisión
optimista; un bloqueo del negocio coordina publicaciones, edición de servicios
y borrado de fotos. Una categoría en uso no se puede eliminar y una foto en uso
no se puede borrar. El portal mantiene sus imágenes de referencia opcionales
como alternativa cuando no hay imagen propia. Guía: `page-personalization.md`.
