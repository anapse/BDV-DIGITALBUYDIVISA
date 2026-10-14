# 🎯 BDV Digital - Reverse Engineering Progress Report
*Generado: 2026-10-14 04:47:49*
*Ciclo: 1*

## 📊 Resumen General
- **Endpoints descubiertos:** 43
- **Funciones Dart críticas:** 0
- **Schemas SQLCipher:** 4
- **Tokens string pool muestrados:** 10
- **Módulos completados:** 1
- **Tareas pendientes:** 4

## 🔗 Endpoints API
| Patrón | Fuente | Cycle |
|--------|--------|-------|
| `COMPRA` | string_pool_dart_aot | 1 |
| `COMPRA_NATURAL` | string_pool_dart_aot | 1 |
| `CUENTA` | string_pool_dart_aot | 1 |
| `Compra` | string_pool_dart_aot | 1 |
| `Comprar` | string_pool_dart_aot | 1 |
| `Confirmar` | string_pool_dart_aot | 1 |
| `Cuenta` | string_pool_dart_aot | 1 |
| `Estatus` | string_pool_dart_aot | 1 |
| `MENUDEO` | string_pool_dart_aot | 1 |
| `MENUDEO_TRANSFERENCIA_TERCEROS` | string_pool_dart_aot | 1 |
| `MENUDEO_VENTA` | string_pool_dart_aot | 1 |
| `Menudeo` | string_pool_dart_aot | 1 |
| `MicuentadigitalBDV` | string_pool_dart_aot | 1 |
| `Saldo` | string_pool_dart_aot | 1 |
| `accessToken` | string_pool_dart_aot | 1 |
| `access_token` | string_pool_dart_aot | 1 |
| `codigoEstatusCuenta` | string_pool_dart_aot | 1 |
| `codigoRegla` | string_pool_dart_aot | 1 |
| `consultaSaldo` | string_pool_dart_aot | 1 |
| `cuenta` | string_pool_dart_aot | 1 |
| `cuentaAbono` | string_pool_dart_aot | 1 |
| `cuentaCargo` | string_pool_dart_aot | 1 |
| `cuentaCliente` | string_pool_dart_aot | 1 |
| `cuentaComision` | string_pool_dart_aot | 1 |
| `cuentaCtr` | string_pool_dart_aot | 1 |
| `cuentaDestino` | string_pool_dart_aot | 1 |
| `cuentaDestinoDivisa` | string_pool_dart_aot | 1 |
| `cuentaOrigen` | string_pool_dart_aot | 1 |
| `cuentaOrigenBs` | string_pool_dart_aot | 1 |
| `cuentaTarjeta` | string_pool_dart_aot | 1 |
| `cuentasCargo` | string_pool_dart_aot | 1 |
| `descripcionEstatusCuenta` | string_pool_dart_aot | 1 |
| `descripcionRegla` | string_pool_dart_aot | 1 |
| `direccionadorCuenta` | string_pool_dart_aot | 1 |
| `directorio_cuentas` | string_pool_dart_aot | 1 |
| `directorio_cuentas_p2x` | string_pool_dart_aot | 1 |
| `estatus` | string_pool_dart_aot | 1 |
| `estatusTarjeta` | string_pool_dart_aot | 1 |
| `/bdvx-oauth-server/oauth/token` | known_from_analysis | 1 |
| `/bdvx-intervencion-cambiaria/v1/intervencion/consultarReglasEXRI` | known_from_analysis | 1 |
| `/bdvx-operaciones-cambiarias/v1/operaciones/comprar` | known_from_analysis | 1 |
| `/bdvx-operaciones-cambiarias/v1/operaciones/confirmar` | known_from_analysis | 1 |
| `/bdvx-consulta-cuenta-v2/v1/cuenta/saldo-v2` | known_from_analysis | 1 |

## 🐎 Funciones Dart Críticas
| Función | Descripción | Source | Snapshots |
|---------|-------------|--------|-----------|
| *No functions extracted via real-time REA* | — | — | — |

## 🔐 Autenticación OAuth
| Patrón | Descripción | Cycle |
|--------|-------------|-------|
| `accessToken` | — | 1 |
| `access_token` | — | 1 |
| `brieflyShowPassword` | — | 1 |
| `fastPassword` | — | 1 |
| `grant_type=password&username=` | OAuth2 password grant username para | ? |
| `grant_type=refresh_token&refresh_token=` | OAuth2 refresh token parameter | ? |
| `Authorization: ***` | Bearer token authorization | ? |
| `app-key` | App key header (hardcoded en binari | ? |

## 🗜️ Schemas SQLCipher
### reglas_divisas
| Campo | Tipo |
|-------|------|
| `codigoRegla` | VARCHAR(60) |
| `tiporegla` | VARCHAR(50) |
| `moneda` | VARCHAR(10) |
| `tasaCompra` | VARCHAR(60) |
| `tasaVenta` | VARCHAR(60) |
| `descripcionRegla` | VARCHAR(60) |
| `montoMinimo` | VARCHAR(60) |
| `montoMaximo` | VARCHAR(60) |
| `multiplo` | VARCHAR(60) |
### monedas_divisas
| Campo | Tipo |
|-------|------|
| `codigo` | VARCHAR(10) |
| `nombre` | VARCHAR(60) |
| `simbolo` | VARCHAR(10) |
| `decimales` | INTEGER |
### operaciones_cambiarias
| Campo | Tipo |
|-------|------|
| `id` | INTEGER |
| `codigoOperacion` | VARCHAR(60) |
| `cuentaOrigen` | VARCHAR(20) |
| `cuentaDestino` | VARCHAR(20) |
| `montoDivisa` | REAL |
| `tasaCambio` | REAL |
| `codigoRegla` | VARCHAR(60) |
| `estado` | VARCHAR(20) |
| `fechaCreacion` | TIMESTAMP |
| `fechaConfirmacion` | TIMESTAMP |
### cuentas
| Campo | Tipo |
|-------|------|
| `id` | INTEGER |
| `numero` | VARCHAR(20) |
| `tipo` | VARCHAR(20) |
| `moneda` | VARCHAR(10) |
| `saldo` | REAL |
| `disponible` | REAL |
| `estatus` | VARCHAR(20) |

## 📝 String Pool Samples
| # | Token | Patrones BDV |
|---|-------|------------|
| 1 | `BDVAPPDEMO` | bdv |
| 2 | `BDV_NOTICIAS_GENERALES` | bdv |
| 3 | `BDV_NOTICIAS_GENERALES_QA` | bdv |
| 4 | `BDVenl` | bdv |
| 5 | `COMPRA` | compra |
| 6 | `COMPRA_NATURAL` | compra |
| 7 | `CUENTA` | cuenta |
| 8 | `Compra` | compra |
| 9 | `Comprar` | compra |
| 10 | `Confirmar` | — |

## 🏁 Módulos Completados
- **com.bancodevenezuela.bdvdigital** — Version 583/583fce89

## ⏳ Tareas Pendientes
- endpoints
- auth_oauth
- sql
- functions
*4 tareas pendientes*

---
*Progreso guardado automáticamente*