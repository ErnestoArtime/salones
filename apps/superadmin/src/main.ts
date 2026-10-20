import { bootstrapApplication } from "@angular/platform-browser";
import { Component, inject, signal } from "@angular/core";
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
      <div class="booking-shell">
        <header class="booking-header">
          <a class="wordmark" href="/admin/">lavía</a>
          <div class="row">
            <span class="quiet">Administración</span
            ><button class="button" (click)="logout()">
              Salir<lv-icon name="logout" />
            </button>
          </div>
        </header>
        <main style="padding-block:40px">
          <div class="page-heading">
            <div>
              <p class="quiet">La plataforma</p>
              <h1>Detrás de cada salón.</h1>
            </div>
            <button class="button" (click)="load()">Actualizar</button>
          </div>
          <p class="muted">
            Activa planes y gestiona el acceso de los negocios. La contratación
            y el cobro se realizan fuera de la plataforma durante el piloto.
          </p>
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
          @if (message()) {
            <p class="success" role="status">{{ message() }}</p>
          }
          <section class="catalog-list" style="margin-top:32px">
            @for (t of tenants(); track t.id) {
              <article class="catalog-row" style="flex-wrap:wrap">
                <div>
                  <h3>{{ t.name }}</h3>
                  <p class="quiet">
                    {{ t.slug }} · {{ t.members }} miembros ·
                    {{ t.created_at.slice(0, 10) }}
                  </p>
                </div>
                <div class="row">
                  <label
                    ><span class="sr-only">Plan de {{ t.name }}</span
                    ><select [(ngModel)]="t.plan">
                      <option value="trial">Prueba</option>
                      <option value="essential">Essential</option>
                      <option value="studio">Studio</option>
                    </select></label
                  ><label class="check-label"
                    ><input
                      type="checkbox"
                      [(ngModel)]="t.suspended"
                    />Suspendido</label
                  ><button class="button" [disabled]="busy()" (click)="save(t)">
                    Guardar
                  </button>
                </div>
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
  error = signal("");
  message = signal("");
  tenants = signal<any[]>([]);
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
    }
  }
  async logout() {
    await this.api.request("/auth/logout", "POST", {});
    this.user.set(null);
  }
}
bootstrapApplication(AdminApp).catch(console.error);
