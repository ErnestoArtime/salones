import { Injectable } from "@angular/core";
import type { ImageSegmenter } from "@mediapipe/tasks-vision";

@Injectable({ providedIn: "root" })
export class PortraitPreparation {
  private model?: Promise<ImageSegmenter>;
  private segmenter() {
    if (!this.model) {
      this.model = import("@mediapipe/tasks-vision")
        .then(async ({ FilesetResolver, ImageSegmenter }) => {
          const root = new URL("studio-vision/", document.baseURI).href;
          const files = await FilesetResolver.forVisionTasks(root + "wasm");
          return ImageSegmenter.createFromOptions(files, {
            baseOptions: {
              modelAssetPath: root + "selfie_segmenter.tflite",
              delegate: "CPU",
            },
            runningMode: "IMAGE",
            outputConfidenceMasks: true,
            outputCategoryMask: false,
          });
        })
        .catch((error) => {
          this.model = undefined;
          throw error;
        });
    }
    return this.model;
  }
  async prepare(file: File): Promise<string> {
    const url = URL.createObjectURL(file);
    const image = new Image();
    try {
      image.src = url;
      await image.decode();
      if (image.naturalWidth * image.naturalHeight > 16000000)
        throw new Error(
          "La fotografía supera 16 megapíxeles. Reduce su tamaño.",
        );
      const factor = Math.min(
        1,
        1400 / image.naturalWidth,
        1800 / image.naturalHeight,
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.naturalWidth * factor);
      canvas.height = Math.round(image.naturalHeight * factor);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx)
        throw new Error("Este navegador no puede preparar la fotografía.");
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const segmenter = await this.segmenter();
      const result = segmenter.segment(canvas);
      try {
        const masks = result.confidenceMasks;
        if (!masks?.length)
          throw new Error("No se pudo separar a la persona del fondo.");
        const person = masks.length === 1 ? masks[0] : masks[1];
        const confidence = person.getAsFloat32Array();
        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = person.width;
        maskCanvas.height = person.height;
        const maskCtx = maskCanvas.getContext("2d")!;
        const rgba = new ImageData(person.width, person.height);
        let foreground = 0;
        for (let i = 0; i < confidence.length; i++) {
          const alpha = Math.max(0, Math.min(1, (confidence[i] - 0.15) / 0.7));
          rgba.data[i * 4] = rgba.data[i * 4 + 1] = rgba.data[i * 4 + 2] = 255;
          rgba.data[i * 4 + 3] = Math.round(alpha * 255);
          if (alpha > 0.5) foreground++;
        }
        if (foreground / confidence.length < 0.01)
          throw new Error(
            "No se distingue a la persona. Usa una foto con buena luz y el rostro y cabello completos.",
          );
        maskCtx.putImageData(rgba, 0, 0);
        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(maskCanvas, 0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", 0.9);
      } finally {
        result.close();
      }
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.startsWith("La fotografía") ||
          error.message.startsWith("No se distingue"))
      )
        throw error;
      throw new Error(
        "No se pudo quitar el fondo. Comprueba la conexión, usa una foto nítida y reintenta; no se ha enviado el original.",
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
