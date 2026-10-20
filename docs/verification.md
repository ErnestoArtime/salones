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
