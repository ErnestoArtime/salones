# Rediseño de Lavía — octubre de 2026

Identidad Atelier existente, Fraunces + IBM Plex Sans y paleta cálida/ciruela. Sistema compartido en `design.md` y tokens comunes; sin cambios de esquema ni sustitución de textos/fotos publicados por los salones.

## Cambios

- Gestión: menú móvil desplegable con nombres e iconos diferenciados, estado activo, cierre con Escape y foco al título al navegar. Agenda primero en la navegación; cabeceras y resumen más compactos. Roles traducidos.
- Editor público: un único encabezado, textos divididos en portada, catálogo y visita; bloques desplegables accesibles y controles consistentes. Se mantienen derechos de publicación, categorías y biblioteca privadas.
- Portal: fotos existentes, proporciones más compactas, tarjetas con imagen lateral en móvil y rejilla en escritorio. Descripción, precio, duración y selección conservados. Los textos propios del salón siguen siendo la fuente del contenido.
- Reservas: título por tarea, resumen compacto, horas agrupadas en mañana, tarde y noche según la zona de la sede, sin eliminar ninguna hora disponible. Mensaje de falta de disponibilidad independiente de la fecha elegida.
- Estudio virtual: un aviso de proveedor pendiente, títulos directos y detalle secundario de tratamiento desplegable. Consentimientos explícitos junto a las operaciones correspondientes.
- Plataforma: listado de salones con controles de plan y acceso etiquetados, estado de guardado por negocio y recuentos de datos reales.
- Acceso: texto propio de administración y de gestión, ayuda de contraseña donde corresponde.

## Verificación

Compilación de las cuatro aplicaciones, recorridos existentes de navegador y nuevos casos de responsividad. Los nuevos casos comprueban navegación y diálogos a 320, 375, 414, 768 y 1440 px, encabezados únicos, ausencia de desbordamientos, movimiento reducido, horarios completos, posición de los controles de reserva y contenido público largo. Las pruebas funcionales usan un salón temporal para publicación/fotos y limpian sus registros; los recorridos demo limpian sus datos de prueba.

La vista previa local se sirve exclusivamente en loopback; las pruebas mantienen el origen HTTPS y las cookies seguras mediante `TEST_PREVIEW_ORIGIN`. El proveedor de IA sigue sin activarse por este rediseño.

```sh
pnpm run build
TEST_WEB_URL=https://lavia.eav-labs.com pnpm run test:e2e
```

Revisión Hallmark: P5 H5 E4 S5 R5 V4. Coherencia entre páginas sobre variación del tema, sin métricas inventadas, sin adornos nuevos, sin tipografía en cursiva, colores/fuentes de tokens, foco visible y grillas acotadas. Comprobaciones de contraste de texto automatizadas sobre acceso, agenda y catálogo; no sustituyen una auditoría completa de accesibilidad ni pruebas en dispositivos físicos.

Capturas y mediciones privadas previas en `.local/design-audit/`; revisión posterior en `.local/design-after/`. Publicación mediante el supervisor existente de `main`, con respaldo previo y los mismos volúmenes.
