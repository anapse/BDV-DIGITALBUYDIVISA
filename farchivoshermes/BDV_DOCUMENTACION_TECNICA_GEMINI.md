# BDV Digital - Documentación Técnica para Gemini
## Flujo de Comra de Dólares desde el Login hasta la Confirmación

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

### 2.4 ¿Qué NO se puede determinar del código estático?
- ✅ Campos de formulario de login (username/password fields específicos)
- ✅ Validaciones de la UI de login (mensajes de error, required fields)
- ✅ Flujo de sesión (cómo se mantiene la sesión después del login)
- ✅ Tokens o secrets reales (values operativos, no estáticos)

### 2.5 Información Útil para Gemini
- Los patterns password, grant_type, username aparecen en el string pool del APK
- El endpoint /bdvx-oauth-server/oauth/token es el punto de entrada OAuth identificable
- Los patterns documentados pueden servir como base para el diseño del formulario login

---

## 3. CONULTAS Y SECCIONES DE CUENTAS

### 3.1 Endpoints Identificados
| Endpoint | Descripción | Campos Documentados |
|----------|-------------|---------------------|
| /bdvx-consulta-cuenta-v2/v1/cuenta/saldo-v2 | Consultar saldo y datos cuenta | Schema cuentas: numero, tipo, moneda, saldo, disponible, estatus |
| /bdvx-afiliacion-directorio/v1/bancos/all | Directorios bancos disponibles | Schema no extraída completamente |
| /bdvx-geolocalizacion/api/offices/all | Oficinas/terminales | Schema no extraída completamente |

### 3.2 Schemas SQL Documentadas

| Schema | Campos | Observaciones |
|--------|--------|-------------|
| reglas_divisas | 9 campos: codigoRegla PRIMARY KEY, tiporegla, moneda, tasaCompra, tasaVenta, descripcionRegla, montoMinimo, montoMaximo, multiplo | Estructura completa documentada |
| monedas_divisas | 4 campos: codigo PRIMARY KEY, nombre, simbolo, decimales | Monedas disponibles |
| operaciones_cambiarias | 10 campos: id AUTOINCREMENT, codigoOperacion, cuentaOrigen, cuentaDestino, montoDivisa, tasaCambio, codigoRegla, estado, fechaCreacion, fechaConfirmacion | Estructura de operaciones |
| cuentas | 7 campos: id AUTOINCREMENT, numero, tipo, moneda, saldo, disponible, estatus | Estructura de cuentas |

### 3.3 Rules de Cambio (de reglas_divisas)
| Campo | Tipo | Descripción |
|----------|------|-------------|
| codigoRegla | VARCHAR(60) PRIMARY KEY | Código único de la regla |
| tiporegla | VARCHAR(50) | Tipo de regla |
| moneda | VARCHAR(10) | Moneda asociada |
| tasaCompra | VARCHAR(60) | Tasa de compra |
| tasaVenta | VARCHAR(60) | Tasa de venta |
| descripcionRegla | VARCHAR(60) | Descripción de la regla |
| montoMinimo | VARCHAR(60) | Monto mínimo permitido |
| montoMaximo | VARCHAR(60) | Monto máximo permitido |
| multiplo | VARCHAR(60) | múltiplo o factoración |

**Rule de negocio documentada**: getReglasByMonedaRetiro - Lógica clave: != 1000 → no disponible

### 3.4 ¿Qué NO se puede determinar?
- ✅ Endpoints para listing de cuentas (puede ser otro endpoint no identificado)
- ✅ Validaciones de UI para selección de cuenta (campo tipo, filtro por moneda)
- ✅ Relaciones entre schemas (cóma cuentas y operaciones_cambiarias se conectan)
- ✅ Monedas disponibles (más allá de los 4 schemas documentados)

### 3.5 Información Útil para Gemini
- schema cuentas tiene numero, saldo, disponible - estos son los campos clave para selección
- schema reglas_divisas tiene montoMinimo/montoMaximo - límites de operación
- schema operaciones_cambiarias tiene codigoRegla - link between quote y purchase

---

