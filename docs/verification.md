# Verificación del MVP local

Fecha: 19 de octubre de 2026. Entorno: VPS del usuario, Docker Compose, Node 24, PostgreSQL 17 y Chromium.

## Compilación

Las cuatro aplicaciones compilan mediante Nx. Angular comprueba también las plantillas. Las imágenes de API y web se han construido y el despliegue usa el usuario PostgreSQL de aplicación sin privilegios globales. Los servicios existentes del VPS no se han modificado.

## Integración real

19 comprobaciones pasadas contra la API, PostgreSQL, GoTrue y Storage reales: sesión, aislamiento de tenants, claves foráneas, horarios, competencia por el mismo hueco, idempotencia, preparación entre citas, bloqueos, roles y revocación, cancelación con portal cerrado, cambios de cita, límites de plan y origen de las escrituras.

Virtual Studio añade consentimiento, decodificación de imágenes, eliminación de EXIF, privacidad sin sesión y entre tenants, catálogo, rechazo explícito de generación sin clave, procesamiento de una tarea con proveedor sintético inyectado solo en la prueba, resultado privado, reserva vinculada y eliminación de fotografías conservando el consumo.

Las imágenes de esas pruebas son ruido sintético, sin personas. No se ha llamado a Replicate ni se ha probado la calidad de una simulación real. El resultado sintético de test se elimina al finalizar y no aparece en el catálogo demo.

## Navegador

4 recorridos pasados con Chromium: gestión y edición persistente, reserva pública y cancelación, superadministración y Estudio virtual sin proveedor. Se verifican estilos realmente aplicados, ausencia de errores JavaScript y desbordamientos en 320, 375, 414 y 768 px, además de escritorio.

Se revisaron capturas de agenda, reservas y Estudio virtual. Están en `.local/screenshots/`. Los colores principales de texto cumplen contraste WCAG AA; el foco se ajustó para contrastar con papel y botones. La política CSP se conserva sin scripts inline; la compilación de Angular desactiva inlineCritical para evitar su cargador inline de CSS.

## Respaldo y restauración

Se generó un respaldo consistente con dump de base de datos, roles, Storage, claves persistentes de PostgreSQL, configuración y checksums. Se comprobó la restauración en una base aislada; el proceso necesita el rol de mantenimiento supabase_admin para objetos internos de Supabase Vault. El runtime no utiliza ese rol. También pasó el script completo `tools/verify-restore.sh`: creó un proyecto Compose aislado, restauró base de datos y volúmenes, reinició PostgreSQL con las claves restauradas, comprobó datos y RLS sin contexto y eliminó únicamente los recursos temporales.

## Límites

No hay dominio, SMTP externo ni destino externo de backups. No se han activado generaciones pagadas. No se han compilado binarios Android/iOS ni probado dispositivos reales. No se ha validado un volumen grande de usuarios, una caída de hardware ni la fidelidad facial de un modelo de IA. Las pruebas responsive no sustituyen una auditoría completa de accesibilidad ni pruebas en dispositivos.


## Publicación HTTPS

Dominio: `https://lavia.eav-labs.com`. DNS CNAME con proxy y ruta de túnel
verificados por API; Google DNS y Cloudflare DNS devuelven registros A.
Se recrearon Auth, API y Storage con las URLs públicas y cookies seguras.
Los cuatro flujos Playwright pasaron en el origen HTTPS: gestión persistente,
reservas y cancelación, superadministración y estudio virtual. Se verificó
inicio de sesión con cookies Secure, HttpOnly y SameSite=Lax.
Durante estas pruebas el resolver del VPS conservaba un NXDOMAIN anterior;
Chromium resolvió el host a la IP de Cloudflare publicada por DNS sobre HTTPS,
conservando el dominio, TLS y validación de certificado normales.
La configuración temporal está en `.local/playwright-public.config.ts` y los
resultados en `.local/domain-browser.log`; no se versionan credenciales.


## Catálogo visual de clientes

- Compilación Nx: cuatro objetivos correctos. Imágenes Docker API/web recompiladas
  y desplegadas; migración 005 aplicada. Respaldo anterior en
  `backups/pre-public-catalog/`.
- Integración: 19 comprobaciones correctas, incluida categoría persistida y rechazo
  de categorías inválidas. Se mantienen las comprobaciones de aislamiento,
  concurrencia de reservas y privacidad del estudio virtual.
- Navegador HTTPS: cinco recorridos correctos, con reserva/cancelación, gestión,
  plataforma, estudio virtual y catálogo por categorías/búsqueda/estados vacíos.
  Los filtros se contrastan con la API real; se comprueba carga de las imágenes.
- Pantallas 320/375/414/768/1440 sin desbordamiento. Portada y CTA verificadas
  dentro de 1280×800. Imágenes WebP locales con carga diferida salvo la principal.
- Contraste WCAG calculado sobre tokens renderizados: tinta/papel 13.04,
  texto secundario/papel 6.03, secundario/superficie 6.39,
  texto del botón/acento 9.37 y foco/papel 3.02.
- El resumen de reserva queda fijo solo después de seleccionar un servicio;
  las anclas conservan el identificador del salón. Ambos casos se verifican
  con Playwright. Capturas en `.local/screenshots/public-final-*.png` y
  `public-catalog-*.png`; resultados en `.local/catalog-browser.log`.


## Personalización por salón

Compilación Nx: 4 objetivos correctos; imágenes API y web reconstruidas y
servicios saludables. Migración 006 aplicada con respaldo anterior en
`backups/pre-page-personalization/`.

