# Virtual Studio · prueba de estilos con fotografías

Inspirado en la propuesta funcional facilitada por el usuario: https://beauty-saas-virtual-studio-ai.soundskink18.chatgpt.site/. Se implementa dentro de la identidad y el monorepo de Lavía, sin copiar el sitio de referencia.

## Recorrido implementado

Gestión → Estudio virtual. El propietario o profesional añade un trabajo real con permiso para usar la imagen, un servicio y una descripción del cabello. Gerencia o propiedad publica los estilos para el probador. Un profesional con cuenta vinculada puede enviar borradores atribuidos a su propia ficha.

Para una consulta presencial, se obtiene consentimiento, se captura o sube el retrato y se selecciona un estilo publicado. Un segundo consentimiento autoriza el envío del retrato y la referencia a Replicate. La solicitud crea una tarea persistida en PostgreSQL. El resultado aparece en el historial y en el comparador antes/después. Recepción puede preparar una cita del servicio y cliente relacionados; la cita y el enlace con la simulación se guardan en una transacción.

El módulo es privado para el equipo del salón en esta versión. No hay fotos públicas ni probador anónimo en el portal de reservas. No incluye cámara con efectos en tiempo real, entrenamiento de modelos ni transferencia exacta garantizada.

## Activar el proveedor después

No hay clave configurada. La interfaz muestra ese estado y la API rechaza generar sin consumir cuota. No se ha enviado ninguna fotografía a un proveedor real ni se ha validado la calidad de una generación de pago.

Configura en `.env`:

```dotenv
REPLICATE_API_TOKEN=tu_clave_privada
STUDIO_MODEL=black-forest-labs/flux-2-pro
```

Después: `docker compose up -d --force-recreate api`. No hace falta publicar el VPS: las fotos viajan como entradas de imagen a la API mediante una conexión saliente. El token nunca se entrega al navegador.

Se usa AI SDK 7 con el adaptador oficial de Replicate. El modelo configurado acepta varias imágenes de referencia: se envían primero el rostro del cliente y después el trabajo del salón. Las indicaciones piden preservar identidad y modificar únicamente el cabello. Esto orienta al modelo, pero no garantiza fidelidad facial, viabilidad profesional ni reproducción exacta del corte. El resultado siempre se presenta como simulación orientativa.

Antes de activar la clave hay que revisar las condiciones, retención, uso de datos, precio y permisos comerciales del proveedor y del modelo elegidos. No se incorpora una tarifa supuesta como coste real. `cost_cents` permanece sin valor hasta que exista conciliación con el proveedor.

## Privacidad y almacenamiento

Supabase Storage mantiene el bucket `virtual-studio` privado. El navegador solo accede mediante rutas de la API que verifican sesión, pertenencia al salón y permisos. Los nombres de objeto incluyen tenant e identificador aleatorio. Un profesional puede ver sus fotos y las referencias publicadas; gerencia y recepción pueden gestionar las pruebas del negocio.

Se aceptan JPEG, PNG y WebP, máximo 5 MB y 16 megapíxeles. El servidor decodifica y normaliza a JPEG, elimina EXIF y limita dimensiones. El consentimiento se registra con fecha y versión `studio-v1`. Las fotos de clientes y resultados caducan en 72 horas; la API impide verlas al caducar y el mantenimiento periódico elimina los objetos del almacenamiento activo. Las referencias del catálogo se conservan mientras formen parte del catálogo.

El usuario puede retirar una foto todavía no utilizada o borrar las fotos y pruebas que comparten un retrato desde el historial. Una tarea en curso debe terminar antes del borrado. Los registros de consumo y auditoría se conservan sin imagen. Las copias de seguridad contienen los archivos y pueden conservar fotos hasta su rotación; el borrado local no garantiza que el proveedor haya eliminado su copia. La aplicación no usa estas fotos para entrenar modelos.

## Tareas, cuotas y fallos

Cuotas iniciales: prueba 10, Essential 50, Studio 100 solicitudes mensuales por negocio. Se cuentan también las solicitudes fallidas, porque pueden tener coste. Borrar una prueba no devuelve cuota. El servidor serializa la comprobación de cuota y usa claves de idempotencia. Máximo 100 subidas diarias por salón.

Un trabajador dentro de la API toma tareas con bloqueo transaccional y SKIP LOCKED. Al caer el proceso, una tarea ya enviada no se reenvía automáticamente; pasados seis minutos se marca fallida con una advertencia sobre posible consumo. Esto evita repetir a ciegas una llamada de pago. Una desconexión no permite saber si el proveedor ya cobró. No hay conciliación de costes ni cancelación remota en esta primera versión.

La cuota se reserva al solicitar. Los fallos y las eliminaciones conservan ese registro; los resultados caducados dejan de aparecer en el historial visual. La conservación externa y la de los backups deben definirse al preparar el piloto.

## Verificación

Las pruebas usan imágenes sintéticas sin personas. Verifican consentimiento, decodificación y eliminación de EXIF, aislamiento, acceso privado, catálogo, estado sin clave y el trabajador con un proveedor sintético inyectado únicamente en la prueba. Ese proveedor de prueba no forma parte del arranque de producción y no se presenta como IA real. La evaluación con rostros reales y el modelo de pago queda pendiente de la clave y de autorización de los participantes.

Referencias técnicas: https://ai-sdk.dev/providers/ai-sdk-providers/replicate y https://replicate.com/black-forest-labs/flux-2-pro/api/schema.

Las fotografías de referencia que se suben pero no se incorporan a un trabajo caducan en 24 horas. El mes de cuota se calcula en UTC.