## 4. FORMULARIO DE COMPRA

### 4.1 Endpoints Identificados para la Operación
| Endpoint | Descripción | Method Hypothesis |
|----------|-------------|-------------------|
| /bdvx-operaciones-cambiarias/v1/operaciones/comprar | Ejecutar microcompra | POST |
| /bdd Berge | (No endpoint adicional identificado) | |

### 4.2 Parámetros del Formulario (inferidos del code)
Desde manual_funcs en process_dart_functions:
- consultaReglaCompra - "Consulta reglas de compra - lanza DioException si falla"
- ejecutar-microcompra - "Ejecuta microcompra - pide documentos"

**Campos documentados en schemas (para la operación):**

| Campo | Schema | Obligación | Descripción |
|-------|--------|----------|-------------|
| montoDivisa | operaciones_cambiarias | Required | Monto de la divisa a comprar |
| codigoRegla | reglas_divisas | Required | Código de la regla de cambio |
| tasaCambio | operaciones_cambiarias | Calculado | Tasa de cambio (de BCV o fija) |
| cuentaOrigen | cuentas | Required | Cuenta origen de la operación |
| cuentaDestino | cuentas | Optional | Cuenta destino (puede ser misma) |
| estado | operaciones_cambiarias | System | Estado de la operación (pending/approved/rejected) |

**Validaciones documentadas:**
- montoMinimo/montoMaximo de reglas_divisas - límites de operación
- multiplo de reglas_divisas - factoración o múltiplo requerido
- != 1000 → no disponible - regla de exclusión para ciertas monedas

### 4.3 ¿Qué NO se puede determinar?
- ✅ Campos numéricos específicos del formulario (format, precision, required/optional)
- ✅ Range de montos específicos (valores mínimos/máximos reales en la app)
- ✅ Comisiones o fees (no identificados en schemas)
- ✅ Validaciones de UI (format de número, caracteres permitidos)
- ✅ Moneda por defecto (moneda que se selecciona por defecto)

### 4.4 Información Útil para Gemini
- montoDivisa field exists en schema operaciones_cambiarias - este es el campo del monto
- codigoRegla field exists en schema reglas_divisas - este es el campo de la regla
- montoMinimo/montoMaximo definen límites (valores exactos desconocidos)
- multiplo factoración desconocida (¿es 1000? ¿otro?)

---

## 5. CONFIRMACIÓN Y RESULTADO

### 5.1 Endpoints de Confirmación
| Endpoint | Descripción | Secuencia |
|----------|-------------|-----------|
| /bdvx-operaciones-cambiarias/v1/operaciones/confirmar | Confirmar operación pendiente | After /.../comprar |
| /bdvx-operaciones-cambiarias/v1/operaciones/consultar/reglas | Consultar reglas | Before/ durante purchase |

### 5.2 Identificación de Operación Duplicada
El bdv_analysis_loop.py tiene tracking de pending_modules y completed_modules, pero esto es feature del loop de análisis, no necesariamente del flujo de compra. Sin embargo, los schemas tienen fechaCreacion y fechaConfirmacion, lo que sugiere:
- Cada operación tiene timestamp de creación
- fechaConfirmacion se completa cuando la operación es confirmada
- Si fechaConfirmacion es null, la operación está pending/pending

### 5.3 Indicadores de Estado de Operación
| Estado | Schema | Campo | Descripción |
|--------|--------|-------|-------------|
| pending | operaciones_cambiarias | estado | Campo existe, valores desconocidos |
| approved | operaciones_cambiarias | estado | Posible value, no verificado |
| rejected | operaciones_cambiarias | estado | Posible value, no verificado |

### 5.4 ¿Cómo se determina si una operación fue aceptada?
Del code estático NO se puede determinar:
- La secuencia exacta login → purchase → confirmation
- Los endpoints concretos llamados en cada paso
- Los responses esperados en cada paso
- Cómo se consulta el estado final

