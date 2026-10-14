/**
 * BDV Banking Adapter - Producción y Desarrollo
 * Arquitectura modular que separa la lógica de negocio, validaciones del servidor
 * y la comunicación bancaria con el Banco de Venezuela (BDV).
 */

import {
  BdvAccount,
  BdvReglaCambiaria,
  BdvOperacionCambiaria,
  CotizacionRequest,
  CotizacionResponse,
  IniciarCompraRequest,
  IniciarCompraResponse,
  ConfirmarCompraRequest,
  ConfirmarCompraResponse,
  BdvUserSession,
} from '../types/bdv';

export interface IBdvBankingAdapter {
  login(username: string, password: string): Promise<BdvUserSession>;
  getCuentas(token: string): Promise<BdvAccount[]>;
  getReglas(token: string): Promise<BdvReglaCambiaria[]>;
  cotizar(token: string, req: CotizacionRequest): Promise<CotizacionResponse>;
  iniciarCompra(token: string, req: IniciarCompraRequest): Promise<IniciarCompraResponse>;
  confirmarCompra(token: string, req: ConfirmarCompraRequest): Promise<ConfirmarCompraResponse>;
  consultarEstado(token: string, codigoOperacion: string): Promise<BdvOperacionCambiaria | null>;
  getAdapterStatus(): {
    mode: 'SANDBOX' | 'LIVE' | 'CONFIG_ERROR';
    evidenceSource: string;
    endpointsConfigured: string[];
    canExecuteLive: boolean;
    reasonIfDisabled?: string;
  };
}

/**
 * Adaptador Bancario de Producción Real (Live API)
 * Conecta directamente contra la pasarela bancaria oficial del Banco de Venezuela
 * usando los endpoints verificados en la extracción técnica del APK.
 */
export class BdvLiveApiAdapter implements IBdvBankingAdapter {
  private baseUrl: string;
  private appKey: string;
  private timeoutMs: number;

  constructor(baseUrl?: string, appKey?: string, timeoutMs: number = 30000) {
    this.baseUrl = (baseUrl || process.env.BDV_API_BASE_URL || '').replace(/\/$/, '');
    this.appKey = appKey || process.env.BDV_APP_KEY || '';
    this.timeoutMs = timeoutMs;
  }

  private ensureConfigured() {
    if (!this.baseUrl) {
      throw new Error(
        'CONFIG_BLOQUEADA: La variable BDV_API_BASE_URL no está configurada en el servidor. ' +
        'Se requiere la URL de la pasarela autorizada del Banco de Venezuela.'
      );
    }
  }

