import { Injectable, signal } from "@angular/core";
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { environment } from "./environment";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
declare global {
  interface Window {
    LAVIA_API_URL?: string;
  }
}
@Injectable({ providedIn: "root" })
export class Api {
  readonly busy = signal(false);
  private refresh: Promise<boolean> | null = null;
  async request<T = any>(
    path: string,
    method = "GET",
    body?: unknown,
    retry = true,
  ): Promise<T> {
    let res: Response;
    try {
      if (Capacitor.isNativePlatform()) {
        const native = await CapacitorHttp.request({
          url: (window.LAVIA_API_URL ?? environment.apiUrl) + path,
          method,
          connectTimeout: 10000,
          readTimeout: 15000,
          headers: { "Content-Type": "application/json" },
          ...(body !== undefined ? { data: body } : {}),
        });
        res = new Response(JSON.stringify(native.data), {
          status: native.status,
        });
      } else
        res = await fetch((window.LAVIA_API_URL ?? environment.apiUrl) + path, {
          method,
          credentials: "include",
          signal: AbortSignal.timeout(15000),
          headers: { "Content-Type": "application/json" },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
    } catch {
      throw new ApiError(
        0,
        "No se pudo conectar. Comprueba tu conexión e inténtalo de nuevo.",
      );
    }
    if (res.status === 401 && retry && !path.startsWith("/auth/")) {
      if (!this.refresh)
        this.refresh = this.request("/auth/refresh", "POST", {}, false)
          .then(() => true)
          .catch(() => false)
          .finally(() => {
            this.refresh = null;
          });
      if (await this.refresh) return this.request(path, method, body, false);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok)
      throw new ApiError(
        res.status,
        data.message ?? "No se pudo completar la operación.",
      );
    return data;
  }
}
export const money = (cents: number, currency = "EUR") =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(
    cents / 100,
  );
export const localDay = (zone = "Europe/Madrid") =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: zone }).format(new Date());
export const hour = (value: string, zone = "Europe/Madrid") =>
  new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zone,
  }).format(new Date(value));
