# Operación y migración

## Configuración y red

### Publicación en Cloudflare

Lavía se publica en `https://lavia.eav-labs.com` mediante el túnel compartido
`92b6e26f-4be5-4d6a-b91d-a9fa5a3a8468`, con origen
`http://127.0.0.1:8130` y CNAME con proxy activado. Se conservaron las rutas
anteriores. Las instantáneas privadas previas están en `.local/cloudflare-route-before.json`
y `.local/cloudflare-publication-before.json`.

La credencial administrativa compartida reside fuera del repositorio en
`/home/ernesto/.config/cloudflare/api-token` (modo 600, directorio 700).
La ruta e instrucciones de uso están en `/home/ernesto/.codex/AGENTS.md` para
futuras sesiones del mismo usuario. No imprimir ni versionar credenciales.
`python3 tools/cloudflare-publish.py` verifica la ruta y el DNS, rechaza conflictos
y conserva el resto de la configuración.

El `.env` del VPS utiliza `PUBLIC_URL=https://lavia.eav-labs.com`,
`BOOKING_URL=https://lavia.eav-labs.com/booking`,
`AUTH_EXTERNAL_URL=https://lavia.eav-labs.com/auth/v1` y `COOKIE_SECURE=true`.
Tras cambiar estas variables, recrear API, Auth y Storage.
Verificación de navegador: `TEST_WEB_URL=https://lavia.eav-labs.com pnpm run test:e2e`.

El único frontend expuesto por Compose escucha en `127.0.0.1:8130`. Auth local usa 54331, PostgreSQL local 54330 y Mailpit 8131, también ligados a loopback. Los demás servicios se comunican en la red privada del proyecto. Nunca publiques PostgreSQL, GoTrue, Mailpit ni Storage directamente en Internet.

Para publicar el piloto, dirige el dominio al proxy HTTPS que ya usa el VPS y reenvía al puerto 8130. Caddy dentro del proyecto sirve las tres aplicaciones bajo `/`, `/booking/` y `/admin/` y enruta la API. Si se instala en un VPS vacío, un proxy TLS externo puede cumplir la misma función; no necesitas cambiar las aplicaciones.

Ajusta en `.env` `PUBLIC_URL`, `BOOKING_URL`, `AUTH_EXTERNAL_URL` y `COOKIE_SECURE=true`. `AUTH_EXTERNAL_URL` debe terminar en `/auth/v1`. Define el correo confirmado del administrador en `PLATFORM_ADMIN_EMAILS`. El origen permitido de escritura se compara con `PUBLIC_URL`; usa exactamente ese host al abrir la web. Tras cambios ejecuta `docker compose up -d --force-recreate api auth`.

El buzón local permite probar confirmaciones y recuperación. Antes de abrir registros a clientes externos configura SMTP en las variables existentes y recrea Auth. No se ha contratado ni configurado ningún proveedor externo.

## Comandos

```sh
docker compose ps
docker compose logs --tail=100 api
docker compose logs --tail=100 auth
curl -f http://localhost:8130/api/health
bash tools/deploy.sh
```

No utilices `docker compose down -v` para actualizar: elimina los datos. Las actualizaciones normales reconstruyen imágenes y ejecutan migraciones sin borrar volúmenes. `IMAGE_TAG` permite etiquetar releases propias. Una migración aplicada no se modifica: se añade otra. Haz respaldo antes de cambios de esquema; volver a una imagen antigua no revierte el esquema automáticamente.

## Respaldos consistentes

```sh
bash tools/backup.sh
```

El script detiene brevemente los servicios escritores que estaban activos, deja PostgreSQL arrancado, captura un dump completo, roles, configuración persistente de PostgreSQL, archivos de Storage y `.env`, y vuelve a arrancar solo los servicios previamente activos. Conserva hashes SHA-256. Los archivos incluyen credenciales: directorio privado, traslado cifrado y almacenamiento fuera del servidor son necesarios. No se ha configurado un destino externo porque no se ha facilitado uno.

El respaldo verificado en esta entrega está en `backups/mvp-studio-verified/`. No es una copia externa. La base puede restaurarse en otra base aislada para comprobar legibilidad; esta prueba no sustituye una migración de servidor completa.

En `infra/systemd/` hay plantillas para ejecutarlo cada madrugada. Ajusta usuario, ruta y PATH antes de instalarlas. La programación no se activa automáticamente ni se cambia el crontab del servidor. Define retención y copia externa según el volumen del piloto.

## Traslado a un servidor nuevo

1. Conserva la misma revisión del repositorio y sus versiones de imágenes. Instala Docker y Compose.
2. Copia de forma cifrada el respaldo y abre un checkout nuevo, sin `.env`. No apuntes al proyecto de producción existente.
3. Ejecuta `bash tools/restore.sh /ruta/al/respaldo`. Verifica checksums y restaura PostgreSQL y archivos.
4. Ajusta dominios, puertos y `COOKIE_SECURE` en el `.env` restaurado. Conserva contraseñas y claves: son necesarias para sesiones y enlaces de cancelación existentes.
5. Ejecuta `bash tools/deploy.sh`. Comprueba acceso, agenda, reserva, cancelación y archivos. Cambia DNS y mantén detenidos los escritores en el origen durante el traslado final para evitar divergencias.

El script rechaza un destino con `.env`, pero no detecta todos los posibles usos ajenos de un nombre de proyecto Docker. Usa un servidor nuevo o un `COMPOSE_PROJECT_NAME` exclusivo. El destino debe tener las mismas extensiones y versión mayor de PostgreSQL; actualizar PostgreSQL es una operación independiente.

## Límites operativos actuales

Una máquina única sin alta disponibilidad; limitación de solicitudes en memoria por instancia; sin trabajador de notificaciones, alertas externas ni monitorización histórica. Los logs Docker rotan. Las credenciales del demo deben mantenerse privadas y la cuenta demo no debe ser administradora en un entorno comercial. No hay facturación ni cobro de planes automáticos.

Para repetir la comprobación aislada: `bash tools/verify-restore.sh backups/mvp-studio-verified`. Necesita libre el puerto local 54340. No modifica los volúmenes del despliegue principal.