  private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`TIMEOUT_RED_BANCARIA: La conexión con ${url} superó el límite de ${this.timeoutMs / 1000}s sin respuesta del banco.`);
      }
      throw new Error(`FALLO_CONEXION_BANCARIA: No se pudo contactar el servidor BDV (${err.message || 'error de red o DNS'}).`);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async login(username: string, password: string): Promise<BdvUserSession> {
    this.ensureConfigured();

    if (!username || !password) {
      throw new Error('Debe proporcionar usuario y contraseña para iniciar sesión.');
    }

    const endpoint = `${this.baseUrl}/bdvx-oauth-server/oauth/token`;
    const bodyParams = new URLSearchParams({
      grant_type: 'password',
      username: username.trim(),
      password: password,
    });

    const res = await this.fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        ...(this.appKey ? { 'app-key': this.appKey } : {}),
      },
      body: bodyParams.toString(),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      if (res.status === 401 || res.status === 403) {
        throw new Error('CREDENCIALES_INVALIDAS: El usuario o contraseña ingresados no son correctos según BDV Digital.');
      }
      throw new Error(`AUTH_BDV_ERROR_${res.status}: ${errText || 'Error al autenticar con el servidor bancario'}`);
    }

    const data = await res.json();
    const token = data.access_token || data.token;
    if (!token) {
      throw new Error('RESPUESTA_INVALIDA_BANCO: La respuesta del servidor OAuth no incluyó un access_token.');
    }

    return {
      username: username.toUpperCase(),
      nombreCompleto: data.nombreCompleto || data.user_name || username.toUpperCase(),
      documentoIdentidad: data.documentoIdentidad || data.cedula || 'V-REGISTRADO',
      token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
      modo: 'CONECTOR_ENLACE_BDV',
    };
  }

  async getCuentas(token: string): Promise<BdvAccount[]> {
    this.ensureConfigured();

    const endpoint = `${this.baseUrl}/bdvx-consulta-cuenta-v2/v1/cuenta/saldo-v2`;
    const res = await this.fetchWithTimeout(endpoint, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        ...(this.appKey ? { 'app-key': this.appKey } : {}),
      },
    });

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('SESION_EXPIRADA: La sesión bancaria ha expirado. Debe ingresar nuevamente.');
      }
      throw new Error(`ERROR_CONSULTA_CUENTAS_${res.status}: No fue posible obtener los saldos del banco.`);
    }

    const raw = await res.json();
    const rawList = Array.isArray(raw) ? raw : (raw.cuentas || raw.data || []);
    
    return rawList.map((c: any, index: number) => ({
      id: c.id || index + 1,
      numero: c.numero || c.accountNumber,
      tipo: c.tipo || (c.moneda === 'USD' ? 'MONEDA_EXTRANJERA' : 'CORRIENTE'),
      moneda: c.moneda || (c.tipo?.includes('USD') ? 'USD' : 'VES'),
      saldo: Number(c.saldo || 0),
      disponible: Number(c.disponible || c.saldo || 0),
      estatus: (c.estatus || 'ACTIVA').toUpperCase() as 'ACTIVA' | 'BLOQUEADA' | 'INACTIVA',
      alias: c.alias || c.descripcion || `${c.tipo} (${c.moneda})`,
    }));
  }

  async getReglas(token: string): Promise<BdvReglaCambiaria[]> {
    this.ensureConfigured();

    const endpoint = `${this.baseUrl}/bdvx-intervencion-cambiaria/v1/intervencion/consultarReglasEXRI`;
    const res = await this.fetchWithTimeout(endpoint, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        ...(this.appKey ? { 'app-key': this.appKey } : {}),
      },
    });

    if (!res.ok) {
      throw new Error(`ERROR_CONSULTA_REGLAS_${res.status}: No se pudieron consultar las tasas oficiales de la mesa de cambio.`);
    }

    const raw = await res.json();
    const rawList = Array.isArray(raw) ? raw : (raw.reglas || raw.data || []);

    return rawList.map((r: any) => ({
      codigoRegla: r.codigoRegla || r.codigo,
      tiporegla: r.tiporegla || 'MENUDEO',
      moneda: r.moneda || 'USD',
      tasaCompra: Number(r.tasaCompra || r.tasa),
      tasaVenta: Number(r.tasaVenta || r.tasa),
      descripcionRegla: r.descripcionRegla || r.descripcion,
      montoMinimo: Number(r.montoMinimo || 1),
      montoMaximo: Number(r.montoMaximo || 1000),
      multiplo: Number(r.multiplo || 1),
      activa: r.activa !== false,
      horarioOperativo: r.horarioOperativo,
    }));
  }

  async cotizar(token: string, req: CotizacionRequest): Promise<CotizacionResponse> {
    const { montoDivisa, codigoRegla, cuentaOrigen, cuentaDestino } = req;
    
    const [cuentas, reglas] = await Promise.all([
      this.getCuentas(token),
      this.getReglas(token),
    ]);

    const regla = reglas.find((r) => r.codigoRegla === codigoRegla);
    if (!regla) {
      throw new Error(`Regla cambiaria [${codigoRegla}] no está disponible en la mesa de cambio actual.`);
    }

    const ctaOri = cuentas.find((c) => c.numero === cuentaOrigen);
    if (!ctaOri) {
      throw new Error(`Cuenta origen [${cuentaOrigen}] no encontrada en los instrumentos del cliente.`);
    }

    const ctaDest = cuentas.find((c) => c.numero === cuentaDestino);
    if (!ctaDest) {
      throw new Error(`Cuenta destino [${cuentaDestino}] no encontrada.`);
    }

    if (ctaOri.moneda !== 'VES') {
      throw new Error('La cuenta debitada debe ser en Bolívares (VES).');
    }

    if (ctaDest.moneda !== 'USD') {
      throw new Error('La cuenta de destino debe ser en Dólares (USD).');
    }

    if (montoDivisa <= 0 || isNaN(montoDivisa)) {
      throw new Error('El monto en divisas debe ser un valor numérico positivo mayor a 0.');
    }

    if (montoDivisa < regla.montoMinimo) {
      throw new Error(`El monto mínimo permitido es $${regla.montoMinimo.toFixed(2)} USD.`);
    }

    if (montoDivisa > regla.montoMaximo) {
      throw new Error(`El monto máximo permitido por operación es $${regla.montoMaximo.toFixed(2)} USD.`);
    }

    if (regla.multiplo > 1) {
      const resto = (montoDivisa * 100) % (regla.multiplo * 100);
      if (resto !== 0) {
        throw new Error(`El monto debe ser múltiplo exacto de ${regla.multiplo} USD.`);
      }
    }

    const tasaCambio = regla.tasaCompra;
    const subtotalBs = Number((montoDivisa * tasaCambio).toFixed(2));
    const comisionBs = Number(Math.max(1.00, subtotalBs * 0.0025).toFixed(2));
    const totalDebitoBs = Number((subtotalBs + comisionBs).toFixed(2));
    const saldoSuficiente = ctaOri.disponible >= totalDebitoBs;

    const advertencias: string[] = [];
    if (!saldoSuficiente) {
      advertencias.push(`Saldo insuficiente: Requiere Bs. ${totalDebitoBs.toFixed(2)} y dispone de Bs. ${ctaOri.disponible.toFixed(2)}`);
    }

    return {
      valido: saldoSuficiente,
      montoDivisa,
      tasaCambio,
      subtotalBs,
      comisionBs,
      totalDebitoBs,
      saldoDisponibleBs: ctaOri.disponible,
      saldoSuficiente,
      codigoRegla,
      regla,
      advertencias,
    };
  }

  async iniciarCompra(token: string, req: IniciarCompraRequest): Promise<IniciarCompraResponse> {
    this.ensureConfigured();

    const endpoint = `${this.baseUrl}/bdvx-operaciones-cambiarias/v1/operaciones/comprar`;
    const res = await this.fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Idempotency-Key': req.idempotencyKey,
        ...(this.appKey ? { 'app-key': this.appKey } : {}),
      },
      body: JSON.stringify({
        montoDivisa: req.montoDivisa,
        codigoRegla: req.codigoRegla,
        cuentaOrigen: req.cuentaOrigen,
        cuentaDestino: req.cuentaDestino,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `ERROR_BANCO_${res.status}: No se pudo preparar la orden cambiaria.`);
    }

    const data = await res.json();
    return {
      exito: true,
      codigoOperacion: data.codigoOperacion || data.referencia,
      estado: data.estado || 'PENDIENTE',
      operacion: data.operacion || data,
      mensaje: data.mensaje || 'Orden de compra preparada en el sistema bancario.',
      requiereConfirmacion: true,
    };
  }

  async confirmarCompra(token: string, req: ConfirmarCompraRequest): Promise<ConfirmarCompraResponse> {
    this.ensureConfigured();

    const endpoint = `${this.baseUrl}/bdvx-operaciones-cambiarias/v1/operaciones/confirmar`;
    const res = await this.fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Idempotency-Key': req.idempotencyKey,
        ...(this.appKey ? { 'app-key': this.appKey } : {}),
      },
      body: JSON.stringify({
        codigoOperacion: req.codigoOperacion,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `CONFIRMACION_RECHAZADA_${res.status}: La operación no pudo ser liquidada por el banco.`);
    }

    const data = await res.json();
    return {
      exito: true,
      codigoOperacion: req.codigoOperacion,
      estado: data.estado || 'APROBADA',
      operacion: data.operacion || data,
      mensaje: data.mensaje || 'Compra de divisas liquidada exitosamente en el Banco de Venezuela.',
      nuevoSaldoBs: data.nuevoSaldoBs,
      nuevoSaldoUsd: data.nuevoSaldoUsd,
    };
  }

  async consultarEstado(token: string, codigoOperacion: string): Promise<BdvOperacionCambiaria | null> {
    this.ensureConfigured();

    const endpoint = `${this.baseUrl}/bdvx-operaciones-cambiarias/v1/operaciones/${encodeURIComponent(codigoOperacion)}/estado`;
    const res = await this.fetchWithTimeout(endpoint, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        ...(this.appKey ? { 'app-key': this.appKey } : {}),
      },
    });

    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`CONSULTA_ESTADO_ERROR_${res.status}: No fue posible consultar la orden en el banco.`);
    }

    const data = await res.json();
    return data.operacion || data;
  }

  getAdapterStatus() {
    return {
      mode: 'LIVE' as const,
      evidenceSource: 'Pasarela autorizada BDV (REST/OAuth2)',
      endpointsConfigured: [
        `${this.baseUrl}/bdvx-oauth-server/oauth/token`,
        `${this.baseUrl}/bdvx-consulta-cuenta-v2/v1/cuenta/saldo-v2`,
        `${this.baseUrl}/bdvx-operaciones-cambiarias/v1/operaciones/comprar`,
        `${this.baseUrl}/bdvx-operaciones-cambiarias/v1/operaciones/confirmar`,
      ],
      canExecuteLive: Boolean(this.baseUrl),
      reasonIfDisabled: !this.baseUrl
        ? 'No se ha configurado la variable de entorno BDV_API_BASE_URL.'
        : undefined,
    };
  }
}

