import { BadRequestException } from "@nestjs/common";
export const DESK = ["owner", "manager", "receptionist"];
export const MANAGE = ["owner", "manager"];
export function commission(cents: number, bps: number) {
  return Number((BigInt(cents) * BigInt(bps) + 5000n) / 10000n);
}
export function refundedCommission(
  original: number,
  paid: number,
  refunded: number,
) {
  return Number(
    (BigInt(original) * BigInt(refunded) + BigInt(Math.floor(paid / 2))) /
      BigInt(paid),
  );
}
export function twoDecimalCurrency(code: string) {
  try {
    if (
      new Intl.NumberFormat("es", {
        style: "currency",
        currency: code,
      }).resolvedOptions().maximumFractionDigits !== 2
    )
      throw new Error();
  } catch {
    throw new BadRequestException("Usa una moneda con dos decimales.");
  }
  return code;
}
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (typeof value !== "number" && /^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