Integración: 26 comprobaciones correctas. Casos nuevos: categorías iniciales
por negocio, roles, formato real de fotos, autorización de biblioteca, fotos
pendientes no públicas, publicación de textos/categorías/fotos, aislamiento
por slug e ID, conflictos de revisión, categoría en uso, referencias cruzadas,
compatibilidad de ediciones antiguas y retirada/borrado de imágenes. Las
pruebas usan fotos sintéticas y negocios temporales que se eliminan.

Navegador HTTPS: 6 recorridos correctos. El recorrido nuevo crea un negocio
QA, publica textos y portada propia, crea/reordena una categoría, cambia la
foto y descripción de un servicio y comprueba su página pública. Verifica
que desactivar referencias elimina las imágenes genéricas y que el texto
con etiquetas HTML se muestra literalmente. Se revisan los cuatro apartados
del editor y la página pública a 320/375/414/768 px sin desbordamiento.
El negocio QA y sus fotos se eliminaron al finalizar.

Resultados: `.local/page-integration.log`, `.local/page-final-build.log` y
`.local/page-final-browser.log`. Capturas del editor en
`.local/screenshots/page-editor-desktop.png` y `page-editor-mobile.png`.

## Caja y ampliación de IA · 26 de octubre de 2026

Migración 007 validada en un proyecto Compose aislado (`lavia-feature-test`), sin clave de IA externa. 37 comprobaciones de integración pasan: aislamiento, permisos, reservas, imágenes privadas, controles/pausa de IA, cola concurrente, evaluación, cobros, devolución, comisiones y cierres. Tres recorridos nuevos de navegador cubren caja completa, controles de IA y comparador/revisión con imagen sintética, incluidos cinco anchos. Las pruebas crean salones temporales y limpian sus registros y fotos. Se comprueban RLS forzado y privilegios de las cuatro tablas nuevas; no hay acceso anónimo ni UPDATE/DELETE de movimientos para el rol de la API.

El modelo de pago no se ha evaluado con imágenes reales: falta la clave de Replicate. El test sintético verifica el recorrido y las restricciones, no la fidelidad de la IA ni el precio del proveedor.

## Proveedores de IA · 30 de octubre de 2026

Compilación de las cuatro aplicaciones correcta. Pasan 45 comprobaciones con infraestructura de pruebas aislada y sin claves externas, además de los siete tests del supervisor. Tres recorridos de navegador verifican caja, controles de IA, consentimiento con el nombre de Runway y revisión del comparador sintético. Las pruebas nuevas cubren el contrato del SDK de Runway, dos subidas efímeras, espera y cancelación, límites de descarga, errores sin reenvíos y bloqueo del consentimiento para otro proveedor. La solicitud real del adaptador de Replicate se inspecciona con transporte simulado para asegurar que `input_images` contiene ambas fotografías y conserva la proporción del retrato. Una prueba con PostgreSQL confirma el proveedor/modelo guardados en la tarea.

La clave de Replicate autentica con HTTP 200 en el endpoint de cuenta y permite consultar el esquema de FLUX.2 Pro. Esta comprobación no crea predicciones ni consume generaciones. Las claves se configuran exclusivamente en el entorno privado del VPS. No se ha ejecutado ninguna generación real de pago ni se ha validado fidelidad facial o viabilidad del peinado.

## Recuperación de subidas de retratos · 30 de octubre de 2026

Se reprodujo el vaciado del selector y el botón deshabilitado ante una respuesta demorada más de 15 segundos. La corrección amplía a 120 segundos únicamente las subidas del estudio y conserva el archivo para reintentar, con error junto al campo y explicación del botón deshabilitado. Una sustitución fallida no permite generar con la foto anterior por equivocación.

Compilación de las cuatro aplicaciones correcta. El recorrido `tests/browser/studio-upload.spec.ts` comprueba fallo controlado, reintento con 17 segundos de demora, vista previa, nombre de archivo conservado, sustitución fallida/recuperada, retirada y anchos de 375/1440 px. Dos recorridos anteriores de controles y revisión de resultados siguen pasando. Se usan salones temporales e imágenes sintéticas, se limpian sus archivos y se bloquea cualquier envío de generación. Las capturas están en `.local/screenshots/studio-upload-375.png` y `studio-upload-1440.png`.

## Cámara, fondo y simulación de barba · 30 de octubre de 2026

La migración 008 se validó en Compose aislado, sin claves de proveedores. Pasan 48 comprobaciones de integración/prompt/SDK y los siete tests del supervisor: alcances compatibles, referencias propias y ajenas, claves foráneas compuestas, roles, idempotencia al cambiar de zona, trabajador combinado con tercera imagen y envío correcto de dos/tres referencias por ambos adaptadores. Las reglas de conservación se mantienen completas dentro del límite de texto de Runway.

Cuatro recorridos web comprueban controles, revisión, subida lenta con recuperación y el nuevo flujo de cámara/alcances. La segmentación se ejecuta de verdad con el modelo local sobre un retrato ficticio de prueba; se verifica fondo blanco. La cámara se simula con un MediaStream de canvas real: permiso denegado, recuperación, captura, detención de tracks al capturar/cambiar de pestaña, selección conjunta y marcado del catálogo. Un archivo corrupto no llega al endpoint de subida. Se bloquean las solicitudes de generación en estas pruebas y no hay consumo de pago. Se revisan 375/1440 px. Las capturas del catálogo están en `.local/screenshots/studio-scopes-375.png` y `studio-scopes-1440.png`; las de retrato conservan el prefijo `studio-upload`.

La cámara física en distintos móviles, los binarios nativos, el recorte con barbas muy largas y la fidelidad de generaciones de pago siguen requiriendo evaluación específica. Las pruebas del constructor de prompts no se presentan como garantía de conservación píxel a píxel del rostro o de la barba.