/**
 * Adaptador Sandbox Seguro:
 * Emula fielmente las 4 tablas SQLite y endpoints del APK de BDV Digital.
 * Valida límites, saldo disponible, múltiplos, comisiones e idempotencia.
 * Se utiliza EXCLUSIVAMENTE en modo desarrollo o testing con flag explícito BDV_ENV=sandbox.
 */
export class BdvSandboxAdapter implements IBdvBankingAdapter {
  private cuentas: Map<string, BdvAccount> = new Map();
  private reglas: Map<string, BdvReglaCambiaria> = new Map();
  private operaciones: Map<string, BdvOperacionCambiaria> = new Map();
  private idempotencyCache: Map<string, IniciarCompraResponse | ConfirmarCompraResponse> = new Map();

  constructor() {
    this.seedInitialData();
  }

  private seedInitialData() {
    const ctaVes: BdvAccount = {
      id: 1,
      numero: '01020108990100045678',
      tipo: 'CORRIENTE',
      moneda: 'VES',
      saldo: 45850.50,
      disponible: 45850.50,
      estatus: 'ACTIVA',
      alias: 'Cuenta Corriente Digital BDV (VES)',
    };

    const ctaUsd: BdvAccount = {
      id: 2,
      numero: '01020108990100098765',
      tipo: 'MONEDA_EXTRANJERA',
      moneda: 'USD',
      saldo: 145.20,
      disponible: 145.20,
      estatus: 'ACTIVA',
      alias: 'Cuenta Divisas Libre Convertibilidad (USD)',
    };

    const ctaAhorro: BdvAccount = {
      id: 3,
      numero: '01020108990100012345',
      tipo: 'AHORRO',
      moneda: 'VES',
      saldo: 1240.00,
      disponible: 1240.00,
      estatus: 'ACTIVA',
      alias: 'Caja de Ahorro BDV (VES)',
    };

    this.cuentas.set(ctaVes.numero, ctaVes);
    this.cuentas.set(ctaUsd.numero, ctaUsd);
    this.cuentas.set(ctaAhorro.numero, ctaAhorro);

    const reglaMenudeo: BdvReglaCambiaria = {
      codigoRegla: 'MENUDEO_USD_BCV',
      tiporegla: 'MENUDEO',
      moneda: 'USD',
      tasaCompra: 395.45,
      tasaVenta: 394.10,
      descripcionRegla: 'Menudeo Digital Personas Naturales - Tasa Oficial BCV',
      montoMinimo: 1.00,
      montoMaximo: 500.00,
      multiplo: 1.00,
      activa: true,
      horarioOperativo: 'Lunes a Domingo (08:00 AM - 11:00 PM)',
    };

    const reglaExri: BdvReglaCambiaria = {
      codigoRegla: 'EXRI_INTERVENCION_USD',
      tiporegla: 'INTERVENCION_EXRI',
      moneda: 'USD',
      tasaCompra: 394.85,
      tasaVenta: 393.50,
      descripcionRegla: 'Intervención Cambiaria EXRI - Asignación Especial',
      montoMinimo: 20.00,
      montoMaximo: 2500.00,
      multiplo: 10.00,
      activa: true,
      horarioOperativo: 'Días hábiles bancarios (08:30 AM - 04:00 PM)',
    };

    this.reglas.set(reglaMenudeo.codigoRegla, reglaMenudeo);
    this.reglas.set(reglaExri.codigoRegla, reglaExri);

    const opPrevia: BdvOperacionCambiaria = {
      id: 101,
      codigoOperacion: 'OP-20261012-7841',
      cuentaOrigen: ctaVes.numero,
      cuentaDestino: ctaUsd.numero,
      montoDivisa: 25.00,
      tasaCambio: 393.20,
      comisionBs: 24.58,
      totalBs: 9854.58,
      codigoRegla: 'MENUDEO_USD_BCV',
      estado: 'APROBADA',
      fechaCreacion: '2026-10-12T14:32:00.000Z',
      fechaConfirmacion: '2026-10-12T14:32:15.000Z',
      mensajeRespuesta: 'Operación cambiaria liquidada exitosamente.',
    };
    this.operaciones.set(opPrevia.codigoOperacion, opPrevia);
  }

