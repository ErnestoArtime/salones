import {
  Component,
  inject,
  input,
  output,
  signal,
  computed,
  effect,
  DestroyRef,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Api } from "../data-access/src/api";
import { environment } from "../data-access/src/environment";
import { Icon } from "./icon";
import type { Workspace } from "../contracts/src/index";
@Component({
  selector: "lv-studio",
  standalone: true,
  imports: [FormsModule, Icon],
  templateUrl: "./studio.component.html",
})
export class StudioComponent {
  private api = inject(Api);
  tenantId = input.required<string>();
  workspace = input.required<Workspace>();
  book = output<any>();
  state = signal<any>(null);
  error = signal("");
  busy = signal(false);
  uploading = signal<"portrait" | "reference" | null>(null);
  portraitError = signal("");
  referenceError = signal("");
  notice = signal("");
  tab = signal("try");
  styleId = signal("");
  portraitId = signal("");
  selected = signal<any>(null);
  compare = 50;
  photoConsent = false;
  externalConsent = false;
  referenceConsent = false;
  customerId = "";
  private requestKey = crypto.randomUUID();
  private lastSignature = "";
  draft: any = {
    name: "",
    description: "",
    instructions: "",
    category: "cut",
    employee_id: "",
    service_id: "",
    reference_asset_id: "",
    published: false,
  };
  manage = computed(() =>
    ["owner", "manager"].includes(this.workspace().tenant.role),
  );
  canCurate = computed(
    () => this.manage() || this.workspace().tenant.role === "professional",
  );
  canBook = computed(() =>
    ["owner", "manager", "receptionist"].includes(this.workspace().tenant.role),
  );
  published = computed(
    () => this.state()?.styles.filter((s: any) => s.published) ?? [],
  );
  style = computed(() =>
    this.state()?.styles.find((s: any) => s.id === this.styleId()),
  );
  constructor() {
    effect(() => {
      this.tenantId();
      this.state.set(null);
      this.portraitId.set("");
      this.selected.set(null);
      this.styleId.set("");
      this.portraitError.set("");
      this.referenceError.set("");
      void this.load();
    });
    const timer = setInterval(() => {
      if (
        this.state()?.jobs.some((j: any) =>
          ["queued", "running"].includes(j.status),
        )
      )
        void this.load();
    }, 5000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
  async load() {
    try {
      const next = await this.api.request<any>("/tenants/" + this.tenantId() + "/studio");
      if (this.state()?.provider_id !== next.provider_id) this.externalConsent = false;
      this.state.set(next);
      if (!this.busy()) {
        this.monthlyLimit = this.state().limit;
        this.generationEnabled = this.state().generation_enabled;
      }
      if (this.selected()) {
        const selected = this.state().jobs.find(
          (j: any) => j.id === this.selected().id,
        );
        this.selected.set(selected ?? null);
      }
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }
  monthlyLimit = 0;
  generationEnabled = true;
  assessmentNotes = "";
  async saveControls() {
    this.busy.set(true);
    this.error.set("");
    try {
      await this.api.request(
        "/tenants/" + this.tenantId() + "/studio/settings",
        "PUT",
        {
          enabled: this.generationEnabled,
          monthly_limit: Number(this.monthlyLimit),
        },
      );
      await this.load();
      this.notice.set("Controles de generación guardados.");
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
  async assess(value: "approved" | "rejected") {
    const job = this.selected();
    if (!job) return;
    this.busy.set(true);
    this.error.set("");
    try {
      await this.api.request(
        "/tenants/" +
          this.tenantId() +
          "/studio/tryons/" +
          job.id +
          "/assessment",
        "PUT",
        { assessment: value, notes: this.assessmentNotes },
      );
      await this.load();
      this.notice.set(
        value === "approved"
          ? "Resultado aprobado por el profesional."
          : "Resultado marcado para mejorar.",
      );
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
  consumptionLabel(status: string) {
    return (
      (
        {
          queued: "En espera",
          running: "En curso",
          succeeded: "Terminadas",
          failed: "Fallidas",
        } as Record<string, string>
      )[status] ?? status
    );
  }
  image(id: string) {
    return (
      (window.LAVIA_API_URL ?? environment.apiUrl) +
      "/tenants/" +
      this.tenantId() +
      "/studio/assets/" +
      id
    );
  }
  async upload(input: HTMLInputElement, kind: "portrait" | "reference") {
    const file = input.files?.[0];
    if (!file || this.busy()) return;
    const fieldError = kind === "portrait" ? this.portraitError : this.referenceError;
    const tenant = this.tenantId();
    fieldError.set("");
    this.error.set("");
    this.notice.set("");
    if (
      (kind === "portrait" && !this.photoConsent) ||
      (kind === "reference" && !this.referenceConsent)
    ) {
      fieldError.set("Confirma el permiso antes de subir la fotografía.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      fieldError.set("La fotografía supera 5 MB. Reduce su tamaño y vuelve a seleccionarla.");
      return;
    }
    this.busy.set(true);
    this.uploading.set(kind);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const asset = await this.api.request(
        "/tenants/" + tenant + "/studio/assets",
        "POST",
        { kind, data, consent: true },
        true,
        120000,
      );
      if (tenant !== this.tenantId()) return;
      if (kind === "portrait") {
        const old = this.portraitId();
        this.portraitId.set(asset.id);
        if (old)
          await this.api
            .request(
              "/tenants/" + tenant + "/studio/assets/" + old,
              "DELETE",
            )
            .catch(() => {});
      } else {
        this.draft.reference_asset_id = asset.id;
        input.value = "";
      }
      this.notice.set("Fotografía guardada de forma privada.");
    } catch (e) {
      if (tenant === this.tenantId())
        fieldError.set("No se pudo subir la fotografía. " + (e as Error).message);
    } finally {
      this.busy.set(false);
      this.uploading.set(null);
    }
  }
  async removePortrait(input?: HTMLInputElement) {
    const id = this.portraitId();
    if (!id) return;
    this.busy.set(true);
    try {
      await this.api.request(
        "/tenants/" + this.tenantId() + "/studio/assets/" + id,
        "DELETE",
      );
      this.portraitId.set("");
      this.portraitError.set("");
      if (input) input.value = "";
      this.photoConsent = false;
      this.externalConsent = false;
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
  async saveStyle() {
    this.busy.set(true);
    this.error.set("");
    try {
      const d = this.draft;
      await this.api.request(
        "/tenants/" + this.tenantId() + "/studio/styles",
        "POST",
        {
          name: d.name,
          description: d.description,
          instructions: d.instructions,
          category: d.category,
          service_id: d.service_id,
          reference_asset_id: d.reference_asset_id,
          published: this.manage() ? d.published : false,
          ...(d.employee_id ? { employee_id: d.employee_id } : {}),
        },
      );
      this.draft = {
        name: "",
        description: "",
        instructions: "",
        category: "cut",
        employee_id: "",
        service_id: "",
        reference_asset_id: "",
        published: false,
      };
      this.notice.set("Trabajo añadido al catálogo del salón.");
      await this.load();
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
  async publish(style: any) {
    this.busy.set(true);
    try {
      await this.api.request(
        "/tenants/" +
          this.tenantId() +
          "/studio/styles/" +
          style.id +
          "/published",
        "PUT",
        { published: !style.published },
      );
      await this.load();
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
  async generate() {
    if (this.generationHint()) return;
    this.busy.set(true);
    this.error.set("");
    try {
      const base = {
        hairstyle_id: this.styleId(),
        portrait_asset_id: this.portraitId(),
        external_consent: this.externalConsent,
        external_consent_provider: this.state().provider_id,
        ...(this.customerId ? { customer_id: this.customerId } : {}),
      };
      const signature = JSON.stringify(base);
      if (signature !== this.lastSignature) {
        this.requestKey = crypto.randomUUID();
        this.lastSignature = signature;
      }
      const result = await this.api.request(
        "/tenants/" + this.tenantId() + "/studio/tryons",
        "POST",
        { ...base, request_key: this.requestKey },
      );
      await this.load();
      this.selected.set(this.state().jobs.find((j: any) => j.id === result.id));
      this.notice.set(
        "Simulación solicitada. Puedes seguir trabajando mientras se procesa.",
      );
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
  generationHint() {
    const state = this.state();
    if (this.uploading() === "portrait") return "Espera a que termine de subirse la foto.";
    if (this.busy()) return "Espera a que termine la operación en curso.";
    if (!state?.provider_ready) return "El proveedor de IA todavía no está configurado.";
    if (!state.generation_enabled) return "La gerencia ha pausado las generaciones.";
    if (state.usage >= state.limit) return "Has agotado la cuota de simulaciones de este mes.";
    if (this.portraitError()) return "Reintenta la subida o selecciona otra fotografía.";
    if (!this.styleId()) return "Selecciona un estilo del catálogo para probarlo.";
    if (!this.portraitId()) return "Sube la foto del cliente para continuar.";
    if (!this.externalConsent) return "Confirma el permiso para enviar las fotos al proveedor de IA.";
    return "";
  }
  async remove(job: any) {
    this.busy.set(true);
    try {
      await this.api.request(
        "/tenants/" + this.tenantId() + "/studio/tryons/" + job.id,
        "DELETE",
      );
      if (this.portraitId() === job.portrait_asset_id) this.portraitId.set("");
      this.selected.set(null);
      await this.load();
      this.notice.set(
        "Fotos eliminadas del almacenamiento activo. Se conserva el registro de consumo.",
      );
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
  statusLabel(status: string) {
    return (
      {
        queued: "En espera",
        running: "Generando",
        succeeded: "Lista para comparar",
        failed: "Sin resultado",
      } as Record<string, string>
    )[status];
  }
  selectJob(job: any) {
    this.selected.set(job);
    this.tab.set("try");
    this.compare = 50;
    this.assessmentNotes = job.assessment_notes ?? "";
  }
}
