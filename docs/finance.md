# Caja, cobros y comisiones

Gestión → Caja. Propiedad, gerencia y recepción pueden consultar y abrir cajas y registrar cobros. Solo propiedad y gerencia realizan devoluciones, movimientos manuales, pagos de comisión, cambios de porcentaje y cierres. Profesionales y visitantes no acceden al módulo.

## Trabajo diario

1. Selecciona sede y moneda. Abre la caja de hoy indicando el efectivo físico inicial. La fecha se calcula en la zona horaria de la sede.
2. Completa una cita desde Agenda. En Caja aparecerá entre las pendientes de cobro de esa sede y moneda, también si el servicio se realizó otro día.
3. Registra el pago recibido en efectivo, tarjeta, transferencia u otro método. Se admiten pagos parciales y varios métodos hasta cubrir el precio de la cita.
4. Para devolver, busca el cobro original y pulsa Devolver. Se utiliza el método original y se exige un motivo. Una devolución de un cobro antiguo se registra en la caja abierta de hoy, conservando el cierre anterior.
5. Registra entradas y salidas manuales de efectivo con motivo. No cambian el valor de las citas ni las comisiones.
6. Cuenta el efectivo y cierra la caja. Se guardan apertura, totales por método, efectivo esperado, contado y diferencia. Si hay diferencia, explica el motivo. El día cerrado no se reabre ni recibe movimientos nuevos.

Son registros de pagos ya realizados; no se procesan cargos bancarios, pagos online, facturas fiscales, impuestos ni nóminas. No se convierten monedas. Se admiten monedas con dos decimales y cada caja es independiente por sede, moneda y día. No se cobran citas confirmadas, canceladas o marcadas como ausencia; la primera versión cobra servicios completados. Una devolución no modifica el precio de la cita: su saldo pendiente vuelve a reflejar la diferencia entre precio y cobrado neto.

## Comisiones

En la pestaña Comisiones se configura un porcentaje por profesional, entre 0 y 100 con dos decimales. El porcentaje se conserva en cada cobro y se aplica al importe recibido. Cambiarlo no modifica el historial. Los saldos se separan por moneda; el importe pendiente acumula el histórico del profesional.

Las devoluciones descuentan la comisión calculada con el porcentaje original. Las devoluciones parciales distribuyen el redondeo de forma acumulada, de modo que una devolución completa devuelve exactamente la comisión del cobro. Se redondea al céntimo por cobro, no por cita completa.

Registrar un pago de comisión descuenta su saldo pendiente. Si se paga en efectivo, también reduce el efectivo esperado de la caja. Las devoluciones posteriores a pagar una comisión pueden dejar saldo negativo, mostrado como saldo a compensar. No se eliminan ni reescriben pagos históricos.

## Integridad y exportación

Los movimientos se añaden; no se editan ni se borran desde la aplicación. La API utiliza transacciones, un bloqueo por salón y claves de idempotencia. Dos peticiones concurrentes no pueden cobrar por encima del saldo, devolver más que el cobro original ni pagar comisiones por encima de lo pendiente. No se permite sacar más efectivo que el registrado.

Los importes se guardan como céntimos enteros y los porcentajes como puntos básicos; la aritmética de comisiones usa enteros. Las claves foráneas incluyen el salón y las tablas tienen RLS forzado. El rol de ejecución no tiene UPDATE ni DELETE sobre los movimientos.

La pantalla muestra hasta 200 movimientos y 100 citas pendientes; el historial rápido incluye 30 días de caja. Se pueden consultar fechas anteriores con el selector. Los totales comprenden todos los movimientos del día. La exportación CSV incluye hasta 10.000 movimientos por día, fecha UTC, tipo de operación, método, importe, comisión y nota; se neutralizan fórmulas en los textos. Las salidas se identifican por el tipo de operación, con importe positivo; las correcciones de comisión llevan signo negativo.

## Verificación

`tests/finance.test.mjs` comprueba permisos y aislamiento, concurrencia, idempotencia, pagos parciales, devoluciones y redondeo, monedas separadas, comisiones, movimientos de efectivo, cierre persistente y devolución posterior. `tests/browser/finance.spec.ts` recorre las operaciones con un salón temporal y cinco anchos. No se crean movimientos en el salón demo ni se envían cargos reales.

Las pruebas de calidad visual identifican las imágenes sintéticas como pruebas; no sustituyen una generación real del proveedor. El detector estático de diseño interpreta los bindings Angular `[src]` del estudio como fuentes ausentes; los tests de navegador comprueban que las imágenes vinculadas cargan realmente.
