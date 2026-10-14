import React, { useState } from 'react';
import { 
  Wallet, 
  Copy, 
  Check, 
  RefreshCw, 
  TrendingUp, 
  ArrowUpRight, 
  DollarSign, 
  CreditCard,
  AlertCircle,
  Eye,
  EyeOff
} from 'lucide-react';
import { BdvAccount } from '../types/bdv';

interface AccountsListProps {
  cuentas: BdvAccount[];
  loading: boolean;
  onRefresh: () => void;
  onGoToPurchase: () => void;
}

export const AccountsList: React.FC<AccountsListProps> = ({
  cuentas,
  loading,
  onRefresh,
  onGoToPurchase,
}) => {
  const [copiedAccount, setCopiedAccount] = useState<string | null>(null);
  const [showFullAccount, setShowFullAccount] = useState<Record<string, boolean>>({});

  const handleCopy = (numero: string) => {
    navigator.clipboard.writeText(numero);
    setCopiedAccount(numero);
    setTimeout(() => setCopiedAccount(null), 2500);
  };

  const toggleShowAccount = (numero: string) => {
    setShowFullAccount((prev) => ({ ...prev, [numero]: !prev[numero] }));
  };

  const formatAccountNumber = (numero: string, isVisible: boolean) => {
    if (isVisible) {
      // Formato bancario estándar venezolano: 0102-0108-99-0100045678
      return `${numero.slice(0, 4)}-${numero.slice(4, 8)}-${numero.slice(8, 10)}-${numero.slice(10)}`;
    }
    return `${numero.slice(0, 4)}-••••-••-${numero.slice(16)}`;
  };

  const vesAccounts = cuentas.filter((c) => c.moneda === 'VES');
  const usdAccounts = cuentas.filter((c) => c.moneda === 'USD');

  const totalVes = vesAccounts.reduce((sum, c) => sum + c.disponible, 0);
  const totalUsd = usdAccounts.reduce((sum, c) => sum + c.disponible, 0);

  return (
    <div className="space-y-6">
      {/* Resumen Superior de Posición Consolidada */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Total Bolívares */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/80 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/10 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none" />
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Saldo Consolidado en Bolívares</span>
            <Wallet className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Bs. {totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/80 pt-3">
            <span>{vesAccounts.length} cuenta(s) en moneda nacional</span>
            <span className="text-emerald-400 font-medium">Disponible para cambio</span>
          </div>
        </div>

        {/* Total Dólares USD */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-emerald-900/40 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-600/10 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none" />
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Saldo Consolidado en Divisas</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 tracking-tight">
            ${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-sm font-medium text-slate-400">USD</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/80 pt-3">
            <span>Cuenta Libre Convertibilidad</span>
            <button
              onClick={onGoToPurchase}
              className="text-red-400 hover:text-red-300 font-semibold flex items-center gap-1 transition-colors"
            >
              Comprar Más <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Acceso Rápido a Mesa Cambiaria */}
        <div className="bg-gradient-to-br from-red-950/60 via-slate-900 to-slate-900 border border-red-900/40 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-red-400 uppercase tracking-wider mb-2">
              <TrendingUp className="w-4 h-4" />
              <span>Operaciones Cambiarias BDV</span>
            </div>
            <h4 className="text-sm font-bold text-white mb-1">
              Adquisición de Dólares al Menudeo y EXRI
            </h4>
            <p className="text-xs text-slate-400">
              Operaciones liquidadas directamente en su cuenta de divisas con tasa oficial BCV.
            </p>
          </div>
          <button
            onClick={onGoToPurchase}
            className="mt-4 w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 px-4 rounded-xl text-xs transition-all shadow-md shadow-red-900/30 flex items-center justify-center gap-2"
          >
            <span>Iniciar Compra de Divisas</span>
            <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Barra de Controles y Refresco */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h2 className="text-lg font-bold text-white">Detalle de Instrumentos Financieros</h2>
          <p className="text-xs text-slate-400">
            Cuentas sincronizadas con el servicio <code className="text-slate-300 font-mono text-[11px]">/bdvx-consulta-cuenta-v2/v1/cuenta/saldo-v2</code>
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-red-400' : ''}`} />
          <span>{loading ? 'Actualizando...' : 'Actualizar Saldos'}</span>
        </button>
      </div>

      {/* Grid de Cuentas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cuentas.map((cuenta) => {
          const isVes = cuenta.moneda === 'VES';
          const isUsd = cuenta.moneda === 'USD';
          const isVisible = Boolean(showFullAccount[cuenta.numero]);

          return (
            <div
              key={cuenta.numero}
              className={`rounded-2xl border p-5 transition-all relative overflow-hidden ${
                isUsd
                  ? 'bg-slate-900/90 border-emerald-800/40 hover:border-emerald-700/60'
                  : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Badge superior */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                      isUsd
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50'
                        : 'bg-red-950 text-red-400 border border-red-800/50'
                    }`}
                  >
                    {isUsd ? <DollarSign className="w-5 h-5" /> : <CreditCard className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{cuenta.alias || cuenta.tipo}</h3>
                    <span
                      className={`inline-block text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
                        cuenta.estatus === 'ACTIVA'
                          ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/50'
                          : 'bg-rose-950/80 text-rose-400 border border-rose-800/50'
                      }`}
                    >
                      {cuenta.estatus}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-mono">
                    Moneda
                  </span>
                  <span
                    className={`text-xs font-bold ${
                      isUsd ? 'text-emerald-400' : 'text-slate-200'
                    }`}
                  >
                    {cuenta.moneda}
                  </span>
                </div>
              </div>

              {/* Número de Cuenta con Enmascarado y Copiado */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 flex items-center justify-between my-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono tracking-wide text-slate-300">
                    {formatAccountNumber(cuenta.numero, isVisible)}
                  </span>
                  <button
                    onClick={() => toggleShowAccount(cuenta.numero)}
                    className="text-slate-500 hover:text-slate-300 transition-colors p-1"
                    title={isVisible ? 'Ocultar número completo' : 'Mostrar número completo'}
                  >
                    {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <button
                  onClick={() => handleCopy(cuenta.numero)}
                  className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-white transition-colors bg-slate-800/80 hover:bg-slate-700 px-2 py-1 rounded-md"
                  title="Copiar 20 dígitos de la cuenta"
                >
                  {copiedAccount === cuenta.numero ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>

              {/* Saldos */}
              <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-800/80">
                <div>
                  <span className="text-[11px] text-slate-400 block">Saldo Disponible</span>
                  <div
                    className={`text-lg font-bold tracking-tight ${
                      isUsd ? 'text-emerald-400' : 'text-white'
                    }`}
                  >
                    {isUsd ? '$' : 'Bs. '}
                    {cuenta.disponible.toLocaleString(isUsd ? 'en-US' : 'es-VE', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[11px] text-slate-400 block">Saldo Contable</span>
                  <div className="text-sm font-semibold text-slate-300">
                    {isUsd ? '$' : 'Bs. '}
                    {cuenta.saldo.toLocaleString(isUsd ? 'en-US' : 'es-VE', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                </div>
              </div>

              {/* Acciones contextuales */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  {isVes ? 'Débito para compra de divisas' : 'Acreditación inmediata de divisas'}
                </span>

                {isVes && (
                  <button
                    onClick={onGoToPurchase}
                    className="text-xs font-semibold text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
                  >
                    Usar para Compra <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
