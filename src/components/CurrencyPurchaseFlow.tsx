import React, { useState, useEffect, useId } from 'react';
import { 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldAlert, 
  HelpCircle, 
  RefreshCw, 
  DollarSign, 
  CreditCard, 
  FileText, 
  Check, 
  Clock, 
  Printer, 
  RotateCcw,
  Info,
  ShieldCheck,
  ChevronRight,
  ExternalLink,
  Search
} from 'lucide-react';
import { 
  BdvAccount, 
  BdvReglaCambiaria, 
  CotizacionResponse, 
  IniciarCompraResponse, 
  ConfirmarCompraResponse,
  BdvOperacionCambiaria
} from '../types/bdv';
import { BdvApiClient } from '../services/apiClient';

interface CurrencyPurchaseFlowProps {
  cuentas: BdvAccount[];
  reglas: BdvReglaCambiaria[];
  onOperationCompleted: () => void;
  onOpenLookup: (codigoOperacion?: string) => void;
}

type FlowStep = 'PARAMETROS' | 'RESUMEN' | 'CONFIRMACION' | 'EXITO' | 'INCERTIDUMBRE';

export const CurrencyPurchaseFlow: React.FC<CurrencyPurchaseFlowProps> = ({
  cuentas,
  reglas,
  onOperationCompleted,
  onOpenLookup,
}) => {
  // Cuentas filtradas
  const vesAccounts = cuentas.filter((c) => c.moneda === 'VES' && c.estatus === 'ACTIVA');
  const usdAccounts = cuentas.filter((c) => c.moneda === 'USD' && c.estatus === 'ACTIVA');

  // Estados del formulario
  const [cuentaOrigen, setCuentaOrigen] = useState<string>('');
  const [cuentaDestino, setCuentaDestino] = useState<string>('');
  const [codigoRegla, setCodigoRegla] = useState<string>('');
  const [montoDivisaInput, setMontoDivisaInput] = useState<string>('20');
  
  // Estados de cálculo y validación
  const [cotizacion, setCotizacion] = useState<CotizacionResponse | null>(null);
  const [cotizando, setCotizando] = useState<boolean>(false);
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);

  // Estados del flujo
  const [step, setStep] = useState<FlowStep>('PARAMETROS');
  const [ordenIniciada, setOrdenIniciada] = useState<IniciarCompraResponse | null>(null);
  const [ordenConfirmada, setOrdenConfirmada] = useState<ConfirmarCompraResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorOperacion, setErrorOperacion] = useState<string | null>(null);

  // Términos y condiciones
  const [aceptoTerminos, setAceptoTerminos] = useState<boolean>(false);

  // Clave de idempotencia única por intento
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  // Inicialización de cuentas por defecto
  useEffect(() => {
    if (vesAccounts.length > 0 && !cuentaOrigen) {
      setCuentaOrigen(vesAccounts[0].numero);
    }
    if (usdAccounts.length > 0 && !cuentaDestino) {
      setCuentaDestino(usdAccounts[0].numero);
    }
    if (reglas.length > 0 && !codigoRegla) {
      setCodigoRegla(reglas[0].codigoRegla);
    }
  }, [cuentas, reglas]);

  // Selección de regla activa
  const reglaSeleccionada = reglas.find((r) => r.codigoRegla === codigoRegla) || reglas[0];
  const cuentaOriObj = cuentas.find((c) => c.numero === cuentaOrigen);
  const cuentaDestObj = cuentas.find((c) => c.numero === cuentaDestino);

  // Cálculo reactivo de cotización cada vez que cambian los parámetros
  useEffect(() => {
    let isCancelled = false;

    const recalcular = async () => {
      const monto = parseFloat(montoDivisaInput);
      if (!cuentaOrigen || !cuentaDestino || !codigoRegla) return;
      if (isNaN(monto) || monto <= 0) {
        setCotizacion(null);
        setErrorValidacion('Ingrese un monto válido mayor a 0');
        return;
      }

      setCotizando(true);
      setErrorValidacion(null);

      try {
        const resp = await BdvApiClient.cotizar({
          montoDivisa: monto,
          codigoRegla,
          cuentaOrigen,
          cuentaDestino,
        });

        if (!isCancelled) {
          setCotizacion(resp);
          if (!resp.saldoSuficiente) {
            setErrorValidacion('Saldo insuficiente en su cuenta corriente para cubrir este monto y comisiones.');
          } else {
            setErrorValidacion(null);
          }
        }
      } catch (err: any) {
        if (!isCancelled) {
          setCotizacion(null);
          setErrorValidacion(err.message || 'Error al validar cotización cambiaria');
        }
      } finally {
        if (!isCancelled) {
          setCotizando(false);
        }
      }
    };

    const timer = setTimeout(recalcular, 250);
    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [montoDivisaInput, cuentaOrigen, cuentaDestino, codigoRegla]);

  // Manejador de botones rápidos de montos
  const handleQuickAmount = (amount: number) => {
    setMontoDivisaInput(amount.toString());
  };

  const handleMaxAmount = () => {
    if (!cuentaOriObj || !reglaSeleccionada) return;
    // Estimación segura de cuánto USD puede comprar con su saldo disponible
    const tasa = reglaSeleccionada.tasaCompra;
    const saldo = cuentaOriObj.disponible;
    // totalBs = monto * tasa * 1.0025
    const maxUsdEstimado = Math.floor((saldo / (tasa * 1.0025)));
    const maxPermitido = Math.min(maxUsdEstimado, reglaSeleccionada.montoMaximo);
    
    // Si la regla tiene múltiplos (ej. 10 USD), redondear al múltiplo inferior
    const multiplo = reglaSeleccionada.multiplo || 1;
    const finalUsd = Math.max(reglaSeleccionada.montoMinimo, Math.floor(maxPermitido / multiplo) * multiplo);
    
    setMontoDivisaInput(finalUsd.toString());
  };

  // ---------------------------------------------------------------------------
  // PASO 1 -> PASO 2: Iniciar Orden (Crear Pre-operación con Idempotencia)
  // ---------------------------------------------------------------------------
  const handleIniciarOrden = async () => {
    if (!cotizacion || !cotizacion.saldoSuficiente || !cuentaOrigen || !cuentaDestino) {
      return;
    }

    setIsSubmitting(true);
    setErrorOperacion(null);

    const newKey = BdvApiClient.generateIdempotencyKey('iniciar');
    setIdempotencyKey(newKey);

    try {
      const resp = await BdvApiClient.iniciarCompra({
        montoDivisa: cotizacion.montoDivisa,
        codigoRegla: cotizacion.codigoRegla,
        cuentaOrigen,
        cuentaDestino,
        idempotencyKey: newKey,
      });

      setOrdenIniciada(resp);
      setAceptoTerminos(false);
      setStep('RESUMEN');
    } catch (err: any) {
      setErrorOperacion(err.message || 'No fue posible iniciar la cotización de compra.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // PASO 2 -> PASO 3: Confirmar Operación con el Banco (Protección Doble Envío)
  // ---------------------------------------------------------------------------
  const handleConfirmarOrden = async () => {
    if (!ordenIniciada || !aceptoTerminos || isSubmitting) return;

    setIsSubmitting(true);
    setErrorOperacion(null);

    const confirmIdempotencyKey = BdvApiClient.generateIdempotencyKey('confirmar');

    try {
      const resp = await BdvApiClient.confirmarCompra(
        ordenIniciada.codigoOperacion,
        confirmIdempotencyKey
      );

      setOrdenConfirmada(resp);
      setStep('EXITO');
      onOperationCompleted();
    } catch (err: any) {
      console.error('Error al confirmar compra:', err);
      // Si el error parece timeout o estado desconocido, no fallar a ciegas:
      if (err.message && (err.message.includes('timeout') || err.message.includes('red') || err.message.includes('desconocido'))) {
        setStep('INCERTIDUMBRE');
      } else {
        setErrorOperacion(err.message || 'No se pudo liquidar la operación cambiaria.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reiniciar flujo para una nueva compra
  const handleReiniciar = () => {
    setStep('PARAMETROS');
    setOrdenIniciada(null);
    setOrdenConfirmada(null);
    setErrorOperacion(null);
    setAceptoTerminos(false);
    setMontoDivisaInput('20');
  };

  // Imprimir comprobante oficial
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Barra de Progreso de 4 Pasos */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg">
        <div className="flex items-center justify-between">
          {[
            { id: 'PARAMETROS', label: '1. Parámetros' },
            { id: 'RESUMEN', label: '2. Verificación' },
            { id: 'CONFIRMACION', label: '3. Liquidación' },
            { id: 'EXITO', label: '4. Comprobante' },
          ].map((s, idx) => {
            const isCurrent = step === s.id;
            const isCompleted =
              (s.id === 'PARAMETROS' && (step === 'RESUMEN' || step === 'EXITO')) ||
              (s.id === 'RESUMEN' && step === 'EXITO') ||
              (s.id === 'CONFIRMACION' && step === 'EXITO');

            return (
              <div key={s.id} className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    isCurrent
                      ? 'bg-red-600 text-white shadow-lg shadow-red-900/40 ring-2 ring-red-400/30'
                      : isCompleted
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  {isCompleted ? <Check className="w-4 h-4" /> : idx + 1}
                </div>
                <span
                  className={`text-xs font-semibold hidden sm:inline ${
                    isCurrent ? 'text-white' : isCompleted ? 'text-emerald-400' : 'text-slate-400'
                  }`}
                >
                  {s.label}
                </span>
                {idx < 3 && <ChevronRight className="w-4 h-4 text-slate-600 hidden md:inline ml-2" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* =======================================================================
          PASO 1: SELECCIÓN DE PARÁMETROS Y COTIZACIÓN REACTIVA
          ======================================================================= */}
      {step === 'PARAMETROS' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-emerald-400" />
              Solicitud de Compra de Divisas (Dólares Americanos - USD)
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Operación autorizada bajo el Convenio Cambiario N° 1 y regulaciones del Banco Central de Venezuela (BCV).
            </p>
          </div>

          {/* Selector de Regla Cambiaria (MENUDEO vs EXRI) */}
          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
              <span>Modalidad / Regla de Adquisición</span>
              <span className="text-emerald-400 font-mono text-[11px] font-bold">
                Tasa Oficial BCV: Bs. {reglaSeleccionada?.tasaCompra.toFixed(2)} / USD
              </span>
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {reglas.map((regla) => {
                const isSelected = regla.codigoRegla === codigoRegla;
                return (
                  <button
                    key={regla.codigoRegla}
                    type="button"
                    onClick={() => setCodigoRegla(regla.codigoRegla)}
                    className={`text-left p-4 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-red-950/40 border-red-500/80 shadow-md ring-1 ring-red-500/30'
                        : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-white uppercase">{regla.tiporegla}</span>
                      <span className="text-xs font-bold text-emerald-400">
                        Bs. {regla.tasaCompra.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 line-clamp-2">{regla.descripcionRegla}</p>
                    <div className="mt-2 text-[10px] text-slate-400 flex items-center justify-between border-t border-slate-800/80 pt-1.5">
                      <span>Límites: ${regla.montoMinimo} - ${regla.montoMaximo} USD</span>
                      <span>Múltiplo: ${regla.multiplo} USD</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cuentas Origen y Destino */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Cuenta Origen en Bolívares */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-red-400" />
                <span>Cuenta a Debitar (Bolívares - VES)</span>
              </label>
              <select
                value={cuentaOrigen}
                onChange={(e) => setCuentaOrigen(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-red-500 font-mono"
              >
                {vesAccounts.map((c) => (
                  <option key={c.numero} value={c.numero}>
                    {c.alias || c.tipo} - {c.numero.slice(-8)} (Disp: Bs. {c.disponible.toLocaleString('es-VE', { minimumFractionDigits: 2 })})
                  </option>
                ))}
              </select>
              {cuentaOriObj && (
                <div className="text-[11px] text-slate-400 flex items-center justify-between px-1">
                  <span>Disponible:</span>
                  <span className="font-semibold text-white">
                    Bs. {cuentaOriObj.disponible.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>

            {/* Cuenta Destino en Divisas */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <span>Cuenta a Acreditar (Dólares - USD)</span>
              </label>
              <select
                value={cuentaDestino}
                onChange={(e) => setCuentaDestino(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
              >
                {usdAccounts.map((c) => (
                  <option key={c.numero} value={c.numero}>
                    {c.alias || 'Cta. Moneda Extranjera'} - {c.numero.slice(-8)} (Saldo: ${c.disponible.toFixed(2)})
                  </option>
                ))}
              </select>
              {cuentaDestObj && (
                <div className="text-[11px] text-slate-400 flex items-center justify-between px-1">
                  <span>Saldo actual en divisas:</span>
                  <span className="font-semibold text-emerald-400">
                    ${cuentaDestObj.disponible.toFixed(2)} USD
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Campo de Importe en Divisas y Botones Rápidos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Monto a Comprar en Divisas (USD)
              </label>
              <div className="text-[11px] text-slate-400">
                Min: <span className="text-white">${reglaSeleccionada?.montoMinimo}</span> | Max:{' '}
                <span className="text-white">${reglaSeleccionada?.montoMaximo} USD</span>
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-emerald-400 font-bold text-lg">
                $
              </div>
              <input
                type="number"
                min={reglaSeleccionada?.montoMinimo || 1}
                max={reglaSeleccionada?.montoMaximo || 2000}
                step={reglaSeleccionada?.multiplo || 1}
                value={montoDivisaInput}
                onChange={(e) => setMontoDivisaInput(e.target.value)}
                placeholder="20.00"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-16 py-3 text-lg font-bold text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all font-mono"
              />
              <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-slate-400 text-xs font-bold">
                USD
              </div>
            </div>

            {/* Accesos directos de montos */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {[10, 20, 50, 100, 250].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleQuickAmount(val)}
                  className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 border border-slate-700/80 transition-colors"
                >
                  +${val} USD
                </button>
              ))}
              <button
                type="button"
                onClick={handleMaxAmount}
                className="px-3 py-1 rounded-lg bg-red-950/80 hover:bg-red-900/80 text-xs font-semibold text-red-300 border border-red-800/60 transition-colors"
              >
                Monto Máximo Posible
              </button>
            </div>
          </div>

          {/* Desglose de Liquidación y Tasa Oficial */}
          {cotizacion && (
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800/80 pb-2">
                <span>Desglose Estimado de Liquidación</span>
                <span className="text-emerald-400 font-mono">Cotización Asegurada</span>
              </div>

              <div className="space-y-2 text-xs sm:text-sm">
                <div className="flex items-center justify-between text-slate-300">
                  <span>Monto solicitado en divisas:</span>
                  <span className="font-bold text-white font-mono">
                    ${cotizacion.montoDivisa.toFixed(2)} USD
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-300">
                  <span>Tasa oficial de cambio BCV:</span>
                  <span className="font-mono text-slate-200">
                    Bs. {cotizacion.tasaCambio.toFixed(2)} / USD
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-300">
                  <span>Contravalor en Bolívares:</span>
                  <span className="font-mono text-slate-200">
                    Bs. {cotizacion.subtotalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span className="flex items-center gap-1">
                    <span>Comisión bancaria normativa (0.25%):</span>
                    <Info className="w-3 h-3 text-slate-500" />
                  </span>
                  <span className="font-mono text-slate-300">
                    Bs. {cotizacion.comisionBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm sm:text-base font-extrabold text-white pt-2 border-t border-slate-800">
                  <span className="text-red-400">Total Débito en Bolívares:</span>
                  <span className="font-mono text-red-400">
                    Bs. {cotizacion.totalDebitoBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Alertas de Validación */}
          {errorValidacion && (
            <div className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-3.5 flex items-start gap-3 text-amber-200 text-xs">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block mb-0.5">Validación de Fondos y Normativa:</span>
                <span>{errorValidacion}</span>
              </div>
            </div>
          )}

          {/* Botón de Continuar a Verificación */}
          <div className="pt-2">
            <button
              type="button"
              disabled={!cotizacion || !cotizacion.saldoSuficiente || cotizando || isSubmitting}
              onClick={handleIniciarOrden}
              className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3.5 px-6 rounded-xl transition-all shadow-lg shadow-red-900/30 flex items-center justify-center gap-2 text-sm"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Preparando orden bancaria...</span>
                </>
              ) : (
                <>
                  <span>Continuar a Verificación</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* =======================================================================
          PASO 2: VERIFICACIÓN Y PRE-OPERACIÓN (CON RESUMEN NO EDITABLE)
          ======================================================================= */}
      {step === 'RESUMEN' && ordenIniciada && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
          <div className="border-b border-slate-800 pb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-emerald-400" />
                Verificación de Operación Cambiaria
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Revise cuidadosamente los detalles antes de autorizar el débito en su cuenta.
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block font-mono">Código de Orden</span>
              <span className="text-xs font-bold text-red-400 font-mono">
                {ordenIniciada.codigoOperacion}
              </span>
            </div>
          </div>

          {/* Tabla de Resumen Inmutable */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl divide-y divide-slate-800/80 text-xs sm:text-sm">
            <div className="p-3.5 sm:p-4 flex items-center justify-between">
              <span className="text-slate-400">Modalidad Cambiaria:</span>
              <span className="font-bold text-white uppercase">{ordenIniciada.operacion.codigoRegla}</span>
            </div>

            <div className="p-3.5 sm:p-4 flex items-center justify-between">
              <span className="text-slate-400">Cuenta de Origen (Débito en Bolívares):</span>
              <span className="font-mono text-slate-200">
                {ordenIniciada.operacion.cuentaOrigen}
              </span>
            </div>

            <div className="p-3.5 sm:p-4 flex items-center justify-between">
              <span className="text-slate-400">Cuenta de Destino (Crédito en Dólares):</span>
              <span className="font-mono text-emerald-400 font-semibold">
                {ordenIniciada.operacion.cuentaDestino}
              </span>
            </div>

            <div className="p-3.5 sm:p-4 flex items-center justify-between">
              <span className="text-slate-400">Monto Solicitado:</span>
              <span className="font-bold text-emerald-400 font-mono text-base">
                ${ordenIniciada.operacion.montoDivisa.toFixed(2)} USD
              </span>
            </div>

            <div className="p-3.5 sm:p-4 flex items-center justify-between">
              <span className="text-slate-400">Tasa de Cambio Oficial:</span>
              <span className="font-mono text-slate-300">
                Bs. {ordenIniciada.operacion.tasaCambio.toFixed(2)} / USD
              </span>
            </div>

            <div className="p-3.5 sm:p-4 flex items-center justify-between">
              <span className="text-slate-400">Comisión por Intermediación Cambiaria:</span>
              <span className="font-mono text-slate-300">
                Bs. {ordenIniciada.operacion.comisionBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="p-3.5 sm:p-4 flex items-center justify-between bg-red-950/20 font-bold">
              <span className="text-red-300">Monto Total a Debitar:</span>
              <span className="font-mono text-red-400 text-base">
                Bs. {ordenIniciada.operacion.totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Declaración Jurada y Normativa Legal */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-2.5">
              <input
                type="checkbox"
                id="declaracionJurada"
                checked={aceptoTerminos}
                onChange={(e) => setAceptoTerminos(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-slate-700 bg-slate-900 text-red-600 focus:ring-red-500 cursor-pointer"
              />
              <label htmlFor="declaracionJurada" className="text-xs text-slate-300 cursor-pointer">
                Declaro bajo fe de juramento que el origen y destino de los fondos son totalmente lícitos,
                que he leído y acepto los términos de intermediación cambiaria establecidos por el Banco Central
                de Venezuela y autorizo expresamente al Banco de Venezuela a debitar de mi cuenta corriente el monto
                total indicado.
              </label>
            </div>
          </div>

          {/* Mensajes de Error de la Operación */}
          {errorOperacion && (
            <div className="bg-rose-950/50 border border-rose-800/80 rounded-xl p-4 flex items-start gap-3 text-rose-200 text-xs">
              <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
              <div>
                <span className="font-bold block mb-0.5">Operación Rechazada por el Banco:</span>
                <span>{errorOperacion}</span>
              </div>
            </div>
          )}

          {/* Botones de Acción (Prevención de Doble Envío) */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setStep('PARAMETROS')}
              className="w-full sm:w-1/3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-semibold py-3 px-4 rounded-xl text-xs sm:text-sm transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Modificar Parámetros</span>
            </button>

            <button
              type="button"
              disabled={!aceptoTerminos || isSubmitting}
              onClick={handleConfirmarOrden}
              className="w-full sm:w-2/3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3.5 px-6 rounded-xl transition-all shadow-lg shadow-red-900/30 flex items-center justify-center gap-2 text-sm"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Procesando liquidación con el Banco...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5" />
                  <span>Confirmar y Comprar ${ordenIniciada.operacion.montoDivisa.toFixed(2)} USD</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* =======================================================================
          PASO 3: ÉXITO Y COMPROBANTE OFICIAL
          ======================================================================= */}
      {step === 'EXITO' && ordenConfirmada && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
          {/* Header de Éxito */}
          <div className="text-center space-y-2 border-b border-slate-800 pb-6">
            <div className="w-16 h-16 rounded-full bg-emerald-950/80 border border-emerald-600 text-emerald-400 mx-auto flex items-center justify-center shadow-lg shadow-emerald-900/40">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black text-white">¡Operación Cambiaria Exitosa!</h2>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Los dólares han sido acreditados de forma inmediata en su cuenta en moneda extranjera del Banco de Venezuela.
            </p>
          </div>

          {/* Tarjeta Recibo Bancario Oficial */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Comprobante Electrónico
                </span>
                <span className="text-sm font-extrabold text-white">BDV Digital - Divisas</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block font-mono">Número de Referencia</span>
                <span className="text-xs font-mono font-bold text-red-400">
                  {ordenConfirmada.codigoOperacion}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block">Fecha y Hora de Confirmación:</span>
                <span className="text-white font-medium">
                  {new Date(ordenConfirmada.operacion.fechaConfirmacion || '').toLocaleString('es-VE')}
                </span>
              </div>

              <div>
                <span className="text-slate-400 block">Modalidad de Operación:</span>
                <span className="text-white font-medium uppercase">
                  {ordenConfirmada.operacion.codigoRegla}
                </span>
              </div>

              <div>
                <span className="text-slate-400 block">Cuenta Debitada (VES):</span>
                <span className="text-white font-mono">{ordenConfirmada.operacion.cuentaOrigen}</span>
              </div>

              <div>
                <span className="text-slate-400 block">Cuenta Acreditada (USD):</span>
                <span className="text-emerald-400 font-mono font-semibold">
                  {ordenConfirmada.operacion.cuentaDestino}
                </span>
              </div>

              <div>
                <span className="text-slate-400 block">Tasa de Cambio Oficial BCV:</span>
                <span className="text-white font-mono">
                  Bs. {ordenConfirmada.operacion.tasaCambio.toFixed(2)} / USD
                </span>
              </div>

              <div>
                <span className="text-slate-400 block">Monto Divisa Acreditado:</span>
                <span className="text-emerald-400 font-bold font-mono text-sm">
                  +${ordenConfirmada.operacion.montoDivisa.toFixed(2)} USD
                </span>
              </div>

              <div className="sm:col-span-2 pt-2 border-t border-slate-800 flex items-center justify-between">
                <span className="text-slate-300 font-semibold">Total Bolívares Debitados:</span>
                <span className="text-red-400 font-extrabold font-mono text-sm">
                  Bs. {ordenConfirmada.operacion.totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Botones de Comprobante y Nueva Compra */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handlePrint}
              className="w-full sm:w-1/2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold py-3 px-4 rounded-xl text-xs sm:text-sm transition-colors flex items-center justify-center gap-2 border border-slate-700"
            >
              <Printer className="w-4 h-4 text-slate-400" />
              <span>Imprimir / Guardar Comprobante</span>
            </button>

            <button
              type="button"
              onClick={handleReiniciar}
              className="w-full sm:w-1/2 bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-xl text-xs sm:text-sm transition-all shadow-md shadow-red-900/30 flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Realizar Otra Operación</span>
            </button>
          </div>
        </div>
      )}

      {/* =======================================================================
          ESTADO ESPECIAL: INCERTIDUMBRE / TIMEOUT DE RED
          (Cumplimiento estricto: no repetir compras a ciegas)
          ======================================================================= */}
      {step === 'INCERTIDUMBRE' && ordenIniciada && (
        <div className="bg-slate-900/90 border border-amber-800/80 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
          <div className="text-center space-y-2 border-b border-slate-800 pb-5">
            <div className="w-16 h-16 rounded-full bg-amber-950/80 border border-amber-500 text-amber-400 mx-auto flex items-center justify-center shadow-lg shadow-amber-900/40">
              <Clock className="w-9 h-9" />
            </div>
            <h2 className="text-xl font-bold text-white">Estado de Liquidación Desconocido</h2>
            <p className="text-xs text-amber-200/90 max-w-lg mx-auto">
              Se produjo un tiempo de espera de red durante la confirmación. Por normativa de seguridad bancaria,
              <strong className="text-white"> no reintente la compra automáticamente</strong> para evitar débitos duplicados.
            </p>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Referencia de Orden Generada:</span>
              <span className="font-mono font-bold text-red-400">{ordenIniciada.codigoOperacion}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Importe en espera de confirmación:</span>
              <span className="font-mono text-emerald-400 font-bold">${ordenIniciada.operacion.montoDivisa.toFixed(2)} USD</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              type="button"
              onClick={() => onOpenLookup(ordenIniciada.codigoOperacion)}
              className="w-full sm:w-1/2 bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-4 rounded-xl text-xs sm:text-sm transition-colors flex items-center justify-center gap-2"
            >
              <Search className="w-4 h-4" />
              <span>Verificar Estado de esta Orden</span>
            </button>

            <button
              type="button"
              onClick={handleReiniciar}
              className="w-full sm:w-1/2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-3 px-4 rounded-xl text-xs sm:text-sm transition-colors flex items-center justify-center gap-2"
            >
              <span>Volver a Cuentas</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