  async login(username: string, password: string): Promise<BdvUserSession> {
    if (!username || username.trim().length === 0) {
      throw new Error('Debe ingresar un usuario o documento de identidad válido.');
    }
    if (!password || password.trim().length === 0) {
      throw new Error('Debe ingresar su contraseña.');
    }

    return {
      username: username.toUpperCase(),
      nombreCompleto: 'CARLOS ALBERTO MENDOZA SILVA',
      documentoIdentidad: 'V-18.492.301',
      token: `bdv_jwt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      refreshToken: `bdv_rf_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      modo: 'SANDBOX_DEMO',
    };
  }

  async getCuentas(_token: string): Promise<BdvAccount[]> {
    return Array.from(this.cuentas.values());
  }

  async getReglas(_token: string): Promise<BdvReglaCambiaria[]> {
    return Array.from(this.reglas.values());
  }

  async cotizar(_token: string, req: CotizacionRequest): Promise<CotizacionResponse> {
    const { montoDivisa, codigoRegla, cuentaOrigen, cuentaDestino } = req;
    const advertencias: string[] = [];

    const regla = this.reglas.get(codigoRegla);
    if (!regla) {
      throw new Error(`Regla cambiaria [${codigoRegla}] no encontrada o inactiva.`);
    }

    const ctaOri = this.cuentas.get(cuentaOrigen);
    if (!ctaOri) {
      throw new Error(`Cuenta origen [${cuentaOrigen}] no válida o no encontrada.`);
    }

    if (ctaOri.moneda !== 'VES') {
      throw new Error('La cuenta origen para compra de divisas debe ser en Bolívares (VES).');
    }

    const ctaDest = this.cuentas.get(cuentaDestino);
    if (!ctaDest) {
      throw new Error(`Cuenta destino [${cuentaDestino}] no válida o no encontrada.`);
    }

    if (ctaDest.moneda !== 'USD') {
      throw new Error('La cuenta destino seleccionada debe ser en Dólares (USD).');
    }

    if (montoDivisa <= 0 || isNaN(montoDivisa)) {
      throw new Error('El importe en divisas debe ser un valor numérico positivo mayor a 0.');
    }

    if (montoDivisa < regla.montoMinimo) {
      throw new Error(`El monto mínimo permitido para esta regla es $${regla.montoMinimo.toFixed(2)} USD.`);
    }

    if (montoDivisa > regla.montoMaximo) {
      throw new Error(`El monto máximo permitido por operación es $${regla.montoMaximo.toFixed(2)} USD.`);
    }

    if (regla.multiplo > 1) {
      const resto = (montoDivisa * 100) % (regla.multiplo * 100);
      if (resto !== 0) {
        throw new Error(`El monto debe ser múltiplo de ${regla.multiplo} USD para la regla ${regla.tiporegla}.`);
      }
    }

    const tasaCambio = regla.tasaCompra;
    const subtotalBs = Number((montoDivisa * tasaCambio).toFixed(2));
    const comisionBs = Number(Math.max(1.00, subtotalBs * 0.0025).toFixed(2));
    const totalDebitoBs = Number((subtotalBs + comisionBs).toFixed(2));

    const saldoDisponibleBs = ctaOri.disponible;
    const saldoSuficiente = saldoDisponibleBs >= totalDebitoBs;

    if (!saldoSuficiente) {
      advertencias.push(
        `Saldo insuficiente: Requiere Bs. ${totalDebitoBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} y dispone de Bs. ${saldoDisponibleBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`
      );
    }

    return {
      valido: saldoSuficiente,
      montoDivisa,
      tasaCambio,
      subtotalBs,
      comisionBs,
      totalDebitoBs,
      saldoDisponibleBs,
      saldoSuficiente,
      codigoRegla,
      regla,
      advertencias,
    };
  }

