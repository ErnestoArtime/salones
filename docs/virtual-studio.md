# Virtual Studio · prueba de estilos con fotografías

Inspirado en la propuesta funcional facilitada por el usuario: https://beauty-saas-virtual-studio-ai.soundskink18.chatgpt.site/. Se implementa dentro de la identidad y el monorepo de Lavía, sin copiar el sitio de referencia.

## Recorrido implementado

Gestión → Estudio virtual. El propietario o profesional añade un trabajo real con permiso para usar la imagen, un servicio y una descripción del cabello. Gerencia o propiedad publica los estilos para el probador. Un profesional con cuenta vinculada puede enviar borradores atribuidos a su propia ficha.

Para una consulta presencial, se obtiene consentimiento, se captura o sube el retrato y se selecciona un estilo publicado. Un segundo consentimiento autoriza el envío del retrato y la referencia al proveedor indicado en pantalla (Runway o Replicate). Si el proveedor ha cambiado desde que se abrió la página, la API exige actualizar y confirmar el consentimiento correcto. La solicitud crea una tarea persistida en PostgreSQL con proveedor y modelo. El resultado aparece en el historial y en el comparador antes/después. Recepción puede preparar una cita del servicio y cliente relacionados; la cita y el enlace con la simulación se guardan en una transacción.

El módulo es privado para el equipo del salón en esta versión. No hay fotos públicas ni probador anónimo en el portal de reservas. No incluye cámara con efectos en tiempo real, entrenamiento de modelos ni transferencia exacta garantizada.

## Configurar el proveedor

Sin la clave del proveedor seleccionado, la interfaz muestra que falta activación y la API rechaza generar sin consumir cuota. La integración y las pruebas automatizadas no suponen una validación de calidad con fotografías reales ni ejecutan generaciones de pago.

Para Runway configura en `.env`:

```dotenv
STUDIO_PROVIDER=runway
RUNWAYML_API_SECRET=tu_clave_privada
RUNWAY_STUDIO_MODEL=gen4_image
```

La clave se obtiene en https://dev.runway.com/. Se utiliza el SDK oficial `@runwayml/sdk`, subidas efímeras de las dos fotos privadas y el endpoint `textToImage` con referencias etiquetadas. Se espera la tarea con el helper oficial, con cancelación y sin reenvío automático. El resultado vertical 1080:1440 se descarga y normaliza al almacenamiento privado de Lavía. El texto enviado, incluidas las instrucciones de estilo, se limita a los 1.000 caracteres UTF-16 admitidos por el modelo; las instrucciones largas del catálogo pueden quedar truncadas. `gen4_image_turbo` también se admite por configuración; cualquier otro modelo se rechaza antes de enviar fotos.

Para Replicate:

```dotenv
REPLICATE_API_TOKEN=tu_clave_privada
STUDIO_PROVIDER=replicate
STUDIO_MODEL=black-forest-labs/flux-2-pro
```

En el VPS gestionado, después de guardar la clave privadamente en `.env`, ejecuta `python3 tools/reload-api-config.py`. El script toma los bloqueos del supervisor, valida la infraestructura aprobada y recrea únicamente la API de la release activa. En un checkout sin supervisor, usa el procedimiento de despliegue de su entorno. No hace falta publicar el VPS: las fotos viajan como entradas de imagen a la API mediante una conexión saliente. El token nunca se entrega al navegador.

La clave de Replicate se crea en https://replicate.com/account/api-tokens. Esa conexión conserva AI SDK 7 con el adaptador oficial de Replicate y admite `black-forest-labs/flux-2-pro`. El esquema actual exige `input_images`: se pasa explícitamente mediante las opciones del proveedor porque el mapeo `prompt.images` del adaptador instalado utiliza otros nombres de campo. Se envían primero el rostro del cliente y después el trabajo del salón, con proporción de la primera imagen y resolución de 1 MP. Una prueba sin red inspecciona la solicitud real del SDK y comprueba que ambas referencias llegan en ese campo. En ambos proveedores las indicaciones piden preservar identidad y modificar únicamente el cabello. Esto orienta al modelo, pero no garantiza fidelidad facial, viabilidad profesional ni reproducción exacta del corte. El resultado siempre se presenta como simulación orientativa. No hace falta tener claves de ambos proveedores; no hay fallback automático. Una tarea histórica conserva su proveedor y modelo aunque se cambie la configuración.

Antes de activar la clave hay que revisar las condiciones, retención, uso de datos, precio y permisos comerciales del proveedor y del modelo elegidos. No se incorpora una tarifa supuesta como coste real. `cost_cents` permanece sin valor hasta que exista conciliación con el proveedor.

## Privacidad y almacenamiento

