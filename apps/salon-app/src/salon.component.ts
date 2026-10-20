import {
  Component,
  inject,
  signal,
  computed,
  viewChild,
  ElementRef,
} from "@angular/core";
import { DateTime } from "luxon";
import { FormsModule } from "@angular/forms";
import {
  Api,
  ApiError,
  money,
  localDay,
  hour,
} from "../../../libs/data-access/src/api";
import { AuthComponent } from "../../../libs/ui/auth.component";
import { environment } from "../../../libs/data-access/src/environment";
import { PageEditorComponent } from "../../../libs/ui/page-editor.component";
import { StudioComponent } from "../../../libs/ui/studio.component";
import { Icon } from "../../../libs/ui/icon";
import type {
  Workspace,
  Tenant,
  Appointment,
  Employee,
  Service,
  Customer,
} from "../../../libs/contracts/src/index";
@Component({
  selector: "app-root",
  standalone: true,
  imports: [FormsModule, AuthComponent, Icon, StudioComponent, PageEditorComponent],
  templateUrl: "./salon.component.html",
})
export class SalonApp {
  serviceCategories = computed(() => this.data()?.categories ?? []);
  api = inject(Api);
  user = signal<{ id: string; email: string } | null>(null);
  loading = signal(true);
  working = signal(false);
  error = signal("");
  notice = signal("");
  tenants = signal<Tenant[]>([]);
  data = signal<Workspace | null>(null);
  tenantId = "";
  page = signal("agenda");
  date = signal(localDay());
  layout = signal("calendar");
  search = signal("");
  employeeFilter = signal("");
  branchFilter = signal("");
  members = signal<any[]>([]);
  weekAppointments = signal<Appointment[]>([]);
  editor = viewChild<ElementRef<HTMLDialogElement>>("editor");
  kind = signal("");
  editing = "";
  draft: any = {};
  selected = signal<Appointment | null>(null);
  slots = signal<string[]>([]);
  slotsBusy = signal(false);
  private slotVersion = 0;
  history = signal<any[]>([]);
  requestKey = crypto.randomUUID();
  studioJobId = "";
  money = money;
  hour = hour;
  dayNames = [
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
    "Domingo",
  ];
  nav = [
    { key: "studio", label: "Estudio virtual", icon: "scissors" },
    { key: "agenda", label: "Agenda", icon: "calendar" },
    { key: "customers", label: "Clientes", icon: "people" },
    { key: "services", label: "Servicios", icon: "scissors" },
    { key: "employees", label: "Equipo", icon: "people" },
    { key: "site", label: "Página de clientes", icon: "link" },
    { key: "settings", label: "Mi salón", icon: "settings" },
  ];
  title = computed(
    () => this.nav.find((n) => n.key === this.page())?.label ?? "Agenda",
  );
  zone = computed(
    () =>
      this.data()?.branches.find((b) => b.id === this.branchFilter())
        ?.timezone ??
      this.data()?.branches[0]?.timezone ??
      "Europe/Madrid",
  );
  canManage = computed(() =>
    ["owner", "manager"].includes(this.data()?.tenant.role ?? ""),
  );
  canBook = computed(() =>
    ["owner", "manager", "receptionist"].includes(
      this.data()?.tenant.role ?? "",
    ),
  );
  filteredCustomers = computed(
    () =>
      this.data()?.customers.filter((c) =>
        (c.name + " " + c.phone + " " + c.email)
          .toLowerCase()
          .includes(this.search().toLowerCase()),
      ) ?? [],
  );
  appointments = computed(
    () =>
      this.data()?.appointments.filter(
        (a) =>
          (!this.employeeFilter() || a.employee_id === this.employeeFilter()) &&
          (!this.branchFilter() || a.branch_id === this.branchFilter()),
      ) ?? [],
  );
  revenue = computed(() => {
    const totals = new Map<string, number>();
    for (const a of this.appointments().filter((a) => a.status === "completed"))
      totals.set(a.currency, (totals.get(a.currency) ?? 0) + a.price_cents);
    return [...totals].map(([c, n]) => money(n, c)).join(" / ") || money(0);
  });
  confirmed = computed(
    () => this.appointments().filter((a) => a.status === "confirmed").length,
  );
  professionalColumns = computed(
    () =>
      this.data()?.employees.filter(
        (e) =>
          (!this.branchFilter() || e.branch_id === this.branchFilter()) &&
          (e.active ||
            this.appointments().some((a) => a.employee_id === e.id)) &&
          (!this.employeeFilter() || e.id === this.employeeFilter()) &&
          (this.data()?.tenant.role !== "professional" ||
            e.user_id === this.user()?.id),
      ) ?? [],
  );
  dayTitle = computed(() =>
    new Intl.DateTimeFormat("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(new Date(this.date() + "T12:00:00Z")),
  );
  calendarStart = computed(() =>
    Math.min(
      9,
      ...this.appointments().map((a) => (this.minutes(a.starts_at) / 60) | 0),
    ),
  );
  calendarEnd = computed(() =>
    Math.max(
      20,
      ...this.appointments().map((a) =>
        Math.ceil(this.minutes(a.ends_at) / 60),
      ),
    ),
  );
  calendarHours = computed(() =>
    Array.from(
      { length: this.calendarEnd() - this.calendarStart() },
      (_, i) => this.calendarStart() + i,
    ),
  );
  availableEmployees() {
    return (
      this.data()?.employees.filter(
        (e) =>
          e.active &&
          e.service_ids.includes(this.draft.service_id) &&
          e.branch_id === this.draft.branch_id,
      ) ?? []
    );
  }
  constructor() {
    if (new URLSearchParams(location.hash.slice(1)).get("type") === "recovery")
      this.loading.set(false);
    else void this.init();
  }
  async init() {
    this.loading.set(true);
    try {
      this.user.set(await this.api.request("/me"));
      await this.loadTenants();
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401)
        this.error.set((e as Error).message);
      this.user.set(null);
    } finally {
      this.loading.set(false);
    }
  }
  async loadTenants() {
    const tenants = await this.api.request<Tenant[]>("/tenants");
    this.tenants.set(tenants);
    if (tenants.length) {
      this.tenantId = tenants.some((t) => t.id === this.tenantId)
        ? this.tenantId
        : tenants[0].id;
      await this.load();
    }
  }
  async load() {
    this.error.set("");
    try {
      this.data.set(
        await this.api.request<Workspace>(
          "/tenants/" + this.tenantId + "/workspace?date=" + this.date(),
        ),
      );
      if (!this.data()?.branches.some((b) => b.id === this.branchFilter()))
        this.branchFilter.set(this.data()?.branches[0]?.id ?? "");
      if (this.layout() === "week") await this.loadWeek();
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }
  async logout() {
    try {
      await this.api.request("/auth/logout", "POST", {});
    } finally {
      this.user.set(null);
      this.data.set(null);
      this.tenants.set([]);
    }
  }
  navigate(key: string) {
    this.page.set(key);
    this.search.set("");
    this.notice.set("");
    if (key === "settings" && this.data()?.tenant.role === "owner")
      void this.loadMembers();
  }
  async changeTenant() {
    this.data.set(null);
    this.employeeFilter.set("");
    await this.load();
  }
  async shiftDay(delta: number) {
    const d = new Date(this.date() + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + delta);
    this.date.set(d.toISOString().slice(0, 10));
    await this.load();
  }
  async today() {
    this.date.set(localDay(this.zone()));
    await this.load();
  }
  statusLabel(status: string) {
    return (
      (
        {
          confirmed: "Confirmada",
          completed: "Completada",
          cancelled: "Cancelada",
          no_show: "No asistió",
        } as Record<string, string>
      )[status] ?? status
    );
  }
  minutes(value: string) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: this.zone(),
      hourCycle: "h23",
    }).formatToParts(new Date(value));
    return (
      Number(parts.find((p) => p.type === "hour")?.value) * 60 +
      Number(parts.find((p) => p.type === "minute")?.value)
    );
  }
  top(a: Appointment) {
    return (this.minutes(a.starts_at) - this.calendarStart() * 60) * 1.2;
  }
  height(a: Appointment) {
    return Math.max(
      40,
      ((Date.parse(a.ends_at) - Date.parse(a.starts_at)) / 60000) * 1.2 - 4,
    );
  }
  forEmployee(id: string) {
    return this.appointments().filter(
      (a) =>
        a.employee_id === id && ["confirmed", "completed"].includes(a.status),
    );
  }
  calendarColumns() {
    return (
      "56px repeat(" + this.professionalColumns().length + ", minmax(0,1fr))"
    );
  }
  async onboard(form: HTMLFormElement) {
    const f = Object.fromEntries(new FormData(form));
    await this.perform(async () => {
      const t = await this.api.request("/tenants", "POST", f);
      this.tenantId = t.id;
      await this.loadTenants();
    }, "Tu salón ya tiene su espacio.");
  }
  open(kind: string, entity?: any) {
    this.kind.set(kind);
    this.editing = entity?.id ?? "";
    this.selected.set(null);
    this.error.set("");
    this.notice.set("");
    this.slots.set([]);
    this.history.set([]);
    this.requestKey = crypto.randomUUID();
    this.studioJobId = "";
    if (kind === "service")
      this.draft = entity
        ? { ...entity, price: entity.price_cents / 100 }
        : {
            name: "",
            category: "other",
            description: "",
            duration_minutes: 45,
            buffer_minutes: 0,
            price: 0,
            currency: "EUR",
            active: true,
          };
    else if (kind === "customer") {
      this.draft = entity
        ? { ...entity }
        : { name: "", email: "", phone: "", notes: "" };
      if (entity)
        void this.api
          .request<any[]>(
            "/tenants/" +
              this.tenantId +
              "/customers/" +
              entity.id +
              "/history",
          )
          .then((h) => this.history.set(h))
          .catch((e) => this.error.set(e.message));
    } else if (kind === "employee")
      this.draft = entity
        ? { ...entity, service_ids: [...entity.service_ids] }
        : {
            name: "",
            branch_id: this.data()?.branches[0]?.id,
            color: "plum",
            service_ids: [],
            active: true,
          };
    else if (kind === "schedule")
      this.draft = {
        employee_id: entity.id,
        name: entity.name,
        periods:
          this.data()
            ?.schedules.filter((s) => s.employee_id === entity.id)
            .map((s) => ({
              weekday: s.weekday,
              start_time: s.start_time.slice(0, 5),
              end_time: s.end_time.slice(0, 5),
            })) ?? [],
      };
    else if (kind === "absence")
      this.draft = {
        employee_id: entity.id,
        name: entity.name,
        start: this.date() + "T09:00",
        end: this.date() + "T18:00",
        reason: "",
      };
    else if (kind === "member")
      this.draft = { email: "", role: "receptionist", employee_id: "" };
    else if (kind === "tenant" || kind === "branch")
      this.draft = {
        name: "",
        slug: "",
        branch_name: "Sede principal",
        timezone: this.zone(),
        address: "",
      };
    else if (kind === "appointment") {
      this.draft = {
        branch_id: this.branchFilter() || this.data()?.branches[0]?.id,
        service_id: "",
        employee_id: "",
        customer_id: "",
        date: this.date(),
        starts_at: "",
        notes: "",
      };
    }
    this.editor()?.nativeElement.showModal();
  }
  detail(a: Appointment) {
    this.kind.set("detail");
    this.selected.set(a);
    this.error.set("");
    this.editor()?.nativeElement.showModal();
  }
  close() {
    this.editor()?.nativeElement.close();
    this.kind.set("");
    this.error.set("");
    this.slotVersion++;
  }
  backdrop(event: MouseEvent) {
    if (event.target === this.editor()?.nativeElement) this.close();
  }
  toggleService(id: string, checked: boolean) {
    this.draft.service_ids = checked
      ? [...this.draft.service_ids, id]
      : this.draft.service_ids.filter((x: string) => x !== id);
  }
  addPeriod() {
    this.draft.periods.push({
      weekday: 1,
      start_time: "09:00",
      end_time: "18:00",
    });
  }
  async loadSlots() {
    const version = ++this.slotVersion;
    this.slots.set([]);
    this.slotsBusy.set(false);
    this.draft.starts_at = "";
    if (!this.draft.employee_id || !this.draft.service_id || !this.draft.date)
      return;
    this.slotsBusy.set(true);
    try {
      const q = new URLSearchParams({
        branch_id: this.draft.branch_id,
        service_id: this.draft.service_id,
        employee_id: this.draft.employee_id,
        date: this.draft.date,
      });
      const slots = await this.api.request<string[]>(
        "/tenants/" + this.tenantId + "/slots?" + q,
      );
      if (version === this.slotVersion) this.slots.set(slots);
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      if (version === this.slotVersion) this.slotsBusy.set(false);
    }
  }
  serviceChanged() {
    this.draft.employee_id = this.availableEmployees()[0]?.id ?? "";
    void this.loadSlots();
  }
  async save() {
    await this.perform(async () => {
      let path = "",
        body: any = {},
        method = this.editing ? "PUT" : "POST";
      const d = this.draft;
      if (this.kind() === "tenant") {
        const t = await this.api.request("/tenants", "POST", d);
        this.tenantId = t.id;
        this.close();
        await this.loadTenants();
        return;
      }
      if (this.kind() === "branch") {
        await this.api.request(
          "/tenants/" + this.tenantId + "/branches",
          "POST",
          {
            name: d.branch_name,
            branch_name: d.branch_name,
            timezone: d.timezone,
            address: d.address,
          },
        );
        this.close();
        await this.load();
        return;
      }
      if (this.kind() === "member") {
        await this.api.request(
          "/tenants/" + this.tenantId + "/members",
          "POST",
          {
            email: d.email,
            role: d.role,
            ...(d.role === "professional"
              ? { employee_id: d.employee_id }
              : {}),
          },
        );
        this.close();
        await this.loadMembers();
        return;
      }
      if (this.kind() === "service") {
        path = "/services";
        body = {
          name: d.name,
          category: d.category ?? "other",
          description: d.description ?? "",
          duration_minutes: Number(d.duration_minutes),
          buffer_minutes: Number(d.buffer_minutes),
          price_cents: Math.round(Number(d.price) * 100),
          currency: d.currency,
          active: d.active,
        };
      }
      if (this.kind() === "customer") {
        path = "/customers";
        body = { name: d.name, email: d.email, phone: d.phone, notes: d.notes };
      }
      if (this.kind() === "employee") {
        path = "/employees";
        body = {
          name: d.name,
          branch_id: d.branch_id,
          color: d.color,
          service_ids: d.service_ids,
          active: d.active,
        };
      }
      if (this.kind() === "schedule") {
        path = "/schedules";
        method = "PUT";
        body = {
          employee_id: d.employee_id,
          periods: d.periods.map((r: any) => ({
            ...r,
            weekday: Number(r.weekday),
          })),
        };
      }
      if (this.kind() === "absence") {
        path = "/absences";
        method = "POST";
        body = {
          employee_id: d.employee_id,
          starts_at: this.zonedISO(d.start),
          ends_at: this.zonedISO(d.end),
          reason: d.reason,
        };
      }
      if (this.kind() === "appointment") {
        path = "/appointments";
        method = "POST";
        body = {
          service_id: d.service_id,
          employee_id: d.employee_id,
          branch_id: d.branch_id,
          customer_id: d.customer_id,
          starts_at: d.starts_at,
          notes: d.notes,
          request_key: this.requestKey,
        };
      }
      if (this.kind() === "appointment" && this.editing) {
        path = "/appointments/" + this.editing + "/reschedule";
        method = "PUT";
      }
      if (
        this.editing &&
        ["service", "customer", "employee"].includes(this.kind())
      )
        path += "/" + this.editing;
      if (this.kind() === "appointment" && this.studioJobId)
        path = "/studio/tryons/" + this.studioJobId + "/appointment";
      await this.api.request("/tenants/" + this.tenantId + path, method, body);
      this.close();
      await this.load();
    }, "Cambios guardados.");
  }
  zonedISO(local: string) {
    const dt = DateTime.fromISO(local, { zone: this.zone() });
    if (!dt.isValid || dt.toFormat("yyyy-MM-dd'T'HH:mm") !== local)
      throw new Error("La hora no existe en esta zona horaria. Elige otra.");
    return dt.toUTC().toISO()!;
  }

  async changeStatus(status: string) {
    const a = this.selected();
    if (!a) return;
    await this.perform(async () => {
      await this.api.request(
        "/tenants/" + this.tenantId + "/appointments/" + a.id + "/status",
        "PUT",
        { status },
      );
      this.close();
      await this.load();
    }, "Cita actualizada.");
  }
  async removeAbsence(id: string) {
    await this.perform(async () => {
      await this.api.request(
        "/tenants/" + this.tenantId + "/absences/" + id,
        "DELETE",
      );
      await this.load();
    }, "Bloqueo eliminado.");
  }
  async saveSettings(form: HTMLFormElement) {
    const f = new FormData(form);
    await this.perform(async () => {
      await this.api.request("/tenants/" + this.tenantId + "/settings", "PUT", {
        name: f.get("name"),
        booking_enabled: f.has("booking_enabled"),
      });
      await this.loadTenants();
    }, "Configuración guardada.");
  }
  bookingUrl() {
    return (
      (environment.apiUrl.startsWith("https:")
        ? new URL(environment.apiUrl).origin
        : location.origin) +
      "/booking/?salon=" +
      this.data()?.tenant.slug
    );
  }
  async copyLink() {
    try {
      await navigator.clipboard.writeText(this.bookingUrl());
      this.notice.set("Enlace copiado.");
    } catch {
      this.notice.set("Enlace: " + this.bookingUrl());
    }
  }
  async loadMembers() {
    try {
      this.members.set(
        await this.api.request("/tenants/" + this.tenantId + "/members"),
      );
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }
  async removeMember(uid: string) {
    await this.perform(async () => {
      await this.api.request(
        "/tenants/" + this.tenantId + "/members/" + uid,
        "DELETE",
      );
      await this.loadMembers();
    }, "Acceso retirado.");
  }
  reschedule() {
    const a = this.selected();
    if (!a) return;
    this.close();
    this.open("appointment");
    this.editing = a.id;
    this.draft = {
      ...this.draft,
      branch_id: a.branch_id,
      employee_id: a.employee_id,
      service_id: a.service_id,
      customer_id: a.customer_id,
      notes: a.notes,
    };
    void this.loadSlots();
  }
  weekStart() {
    const d = new Date(this.date() + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  }
  weekDays() {
    const start = new Date(this.weekStart() + "T12:00:00Z");
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      return {
        date: d.toISOString().slice(0, 10),
        label: new Intl.DateTimeFormat("es", {
          weekday: "short",
          day: "numeric",
          timeZone: "UTC",
        }).format(d),
      };
    });
  }
  async loadWeek() {
    try {
      this.weekAppointments.set(
        await this.api.request(
          "/tenants/" + this.tenantId + "/agenda?from=" + this.weekStart(),
        ),
      );
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }
  weekDayAppointments(day: string) {
    return this.weekAppointments().filter(
      (a) =>
        a.local_date === day &&
        (!this.branchFilter() || a.branch_id === this.branchFilter()) &&
        (!this.employeeFilter() || a.employee_id === this.employeeFilter()),
    );
  }
  setLayout(value: string) {
    this.layout.set(value);
    if (value === "week") void this.loadWeek();
  }
  draftZone() {
    return (
      this.data()?.branches.find((b) => b.id === this.draft.branch_id)
        ?.timezone ?? this.zone()
    );
  }
  bookStyle(job: any) {
    this.open("appointment");
    this.studioJobId = job.id;
    this.draft.service_id = job.service_id;
    this.draft.employee_id =
      job.employee_id ?? this.availableEmployees()[0]?.id ?? "";
    this.draft.customer_id = job.customer_id ?? "";
    void this.loadSlots();
  }
  async perform(fn: () => Promise<void>, message: string) {
    if (this.working()) return;
    this.working.set(true);
    this.error.set("");
    try {
      await fn();
      this.notice.set(message);
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.working.set(false);
    }
  }
}
