import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import RunwayML, {
  TaskFailedError,
  TaskTimedOutError,
  toFile,
} from "@runwayml/sdk";
@Injectable()
export class StudioProvider {
  readonly id = process.env.STUDIO_PROVIDER ?? "replicate";
  readonly name = this.id === "runway" ? "Runway" : "Replicate";
  readonly model =
    this.id === "runway"
      ? process.env.RUNWAY_STUDIO_MODEL || "gen4_image"
      : process.env.STUDIO_MODEL || "black-forest-labs/flux-2-pro";
  enabled(provider = this.id) {
    if (provider === "runway") return !!process.env.RUNWAYML_API_SECRET;
    if (provider === "replicate") return !!process.env.REPLICATE_API_TOKEN;
    return false;
  }
  protected runwayClient() {
    return new RunwayML({
      apiKey: process.env.RUNWAYML_API_SECRET,
      maxRetries: 0,
    });
  }
  async render(
    portrait: Buffer,
    reference: Buffer,
    instructions: string,
    signal: AbortSignal,
    model = this.model,
    provider = this.id,
  ) {
    if (!this.enabled(provider))
      throw new ServiceUnavailableException(
        "La API de IA todavía no está configurada.",
      );
    // Dispatch by the provider saved on the job, never by today's configuration.
    if (provider === "runway") {
      if (model !== "gen4_image" && model !== "gen4_image_turbo")
        throw new Error("Unsupported Runway image model");
      signal.throwIfAborted();
      const client = this.runwayClient();
      const [clientPhoto, hairstyle] = await Promise.all([
        client.uploads.createEphemeral(
          {
            file: await toFile(portrait, "portrait.jpg", {
              type: "image/jpeg",
            }),
          },
          { signal },
        ),
        client.uploads.createEphemeral(
          {
            file: await toFile(reference, "hairstyle.jpg", {
              type: "image/jpeg",
            }),
          },
          { signal },
        ),
      ]);
      const promptText = (
        "Photorealistic salon consultation preview of @client. Preserve their face, identity, skin tone, age, facial proportions, expression, pose, clothing and background. Use @hairstyle only as a reference for hair cut, texture and color. Change hair only. Never copy the reference person's face or body. No face beautification, text or watermark. Show only the client. Requested hairstyle: " +
        instructions
      ).slice(0, 1000);
      try {
        const task = await client.textToImage
          .create(
            {
              model,
              ratio: "1080:1440",
              promptText,
              referenceImages: [
                { uri: clientPhoto.uri, tag: "client" },
                { uri: hairstyle.uri, tag: "hairstyle" },
              ],
            },
            { signal },
          )
          .waitForTaskOutput({ timeout: 210000, abortSignal: signal });
        const url = new URL(task.output[0]);
        if (url.protocol !== "https:" || url.username || url.password)
          throw new Error("Invalid Runway output URL");
        const response = await fetch(url, { signal, redirect: "error" });
        if (!response.ok || !response.body)
          throw new Error("Runway output unavailable");
        // Bound memory before image normalization, including chunked responses.
        const maxBytes = 20 * 1024 * 1024;
        if (Number(response.headers.get("content-length")) > maxBytes) {
          await response.body.cancel();
          throw new Error("Runway output too large");
        }
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > maxBytes) throw new Error("Runway output too large");
          chunks.push(Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
      } catch (error) {
        // Provider errors can contain signed URLs and input details; do not log them.
        if (error instanceof TaskFailedError)
          throw new Error("Runway task failed");
        if (error instanceof TaskTimedOutError)
          throw new Error(
            "Runway task timed out; check provider usage before retrying",
          );
        throw error;
      }
    }
    if (model !== "black-forest-labs/flux-2-pro")
      throw new Error("Unsupported Replicate consultation model");
    const [{ generateImage }, { createReplicate }] = await Promise.all([
      import("ai"),
      import("@ai-sdk/replicate"),
    ]);
    const replicate = createReplicate({
      apiToken: process.env.REPLICATE_API_TOKEN,
    });
    const { image } = await generateImage({
      model: replicate.image(model),
      prompt:
        "Create a photorealistic salon consultation preview. Image 1 is the client: preserve their face, identity, skin tone, age, facial proportions, expression, pose, clothing and background. Image 2 is a hairstyle reference only: adapt its hair cut, texture and color to the client. Do not copy the face or body from image 2. Change hair only; no face beautification, no text or watermark. The output must show only the client from image 1. Requested hairstyle: " +
        instructions,
      // The current Replicate schema uses an array. The installed adapter's
      // prompt.images mapping sends input_image/input_image_2, which this model ignores.
      providerOptions: {
        replicate: {
          input_images: [portrait, reference].map(
            (bytes) => "data:image/jpeg;base64," + bytes.toString("base64"),
          ),
          aspect_ratio: "match_input_image",
          resolution: "1 MP",
          output_format: "jpg",
        },
      },
      n: 1,
      maxRetries: 0,
      abortSignal: signal,
    });
    return Buffer.from(image.uint8Array);
  }
}