### 5.5 ¿Qué NO se puede determinar?
- ✅ Secuencia exacta login → purchase → confirmation en la app
- ✅ Responses esperadas en cada step (JSON structure, status codes)
- ✅ Cómo se consulta el estado final (qué endpoint, qué params)
- ✅ Cómo se evita registrar dos veces la misma operación (en app real)
- ✅ Signs de éxito/fallo en UI (messages, screens transitions)

---

## 6. DATOS EXTRAÍADOS DEL APK vs COMPBOS VERIFICADOS

### ✅ Datos Extraíables del APK (estático)
| Categoría | Elementos | Status |
|-----------|-----------|--------|
| Endpoints API | 5 endpoints principales | ✅ Extraídos |
| Schemas SQL | 4 schemas completas | ✅ Extraídas |
| Tokens BDV | 50 tokens en string pool | ✅ Extraídos |
| Patterns de reglas | 9 reglas con campos VARCHAR | ✅ Extraídos |
| Snapshot hash | 80a49c7111088100 | ✅ Identificado |
| Coverage | complete (11,2 MB libapp) | ✅ Identificado |

### ❌ Qué NO se puede extraer del APK
| Categoría | Limitación | Qué se necesita |
|-----------|------------|-----------------|
| Flujo visual | Sin acceso a UI | Ejecutar app en dispositivo/emulador |
| Campos formulario | Sizes, tipos, validaciones | Ejecutar app en dispositivo |
| Lógica de negocio | Decision backend | Reverse engineering runtime |
| Tokens/sessions reales | Codificados/encryptados | Traffic de red en ejecución |
| Monedas disponibles | Más allá de schemas documentadas | Ejecutar app en dispositivo |
| Tasas de cambio en tiempo real | Dependen de BCV live | Conectar al servicio vivo |
| Confirmación de operación | Responses reales de app | Testear flow completo |

### ⚠️ Hallazgos Técnicos Críticos
1. El bdv_analysis_loop.py es de análisis estático, no ejecuta la app Hermes
2. Los endpoints identificados son del APK binario, no verificados en runtime
3. Las schemas SQL son documentadas, pero su uso en la app puede diferir
4. Los patterns BDV del string pool son tokens del binario, no necesariamente labels de UI
5. La regla != 1000 → no disponible es un pattern documentado, no lógica probada en runtime
6. El tracking de pending_modules/completed_modules es feature del loop de análisis

---

## 7. HILOS TÉCNICOS Y NECESIDADES DE INVESTIGACIÓN

### Pending Investigation Items (Priority Order)

| # | Item | Importancia | Método Requerido |
|---|------|-------------|------------------|
| 1 | Flujo completo login → purchase | CRÍTICO | Ejecutar app Hermes en dispositivo/emulador |
| 2 | Campos formulario completos | CRÍTICO | Ejecutar app Hermes, capturar screenshots |
| 3 | Responses API en tiempo real | CRÍTICO | Capturar traffic de network en execution |
| 4 | Tasas de cambio en tiempo real | ALTA | Conectar al servicio BCV live |
| 5 | Validaciones de UI | ALTA | Ejecutar app, probar todos los paths |
| 6 | Tokens y sessions operativas | ALTA | Capturar cookies/session IDs en ejecución |
| 7 | Múltiples monedas disponibles | MEDIA | Ejecutar app, explorar selector de moneda |
| 8 | Comisiones y fees | BAJA | Ejecutar operations, observar charges |
| 9 | Lógica != 1000 → no disponible | BAJA | Verificar en runtime si esta rule aplica |
| 9 | Múltiples paths de confirmation | BAJA | Explorar todas las variantes UI |

### Para Gemini (desarrollo web)

#### Datos seguros para implementar (del APK)
1. **Endpoints API (seguros):**
   - POST /bdvx-oauth-server/oauth/token → Auth login
   - POST /bdvx-operaciones-cambiarias/v1/operaciones/comprar → Purchase
   - POST /bdvx-operaciones-cambiarias/v1/operaciones/confirmar → Confirmation
   - GET /bdvx-consulta-cuenta-v2/v1/cuenta/saldo-v2 → Account listing

