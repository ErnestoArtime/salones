import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  StudioProvider,
} = require("../dist/api/apps/api/src/modules/studio/studio.provider.js");
const {
  StudioController,
} = require("../dist/api/apps/api/src/modules/studio/studio.controller.js");
const { TaskFailedError, TaskTimedOutError } = require("@runwayml/sdk");

test("Runway: referencias, espera, privacidad y aislamiento de proveedor sin llamadas de pago", async (t) => {
  const old = { ...process.env };
  const originalFetch = globalThis.fetch;
  try {
    process.env.STUDIO_PROVIDER = "runway";
    process.env.RUNWAY_STUDIO_MODEL = "gen4_image";
    process.env.RUNWAYML_API_SECRET = "test-only-not-a-real-key";
    delete process.env.REPLICATE_API_TOKEN;
    const provider = new StudioProvider();
    assert.equal(provider.runwayClient().maxRetries, 0);
    const uploads = [],
      creates = [],
      waits = [];
    let output = { output: ["https://output.example.test/image.jpg"] };
    let failure;
    provider.runwayClient = () => ({
      uploads: {
        createEphemeral: async ({ file }, options) => {
          uploads.push({ file, options });
          return { uri: "runway://image-" + uploads.length };
        },
      },
      textToImage: {
        create: (body, options) => {
          creates.push({ body, options });
          return {
            waitForTaskOutput: async (options) => {
              waits.push(options);
              if (failure) throw failure;
              return output;
            },
          };
        },
      },
    });
    const bytes = Buffer.from("synthetic-image-bytes");
    globalThis.fetch = async () =>
      new Response(bytes, { headers: { "content-type": "image/jpeg" } });
    const signal = new AbortController().signal;
    await t.test(
      "SDK recibe dos fotos privadas, un modelo explícito y espera con cancelación",
      async () => {
        assert.equal(provider.id, "runway");
        assert.equal(provider.name, "Runway");
        assert.equal(provider.enabled(), true);
        assert.equal(provider.enabled("replicate"), false);
        assert.equal(provider.runwayClient !== undefined, true);
        assert.deepEqual(
          await provider.render(bytes, bytes, "Copper bob", signal),
          bytes,
        );
        assert.equal(uploads.length, 2);
        assert.equal(uploads[0].file.type, "image/jpeg");
        assert.equal(uploads[0].options.signal, signal);
        assert.equal(creates.length, 1);
        assert.equal(creates[0].body.model, "gen4_image");
        assert.equal(creates[0].body.ratio, "1080:1440");
        assert.deepEqual(
          creates[0].body.referenceImages.map((x) => x.tag),
          ["client", "hairstyle"],
        );
        assert.match(creates[0].body.promptText, /@client/);
        assert.match(creates[0].body.promptText, /@hairstyle/);
        assert.equal(waits[0].abortSignal, signal);
        assert.equal(waits[0].timeout, 210000);
      },
    );
    await t.test(
      "no cambia una tarea histórica de Replicate a Runway ni envía modelos desconocidos",
      async () => {
        const before = uploads.length;
        await assert.rejects(
          provider.render(
            bytes,
            bytes,
            "style",
            signal,
            "black-forest-labs/flux-2-pro",
            "replicate",
          ),
        );
        await assert.rejects(
          provider.render(bytes, bytes, "style", signal, "unknown", "runway"),
          /Unsupported/,
        );
        await assert.rejects(
          provider.render(bytes, bytes, "style", AbortSignal.abort()),
          /abort/i,
        );
        assert.equal(uploads.length, before);
      },
    );
    await t.test(
      "acota el texto según el contrato y evita descargar respuestas excesivas",
      async () => {
        await provider.render(bytes, bytes, "x".repeat(1500), signal);
        assert.equal(creates.at(-1).body.promptText.length, 1000);
        globalThis.fetch = async () =>
          new Response(bytes, {
            headers: { "content-length": String(21 * 1024 * 1024) },
          });
        await assert.rejects(
          provider.render(bytes, bytes, "style", signal),
          /too large/,
        );
        output = { output: ["http://output.example.test/image.jpg"] };
        await assert.rejects(
          provider.render(bytes, bytes, "style", signal),
          /Invalid/,
        );
        output = { output: ["https://output.example.test/image.jpg"] };
      },
    );
    await t.test(
      "fallos y esperas agotadas no reenvían la generación ni exponen detalles del proveedor",
      async () => {
        for (const error of [
          new TaskFailedError({
            id: "private-task",
            status: "FAILED",
            failure: "private-url",
            failureCode: "test",
          }),
          new TaskTimedOutError({ id: "private-task", status: "RUNNING" }),
        ]) {
          failure = error;
          const before = creates.length;
          await assert.rejects(
            provider.render(bytes, bytes, "style", signal),
            (e) => !e.message.includes("private"),
          );
          assert.equal(creates.length, before + 1);
        }
      },
    );
    await t.test(
      "consentimiento ausente o para otro proveedor se rechaza antes de reservar cuota",
      async () => {
        const queries = [];
        const db = {
          tenant: async (_user, _tenant, _roles, fn) =>
            fn(
              {
                query: async (sql) => {
                  queries.push(sql);
                  return { rows: [] };
                },
              },
              "owner",
            ),
        };
        const id = "11111111-1111-4111-8111-111111111111";
        const controller = new StudioController(
          db,
          { user: async () => ({ id }) },
          {},
          provider,
          {},
        );
        for (const consent of [undefined, "replicate"]) {
          await assert.rejects(
            controller.create({}, id, {
              hairstyle_id: id,
              portrait_asset_id: id,
              request_key: id,
              external_consent: true,
              ...(consent ? { external_consent_provider: consent } : {}),
            }),
            (e) => e.getStatus() === 409,
          );
        }
        assert.equal(
          queries.some((q) => q.includes("INSERT")),
          false,
        );
      },
    );
    await t.test(
      "Replicate recibe input_images según su esquema actual, sin perder las referencias",
      async () => {
        process.env.REPLICATE_API_TOKEN = "test-only-not-a-real-key";
        const requests = [];
        globalThis.fetch = async (url, options) => {
          if (
            String(url).endsWith(
              "/models/black-forest-labs/flux-2-pro/predictions",
            )
          ) {
            requests.push(JSON.parse(options.body));
            return Response.json({
              status: "succeeded",
              output: ["https://api.replicate.com/synthetic-output.jpg"],
              urls: {
                get: "https://api.replicate.com/v1/predictions/synthetic",
              },
            });
          }
          assert.equal(
            String(url),
            "https://api.replicate.com/synthetic-output.jpg",
          );
          return new Response(bytes, {
            headers: { "content-type": "image/jpeg" },
          });
        };
        assert.deepEqual(
          await provider.render(
            bytes,
            bytes,
            "Copper bob",
            signal,
            "black-forest-labs/flux-2-pro",
            "replicate",
          ),
          bytes,
        );
        assert.equal(requests.length, 1);
        assert.deepEqual(
          requests[0].input.input_images,
          [bytes, bytes].map(
            (b) => "data:image/jpeg;base64," + b.toString("base64"),
          ),
        );
        assert.equal(requests[0].input.input_image, undefined);
        assert.equal(requests[0].input.input_image_2, undefined);
        assert.equal(requests[0].input.aspect_ratio, "match_input_image");
        assert.equal(requests[0].input.resolution, "1 MP");
        assert.equal(requests[0].input.num_outputs, 1);
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of [
      "STUDIO_PROVIDER",
      "RUNWAY_STUDIO_MODEL",
      "RUNWAYML_API_SECRET",
      "REPLICATE_API_TOKEN",
    ]) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
  }
});
