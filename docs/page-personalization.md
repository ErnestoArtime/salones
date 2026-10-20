# Personalización por salón

En Gestión → Página de clientes, propiedad y gerencia pueden personalizar el
portal de reservas del negocio activo. Recepción y profesionales no pueden
publicar ni acceder a la biblioteca de edición. Cada cambio registra auditoría.

## Uso

- **Portada y textos**: nombre público (sin cambiar el nombre interno), titular,
  descripción, botón de reserva, títulos e introducciones de categorías y
  catálogo, sección de visita y pie. Los saltos de línea del titular y de la
  visita se conservan. Los textos son texto plano, sin HTML.
- **Fotos**: subir portada y foto del salón o reutilizar una de la biblioteca.
  Se puede desactivar el uso de todas las fotografías genéricas. Si no hay
  foto propia, la página muestra un tratamiento tipográfico sin inventar fotos.
- **Categorías**: nombres, descripciones, fotos propias, referencia alternativa,
  orden y visibilidad en la sección de experiencias. Hasta 20 categorías. La
  visibilidad afecta a las experiencias de portada; las categorías con servicios
  activos siguen apareciendo en filtros y en las etiquetas del catálogo.
  Para borrar una categoría, reasignar primero todos sus servicios, incluidos
  los inactivos. La categoría general `other` se puede renombrar y se conserva
  como alternativa para altas de servicios sin clasificación.
- **Guardar y publicar** aplica textos y categorías en una sola transacción.
  Una revisión detecta otra sesión que haya publicado cambios entretanto;
  hay que recargar para evitar sobrescribirlos.
- **Fotos de servicios**: seleccionar servicio, cambiar su descripción, categoría
  y foto y pulsar **Guardar servicio**. La imagen propia tiene prioridad sobre
  la de categoría. Las categorías nuevas deben publicarse antes de asignarlas.
  La descripción y categoría también se editan desde Servicios.
- **Biblioteca**: reutilizar imágenes o eliminar las que no estén en uso. Para
  borrar una foto publicada, retirarla de sus usos y guardar primero. Los
  respaldos tienen retención independiente.

Los precios, duración y disponibilidad siguen siendo los del catálogo y del
motor de reservas. La personalización conserva rutas, acceso sin cuenta y
cancelación mediante enlace privado.

## Almacenamiento y aislamiento

Las fotos permanecen en el VPS, en el volumen Storage ya incluido en backups,
en un bucket privado independiente `salon-pages`. No se envían a la IA.
El servidor verifica JPEG/PNG/WebP reales, 5 MB, 16 megapíxeles; elimina metadatos,
normaliza orientación y guarda JPEG de hasta 1400×1800. Se exige declarar derechos
de publicación, incluyendo permiso de las personas que aparezcan. Biblioteca:
200 imágenes / 100 MB por negocio; las fotos sin publicar cuentan también.

`page_assets`, `salon_pages` y `service_categories` tienen FORCE RLS y contexto
por tenant. Las relaciones de imágenes y categorías son claves compuestas por
salón. Los archivos no se exponen directamente por Storage: la API sirve solo
las fotos asociadas a una página habilitada, categorías visibles o servicios
activos del slug resuelto. Una foto pendiente es privada. Retirar la última
referencia revoca su acceso público; no se emiten URLs firmadas duraderas.
Se utiliza `Cache-Control: no-store` también para las fotos públicas.

La migración 006 conserva las siete categorías anteriores por cada negocio.
Los negocios nuevos reciben esas categorías al crearse; después las pueden
renombrar, ordenar o ampliar. El runtime sigue siendo `salon_api`, sin BYPASSRLS.
Las fotos del estudio virtual continúan en su bucket privado separado y nunca
son elegibles como fotos públicas por ID.

## Operación

Se aplicó migración versionada 006. Respaldo previo:
`backups/pre-page-personalization/`. No se modifican migraciones ya aplicadas.
Los backups existentes capturan el volumen de Storage y las tablas nuevas.
La edición de servicios desde clientes anteriores conserva descripción, imagen
 y categoría si omiten esos campos.
