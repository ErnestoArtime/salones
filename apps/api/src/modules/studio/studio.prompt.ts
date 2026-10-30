export type StudioScope = "hair" | "beard" | "hair_beard";
export function studioPrompt(
  provider: string,
  scope: StudioScope,
  instructions: string,
  beardInstructions?: string,
) {
  const client = provider === "runway" ? "@client" : "image 1";
  const style = provider === "runway" ? "@hairstyle" : "image 2";
  const beard = provider === "runway" ? "@beard" : "image 3";
  const base = `Photorealistic salon preview of ${client}, one portrait on its plain white background. Preserve face identity, age, skin, facial proportions, expression, pose and clothing. Never copy reference faces, bodies or diptych layout. No beautification, text or watermark. `;
  const rule =
    scope === "hair"
      ? `Change scalp hair only using ${style}. Preserve the client's beard and moustache EXACTLY, including length, shape, density and color, even if the reference is clean-shaven. Never add or remove facial hair. `
      : scope === "beard"
        ? `Change beard and moustache only using ${style}. Preserve the client's scalp hairstyle, hairline, length, texture and color EXACTLY. Do not change face or jaw shape. `
        : `Change both scalp hair and facial hair. Use ${style} for the hairstyle and ${beardInstructions ? beard : style} for beard and moustache. Preserve face and jaw shape. `;
  const prefix =
    base +
    rule +
    "These scope rules override conflicting reference notes. Reference notes: ";
  const budget =
    provider === "runway" ? Math.max(0, 1000 - prefix.length) : 4000;
  const notes = beardInstructions
    ? "Hair: " +
      instructions.slice(0, Math.floor((budget - 16) / 2)) +
      "; beard: " +
      beardInstructions.slice(0, Math.floor((budget - 16) / 2))
    : instructions.slice(0, budget);
  return prefix + notes;
}
