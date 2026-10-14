# BDV Digital - Documentación Técnica para Gemini
## Flujo de Compra de Dólares desde el Login hasta la Confirmación

---

## 1. ARQUITECTURA Y CONTEXTO

### 1.1 Fuentes de Información
- **bdv_analysis_loop.py**: Herramienta de análisis estático que extrae metadata del APK
- **REA `inspect-dart-aot`**: Proporciona tokens, strings, patterns del binario Flutter
- **bdv_checkpoint.json**: Estado del loop persistente y tracking de módulos
- **bdv_analisis_progreso.md/json**: Reports generados después de cada módulo de análisis

### 1.2 APK Analizado
- **Archivo**: `split_config.arm64_v8a.apk` (39.9 MB)
- **Framework**: Flutter (identificado por REA)
- **Hash sombra**: `80a49c7111088100` (identificador de snapshot Flutter)
- **Coverage**: complete (libapp 11,207,584 bytes)
- **Architecture**: arm64-v8a

### 1.3 Limitaciones Críticas
⚠️ TODO IMPORTANTE: TODO el análisis es estático sobre el archivo APK binario. No hay:
- Ejecución de la app Hermes en dispositivo/emulador
- Traffic de red capturado en ejecución real
- Interfaces de usuario visuales
- Lógica de negocio en tiempo real
- Tokens o sesiones operativas

---

## 2. AUTENTICACIÓN Y LOGIN

### 2.1 Endpoints Identificados (del APK)
| Endpoint | Hypothesis | Status Verificación |
|----------|------------|---------------------|
| /bdvx-oauth-server/oauth/token | Endpoint token OAuth2 | ✅ Extraído del APK |
| /bdvx-intervencion-cambiaria/v1/intervencion/consultarReglasEXRI | Consultar reglas | ✅ Extraído del APK |

### 2.2 Patterns de Tokens BDV (del string pool)
Tokens que contienen indicadores de autenticación:
- BDVAPPDEMO - Token de demostración BDV
- BDV_NOTICIAS_GENERALES - Noticias generales BDV
- COMPRA, COMPRA_NATURAL, Comprar - Related to purchase
- CUENTA, Consulta, Saldo - Related to account/balance
- Confirmar - Confirmation pattern
- EXRI, MENUDEO - BDV-specific patterns

### 2.3 Auth Flow Documentado (del checkpoint)
auth_flow entries (8 total):
- grant_type=password&username= → OAuth2 password grant
- grant_type=refresh_token&refresh_token= → OAuth2 refresh token
- Authorization: *** → Bearer token authorization
- app-key → App key header (hardcoded en binario)

---

## 3. CONSULTAS Y SECCIONES DE CUENTAS

### 3.1 Endpoints Identificados
| Endpoint | Descripción | Campos Documentados |
|----------|-------------|---------------------|
| /bdvx-consulta-cuenta-v2/v1/cuenta/saldo-v2 | Consultar saldo y datos cuenta | Schema cuentas: numero, tipo, moneda, saldo, disponible, estatus |
| /bdvx-afiliacion-directorio/v1/bancos/all | Directorios bancos disponibles | Schema no extraída completamente |
| /bdvx-geolocalizacion/api/offices/all | Oficinas/terminales | Schema no extraída completamente |

### 3.2 Schemas SQL Documentadas (Caché local SQLite / Drift de la app Flutter)
| Schema | Campos | Observaciones |
|--------|--------|-------------|
| reglas_divisas | 9 campos: codigoRegla PRIMARY KEY, tiporegla, moneda, tasaCompra, tasaVenta, descripcionRegla, montoMinimo, montoMaximo, multiplo | Estructura completa documentada |
| monedas_divisas | 4 campos: codigo PRIMARY KEY, nombre, simbolo, decimales | Monedas disponibles |
| operaciones_cambiarias | 10 campos: id AUTOINCREMENT, codigoOperacion, cuentaOrigen, cuentaDestino, montoDivisa, tasaCambio, codigoRegla, estado, fechaCreacion, fechaConfirmacion | Estructura de operaciones |
| cuentas | 7 campos: id AUTOINCREMENT, numero, tipo, moneda, saldo, disponible, estatus | Estructura de cuentas |

### 3.3 Rules de Cambio (de reglas_divisas)
- `codigoRegla`: Identificador único (ej. `MENUDEO_USD_BCV`, `EXRI_INTERVENCION`)
- `montoMinimo` / `montoMaximo`: Límites permitidos
- `multiplo`: Factoración requerida
- Regla de negocio getReglasByMonedaRetiro: `!= 1000 -> no disponible`

---

## 4. FORMULARIO DE COMPRA

### 4.1 Endpoints Identificados para la Operación
| Endpoint | Descripción | Method |
|----------|-------------|--------|
| /bdvx-operaciones-cambiarias/v1/operaciones/comprar | Ejecutar microcompra / cotizar compra | POST |
| /bdvx-operaciones-cambiarias/v1/operaciones/confirmar | Confirmar operación pendiente | POST |
| /bdvx-operaciones-cambiarias/v1/operaciones/consultar/reglas | Consultar reglas cambiarias | GET / POST |
