import React, { useState } from 'react';
import { 
  X, 
  Code2, 
  FileCheck2, 
  AlertCircle, 
  CheckCircle, 
  HelpCircle, 
  Database, 
  ShieldAlert, 
  Server,
  Layers,
  ArrowRight
} from 'lucide-react';

interface TechnicalEvidenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  adapterInfo: any;
}

export const TechnicalEvidenceModal: React.FC<TechnicalEvidenceModalProps> = ({
  isOpen,
  onClose,
  adapterInfo,
}) => {
  const [activeTab, setActiveTab] = useState<'clasificacion' | 'flujo' | 'schemas' | 'fallos'>('clasificacion');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header Modal */}
        <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-950 border border-red-800/80 flex items-center justify-center text-red-400">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Auditoría Técnica BDV Digital</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                  Hermes REA • APK v8a
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Evidencias del archivo split_config.arm64_v8a.apk (Hash: 80a49c7111088100)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Tabs */}
        <div className="bg-slate-950/40 px-6 pt-3 border-b border-slate-800 flex gap-2">
          {[
            { id: 'clasificacion', label: '1. Clasificación Hallazgos' },
            { id: 'flujo', label: '2. Trazabilidad Flujo Compra' },
            { id: 'schemas', label: '3. Schemas SQLite vs Banco' },
            { id: 'fallos', label: '4. Fallo Principal y Solución' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-3 px-3 text-xs font-semibold border-b-2 transition-all ${
                activeTab === tab.id
                  ? 'border-red-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs sm:text-sm text-slate-300">
          {/* TAB 1: CLASIFICACIÓN DE HALLAZGOS (FASE 1) */}
          {activeTab === 'clasificacion' && (
            <div className="space-y-4">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <h4 className="text-sm font-bold text-emerald-400 flex items-center gap-2 mb-2">
                  <CheckCircle className="w-4 h-4" />
                  Confirmados mediante Evidencia en el APK
                </h4>
                <ul className="space-y-1.5 text-xs text-slate-300 list-disc list-inside">
                  <li><strong>Endpoints OAuth y de Negocio:</strong> Extraídos del string pool: <code className="text-slate-200 font-mono">/bdvx-oauth-server/oauth/token</code>, <code className="text-slate-200 font-mono">/bdvx-consulta-cuenta-v2/v1/cuenta/saldo-v2</code>, <code className="text-slate-200 font-mono">/bdvx-operaciones-cambiarias/v1/operaciones/comprar</code> y <code className="text-slate-200 font-mono">/confirmar</code>.</li>
                  <li><strong>Parámetros de Autenticación:</strong> Patrones <code className="text-slate-200 font-mono">grant_type=password&username=</code>, cabecera <code className="text-slate-200 font-mono">app-key</code> y Bearer tokens.</li>
                  <li><strong>Modelos Cambiarios BDV:</strong> Presencia de tokens <code className="text-slate-200 font-mono">MENUDEO</code> y <code className="text-slate-200 font-mono">EXRI</code> (Intervención Cambiaria).</li>
                  <li><strong>Estructura de Base Local:</strong> Tablas SQLite Drift/Floor con columnas exactas (<code className="text-slate-200 font-mono">montoDivisa</code>, <code className="text-slate-200 font-mono">codigoRegla</code>, <code className="text-slate-200 font-mono">tasaCompra</code>, etc.).</li>
                </ul>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <h4 className="text-sm font-bold text-amber-400 flex items-center gap-2 mb-2">
                  <HelpCircle className="w-4 h-4" />
                  Inferidos, Pendientes de Verificación en Ejecución (Runtime)
                </h4>
                <ul className="space-y-1.5 text-xs text-slate-300 list-disc list-inside">
                  <li><strong>Contratos de respuesta JSON exactos:</strong> Estructura completa de payloads de error cuando el saldo es insuficiente o el monto no respeta múltiplos.</li>
                  <li><strong>Valor numérico de múltiplos:</strong> Si Menudeo requiere enteros ($1.00) y EXRI requiere paquetes ($10 o $100).</li>
                  <li><strong>Regla <code className="text-slate-200 font-mono">!= 1000 -&gt; no disponible</code>:</strong> Lógica de exclusión de monedas o canales de retiro identificada en el APK.</li>
                  <li><strong>Horarios y cupos de la mesa de cambio:</strong> Disponibilidad horaria según lineamientos diarios del BCV.</li>
                </ul>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <h4 className="text-sm font-bold text-rose-400 flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4" />
                  Incorrectos o Contradictorios (Advertencia de Diseño)
                </h4>
                <ul className="space-y-1.5 text-xs text-slate-300 list-disc list-inside">
                  <li><strong>Confundir SQLite local con la BD del banco:</strong> Las 4 tablas descritas son una base de datos local SQLite de la app Flutter para caché móvil, NO la base de datos central Oracle/PostgreSQL del Banco de Venezuela.</li>
                  <li><strong>Asumir que las URLs del APK se llaman directamente desde el navegador:</strong> Los endpoints del banco requieren red privada institucional, certificados mTLS, app-keys y violan CORS en clientes web directos.</li>
                  <li><strong>Reintentar operaciones fallidas a ciegas:</strong> Reenviar compras tras un timeout puede duplicar débitos en Bolívares.</li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB 2: TRAZABILIDAD DEL FLUJO (FASE 2) */}
          {activeTab === 'flujo' && (
            <div className="space-y-3">
              <div className="border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800">
                {[
                  { paso: '1. Login', endpoint: '/bdvx-oauth-server/oauth/token', componente: 'LoginModal.tsx', detalle: 'Obtención de Bearer token con grant_type password y app-key.' },
                  { paso: '2. Sesión', endpoint: 'Authorization: Bearer <jwt>', componente: 'BdvApiClient / Header', detalle: 'Persistencia segura en cabeceras de cada petición.' },
                  { paso: '3. Cuentas y Saldos', endpoint: '/bdvx-consulta-cuenta-v2/v1/cuenta/saldo-v2', componente: 'AccountsList.tsx', detalle: 'Consulta de saldos en VES y USD para validar suficiencia previa.' },
                  { paso: '4. Reglas Cambiarias', endpoint: '/consultarReglasEXRI y /operaciones/consultar/reglas', componente: 'CurrencyPurchaseFlow.tsx', detalle: 'Obtención de tasas oficiales BCV, montoMinimo, montoMaximo y multiplos.' },
                  { paso: '5. Selección y Validación', endpoint: 'POST /api/operaciones/cotizar', componente: 'CurrencyPurchaseFlow.tsx', detalle: 'Validación en servidor: saldo en Bs >= (montoDivisa * tasa + comisión).' },
                  { paso: '6. Presentación Pre-Operación', endpoint: 'POST /api/operaciones/comprar', componente: 'CurrencyPurchaseFlow.tsx (Paso 2)', detalle: 'Creación de orden temporal PENDIENTE con codigoOperacion y clave de idempotencia.' },
                  { paso: '7. Confirmación y Débito', endpoint: 'POST /api/operaciones/confirmar', componente: 'CurrencyPurchaseFlow.tsx (Paso 3)', detalle: 'Liquidación con el banco, bloqueo anti-doble clic y débito/crédito.' },
                  { paso: '8. Consulta de Estado Final', endpoint: 'GET /api/operaciones/:id/estado', componente: 'OperationLookup.tsx', detalle: 'Mecanismo autorizado para verificar estatus antes de reintentar operaciones.' },
                ].map((item, idx) => (
                  <div key={idx} className="p-3 bg-slate-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="w-48 font-bold text-white flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-red-950 text-red-400 text-[10px] flex items-center justify-center font-mono">
                        {idx + 1}
                      </span>
                      <span>{item.paso}</span>
                    </div>
                    <div className="font-mono text-[11px] text-emerald-400 bg-slate-900 px-2 py-1 rounded">
                      {item.endpoint}
                    </div>
                    <div className="text-xs text-slate-400 max-w-xs text-right">
                      {item.detalle}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: SCHEMAS SQLITE (FASE 1.6) */}
          {activeTab === 'schemas' && (
            <div className="space-y-4">
              <div className="bg-amber-950/30 border border-amber-800/60 rounded-xl p-3 text-xs text-amber-200">
                <strong>Aclaración Técnica Fundamental:</strong> Las 4 schemas extraídas por REA corresponden a la base de datos local SQLite embebida en la app móvil Flutter (Drift/Floor) para almacenamiento sin conexión, no al core bancario.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                  <h5 className="font-bold text-white text-xs uppercase mb-2 flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-red-400" />
                    Tabla: cuentas
                  </h5>
                  <ul className="text-xs font-mono text-slate-400 space-y-1">
                    <li>id: INTEGER AUTOINCREMENT</li>
                    <li>numero: VARCHAR(20)</li>
                    <li>tipo: VARCHAR(20)</li>
                    <li>moneda: VARCHAR(10) (VES / USD)</li>
                    <li>saldo: DECIMAL(18,2)</li>
                    <li>disponible: DECIMAL(18,2)</li>
                    <li>estatus: VARCHAR(20)</li>
                  </ul>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                  <h5 className="font-bold text-white text-xs uppercase mb-2 flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-emerald-400" />
                    Tabla: reglas_divisas
                  </h5>
                  <ul className="text-xs font-mono text-slate-400 space-y-1">
                    <li>codigoRegla: VARCHAR(60) PRIMARY KEY</li>
                    <li>tiporegla: VARCHAR(50) (MENUDEO, EXRI)</li>
                    <li>moneda: VARCHAR(10)</li>
                    <li>tasaCompra / tasaVenta: DECIMAL</li>
                    <li>descripcionRegla: VARCHAR(60)</li>
                    <li>montoMinimo / montoMaximo: DECIMAL</li>
                    <li>multiplo: DECIMAL</li>
                  </ul>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                  <h5 className="font-bold text-white text-xs uppercase mb-2 flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-blue-400" />
                    Tabla: operaciones_cambiarias
                  </h5>
                  <ul className="text-xs font-mono text-slate-400 space-y-1">
                    <li>id: INTEGER AUTOINCREMENT</li>
                    <li>codigoOperacion: VARCHAR(60)</li>
                    <li>cuentaOrigen / cuentaDestino: VARCHAR</li>
                    <li>montoDivisa / tasaCambio: DECIMAL</li>
                    <li>codigoRegla: VARCHAR(60)</li>
                    <li>estado: PENDIENTE / APROBADA / RECHAZADA</li>
                    <li>fechaCreacion / fechaConfirmacion</li>
                  </ul>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                  <h5 className="font-bold text-white text-xs uppercase mb-2 flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-purple-400" />
                    Tabla: monedas_divisas
                  </h5>
                  <ul className="text-xs font-mono text-slate-400 space-y-1">
                    <li>codigo: VARCHAR PRIMARY KEY (USD, EUR, VES)</li>
                    <li>nombre: VARCHAR</li>
                    <li>simbolo: VARCHAR ($, Bs., €)</li>
                    <li>decimales: INTEGER (2)</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: FALLO PRINCIPAL Y SOLUCIÓN */}
          {activeTab === 'fallos' && (
            <div className="space-y-4">
              <div className="bg-slate-950 border border-red-900/60 rounded-xl p-4">
                <h5 className="font-bold text-red-400 text-sm mb-2">
                  Diagnóstico: ¿Cuál era el fallo principal del flujo?
                </h5>
                <p className="text-xs text-slate-300 leading-relaxed mb-3">
                  <strong>1. Falta de backend intermediario y desacoplado:</strong> El navegador no puede conectarse directamente a las rutas bancarias del APK (<code className="text-slate-200 font-mono">/bdvx-oauth-server</code>, etc.) por restricciones de red privada, mTLS institucional y CORS.
                </p>
                <p className="text-xs text-slate-300 leading-relaxed mb-3">
                  <strong>2. Desconexión del flujo de 2 fases (/comprar y /confirmar):</strong> El APK divide la operación en dos pasos: preparación de la orden (congelación de tasa y cálculo de comisión) y confirmación explícita. Sin este ciclo, no existía código de referencia para verificar débitos.
                </p>
                <p className="text-xs text-slate-300 leading-relaxed">
                  <strong>3. Ausencia de control de idempotencia y prevención de dobles cargos:</strong> Si el usuario hacía doble clic o se presentaba un timeout de red, no había mecanismo de deduplicación ni consulta de estado seguro.
                </p>
              </div>

              <div className="bg-slate-950 border border-emerald-900/60 rounded-xl p-4">
                <h5 className="font-bold text-emerald-400 text-sm mb-2">
                  Correcciones Implementadas en esta Entrega:
                </h5>
                <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside">
                  <li><strong>Arquitectura Backend con Express (<code className="text-slate-200 font-mono">server.ts</code>):</strong> Proxy seguro con validación en servidor de montos, límites min/max, múltiplos y saldo suficiente.</li>
                  <li><strong>Patrón de Adaptador Bancario (<code className="text-slate-200 font-mono">BdvBankingAdapter</code>):</strong> Implementación de Sandbox de alta fidelidad que valida los contratos extraídos del APK, junto con conector Live listo para producción.</li>
                  <li><strong>Control Estricto de Idempotencia (<code className="text-slate-200 font-mono">X-Idempotency-Key</code>):</strong> Clave única generada por intento en cliente y memorizada en el servidor para impedir transacciones duplicadas.</li>
                  <li><strong>Módulo de Consulta de Estado (<code className="text-slate-200 font-mono">/api/operaciones/:id/estado</code>):</strong> Pantalla dedicada para verificar el estado final ante timeouts de red.</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-950 px-6 py-4 border-t border-slate-800 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Adaptador activo: {adapterInfo?.mode || 'SANDBOX'} (Validación Estricta)</span>
          </div>
          <button
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-700 text-white font-medium px-4 py-2 rounded-xl text-xs transition-colors"
          >
            Cerrar Ventana
          </button>
        </div>
      </div>
    </div>
  );
};
