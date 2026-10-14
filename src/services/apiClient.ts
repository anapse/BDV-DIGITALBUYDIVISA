import {
  BdvAccount,
  BdvReglaCambiaria,
  BdvOperacionCambiaria,
  CotizacionRequest,
  CotizacionResponse,
  IniciarCompraRequest,
  IniciarCompraResponse,
  ConfirmarCompraResponse,
  BdvUserSession,
} from '../types/bdv';

const SESSION_STORAGE_KEY = 'bdv_digital_session_v1';

export class BdvApiClient {
  private static getSession(): BdvUserSession | null {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  public static setSession(session: BdvUserSession): void {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  }

  public static clearSession(): void {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }

  public static getCurrentUser(): BdvUserSession | null {
    return this.getSession();
  }

  private static getHeaders(idempotencyKey?: string): HeadersInit {
    const session = this.getSession();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (session?.token) {
      headers['Authorization'] = `Bearer ${session.token}`;
    }

    if (idempotencyKey) {
      headers['X-Idempotency-Key'] = idempotencyKey;
    }

    return headers;
  }

  // Generador de clave de idempotencia única por transacción para evitar duplicados
  public static generateIdempotencyKey(action: string): string {
    const random = Math.random().toString(36).substring(2, 10);
    return `bdv_idem_${action}_${Date.now()}_${random}`;
  }

  public static async login(username: string, password: string): Promise<BdvUserSession> {
    const res = await fetch('/api/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error?.message || 'Error al iniciar sesión en BDV Digital');
    }

    this.setSession(json.data);
    return json.data;
  }

  public static async getCuentas(): Promise<BdvAccount[]> {
    const res = await fetch('/api/cuentas', {
      headers: this.getHeaders(),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error?.message || 'Error al obtener cuentas');
    }
    return json.data;
  }

  public static async getReglas(): Promise<BdvReglaCambiaria[]> {
    const res = await fetch('/api/reglas', {
      headers: this.getHeaders(),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error?.message || 'Error al obtener reglas cambiarias');
    }
    return json.data;
  }

  public static async cotizar(req: CotizacionRequest): Promise<CotizacionResponse> {
    const res = await fetch('/api/operaciones/cotizar', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(req),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error?.message || 'Error al calcular cotización');
    }
    return json.data;
  }

  public static async iniciarCompra(req: IniciarCompraRequest): Promise<IniciarCompraResponse> {
    const res = await fetch('/api/operaciones/comprar', {
      method: 'POST',
      headers: this.getHeaders(req.idempotencyKey),
      body: JSON.stringify(req),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error?.message || 'Error al iniciar operación de compra');
    }
    return json.data;
  }

  public static async confirmarCompra(codigoOperacion: string, idempotencyKey: string): Promise<ConfirmarCompraResponse> {
    const res = await fetch('/api/operaciones/confirmar', {
      method: 'POST',
      headers: this.getHeaders(idempotencyKey),
      body: JSON.stringify({ codigoOperacion, idempotencyKey }),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error?.message || 'Error al confirmar la compra');
    }
    return json.data;
  }

  public static async consultarEstado(codigoOperacion: string): Promise<BdvOperacionCambiaria> {
    const res = await fetch(`/api/operaciones/${encodeURIComponent(codigoOperacion)}/estado`, {
      headers: this.getHeaders(),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error?.message || 'Error al consultar estado de la operación');
    }
    return json.data;
  }

  public static async getAdapterInfo(): Promise<any> {
    const res = await fetch('/api/adapter/info');
    const json = await res.json();
    return json.data;
  }
}