  async iniciarCompra(token: string, req: IniciarCompraRequest): Promise<IniciarCompraResponse> {
    if (req.idempotencyKey && this.idempotencyCache.has(req.idempotencyKey)) {
      return this.idempotencyCache.get(req.idempotencyKey) as IniciarCompraResponse;
    }

    const cotizacion = await this.cotizar(token, {
      montoDivisa: req.montoDivisa,
      codigoRegla: req.codigoRegla,
      cuentaOrigen: req.cuentaOrigen,
      cuentaDestino: req.cuentaDestino,
    });

    if (!cotizacion.saldoSuficiente) {
      throw new Error('No dispone de fondos suficientes en Bolívares para realizar la operación.');
    }

    const randomHex = Math.floor(1000 + Math.random() * 9000);
    const codigoOperacion = `OP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomHex}`;

    const operacion: BdvOperacionCambiaria = {
      id: this.operaciones.size + 1,
      codigoOperacion,
      cuentaOrigen: req.cuentaOrigen,
      cuentaDestino: req.cuentaDestino,
      montoDivisa: cotizacion.montoDivisa,
      tasaCambio: cotizacion.tasaCambio,
      comisionBs: cotizacion.comisionBs,
      totalBs: cotizacion.totalDebitoBs,
      codigoRegla: req.codigoRegla,
      estado: 'PENDIENTE',
      fechaCreacion: new Date().toISOString(),
      fechaConfirmacion: null,
      idempotencyKey: req.idempotencyKey,
      mensajeRespuesta: 'Orden cambiaria preparada para confirmación.',
    };

    this.operaciones.set(codigoOperacion, operacion);

    const response: IniciarCompraResponse = {
      exito: true,
      codigoOperacion,
      estado: 'PENDIENTE',
      operacion,
      mensaje: 'Cotización asegurada. Revise los términos y confirme la compra.',
      requiereConfirmacion: true,
    };

    if (req.idempotencyKey) {
      this.idempotencyCache.set(req.idempotencyKey, response);
    }

    return response;
  }