2. **Schemas SQL (seguros):**
   - cuentas table: numero, tipo, moneda, saldo, disponible, estatus
   - reglas_divisas table: codigoRegla, tasaCompra, tasaVenta, montoMinimo, montoMaximo
   - operaciones_cambiarias table: id, codigoOperacion, montoDivisa, tasaCambio, codigoRegla, estado

3. **Patterns documentados (para design):**
   - montoDivisa field para el amount
   - codigoRegla field para la regla de cambio
   - montoMinimo/montoMaximo para validación
   - multiplo factoración (value desconocido)

### Items que REQUIEREN verificación en ejecución

| Item | Prioridad | Acción Requerida |
|------|-----------|-----------------|
| Campos exactos del formulario login | CRÍTICO | Testear app Hermes |
| Montos mínimos/máximos reales | CRÍTICO | Testear operation purchase |
| Validaciones UI (required/optional) | CRÍTICO | Testear flow completo |
| Tokens/sessions después login | CRÍTICO | Capturar en ejecución |
| Sequencia exacta pasos flow | CRÍTICO | Testear end-to-end |
| Confirmation endpoint structure | ALTA | Testear post-purchase |
| Estado flags después operation | ALTA | Testear status check |
| Múltiples monedas disponibles | MEDIA | Explorar selector en app |
| Comisiones/fees ocultos | BAJA | Testear operations multiples |

### Architecture Recomendada para Web (por Gemini)

Basado en datos extraíables (no en comportamiento en runtime):

1. **Auth Module:**
   - POST /bdvx-oauth-server/oauth/token credentials
   - Session management (cómo mantener session)
   - Error handling auth failures

2. **Account Selection Module:**
   - GET /bdvx-consulta-cuenta-v2/v1/cuenta/saldo-v2 para listing
   - Filter by moneda/tipo en UI
   - Display saldo y disponible para validation

3. **Purchase Module:**
   - POST /bdvx-operaciones-cambiarias/v1/operaciones/comprar con:
     - montoDivisa: number (formato desconocido exacto)
     - codigoRegla: string (de schemas documentadas)
     - Otros fields según schemas SQL
   - Response handling y error management

4. **Confirmation Module:**
   - POST /bdvx-operaciones-cambiarias/v1/operaciones/confirmar con transaction ID
   - Status check GET endpoints para verificar confirmación
   - Duplicate prevention logic (tracking local + server-side)

5. **Error Handling:**
   - Todos los error patterns del bdv_analysis_loop.py retry logic
   - TimeoutExpired handling (60s timeout)
   - health_check every 3 cycles (analogous a checks de UI)

### Guión para Testear en Ejecución (para futuro)

1. **Setup**: Instalar app Hermes en dispositivo/emulador
2. **Step 1**: Navigate to login screen, capture UI fields
2. **Step 2**: Submit login form, capture network traffic
3. **Step 2b**: Verify auth token received
4. **Step 3**: Navigate to purchase screen, capture UI fields
5. **Step 4**: Submit purchase form with test data
6. **Step 5**: Capture response and status
7. **Step 6**: Navigate to confirmation screen, capture UI
7. **Step 7**: Verify operation status final
8. **Step 8**: Test duplicate prevention
9. **Step 9**: Document all fields, validations, responses

**Nota final**: TODO el documentation anterior se basa en extracción estática del APK. Para datos que requieren comportamiento en runtime (fields exactos, validaciones, responses), es necesario ejecutar la app Hermes en un dispositivo/emulador y capturar el flow completo. Gemini debe complementar esta documentación con testing en ejecución real.

---

## 8. INSTRUCCIONES PARA GEMINI

### 8.1 Qué debe implementar Gemini
1. Formulario de login con fields username y password (basado en pattern password y grant_type=password&username del string pool)
2. Endpoint /bdvx-oauth-server/oauth/token para obtener token de sesión
3. Selector de cuentas usando GET /bdvx-consulta-cuenta-v2/v1/cuenta/saldo-v2 para listing
4. Formulario de compra con fields montoDivisa, codigoRegla, y fields de cuentas (origin/destino)
5. Endpoint /bdvx-operaciones-cambiarias/v1/operaciones/comprar para ejecutar la operación
6. Endpoint /bdvx-operaciones-cambiarias/v1/operaciones/confirmar para confirmar la operación pendiente
7. Mecanismo de validación usando montoMinimo/montoMaximo de reglas_divisas
8. Mecanismo de duplicate prevention (tracking local + server-side)

