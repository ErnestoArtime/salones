export * from "./page";
import type { SiteCategory, PageSettings } from "./page";
export type Role = "owner" | "manager" | "receptionist" | "professional";
export type AppointmentStatus =
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  role: Role;
  plan: string;
  booking_enabled: boolean;
  suspended: boolean;
}
export interface Branch {
  id: string;
  name: string;
  timezone: string;
  address: string;
}
export const SERVICE_CATEGORY_IDS = ["hair", "nails", "barber", "spa", "massage", "beauty", "other"] as const;
export type ServiceCategory = string;
export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  hair: "Peluquería", nails: "Manicura y pedicura", barber: "Barbería",
  spa: "Spa y cuidado facial", massage: "Masajes", beauty: "Cejas y belleza", other: "Otros cuidados",
};
export interface Service {
  id: string;
  name: string;
  category: ServiceCategory;
  description?: string;
  photo_asset_id?: string | null;
  duration_minutes: number;
  buffer_minutes: number;
  price_cents: number;
  currency: string;
  active: boolean;
}
export interface Employee {
  id: string;
  branch_id: string;
  name: string;
  color: string;
  active: boolean;
  user_id: string | null;
  service_ids: string[];
}
export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
}
export interface Appointment {
  id: string;
  branch_id: string;
  service_id: string;
  customer_id: string;
  local_date?: string;
  customer_name: string;
  service_name: string;
  employee_name: string;
  employee_id: string;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  price_cents: number;
  currency: string;
  notes: string;
}
export interface Schedule {
  id: string;
  employee_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
}
export interface Absence {
  id: string;
  employee_id: string;
  starts_at: string;
  ends_at: string;
  reason: string;
}
export interface Workspace {
  categories: SiteCategory[];
  tenant: Tenant;
  branches: Branch[];
  services: Service[];
  employees: Employee[];
  customers: Customer[];
  appointments: Appointment[];
  schedules: Schedule[];
  absences: Absence[];
}
export interface PublicSalon {
  page: PageSettings;
  categories: SiteCategory[];
  name: string;
  slug: string;
  branches: Branch[];
  services: Service[];
  employees: Pick<Employee, "id" | "name" | "branch_id" | "service_ids">[];
}