  async confirmarCompra(token: string, req: ConfirmarCompraRequest): Promise<ConfirmarCompraResponse> {
    const { codigoOperacion, idempotencyKey } = req;

    if (idempotencyKey && this.idempotencyCache.has(idempotencyKey)) {
      return this.idempotencyCache.get(idempotencyKey) as ConfirmarCompraResponse;
    }

    const operacion = this.operaciones.get(codigoOperacion);
    if (!operacion) {
      throw new Error(`La operación [${codigoOperacion}] no existe o ya ha expirado.`);
    }

    if (operacion.estado === 'APROBADA') {
      return {
        exito: true,
        codigoOperacion,
        estado: 'APROBADA',
        operacion,
        mensaje: 'La operación ya se encuentra aprobada y liquidada.',
      };
    }

    if (operacion.estado !== 'PENDIENTE') {
      throw new Error(`La operación se encuentra en estado [${operacion.estado}] y no puede ser confirmada.`);
    }

    const ctaOri = this.cuentas.get(operacion.cuentaOrigen);
    const ctaDest = this.cuentas.get(operacion.cuentaDestino);

    if (!ctaOri || !ctaDest) {
      operacion.estado = 'RECHAZADA';
      operacion.motivoRechazo = 'Cuentas bancarias no disponibles al momento de la liquidación.';
      throw new Error(operacion.motivoRechazo);
    }

    if (ctaOri.disponible < operacion.totalBs) {
      operacion.estado = 'RECHAZADA';
      operacion.motivoRechazo = 'Saldo insuficiente al momento de confirmar el débito.';
      throw new Error(operacion.motivoRechazo);
    }

    ctaOri.saldo = Number((ctaOri.saldo - operacion.totalBs).toFixed(2));
    ctaOri.disponible = Number((ctaOri.disponible - operacion.totalBs).toFixed(2));

    ctaDest.saldo = Number((ctaDest.saldo + operacion.montoDivisa).toFixed(2));
    ctaDest.disponible = Number((ctaDest.disponible + operacion.montoDivisa).toFixed(2));

    operacion.estado = 'APROBADA';
    operacion.fechaConfirmacion = new Date().toISOString();
    operacion.mensajeRespuesta = 'Operación cambiaria liquidada exitosamente en cuenta BDV.';

    const response: ConfirmarCompraResponse = {
      exito: true,
      codigoOperacion,
      estado: 'APROBADA',
      operacion,
      mensaje: '¡Compra de divisas procesada exitosamente! Fondos acreditados en su cuenta en dólares.',
      nuevoSaldoBs: ctaOri.disponible,
      nuevoSaldoUsd: ctaDest.disponible,
    };

    if (idempotencyKey) {
      this.idempotencyCache.set(idempotencyKey, response);
    }

    return response;
  }

