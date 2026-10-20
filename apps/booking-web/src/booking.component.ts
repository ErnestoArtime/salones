import {
  Component,
  inject,
  signal,
  computed,
  HostListener,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Api, money, hour, localDay } from "../../../libs/data-access/src/api";
import { Icon } from "../../../libs/ui/icon";
import { PAGE_DEFAULTS, DEFAULT_SITE_CATEGORIES, type Service, type PublicSalon, type ServiceCategory } from "../../../libs/contracts/src/index";
@Component({
  selector: "app-root",
  standalone: true,
  imports: [FormsModule, Icon],
  templateUrl: "./booking.component.html",
  styleUrl: "./booking.component.css",
})
export class BookingApp {
  pageSettings = computed(() => ({ ...PAGE_DEFAULTS, ...this.salon()?.page }));
  salonName = computed(() => this.pageSettings().display_name || this.salon()?.name || "");
  catalogCategories = computed(() => this.salon()?.categories ?? DEFAULT_SITE_CATEGORIES);
  get categoryLabels(): Record<string,string> { return Object.fromEntries(this.catalogCategories().map(c => [c.id,c.name])); }
  category = signal<ServiceCategory | "all">("all");
  search = signal("");
  categories = computed(() => this.catalogCategories().filter(c=>c.featured).map(c => ({ id:c.id,title:c.name,detail:c.description,src:this.categoryImage(c.id),alt:c.photo_asset_id?c.name:'Imagen de referencia de '+c.name })));
  photo(id: string | null | undefined) { return id ? "/api/public/salons/" + encodeURIComponent(this.slug) + "/photos/" + id : null; }
  heroImage = computed(() => this.photo(this.pageSettings().hero_asset_id) ?? (this.pageSettings().show_reference_photos ? "images/hero.webp" : null));
  visitImage = computed(() => this.photo(this.pageSettings().visit_asset_id) ?? (this.pageSettings().show_reference_photos ? "images/salon.webp" : null));
  usesReferences = computed(() => this.pageSettings().show_reference_photos && (!this.pageSettings().hero_asset_id || !this.pageSettings().visit_asset_id || this.categories().some(c=>!this.catalogCategories().find(x=>x.id===c.id)?.photo_asset_id) || this.salon()?.services.some(s=>!s.photo_asset_id && !this.catalogCategories().find(c=>c.id===s.category)?.photo_asset_id)));
  categoryCount(id: ServiceCategory) {
    return this.salon()?.services.filter(s => s.category === id).length ?? 0;
  }
  availableCategories = computed(() => this.catalogCategories().filter(c => this.categoryCount(c.id)>0).map(c => ({id:c.id,label:c.name})));
  filteredServices = computed(() => {
    const query = this.normalize(this.search().trim());
    return this.salon()?.services.filter(s =>
      (this.category() === "all" || s.category === this.category()) &&
      (!query || this.normalize(s.name + " " + (this.categoryLabels[s.category] ?? "") + " " + (s.description ?? "")).includes(query))) ?? [];
  });
  normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es"); }
  anchor(id: string) { return location.pathname + location.search + "#" + id; }
  categoryImage(id: ServiceCategory) {
    const c=this.catalogCategories().find(c=>c.id===id);
    return this.photo(c?.photo_asset_id) ?? (this.pageSettings().show_reference_photos ? "images/" + (c?.fallback_image ?? "salon") + ".webp" : null);
  }
  serviceImage(s: Service) { return this.photo(s.photo_asset_id) ?? this.categoryImage(s.category); }
  showCategory(id: ServiceCategory | "all") {
    this.category.set(id);
    this.search.set("");
    document.getElementById("catalogo")?.scrollIntoView({ behavior: "instant", block: "start" });
  }
  api = inject(Api);
  salon = signal<PublicSalon | null>(null);
  busy = signal(false);
  loading = signal(false);
  slotsBusy = signal(false);
  error = signal("");
  step = signal(1);
  slug = new URLSearchParams(location.search).get("salon") ?? "";
  serviceId = signal("");
  employeeId = signal("");
  branchId = signal("");
  date = signal(localDay());
  time = signal("");
  slots = signal<string[]>([]);
  customer = { name: "", email: "", phone: "" };
  consent = false;
  confirmation = signal<any>(null);
  cancelled = signal(false);
  cancelId = signal("");
  cancelToken = "";
  private sequence = 0;
  private key = crypto.randomUUID();
  private lastSignature = "";
  money = money;
  hour = hour;
  today = computed(() => localDay(this.zone()));
  service = computed(() =>
    this.salon()?.services.find((s) => s.id === this.serviceId()),
  );
  branch = computed(() =>
    this.salon()?.branches.find((b) => b.id === this.branchId()),
  );
  zone = computed(() => this.branch()?.timezone ?? "Europe/Madrid");
  employees = computed(
    () =>
      this.salon()?.employees.filter(
        (e) =>
          e.service_ids.includes(this.serviceId()) &&
          e.branch_id === this.branchId(),
      ) ?? [],
  );
  employee = computed(() =>
    this.employees().find((e) => e.id === this.employeeId()),
  );
  constructor() {
    this.readCancellation();
    if (this.slug) void this.load();
  }
  @HostListener("window:hashchange") readCancellation() {
    const hash = new URLSearchParams(location.hash.slice(1));
    const cid = hash.get("cancel"),
      token = hash.get("token");
    if (cid && token) {
      this.cancelId.set(cid);
      this.cancelToken = token;
      history.replaceState(null, "", location.pathname + location.search);
    }
  }

