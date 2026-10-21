# Despliegue automático del VPS

El VPS consulta por SSH `main` de `git@github.com:ErnestoArtime/salones.git` cada minuto mediante `lavia-deploy.timer`. Un push inicia la actualización en la siguiente consulta, más el tiempo de compilación. No requiere GitHub Actions, secretos de GitHub ni un puerto SSH adicional. El temporizador queda habilitado al reiniciar el VPS.

## Flujo y conservación de datos

1. Obtiene el commit en un repositorio privado separado; el checkout de desarrollo no se modifica.
2. Extrae una release por SHA y compila imágenes `lavia/api:<SHA>` y `lavia/web:<SHA>` mientras la versión anterior sigue atendiendo.
3. Verifica los volúmenes existentes, la infraestructura aprobada, las migraciones ya aplicadas y el espacio disponible.
4. Pausa los escritores y respalda PostgreSQL, roles, archivos de Storage, configuración persistente y secretos. Hay una interrupción breve durante el respaldo y la actualización.
5. Ejecuta las nuevas migraciones, arranca la aplicación y comprueba API, reservas y administración. Guarda el SHA y el respaldo utilizados.

Las releases comparten el `.env`, `.local` y `backups` originales del proyecto. Se mantienen los mismos volúmenes `lavia_pg-data`, `lavia_pg-config`, `lavia_storage-data` y `lavia_mail-data`. No se ejecuta seed, no se regeneran contraseñas y no se eliminan volúmenes. Los bloqueos impiden solapar despliegues y respaldos manuales.

## Operación

```sh
lavia-deploy status
systemctl status lavia-deploy.timer --no-pager
journalctl -u lavia-deploy.service -n 30 --no-pager
# Consulta inmediata; permite reintentar el SHA que haya fallado:
lavia-deploy check --retry
# Pausar próximas consultas; comprobar que no haya una ejecución en curso:
sudo systemctl stop lavia-deploy.timer
systemctl status lavia-deploy.service --no-pager
# Reanudar:
sudo systemctl start lavia-deploy.timer
```

El estado privado está en `/home/ernesto/.local/share/lavia-deploy/state.json`; el log detallado por commit está en el subdirectorio `logs/`. Los respaldos de cada despliegue están en `backups/auto-<fecha>-<SHA>/` del checkout original. Contienen secretos: no publicarlos ni versionarlos.

`bash tools/deploy.sh` detecta la instalación y delega en el supervisor. No ejecutar `docker compose up` desde el checkout original para actualizar producción: usaría etiquetas y montajes ajenos a la release activa. Para inspeccionar Compose, usar la ruta `release` y la etiqueta `tag` de `lavia-deploy status`, exportando `IMAGE_TAG` y manteniendo `--project-name lavia`.

## Fallos

Un fallo de compilación o validación deja la versión anterior funcionando. Si falla después de pausar escritores, solo se vuelve al código anterior cuando el historial de migraciones sigue intacto. Si el esquema cambió, la aplicación queda detenida para reparar o restaurar de forma deliberada. Nunca se restauran automáticamente datos o fotos sobre cambios recientes. Revisar `status`, `failed_stage` y el log privado; publicar una corrección o reintentar tras resolver la causa. El mismo SHA fallido no se reintenta en cada consulta.

Una ejecución interrumpida se recupera en la siguiente consulta con esa misma comprobación de esquema. No hay alertas externas configuradas; revisar el estado y el journal si una actualización no aparece.

## Cambios de infraestructura y mantenimiento

Los cambios a PostgreSQL, Auth, Storage, correo, volúmenes, puertos o su configuración se rechazan para tratarlos como una actualización operativa separada. Esto incluye cambios en variables del `.env` que afecten a esos servicios. No editar los hashes aprobados para saltarse la comprobación: pausar el temporizador y preparar respaldo, actualización y nueva validación de infraestructura. Añadir migraciones nuevas; nunca modificar las aplicadas. Se rechaza reescribir `main` a una historia que no descienda de la versión publicada.

El instalador `bash tools/install-auto-deploy.sh` instala el controlador y las unidades systemd en rutas del sistema. Los cambios futuros al propio controlador requieren volver a instalarlo desde una revisión revisada; el servicio no se modifica a sí mismo desde cada push. La instalación actual adopta este despliegue concreto y sus imágenes iniciales; para otro VPS ajustar rutas y realizar la migración documentada antes de instalar un supervisor.

No hay limpieza automática de imágenes, releases o respaldos. No borrar releases activas: pueden tener archivos montados en contenedores. El supervisor exige espacio para el respaldo y al menos 6 GiB libres antes de desplegar; si no alcanza, conserva producción. Configurar retención y copia cifrada fuera del VPS según el volumen real. Los respaldos locales no protegen frente a la pérdida del servidor.

Pruebas del controlador: `python3 -m unittest discover -s tests/deploy -v`.
