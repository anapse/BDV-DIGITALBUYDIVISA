import React, { useState } from 'react';
import { 
  Building2, 
  ShieldCheck, 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  RefreshCw, 
  AlertCircle,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';
import { BdvApiClient } from '../services/apiClient';
import { BdvUserSession } from '../types/bdv';

interface LoginModalProps {
  onLoginSuccess: (session: BdvUserSession) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLoginSuccess }) => {
  // Sin credenciales precargadas en producción
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Por favor ingrese su usuario o documento de identidad registrado.');
      return;
    }
    if (!password.trim()) {
      setError('Por favor ingrese su contraseña bancaria.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const session = await BdvApiClient.login(username.trim(), password);
      onLoginSuccess(session);
    } catch (err: any) {
      setError(err.message || 'Error al autenticar con el servidor de BDV Digital.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Glow de fondo institucional */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-red-600/10 rounded-full blur-3xl pointer-events-none -mr-10 -mt-10" />

        {/* Header institucional */}
        <div className="text-center space-y-2 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-600 to-red-800 text-white mx-auto flex items-center justify-center shadow-lg shadow-red-900/40">
            <Building2 className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              BDV <span className="text-red-500 font-light">Digital</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Banco de Venezuela • Acceso Seguro a Banca en Línea
            </p>
          </div>
        </div>

        {/* Mensaje de error si falla la autenticación */}
        {error && (
          <div className="mb-6 bg-rose-950/40 border border-rose-800/80 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-rose-200">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block mb-0.5">Fallo de Autenticación:</span>
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-red-400" />
              <span>Usuario o Documento de Identidad</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Ej: V-18492301 o usuario BDV"
              required
              autoComplete="username"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-red-400" />
              <span>Contraseña Bancaria</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Introduzca su contraseña"
                required
                autoComplete="current-password"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-4 pr-11 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors"
                title={showPassword ? 'Ocultar' : 'Mostrar'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:opacity-50 text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-lg shadow-red-900/30 flex items-center justify-center gap-2 text-sm"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Autenticando con canal bancario seguro...</span>
              </>
            ) : (
              <>
                <span>Ingresar a BDV Digital</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Garantías de seguridad */}
        <div className="mt-6 pt-5 border-t border-slate-800 text-center space-y-2">
          <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Conexión protegida por cifrado TLS 256-bit</span>
          </div>
          <p className="text-[10px] text-slate-500">
            Sus credenciales no se almacenan en el navegador y son transmitidas de forma directa al servidor OAuth del Banco de Venezuela.
          </p>
        </div>
      </div>
    </div>
  );
};
