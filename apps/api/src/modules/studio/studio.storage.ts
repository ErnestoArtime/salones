import {
  Injectable,
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import sharp from "sharp";
@Injectable()
export class StudioStorage {
  private base = process.env.STORAGE_URL ?? "http://storage:5000";
  protected bucket = "virtual-studio";
  private headers() {
    return {
      Authorization: "Bearer " + process.env.SERVICE_ROLE_KEY,
      apikey: process.env.SERVICE_ROLE_KEY ?? "",
    };
  }
  async normalize(bytes: Buffer) {
    if (bytes.length > 5 * 1024 * 1024)
      throw new BadRequestException("La imagen supera 5 MB. Reduce su tamaño.");
    try {
      const meta = await sharp(bytes, {
        limitInputPixels: 16000000,
      }).metadata();
      if (!["jpeg", "png", "webp"].includes(meta.format ?? "")) throw Error();
      return await sharp(bytes, { limitInputPixels: 16000000 })
        .rotate()
        .resize(1400, 1800, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 88 })
        .toBuffer();
    } catch {
      throw new BadRequestException(
        "Usa una imagen JPEG, PNG o WebP válida de hasta 16 megapíxeles.",
      );
    }
  }
  async put(key: string, bytes: Buffer) {
    const headers = this.headers();
    const bucket = await fetch(this.base + "/bucket", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: this.bucket,
        name: this.bucket,
        public: false,
        file_size_limit: 5242880,
        allowed_mime_types: ["image/jpeg"],
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!bucket.ok && ![400, 409].includes(bucket.status))
      throw new ServiceUnavailableException(
        "No se pudo preparar el almacenamiento privado.",
      );
    const res = await fetch(this.base + "/object/" + this.bucket + "/" + key, {
      method: "POST",
      headers: { ...headers, "Content-Type": "image/jpeg" },
      body: new Uint8Array(bytes),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok)
      throw new ServiceUnavailableException(
        "No se pudo guardar la fotografía.",
      );
  }
  async get(key: string) {
    const res = await fetch(
      this.base + "/object/authenticated/" + this.bucket + "/" + key,
      { headers: this.headers(), signal: AbortSignal.timeout(15000) },
    );
    if (!res.ok)
      throw new ServiceUnavailableException(
        "La fotografía ya no está disponible.",
      );
    return Buffer.from(await res.arrayBuffer());
  }
  async remove(key: string) {
    const res = await fetch(this.base + "/object/" + this.bucket, {
      method: "DELETE",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: [key] }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok)
      throw new ServiceUnavailableException(
        "No se pudo eliminar la fotografía.",
      );
  }
}
