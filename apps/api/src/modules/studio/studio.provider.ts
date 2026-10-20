import { Injectable, ServiceUnavailableException } from "@nestjs/common";
@Injectable()
export class StudioProvider {
  readonly model = process.env.STUDIO_MODEL ?? "black-forest-labs/flux-2-pro";
  enabled() {
    return !!process.env.REPLICATE_API_TOKEN;
  }
  async render(
    portrait: Buffer,
    reference: Buffer,
    instructions: string,
    signal: AbortSignal,
    model = this.model,
  ) {
    if (!this.enabled())
      throw new ServiceUnavailableException(
        "La API de IA todavía no está configurada.",
      );
    const [{ generateImage }, { createReplicate }] = await Promise.all([
      import("ai"),
      import("@ai-sdk/replicate"),
    ]);
    const replicate = createReplicate({
      apiToken: process.env.REPLICATE_API_TOKEN,
    });
    const { image } = await generateImage({
      model: replicate.image(model),
      prompt: {
        text:
          "Create a photorealistic salon consultation preview. Image 1 is the client: preserve their face, identity, skin tone, age, facial proportions, expression, pose, clothing and background. Image 2 is a hairstyle reference only: adapt its hair cut, texture and color to the client. Do not copy the face or body from image 2. Change hair only; no face beautification, no text or watermark. The output must show only the client from image 1. Requested hairstyle: " +
          instructions,
        images: [portrait, reference],
      },
      n: 1,
      maxRetries: 0,
      abortSignal: signal,
    });
    return Buffer.from(image.uint8Array);
  }
}
