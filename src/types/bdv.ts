/**
 * Tipos y esquemas de BDV Digital basados en la extracción estática del APK y schemas SQL.
 * Tablas documentadas: cuentas, reglas_divisas, operaciones_cambiarias, monedas_divisas.
 */

export interface BdvAccount {
  id: number;
  numero: string; // 20 dígitos bancarios (ej. 0102-0100-...)
  tipo: 'CORRIENTE' | 'AHORRO' | 'MONEDA_EXTRANJERA';
  moneda: 'VES' | 'USD' | 'EUR';
  saldo: number;
  disponible: number;
  estatus: 'ACTIVA' | 'BLOQUEADA' | 'INACTIVA';
  alias?: string;
}

export interface BdvReglaCambiaria {
  codigoRegla: string; // VARCHAR(60) PRIMARY KEY
  tiporegla: 'MENUDEO' | 'INTERVENCION_EXRI' | 'MESA_DE_CAMBIO';
  moneda: 'USD' | 'EUR';
  tasaCompra: number; // Tasa a la que el usuario compra divisas (debe pagar en Bs)
  tasaVenta: number;
  descripcionRegla: string;
  montoMinimo: number;
  montoMaximo: number;
  multiplo: number; // Factoración requerida
  activa: boolean;
  horarioOperativo?: string;
}

export type BdvEstadoOperacion = 
  | 'PENDIENTE' 
  | 'APROBADA' 
  | 'RECHAZADA' 
  | 'DESCONOCIDO' 
  | 'EN_REVISION';

export interface BdvOperacionCambiaria {
  id: number;
  codigoOperacion: string; // Referencia bancaria única (ej. OP-20261014-948123)
  cuentaOrigen: string; // Cuenta en Bs
  cuentaDestino: string; // Cuenta en USD
  montoDivisa: number; // Monto en USD solicitado
  tasaCambio: number; // Tasa oficial congelada
  comisionBs: number; // Comisión bancaria (0.25% - 0.50% según normativa)
  totalBs: number; // (montoDivisa * tasaCambio) + comisionBs
  codigoRegla: string; // Referencia a reglas_divisas
  estado: BdvEstadoOperacion;
  fechaCreacion: string; // ISO String
  fechaConfirmacion?: string | null;
  mensajeRespuesta?: string;
  motivoRechazo?: string;
  idempotencyKey?: string;
}

export interface BdvUserSession {
  username: string;
  nombreCompleto: string;
  documentoIdentidad: string; // V-12345678
  token: string;
  refreshToken?: string;
  expiresAt: string;
  modo: 'SANDBOX_DEMO' | 'CONECTOR_ENLACE_BDV';
}

export interface CotizacionRequest {
  montoDivisa: number;
  codigoRegla: string;
  cuentaOrigen: string;
  cuentaDestino: string;
}

export interface CotizacionResponse {
  valido: boolean;
  montoDivisa: number;
  tasaCambio: number;
  subtotalBs: number;
  comisionBs: number;
  totalDebitoBs: number;
  saldoDisponibleBs: number;
  saldoSuficiente: boolean;
  codigoRegla: string;
  regla: BdvReglaCambiaria;
  advertencias: string[];
}

export interface IniciarCompraRequest {
  montoDivisa: number;
  codigoRegla: string;
  cuentaOrigen: string;
  cuentaDestino: string;
  idempotencyKey: string;
}

export interface IniciarCompraResponse {
  exito: boolean;
  codigoOperacion: string;
  estado: BdvEstadoOperacion;
  operacion: BdvOperacionCambiaria;
  mensaje: string;
  requiereConfirmacion: boolean;
}

export interface ConfirmarCompraRequest {
  codigoOperacion: string;
  idempotencyKey: string;
}

export interface ConfirmarCompraResponse {
  exito: boolean;
  codigoOperacion: string;
  estado: BdvEstadoOperacion;
  operacion: BdvOperacionCambiaria;
  mensaje: string;
  nuevoSaldoBs?: number;
  nuevoSaldoUsd?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}
