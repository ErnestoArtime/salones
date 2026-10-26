import {
  Component,
  inject,
  input,
  signal,
  computed,
  effect,
  untracked,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Api, money, localDay } from "../data-access/src/api";
import { environment } from "../data-access/src/environment";
import type { Workspace } from "../contracts/src/index";
import { Icon } from "./icon";
@Component({
  selector: "lv-finance",
  standalone: true,
  imports: [FormsModule, Icon],
  templateUrl: "./finance.component.html",
  styleUrl: "./finance.component.css",
})
export class FinanceComponent {
  private api = inject(Api);
  tenantId = input.required<string>();
  workspace = input.required<Workspace>();
  state = signal<any>(null);
  loading = signal(true);
  busy = signal(false);
  error = signal("");
  notice = signal("");
  tab = signal("day");
  branchId = "";
  date = "";
  currency = "EUR";
  opening = "0";
  counted = "";
  closingNotes = "";
  rateDrafts: Record<string, string> = {};
  mode = "payment";
  appointmentId = "";
  employeeId = "";
  refundEntry: any = null;
  amount = "";
  method = "cash";
  note = "";
  private key = crypto.randomUUID();
  private signature = "";
  private loadSequence = 0;
  money = money;
  manage = computed(() =>
    ["owner", "manager"].includes(this.workspace().tenant.role),
  );
  currencies = computed(() => [
    ...new Set(["EUR", ...this.workspace().services.map((s) => s.currency)]),
  ]);
  openNow = computed(
    () =>
      this.state()?.day?.status === "open" && this.date === this.state()?.today,
  );
  received = computed(
    () =>
      this.state()?.totals.reduce(
        (s: number, r: any) => s + r.received_cents,
        0,
      ) ?? 0,
  );
  refunded = computed(
    () =>
      this.state()?.totals.reduce(
        (s: number, r: any) => s + r.refunded_cents,
        0,
      ) ?? 0,
  );
  expected = computed(
    () =>
      (this.state()?.day?.opening_cents ?? 0) +
      (this.state()?.totals.find((r: any) => r.method === "cash")
        ?.balance_cents ?? 0),
  );
  exportUrl() {
    return (
      (window.LAVIA_API_URL ?? environment.apiUrl) +
      "/tenants/" +
      this.tenantId() +
      "/finance/export?" +
      new URLSearchParams({
        branch_id: this.branchId,
        date: this.date,
        currency: this.currency,
      })
    );
  }
  constructor() {
    effect(() => {
      this.tenantId();
      const w = this.workspace();
      untracked(() => {
        this.branchId = w.branches[0]?.id ?? "";
        this.date = localDay(w.branches[0]?.timezone ?? "Europe/Madrid");
        this.currency = w.services[0]?.currency ?? "EUR";
        this.tab.set("day");
        this.clear();
        void this.load();
      });
    });
  }
  cents(value: string) {
    const v = String(value).trim().replace(",", ".");
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(v))
      throw new Error("Escribe un importe con un máximo de dos decimales.");
    const [whole, decimal = ""] = v.split(".");
    const n = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
    if (n > 100000000)
      throw new Error("El importe supera el máximo permitido.");
    return n;
  }
  async load() {
    const sequence = ++this.loadSequence;
    this.loading.set(true);
    this.error.set("");
    try {
      const data = await this.api.request(
        "/tenants/" +
          this.tenantId() +
          "/finance?" +
          new URLSearchParams({
            branch_id: this.branchId,
            date: this.date,
            currency: this.currency,
          }),
      );
      if (sequence !== this.loadSequence) return;
      this.state.set(data);
      this.rateDrafts = Object.fromEntries(
        data.rates.map((r: any) => [r.id, (r.rate_bps / 100).toFixed(2)]),
      );
    } catch (e) {
      if (sequence === this.loadSequence) {
        this.state.set(null);
        this.error.set((e as Error).message);
      }
    } finally {
      if (sequence === this.loadSequence) this.loading.set(false);
    }
  }
  async run(fn: () => Promise<void>, message: string) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set("");
    this.notice.set("");
    try {
      await fn();
      await this.load();
      this.notice.set(message);
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
  async open() {
    await this.run(async () => {
      await this.api.request(
        "/tenants/" + this.tenantId() + "/finance/open",
        "POST",
        {
          branch_id: this.branchId,
          currency: this.currency,
          opening_cents: this.cents(this.opening),
        },
      );
    }, "Caja abierta. Ya puedes registrar cobros.");
  }
  payoutName() {
    return (
      this.state()?.rates.find(
        (employee: any) => employee.id === this.employeeId,
      )?.name ?? ""
    );
  }
  chooseAppointment() {
    const a = this.state()?.pending.find(
      (a: any) => a.id === this.appointmentId,
    );
    this.amount = a ? (a.due_cents / 100).toFixed(2) : "";
  }
  clear() {
    this.mode = "payment";
    this.appointmentId = "";
    this.employeeId = "";
    this.refundEntry = null;
    this.amount = "";
    this.method = "cash";
    this.note = "";
    this.key = crypto.randomUUID();
    this.signature = "";
  }
  async record() {
    await this.run(async () => {
      const body: any = {
        branch_id: this.branchId,
        currency: this.currency,
        kind: this.mode,
        method: this.method,
        amount_cents: this.cents(this.amount),
        note: this.note,
      };
      if (this.mode === "payment") body.appointment_id = this.appointmentId;
      if (this.mode === "refund") body.reverses_entry_id = this.refundEntry?.id;
      if (this.mode === "commission_payout") body.employee_id = this.employeeId;
      const signature = JSON.stringify(body);
      if (signature !== this.signature) {
        this.signature = signature;
        this.key = crypto.randomUUID();
      }
      await this.api.request(
        "/tenants/" + this.tenantId() + "/finance/entries",
        "POST",
        { ...body, request_key: this.key },
      );
      this.clear();
    }, "Movimiento registrado.");
  }
  async close() {
    await this.run(async () => {
      await this.api.request(
        "/tenants/" +
          this.tenantId() +
          "/finance/days/" +
          this.state().day.id +
          "/close",
        "POST",
        { counted_cents: this.cents(this.counted), notes: this.closingNotes },
      );
      this.counted = "";
      this.closingNotes = "";
    }, "Caja cerrada. El recuento queda guardado en el historial.");
  }
  async saveRate(employee: any) {
    await this.run(async () => {
      const bps = this.cents(this.rateDrafts[employee.id]);
      if (bps > 10000)
        throw new Error("El porcentaje debe estar entre 0 y 100.");
      await this.api.request(
        "/tenants/" + this.tenantId() + "/finance/commissions/" + employee.id,
        "PUT",
        { rate_bps: bps },
      );
    }, "Porcentaje actualizado para los próximos cobros.");
  }
  async refund(entry: any) {
    this.clear();
    this.mode = "refund";
    this.refundEntry = entry;
    this.amount = (
      (entry.refundable_cents ?? entry.amount_cents) / 100
    ).toFixed(2);
    this.method = entry.method;
    this.date = this.state().today;
    this.tab.set("day");
    await this.load();
    this.focusRecord();
  }
  async payout(employee: any) {
    this.clear();
    this.mode = "commission_payout";
    this.employeeId = employee.id;
    this.amount = (employee.balance_cents / 100).toFixed(2);
    this.method = "transfer";
    this.date = this.state().today;
    this.tab.set("day");
    await this.load();
    this.focusRecord();
  }
  focusRecord() {
    requestAnimationFrame(() =>
      document
        .getElementById("finance-record")
        ?.scrollIntoView({ block: "start", behavior: "instant" }),
    );
  }
  changeScope() {
    this.clear();
    this.notice.set("");
    this.counted = "";
    this.closingNotes = "";
    void this.load();
  }
  kindLabel(kind: string) {
    return (
      (
        {
          payment: "Cobro",
          refund: "Devolución",
          cash_in: "Entrada de efectivo",
          cash_out: "Salida de efectivo",
          commission_payout: "Pago de comisión",
        } as Record<string, string>
      )[kind] ?? kind
    );
  }
  methodLabel(method: string) {
    return (
      (
        {
          cash: "Efectivo",
          card: "Tarjeta",
          transfer: "Transferencia",
          other: "Otro",
        } as Record<string, string>
      )[method] ?? method
    );
  }
  dateLabel(value: string) {
    return new Intl.DateTimeFormat("es", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: this.state()?.timezone ?? "Europe/Madrid",
    }).format(new Date(value));
  }
}
