# Portal visual de clientes

El portal existente `/booking/?salon=<slug>` incorpora portada fotográfica,
categorías, catálogo con búsqueda, selección de servicio y la reserva existente.
La gestión interna y la administración mantienen su identidad y rutas.

Cada servicio tiene una categoría persistida y propia del negocio. Las
categorías iniciales son `hair`, `nails`, `barber`, `spa`, `massage`, `beauty` y
`other`; ahora se pueden renombrar y añadir categorías personalizadas. Se elige en Gestión → Servicios → editar/crear.
La API valida los valores y la base de datos exige una categoría del mismo salón.
La migración 005 clasifica una sola vez los servicios anteriores según el nombre;
el propietario puede corregirlos después. No cambia precios, citas ni permisos.

Las cinco categorías fotográficas siempre se pueden explorar. El catálogo
solo muestra los servicios activos publicados por ese negocio. Una categoría
sin servicios muestra un estado vacío explícito. Los filtros de texto omiten
mayúsculas y tildes. Elegir otro filtro no borra la selección de reserva.

Las imágenes son referencias de Pexels y no se presentan como trabajos reales
ni como personal del salón. Los WebP se sirven desde el VPS; fuentes y licencia
se documentan en `apps/booking-web/public/images/SOURCES.md`. Cada salón puede sustituirlas por fotos propias o desactivar las referencias
desde Página de clientes. Ver [personalización](page-personalization.md).
Virtual Studio conserva su catálogo privado y sus controles de acceso.

`node tools/demo-catalog.mjs` añade de forma idempotente tres servicios de
bienestar/barbería únicamente al negocio demo identificado por ID, slug y nombre.
Los asocia a los profesionales demo para que se pueda probar la reserva. No
se ejecuta en otros negocios. Los importes son datos de ejemplo.
