# Android e iOS

La aplicación de gestión usa Angular + Ionic y comparte sus pantallas con web. Capacitor 8 incluye los proyectos de empaquetado y el transporte HTTP nativo; sus cookies se mantienen mediante los plugins de Capacitor. No se incrusta una contraseña ni un service role en el binario.

Tras configurar el dominio HTTPS:

```sh
NATIVE_API_URL=https://salones.tudominio.com/api node tools/native.mjs android
# En macOS:
NATIVE_API_URL=https://salones.tudominio.com/api node tools/native.mjs ios
```

El comando compila la configuración `native`, genera el proyecto de plataforma si no existe y sincroniza los assets. La URL nativa se escribe en `.local/native-environment.ts` y solo se utiliza mediante file replacement en esa compilación. Las compilaciones web conservan `/api` como ruta relativa.

Abre el proyecto generado con Android Studio o Xcode. Son necesarios sus SDKs, un dispositivo/emulador y credenciales de firma para producir y distribuir binarios. No se han compilado APK/AAB/IPA ni validado cookies o teclado en dispositivos durante esta entrega; las pruebas móviles realizadas son del navegador responsive. La recuperación de contraseña se abre en la web del dominio configurado. Push, deep links, biometría y modo sin conexión no están implementados.

El portal de clientes se comparte como enlace web; no necesita instalación.
