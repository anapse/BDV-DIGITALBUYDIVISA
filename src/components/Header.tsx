import React from 'react';
import { 
  Building2, 
  ShieldCheck, 
  LogOut, 
  User, 
  Code2, 
  HelpCircle,
  Clock,
  ArrowRightLeft,
  Wallet,
  Search
} from 'lucide-react';
import { BdvUserSession } from '../types/bdv';

interface HeaderProps {
  user: BdvUserSession | null;
  activeTab: 'cuentas' | 'compra' | 'consulta' | 'evidencia';
  setActiveTab: (tab: 'cuentas' | 'compra' | 'consulta' | 'evidencia') => void;
  onLogout: () => void;
  onOpenEvidencia: () => void;
  adapterInfo: any;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  activeTab,
  setActiveTab,
  onLogout,
  onOpenEvidencia,
  adapterInfo,
}) => {
  return (
    <header className="bg-slate-950 border-b border-slate-800 sticky top-0 z-40 backdrop-blur-md bg-opacity-95">
      {/* Top Banner de Seguridad Institucional BDV */}
      <div className="bg-gradient-to-r from-red-700 via-red-800 to-slate-900 text-white text-xs px-4 py-1.5 flex items-center justify-between font-medium">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-red-200" />
          <span>Banco de Venezuela, S.A. Banco Universal | BDV en línea Digital</span>
        </div>
        <div className="flex items-center gap-4 text-slate-200 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Canal Seguro SSL 256-bit
          </span>
          <span className="hidden md:inline">Operaciones Reguladas BCV / SUDEBAN</span>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo y Branding */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-red-800 text-white shadow-lg shadow-red-900/30">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight text-white">BDV</span>
                <span className="text-xl font-light text-red-500">Digital</span>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-red-950/80 text-red-300 border border-red-800/50">
                  Divisas
                </span>
              </div>
              <p className="text-[10px] text-slate-400 -mt-1 hidden sm:block">
                Mesa de Cambio & Menudeo Electrónico
              </p>
            </div>
          </div>

          {/* Nav Tabs */}
          {user && (
            <nav className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={() => setActiveTab('cuentas')}
                className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-2 ${
                  activeTab === 'cuentas'
                    ? 'bg-red-600/20 text-red-400 border border-red-500/40 shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Wallet className="w-4 h-4" />
                <span className="hidden md:inline">Mis Cuentas</span>
              </button>

              <button
                onClick={() => setActiveTab('compra')}
                className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-2 ${
                  activeTab === 'compra'
                    ? 'bg-red-600 text-white shadow-md shadow-red-900/40 font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <ArrowRightLeft className="w-4 h-4" />
                <span>Comprar Divisas</span>
              </button>

              <button
                onClick={() => setActiveTab('consulta')}
                className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-2 ${
                  activeTab === 'consulta'
                    ? 'bg-red-600/20 text-red-400 border border-red-500/40 shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Search className="w-4 h-4" />
                <span className="hidden md:inline">Verificar Estado</span>
              </button>

              <button
                onClick={onOpenEvidencia}
                className="px-3 py-2 rounded-lg text-xs sm:text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 flex items-center gap-1.5 border border-slate-700/60"
                title="Ver evidencia técnica del APK y arquitectura"
              >
                <Code2 className="w-4 h-4 text-emerald-400" />
                <span className="hidden lg:inline">Auditoría Técnica APK</span>
              </button>
            </nav>
          )}

          {/* User Info & Actions */}
          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3 pl-3 border-l border-slate-800">
                <div className="hidden sm:block text-right">
                  <div className="text-xs font-semibold text-slate-200">{user.nombreCompleto}</div>
                  <div className="text-[11px] text-slate-400 font-mono flex items-center justify-end gap-1">
                    <span>{user.documentoIdentidad}</span>
                    <span className="text-emerald-400 font-medium text-[10px]">● Activo</span>
                  </div>
                </div>

                <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 font-bold text-xs shadow-inner">
                  <User className="w-4 h-4 text-red-400" />
                </div>

                <button
                  onClick={onLogout}
                  title="Cerrar Sesión Segura"
                  className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-950/40 rounded-lg transition-colors border border-transparent hover:border-red-900/40"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="text-xs text-slate-400 font-medium flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>Sesión no autenticada</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
