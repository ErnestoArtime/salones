import { bootstrapApplication } from "@angular/platform-browser";
import { Component, inject, signal, computed } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Api, ApiError } from "../../../libs/data-access/src/api";
import { AuthComponent } from "../../../libs/ui/auth.component";
import { Icon } from "../../../libs/ui/icon";
@Component({
  selector: "app-root",
  standalone: true,
  imports: [FormsModule, AuthComponent, Icon],
  template: ` @if (loading()) {
      <div class="boot">Preparando administración…</div>
    } @else if (!user()) {
      <lv-auth [admin]="true" (authenticated)="init()" />
    } @else {
      <div class="booking-shell admin-page">
        <header class="booking-header">
          <a class="wordmark" href="/admin/">lavía</a>
          <div class="row">
            <span class="quiet">Administración</span
            ><button class="button" (click)="logout()">
              Salir<lv-icon name="logout" />
            </button>
          </div>
        </header>
        <main>
          <div class="page-heading">
            <div>
              <p class="quiet">Administración de plataforma</p>
              <h1>Salones</h1>
            </div>
            <button class="button" (click)="load()">Actualizar</button>
          </div>
          <p class="muted admin-intro">Gestiona planes y acceso. La contratación y el cobro se realizan fuera de Lavía durante el piloto.</p><div class="admin-summary"><span><strong>{{tenants().length}}</strong> {{tenants().length === 1 ? 'salón' : 'salones'}}</span><span><strong>{{activeCount()}}</strong> con acceso activo</span></div>
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
          @if (message()) {
            <p class="success" role="status">{{ message() }}</p>
          }
          <section class="admin-list" aria-label="Salones registrados">
            @for (t of tenants(); track t.id) {
              <article class="admin-tenant">
                <div>
                  <h2>{{ t.name }}</h2>
                  <p class="quiet tenant-meta">
                    {{ t.slug }} · {{ t.members }} {{ t.members === 1 ? "miembro" : "miembros" }} · Alta
                    {{ t.created_at.slice(0, 10) }}
                  </p>
                </div>
                <form (ngSubmit)="save(t)">
                  <label
                    ><span>Plan</span
                    ><select [attr.aria-label]="'Plan de '+t.name" [(ngModel)]="t.plan" [name]="'plan-'+t.id">
                      <option value="trial">Prueba</option>
                      <option value="essential">Essential</option>
                      <option value="studio">Studio</option>
                    </select></label
                  ><label><span>Acceso</span><select [(ngModel)]="t.suspended" [name]="'access-'+t.id" [attr.aria-label]="'Acceso de '+t.name"><option [ngValue]="false">Activo</option><option [ngValue]="true">Suspendido</option></select></label
                  ><button type="submit" class="button" [disabled]="busy()">
                    {{savingId() === t.id ? 'Guardando…' : 'Guardar'}}
                  </button>
                </form>
              </article>
            } @empty {
              @if (!error()) {
                <div class="empty">
                  <h3>Aquí empieza la plataforma.</h3>
                  <p>Los salones aparecerán cuando completen su registro.</p>
                </div>
              }
            }
          </section>
        </main>
        <footer class="page-foot">
          <span>Lavía · Administración de plataforma.</span
          ><a href="/">Ir a gestión</a>
        </footer>
      </div>
    }`,
})
class AdminApp {
  api = inject(Api);
  user = signal<any>(null);
  loading = signal(true);
  busy = signal(false);
  savingId = signal("");
  error = signal("");
  message = signal("");
  tenants = signal<any[]>([]);
  activeCount = computed(() => this.tenants().filter(t => !t.suspended).length);
  constructor() {
    void this.init();
  }
  async init() {
    this.loading.set(true);
    try {
      this.user.set(await this.api.request("/me"));
      await this.load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) this.user.set(null);
      else this.error.set((e as Error).message);
    } finally {
      this.loading.set(false);
    }
  }
  async load() {
    this.error.set("");
    try {
      this.tenants.set(await this.api.request("/platform/tenants"));
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }
  async save(t: any) {
    this.busy.set(true);
    this.savingId.set(t.id);
    this.error.set("");
    this.message.set("");
    try {
      await this.api.request("/platform/tenants/" + t.id, "PUT", {
        plan: t.plan,
        suspended: t.suspended,
      });
      this.message.set("Plan y acceso actualizados.");
      await this.load();
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
      this.savingId.set("");
    }
  }
  async logout() {
    await this.api.request("/auth/logout", "POST", {});
    this.user.set(null);
  }
}
bootstrapApplication(AdminApp).catch(console.error);