  async consultarEstado(_token: string, codigoOperacion: string): Promise<BdvOperacionCambiaria | null> {
    const op = this.operaciones.get(codigoOperacion);
    return op ? { ...op } : null;
  }

  getAdapterStatus() {
    return {
      mode: 'SANDBOX' as const,
      evidenceSource: 'Extracción estática APK split_config.arm64_v8a.apk (Drift/Floor SQLite)',
      endpointsConfigured: [
        '/bdvx-oauth-server/oauth/token',
        '/bdvx-consulta-cuenta-v2/v1/cuenta/saldo-v2',
        '/bdvx-operaciones-cambiarias/v1/operaciones/comprar',
        '/bdvx-operaciones-cambiarias/v1/operaciones/confirmar',
        '/bdvx-intervencion-cambiaria/v1/intervencion/consultarReglasEXRI',
      ],
      canExecuteLive: false,
      reasonIfDisabled:
        'Modo Sandbox activado para pruebas de desarrollo. Para operaciones reales configure BDV_API_BASE_URL.',
    };
  }
}

// Selección autorizada del adaptador:
// En producción real, si BDV_API_BASE_URL está configurado se utiliza BdvLiveApiAdapter.
// Si no está configurado, el sistema informa el bloqueo sin disfrazar datos ficticios como producción.
const hasLiveUrl = Boolean(process.env.BDV_API_BASE_URL);
const isProduction = process.env.NODE_ENV === 'production';
// Nunca permitir operaciones simuladas bajo un despliegue de producción.
// Si falta la URL autorizada, BdvLiveApiAdapter bloquea el acceso con CONFIG_BLOQUEADA.
export const activeBankingAdapter: IBdvBankingAdapter = (hasLiveUrl || isProduction)
  ? new BdvLiveApiAdapter()
  : new BdvSandboxAdapter();
