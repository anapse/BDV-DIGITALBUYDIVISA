import React, { useState, useEffect } from 'react';
import { 
  Search, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertTriangle, 
  HelpCircle, 
  FileText,
  DollarSign,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { BdvOperacionCambiaria } from '../types/bdv';
import { BdvApiClient } from '../services/apiClient';

interface OperationLookupProps {
  initialCode?: string;
  onGoToPurchase: () => void;
}

export const OperationLookup: React.FC<OperationLookupProps> = ({
  initialCode = '',
  onGoToPurchase,
}) => {
  const [codigoInput, setCodigoInput] = useState<string>(initialCode);
  const [operacion, setOperacion] = useState<BdvOperacionCambiaria | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleBuscar = async (codigoABuscar?: string) => {
    const code = (codigoABuscar || codigoInput).trim();
    if (!code) {
      setError('Por favor ingrese una referencia bancaria válida (ej. OP-20261012-7841)');
      return;
    }

    setLoading(true);
    setError(null);
    setOperacion(null);

    try {
      const data = await BdvApiClient.consultarEstado(code);
      setOperacion(data);
    } catch (err: any) {
      setError(err.message || 'No se encontró ninguna operación con esa referencia.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialCode) {
      setCodigoInput(initialCode);
      handleBuscar(initialCode);
    }
  }, [initialCode]);

  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case 'APROBADA':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-950 text-emerald-400 border border-emerald-800/80">
            <CheckCircle2 className="w-3.5 h-3.5" /> APROBADA Y LIQUIDADA
          </span>
        );
      case 'PENDIENTE':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-950 text-amber-400 border border-amber-800/80">
            <Clock className="w-3.5 h-3.5" /> PENDIENTE POR CONFIRMAR
          </span>
        );
      case 'RECHAZADA':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-950 text-rose-400 border border-rose-800/80">
            <XCircle className="w-3.5 h-3.5" /> RECHAZADA
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">
            <HelpCircle className="w-3.5 h-3.5" /> {estado}
          </span>
        );
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Banner Informativo de Auditoría */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-950 border border-red-800/60 text-red-400 flex items-center justify-center shrink-0">
            <Search className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">
              Consulta y Verificación de Estado de Operación
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Si experimentó una pérdida de conexión o resultado desconocido durante una compra,
              verifique aquí el estatus oficial registrado en el banco antes de realizar cualquier otro intento.
            </p>
          </div>
        </div>

        {/* Input de Búsqueda */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleBuscar();
          }}
          className="flex flex-col sm:flex-row gap-2 pt-2"
        >
          <div className="relative flex-1">
            <input
              type="text"
              value={codigoInput}
              onChange={(e) => setCodigoInput(e.target.value.toUpperCase())}
              placeholder="Ej: OP-20261012-7841"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 font-mono focus:outline-none focus:border-red-500 uppercase"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-xl text-xs sm:text-sm transition-colors flex items-center justify-center gap-2 shadow-md shadow-red-900/30"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Consultando...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Consultar Referencia</span>
              </>
            )}
          </button>
        </form>

        {/* Ejemplos para auditoría rápida */}
        <div className="text-[11px] text-slate-500 flex items-center gap-2">
          <span>Operación previa en sistema:</span>
          <button
            type="button"
            onClick={() => {
              setCodigoInput('OP-20261012-7841');
              handleBuscar('OP-20261012-7841');
            }}
            className="text-red-400 hover:underline font-mono"
          >
            OP-20261012-7841
          </button>
        </div>
      </div>

      {/* Resultado de la Búsqueda */}
      {error && (
        <div className="bg-rose-950/40 border border-rose-800/60 rounded-xl p-4 flex items-start gap-3 text-rose-200 text-xs">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          <div>
            <span className="font-bold block mb-0.5">Consulta sin resultados:</span>
            <span>{error}</span>
          </div>
        </div>
      )}

      {operacion && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                Detalle Oficial de Operación
              </span>
              <span className="text-base font-extrabold text-white font-mono">
                {operacion.codigoOperacion}
              </span>
            </div>
            <div>{getStatusBadge(operacion.estado)}</div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm">
            <div>
              <span className="text-slate-400 block text-xs">Fecha de Solicitud:</span>
              <span className="text-slate-200 font-medium">
                {new Date(operacion.fechaCreacion).toLocaleString('es-VE')}
              </span>
            </div>

            {operacion.fechaConfirmacion && (
              <div>
                <span className="text-slate-400 block text-xs">Fecha de Liquidación:</span>
                <span className="text-emerald-400 font-medium">
                  {new Date(operacion.fechaConfirmacion).toLocaleString('es-VE')}
                </span>
              </div>
            )}

            <div>
              <span className="text-slate-400 block text-xs">Monto en Divisas:</span>
              <span className="text-emerald-400 font-bold font-mono text-base">
                ${operacion.montoDivisa.toFixed(2)} USD
              </span>
            </div>

            <div>
              <span className="text-slate-400 block text-xs">Tasa de Cambio Oficial:</span>
              <span className="text-slate-200 font-mono">
                Bs. {operacion.tasaCambio.toFixed(2)} / USD
              </span>
            </div>

            <div>
              <span className="text-slate-400 block text-xs">Cuenta Origen (Débito):</span>
              <span className="text-slate-200 font-mono">{operacion.cuentaOrigen}</span>
            </div>

            <div>
              <span className="text-slate-400 block text-xs">Cuenta Destino (Crédito):</span>
              <span className="text-slate-200 font-mono">{operacion.cuentaDestino}</span>
            </div>

            <div className="sm:col-span-2 pt-3 border-t border-slate-800 flex items-center justify-between">
              <span className="text-slate-300 font-semibold">Total Liquidado en Bolívares:</span>
              <span className="text-red-400 font-extrabold font-mono text-base">
                Bs. {operacion.totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
              </span>
            </div>

            {operacion.mensajeRespuesta && (
              <div className="sm:col-span-2 bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs text-slate-300">
                <span className="text-slate-400 block mb-0.5">Respuesta de Liquidación:</span>
                <span>{operacion.mensajeRespuesta}</span>
              </div>
            )}
          </div>

          {operacion.estado === 'PENDIENTE' && (
            <div className="bg-amber-950/40 border border-amber-800/80 rounded-xl p-4 flex items-center justify-between">
              <div className="text-xs text-amber-200">
                <strong className="block">Esta orden está pendiente por confirmar.</strong>
                <span>Puede proceder a autorizarla o cancelarla desde el flujo de compra.</span>
              </div>
              <button
                onClick={onGoToPurchase}
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1"
              >
                <span>Ir al Flujo</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
