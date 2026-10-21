import { Component, inject, signal, output, input } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Api } from "../data-access/src/api";
import { Icon } from "./icon";
@Component({
  selector: "lv-auth",
  standalone: true,
  imports: [FormsModule, Icon],
  template: ` <div class="auth-page">
    <aside class="auth-story">
      <a class="wordmark" href="/">lavía</a>
      <div>
        <p class="quiet">Hecho para el oficio de cuidar.</p>
        <h1>Tu salón,<br />con otro ritmo.</h1>
        <p>
          Menos llamadas entre citas.<br />Más tiempo para quien se sienta
          frente a ti.
        </p>
      </div>
      <footer>Agenda · Equipo · Clientes</footer>
    </aside>
    <main class="auth-main">
      <div class="auth-form">
        <p class="quiet">
          {{
            admin()
              ? "Administración de la plataforma"
              : "Tu espacio de trabajo"
          }}
        </p>
        <h2>
          {{
            reset()
              ? "Una nueva contraseña."
              : recover()
                ? "Recupera tu espacio."
                : register()
                  ? "Empecemos por ti."
                  : admin() ? "Acceso a plataforma" : "Entra a tu salón"
          }}
        </h2>
        <p class="muted">
          {{
            reset()
              ? "Elige una contraseña de al menos 10 caracteres."
              : recover()
                ? "Te enviaremos un enlace a tu correo."
                : register()
                  ? "Crea tu cuenta y prepara tu salón."
                  : admin() ? "Gestiona los planes y el acceso de los salones." : "Tu agenda, tu equipo y tus clientes, en un solo lugar."
          }}
        </p>
        <form (ngSubmit)="submit()">
          @if (!reset()) {
            <label
              >Correo electrónico<input
                name="email"
                type="email"
                [(ngModel)]="email"
                autocomplete="email"
                required
                maxlength="254"
            /></label>
          }
          @if (!recover()) {
            <label
              >Contraseña<input
                name="password"
                type="password"
                [(ngModel)]="password"
                [attr.autocomplete]="
                  register() ? 'new-password' : 'current-password'
                "
                required
                minlength="10"
                maxlength="128"
            /></label>
            @if (register() || reset()) {<p class="field-help">Mínimo 10 caracteres.</p>}
          }
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
          @if (message()) {
            <p class="success" role="status">{{ message() }}</p>
          }
          <button class="button primary wide" type="submit" [disabled]="busy()">
            {{
              busy()
                ? "Un momento…"
                : reset()
                  ? "Guardar contraseña"
                  : recover()
                    ? "Enviar enlace"
                    : register()
                      ? "Crear cuenta"
                      : "Entrar"
            }}<lv-icon name="arrow" />
          </button>
        </form>
        @if (!reset() && !recover() && !register()) {
          <button
            class="text-button"
            type="button"
            (click)="recover.set(true); error.set('')"
          >
            He olvidado mi contraseña
          </button>
        }
        @if (recover()) {
          <button
            class="text-button"
            type="button"
            (click)="recover.set(false); error.set('')"
          >
            Volver a entrar
          </button>
        }
        @if (!admin() && !recover() && !reset()) {
          <button
            class="text-button"
            type="button"
            (click)="register.set(!register()); error.set(''); message.set('')"
          >
            {{ register() ? "Ya tengo cuenta" : "Crear mi cuenta" }}
          </button>
        }
      </div>
      <p class="auth-foot">Lavía · Espacio para hacerlo bien.</p>
    </main>
  </div>`,
})
export class AuthComponent {
  private api = inject(Api);
  authenticated = output<void>();
  admin = input(false);
  register = signal(false);
  recover = signal(false);
  reset = signal(false);
  private recoveryToken = "";
  busy = signal(false);
  error = signal("");
  message = signal("");
  email = "";
  password = "";
  constructor() {
    const hash = new URLSearchParams(location.hash.slice(1));
    if (hash.get("type") === "recovery" && hash.get("access_token")) {
      this.recoveryToken = hash.get("access_token")!;
      this.reset.set(true);
      history.replaceState(null, "", location.pathname + location.search);
    }
  }
  async submit() {
    this.busy.set(true);
    this.error.set("");
    this.message.set("");
    try {
      if (this.reset()) {
        const result = await this.api.request("/auth/password", "POST", {
          token: this.recoveryToken,
          password: this.password,
        });
        this.reset.set(false);
        this.recoveryToken = "";
        this.password = "";
        this.message.set(result.message);
        return;
      }
      if (this.recover()) {
        const result = await this.api.request("/auth/recover", "POST", {
          email: this.email,
        });
        this.message.set(result.message);
        return;
      }
      const result = await this.api.request(
        "/auth/" + (this.register() ? "register" : "login"),
        "POST",
        { email: this.email, password: this.password },
      );
      if (this.register()) this.message.set(result.message);
      else this.authenticated.emit();
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
