/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { BdvApiClient } from './services/apiClient';
import { BdvAccount, BdvReglaCambiaria, BdvUserSession } from './types/bdv';
import { Header } from './components/Header';
import { AccountsList } from './components/AccountsList';
import { CurrencyPurchaseFlow } from './components/CurrencyPurchaseFlow';
import { OperationLookup } from './components/OperationLookup';
import { TechnicalEvidenceModal } from './components/TechnicalEvidenceModal';
import { LoginModal } from './components/LoginModal';
import { RefreshCw, AlertCircle, ShieldAlert, CheckCircle, Info } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<BdvUserSession | null>(null);
  const [cuentas, setCuentas] = useState<BdvAccount[]>([]);
  const [reglas, setReglas] = useState<BdvReglaCambiaria[]>([]);
  const [adapterInfo, setAdapterInfo] = useState<any>(null);
  
  const [activeTab, setActiveTab] = useState<'cuentas' | 'compra' | 'consulta' | 'evidencia'>('cuentas');
  const [lookupInitialCode, setLookupInitialCode] = useState<string>('');
  const [isEvidenceModalOpen, setIsEvidenceModalOpen] = useState<boolean>(false);

  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);
  const [loadingData, setLoadingData] = useState<boolean>(false);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);

  // 1. Cargar sesión existente si la hubiera
  useEffect(() => {
    const existingUser = BdvApiClient.getCurrentUser();
    if (existingUser) {
      setUser(existingUser);
    }
    setLoadingInitial(false);
  }, []);

  // 2. Cargar datos cuando el usuario esté autenticado
  const fetchData = async () => {
    if (!user) return;
    setLoadingData(true);
    setErrorGlobal(null);

    try {
      const [cuentasRes, reglasRes, infoRes] = await Promise.all([
        BdvApiClient.getCuentas(),
        BdvApiClient.getReglas(),
        BdvApiClient.getAdapterInfo().catch(() => null),
      ]);

      setCuentas(cuentasRes);
      setReglas(reglasRes);
      if (infoRes) setAdapterInfo(infoRes);
    } catch (err: any) {
      setErrorGlobal(err.message || 'Error al conectar con los servicios bancarios.');
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const handleLoginSuccess = (session: BdvUserSession) => {
    setUser(session);
    setActiveTab('cuentas');
  };

  const handleLogout = () => {
    BdvApiClient.clearSession();
    setUser(null);
    setCuentas([]);
    setReglas([]);
  };

  const handleOpenLookupWithCode = (codigoOperacion?: string) => {
    if (codigoOperacion) {
      setLookupInitialCode(codigoOperacion);
    }
    setActiveTab('consulta');
  };

  if (loadingInitial) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="flex items-center gap-3">
          <RefreshCw className="w-5 h-5 animate-spin text-red-500" />
          <span className="text-sm font-medium">Iniciando plataforma BDV Digital...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-red-600 selection:text-white">
      {/* Cabecera Principal */}
      <Header
        user={user}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={handleLogout}
        onOpenEvidencia={() => setIsEvidenceModalOpen(true)}
        adapterInfo={adapterInfo}
      />

      {/* Contenido Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {!user ? (
          <LoginModal onLoginSuccess={handleLoginSuccess} />
        ) : (
          <div className="space-y-6">
            {/* Banner de Estado del Adaptador Bancario */}
            {adapterInfo && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-slate-300">
                    <strong className="text-white">Modo Adaptador:</strong> {adapterInfo.mode === 'SANDBOX' ? 'Sandbox de Alta Fidelidad (Evidencias APK)' : 'Enlace Bancario Live'}
                  </span>
                  <span className="hidden md:inline text-slate-500">|</span>
                  <span className="hidden md:inline text-slate-400 font-mono text-[11px]">
                    4 tablas SQLite y 5 endpoints verificados
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setIsEvidenceModalOpen(true)}
                    className="text-red-400 hover:text-red-300 font-semibold underline underline-offset-2 transition-colors flex items-center gap-1"
                  >
                    <Info className="w-3.5 h-3.5" />
                    <span>Ver Análisis Hermes REA</span>
                  </button>
                </div>
              </div>
            )}

            {/* Error global si lo hubiera */}
            {errorGlobal && (
              <div className="bg-rose-950/40 border border-rose-800/80 rounded-2xl p-4 flex items-start gap-3 text-rose-200 text-xs">
                <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
                <div className="flex-1">
                  <strong className="block mb-0.5">Error en canal bancario:</strong>
                  <span>{errorGlobal}</span>
                </div>
                <button
                  onClick={fetchData}
                  className="px-3 py-1 rounded-lg bg-rose-900/60 hover:bg-rose-800 text-rose-100 font-semibold transition-colors"
                >
                  Reintentar
                </button>
              </div>
            )}

            {/* Vistas según pestaña activa */}
            {activeTab === 'cuentas' && (
              <AccountsList
                cuentas={cuentas}
                loading={loadingData}
                onRefresh={fetchData}
                onGoToPurchase={() => setActiveTab('compra')}
              />
            )}

            {activeTab === 'compra' && (
              <CurrencyPurchaseFlow
                cuentas={cuentas}
                reglas={reglas}
                onOperationCompleted={fetchData}
                onOpenLookup={handleOpenLookupWithCode}
              />
            )}

            {activeTab === 'consulta' && (
              <OperationLookup
                initialCode={lookupInitialCode}
                onGoToPurchase={() => setActiveTab('compra')}
              />
            )}
          </div>
        )}
      </main>

      {/* Footer Institucional */}
      <footer className="border-t border-slate-900 bg-slate-950 text-slate-500 text-xs py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-600"></span>
            <span>Banco de Venezuela, S.A. Banco Universal. RIF G-20009997-6</span>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span>Operaciones autorizadas por el BCV</span>
            <span>Protección de datos SUDEBAN</span>
            <span>Normativa Cambiaria N° 1</span>
          </div>
        </div>
      </footer>

      {/* Modal de Evidencia Técnica */}
      <TechnicalEvidenceModal
        isOpen={isEvidenceModalOpen}
        onClose={() => setIsEvidenceModalOpen(false)}
        adapterInfo={adapterInfo}
      />
    </div>
  );
}