  async load() {
    this.loading.set(true);
    this.error.set("");
    try {
      const salon = this.cancelId()
        ? await this.api.request<PublicSalon>(
            "/public/salons/" + encodeURIComponent(this.slug) + "/cancellation",
            "POST",
            { id: this.cancelId(), token: this.cancelToken },
          )
        : await this.api.request<PublicSalon>(
            "/public/salons/" + encodeURIComponent(this.slug),
          );
      this.salon.set(salon);
      this.branchId.set(salon.branches[0]?.id ?? "");
      this.date.set(localDay(this.zone()));
      document.title = (salon.page?.display_name || salon.name) + " · Reservas con Lavía";
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.loading.set(false);
    }
  }
  openSalon() {
    if (!/^[a-z0-9][a-z0-9-]{2,59}$/.test(this.slug)) {
      this.error.set("Escribe el identificador que te ha facilitado tu salón.");
      return;
    }
    location.search = "?salon=" + encodeURIComponent(this.slug);
  }
  choose(id: string) {
    this.serviceId.set(id);
    this.time.set("");
    this.employeeId.set("");
    this.error.set("");
  }
  async next() {
    if (!this.serviceId()) return;
    this.employeeId.set(this.employees()[0]?.id ?? "");
    this.step.set(2);
    window.scrollTo({ top: 0, behavior: "instant" });
    await this.loadSlots();
  }
  async branchChanged(id: string) {
    this.branchId.set(id);
    this.date.set(localDay(this.zone()));
    this.employeeId.set(this.employees()[0]?.id ?? "");
    await this.loadSlots();
  }
  async loadSlots() {
    const sequence = ++this.sequence;
    this.slots.set([]);
    this.time.set("");
    this.error.set("");
    this.slotsBusy.set(false);
    if (!this.employeeId() || !this.serviceId() || !this.branchId()) return;
    this.slotsBusy.set(true);
    try {
      const query = new URLSearchParams({
        service_id: this.serviceId(),
        employee_id: this.employeeId(),
        branch_id: this.branchId(),
        date: this.date(),
      });
      const slots = await this.api.request<string[]>(
        "/public/salons/" + encodeURIComponent(this.slug) + "/slots?" + query,
      );
      if (sequence === this.sequence) this.slots.set(slots);
    } catch (e) {
      if (sequence === this.sequence) this.error.set((e as Error).message);
    } finally {
      if (sequence === this.sequence) this.slotsBusy.set(false);
    }
  }
  prettyDate() {
    return new Intl.DateTimeFormat("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: this.zone(),
    }).format(new Date(this.time() || this.date() + "T12:00:00Z"));
  }
  async reserve() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set("");
    const base = {
      service_id: this.serviceId(),
      employee_id: this.employeeId(),
      branch_id: this.branchId(),
      starts_at: this.time(),
      customer: { ...this.customer },
      consent: this.consent,
    };
    const signature = JSON.stringify(base);
    if (signature !== this.lastSignature) {
      this.key = crypto.randomUUID();
      this.lastSignature = signature;
    }
    try {
      const result = await this.api.request(
        "/public/salons/" + encodeURIComponent(this.slug) + "/appointments",
        "POST",
        { ...base, request_key: this.key },
      );
      this.confirmation.set(result);
      this.step.set(4);
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
  cancellationUrl() {
    const c = this.confirmation();
    return (
      location.origin +
      location.pathname +
      "?salon=" +
      encodeURIComponent(this.slug) +
      "#cancel=" +
      c.id +
      "&token=" +
      c.cancellation_token
    );
  }
  async cancel() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set("");
    try {
      await this.api.request(
        "/public/salons/" + encodeURIComponent(this.slug) + "/cancel",
        "POST",
        { id: this.cancelId(), token: this.cancelToken },
      );
      this.cancelled.set(true);
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
  downloadCalendar() {
    const c = this.confirmation(),
      stamp = (v: string) =>
        new Date(v)
          .toISOString()
          .replace(/[-:]/g, "")
          .replace(/\.\d{3}/, "");
    const escape = (v: string) =>
      v
        .replace(/\\/g, "\\\\")
        .replace(/\n/g, "\\n")
        .replace(/,/g, "\\,")
        .replace(/;/g, "\\;");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Lavia//Reservas//ES",
      "BEGIN:VEVENT",
      "UID:" + c.id + "@lavia",
      "DTSTAMP:" + stamp(new Date().toISOString()),
      "DTSTART:" + stamp(c.starts_at),
      "DTEND:" + stamp(c.ends_at),
      "SUMMARY:" + escape(this.service()?.name ?? "Cita"),
      "LOCATION:" + escape(this.branch()?.address ?? this.salon()?.name ?? ""),
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob([ics], { type: "text/calendar;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "mi-cita.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
