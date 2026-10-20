import { z } from "zod";
export const id = z.string().uuid();
export const text = z.string().trim().min(1).max(140);
export const credentials = z
  .object({ email: z.email().max(254), password: z.string().min(10).max(128) })
  .strict();
export const onboarding = z
  .object({
    name: text,
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,59}$/),
    branch_name: text,
    timezone: z
      .string()
      .max(80)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat("es", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }, "Zona horaria no válida"),
    address: z.string().max(300).default(""),
  })
  .strict();
export const serviceInput = z
  .object({
    name: text,
    category: z.string().regex(/^[a-z][a-z0-9-]{0,59}$/).optional(),
    description: z.string().trim().max(500).optional(),
    photo_asset_id: id.nullable().optional(),
    duration_minutes: z.number().int().min(5).max(480),
    buffer_minutes: z.number().int().min(0).max(120).default(0),
    price_cents: z.number().int().min(0).max(10000000),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default("EUR"),
    active: z.boolean().default(true),
  })
  .strict();
export const employeeInput = z
  .object({
    name: text,
    branch_id: id,
    color: z.enum(["plum", "sage", "clay", "ochre"]).default("plum"),
    service_ids: z.array(id).max(100),
    active: z.boolean().default(true),
  })
  .strict();
export const customerInput = z
  .object({
    name: text,
    email: z.union([z.email().max(254), z.literal("")]).default(""),
    phone: z.string().trim().max(30).default(""),
    notes: z.string().max(2000).default(""),
  })
  .strict();
export const scheduleInput = z
  .object({
    employee_id: id,
    periods: z
      .array(
        z
          .object({
            weekday: z.number().int().min(1).max(7),
            start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
            end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
          })
          .refine(
            (v) => v.end_time > v.start_time,
            "La hora de fin debe ser posterior al inicio.",
          ),
      )
      .max(28),
  })
  .strict();
export const absenceInput = z
  .object({
    employee_id: id,
    starts_at: z.iso.datetime({ offset: true }),
    ends_at: z.iso.datetime({ offset: true }),
    reason: z.string().max(300).default(""),
  })
  .strict()
  .refine(
    (v) => Date.parse(v.ends_at) > Date.parse(v.starts_at),
    "El final debe ser posterior al inicio.",
  );
export const bookingInput = z
  .object({
    service_id: id,
    employee_id: id,
    branch_id: id,
    starts_at: z.iso.datetime({ offset: true }),
    customer_id: id.optional(),
    customer: customerInput.optional(),
    notes: z.string().max(1000).default(""),
    request_key: id,
  })
  .strict();
export const publicBookingInput = bookingInput
  .omit({ customer_id: true, notes: true })
  .extend({
    customer: customerInput
      .omit({ notes: true })
      .extend({ phone: z.string().trim().min(5).max(30) }),
    consent: z.literal(true),
  });
export const statusInput = z
  .object({
    status: z.enum(["confirmed", "completed", "cancelled", "no_show"]),
  })
  .strict();
export const slotQuery = z
  .object({
    service_id: id,
    employee_id: id,
    branch_id: id,
    date: z.iso.date(),
  })
  .strict();
