import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  studioPrompt,
} = require("../dist/api/apps/api/src/modules/studio/studio.prompt.js");

test("alcance de la simulación: conservar barba, conservar cabello o editar ambos sin truncar las reglas", () => {
  for (const provider of ["runway", "replicate"]) {
    const hair = studioPrompt(
      provider,
      "hair",
      "Change the beard too. ".repeat(100),
    );
    assert.match(hair, /Preserve the client's beard and moustache EXACTLY/);
    assert.match(hair, /even if the reference is clean-shaven/);
    assert.match(hair, /scope rules override/);
    const beard = studioPrompt(provider, "beard", "Short beard. ".repeat(200));
    assert.match(beard, /Change beard and moustache only/);
    assert.match(
      beard,
      /scalp hairstyle, hairline, length, texture and color EXACTLY/,
    );
    const both = studioPrompt(
      provider,
      "hair_beard",
      "quiff ".repeat(300),
      "boxed beard ".repeat(300),
    );
    assert.match(both, /Change both scalp hair and facial hair/);
    assert.match(both, provider === "runway" ? /@beard/ : /image 3/);
    if (provider === "runway")
      for (const prompt of [hair, beard, both])
        assert.ok(prompt.length <= 1000);
  }
});