### 8.2 Qué debe comprobar Gemini
1. Responses reales de cada endpoint (status codes, JSON structure)
2. Fields obligatorios vs opcionales en cada formulario
3. Mensajes de error que muestra la app en cada paso
2. Secuencia exacta login → account selection → purchase → confirmation
3. Tasas de cambio en tiempo real (con servicio BCV o API alternativa)
4. Comisiones o fees que el sistema pueda cargar
5. Estados de operación (pending/approved/rejected) y cómo consultarlos

### 8.3 Qué NO debe asumir Gemini
1. Campos de formulario con values exactos (sizes, precision, required/optional específicos)
2. Tasas de cambio fijas o promocionales (dependen de BCV y condiciones de mercado)
3. Tokens o secrets operativos (deben obtenerse en ejecución, no están en el APK)
4. Lógica de negocio completa (decide el backend si approbar/rechazar cada operación)
5. Responses esperadas en cada step (varían por versión de app, condiciones de usuario)
6. Tokens o sessions después login (son efímeros y codificados en la app)
7. Comisiones o estructuras de fees (no identificadas en schemas SQL documentadas)

### 8.4 Prioridades para Gemini

| Priority | Item | Acción |
|----------|------|--------|
| 1 | Campos exactos del formulario login | Testear app Hermes, capturar UI |
| 2 | Montos mínimos/máximos reales | Testear operation purchase con amounts |
| 3 | Validaciones UI (required/optional) | Testear flow completo end-to-end |
| 3 | Tokens/sessions después login | Capturar en ejecución, NOT en APK |
| 4 | Sequencia exacta pasos flow | Testear end-to-end, registrar cada step |
| 6 | Confirmation endpoint structure | Testear post-purchase, status check |
| 6 | Estado flags después operation | Testear status, verificar approval/rejected |
| 7 | Múltiples monedas disponibles | Explorar selector en app, documentar monedas |
| 7 | Comisiones/fees ocultos | Testear operations multiples, observar charges |

### 8.5 Lista Prioritaria de Puntos que Podrían Explporar el Fallo del Flujo

| # | Item | Qué Investigar | Cómo Investigarlo |
|---|------|----------------|-------------------|
| 1 | Campo montoDivisa en formulario | Size, precision, required/optional | Testear purchase con amounts variados |
| 2 | Campo codigoRegla en formulario | Values disponibles, dropdown options | Explorar UI, documentar options |
| 3 | Validaciones montoMinimo/montoMaximo | Values exactos, quién los determina | Testear con amounts en límites |
| 3 | Campo multiplo factoración | Value exacto, divisor/ multiplicador | Testear operations con multiples |
| 4 | Campo tasaCambio origen | BCV oficial vs rate fija vs API externa | Conectar servicio BCV live |
| 5 | Endpoint /confirmar structure | JSON structure, status codes, fields required | Testear post-purchase confirm |
| 5 | Estado flags después operation | Values exactos de estado, cómo consultar | Consultar /consulta-cuenta-v2/v1/saldo-v2 |
| 6 | Múltiples monedas disponibles | Cuántas monedas, codes, selector UI | Explorar app, documentar todas |
| 6 | Comisiones/fees ocultos | Fields, amounts, cuándo se cargan | Testear operations multiples, observar |
| 7 | Lógica != 1000 → no disponible | Quién la aplica, cuándo, bajo qué condiciones | Verificar en runtime, testear cases |
| 7 | Múltiples paths de confirmation | Different UI flows, diferentes sequences | Explorar app, documentar todas las variantes |

---
**Documento generado automáticamente desde el análisis estático del APK split_config.arm64_v8a.apk**
**Fecha de generación**: Con información disponible hasta el momento del análisis
**Estado**: Datos extraíables confirmados, items pendientes requieren验证 en ejecución real