import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
const platform = process.argv[2];
if (!["android", "ios"].includes(platform))
  throw Error(
    "Usa: NATIVE_API_URL=https://tu-dominio/api node tools/native.mjs android|ios",
  );
const url = new URL(process.env.NATIVE_API_URL ?? "");
if (url.protocol !== "https:" || !url.pathname.endsWith("/api"))
  throw Error("NATIVE_API_URL debe ser HTTPS y terminar en /api");
mkdirSync(".local", { recursive: true });
writeFileSync(
  ".local/native-environment.ts",
  "export const environment=" +
    JSON.stringify({ apiUrl: url.href.replace(/\/$/, "") }) +
    ";\n",
);
function run(args, cwd = ".") {
  const r = spawnSync("pnpm", args, { cwd, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
run(["exec", "ng", "build", "salon-app", "--configuration", "native"]);
if (!existsSync("apps/salon-app/" + platform))
  run(["exec", "cap", "add", platform], "apps/salon-app");
run(["exec", "cap", "sync", platform], "apps/salon-app");
if (platform === "android") {
  const file = "apps/salon-app/android/app/src/main/AndroidManifest.xml";
  let xml = readFileSync(file, "utf8");
  if (!xml.includes("android.permission.CAMERA"))
    xml = xml.replace("<application", '<uses-permission android:name="android.permission.CAMERA" />\n    <uses-feature android:name="android.hardware.camera.any" android:required="false" />\n    <application');
  writeFileSync(file, xml);
} else {
  const file = "apps/salon-app/ios/App/App/Info.plist";
  let xml = readFileSync(file, "utf8");
  if (!xml.includes("NSCameraUsageDescription"))
    xml = xml.replace(/<\/dict>\s*<\/plist>/, '<key>NSCameraUsageDescription</key><string>Tomar una foto del cliente para la consulta y simulación del salón, con su permiso.</string>\n</dict>\n</plist>');
  writeFileSync(file, xml);
}
console.log(
  "Proyecto nativo preparado. Abre Android Studio/Xcode para compilar, firmar y probar en dispositivo.",
);