Supabase Storage mantiene el bucket `virtual-studio` privado. El navegador solo accede mediante rutas de la API que verifican sesión, pertenencia al salón y permisos. Los nombres de objeto incluyen tenant e identificador aleatorio. Un profesional puede ver sus fotos y las referencias publicadas; gerencia y recepción pueden gestionar las pruebas del negocio.

Se aceptan JPEG, PNG y WebP, máximo 5 MB y 16 megapíxeles. El servidor decodifica y normaliza a JPEG, elimina EXIF y limita dimensiones. El consentimiento se registra con fecha y versión `studio-v1`. Las fotos de clientes y resultados caducan en 72 horas; la API impide verlas al caducar y el mantenimiento periódico elimina los objetos del almacenamiento activo. Las referencias del catálogo se conservan mientras formen parte del catálogo.

La subida de fotografías permite hasta 120 segundos, manteniendo el límite de 15 segundos para las demás peticiones. El archivo del retrato permanece seleccionado al terminar o fallar; los errores aparecen junto al campo y permiten reintentar sin volver a elegirlo. Una sustitución fallida conserva la foto anterior pero bloquea generar hasta resolver el error. El botón explica si falta un estilo, una foto, consentimiento, cuota o activación del proveedor. Subir una imagen no envía ninguna generación al proveedor externo.

El usuario puede retirar una foto todavía no utilizada o borrar las fotos y pruebas que comparten un retrato desde el historial. Una tarea en curso debe terminar antes del borrado. Los registros de consumo y auditoría se conservan sin imagen. Las copias de seguridad contienen los archivos y pueden conservar fotos hasta su rotación; el borrado local no garantiza que el proveedor haya eliminado su copia. La aplicación no usa estas fotos para entrenar modelos.

## Tareas, cuotas y fallos

Cuotas iniciales: prueba 10, Essential 50, Studio 100 solicitudes mensuales por negocio. Se cuentan también las solicitudes fallidas, porque pueden tener coste. Borrar una prueba no devuelve cuota. El servidor serializa la comprobación de cuota y usa claves de idempotencia. Máximo 100 subidas diarias por salón.

Un trabajador dentro de la API toma tareas con bloqueo transaccional y SKIP LOCKED. Al caer el proceso, una tarea ya enviada no se reenvía automáticamente; pasados seis minutos se marca fallida con una advertencia sobre posible consumo. Esto evita repetir a ciegas una llamada de pago. Una desconexión no permite saber si el proveedor ya cobró. No hay conciliación de costes ni cancelación remota en esta primera versión.

La cuota se reserva al solicitar. Los fallos y las eliminaciones conservan ese registro; los resultados caducados dejan de aparecer en el historial visual. La conservación externa y la de los backups deben definirse al preparar el piloto.

## Verificación

Las pruebas usan imágenes sintéticas sin personas. Verifican consentimiento, decodificación y eliminación de EXIF, aislamiento, acceso privado, catálogo, estado sin clave y el trabajador con un proveedor sintético inyectado únicamente en la prueba. Ese proveedor de prueba no forma parte del arranque de producción y no se presenta como IA real. La evaluación con rostros reales y el modelo de pago requiere autorización de los participantes y se realiza aparte de las pruebas automáticas.

Referencias técnicas: https://docs.dev.runwayml.com/api, https://docs.dev.runwayml.com/assets/inputs/, https://docs.dev.runwayml.com/guides/pricing/, https://ai-sdk.dev/providers/ai-sdk-providers/replicate y https://replicate.com/black-forest-labs/flux-2-pro/api/schema.

Las fotografías de referencia que se suben pero no se incorporan a un trabajo caducan en 24 horas. El mes de cuota se calcula en UTC.

## Controles y revisión del resultado

Propiedad y gerencia pueden pausar las generaciones y fijar un límite mensual de solicitudes igual o inferior a la cuota del plan. El contador usa meses UTC e incluye fallos y registros cuyas fotos se borraron. Se muestran consumo por estado y solicitudes restantes. Es un límite de solicitudes, no una estimación del precio ni un presupuesto monetario del proveedor. Como máximo se admiten dos tareas pendientes por salón. No hay reintentos automáticos de llamadas de pago.

Pausar impide solicitudes nuevas y que el trabajador tome tareas en espera; las ya enviadas continúan. Las tareas cuyas entradas han caducado pasan a fallo. La pausa y la toma de tareas se coordinan con el mismo bloqueo transaccional.

Los resultados terminados se revisan con el comparador: aprobar o marcar para mejorar, con notas, autor y fecha. Antes de crear la primera cita vinculada se exige aprobación de propiedad, gerencia o el profesional autor de la prueba. Una valoración no garantiza la fidelidad de la IA; la prueba de calidad con proveedor real requiere fotografías con permiso y continúa pendiente. La interfaz no presenta el proveedor sintético de los tests como una generación real.
