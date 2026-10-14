import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { activeBankingAdapter } from './src/server/bdvAdapter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

// Soporte CORS para clientes web externos y GitHub Pages
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Idempotency-Key, app-key');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Sanitizador de logs para seguridad en producción (no registra contraseñas ni tokens completos)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api')) {
      const duration = Date.now() - start;
      const authPresent = Boolean(req.headers.authorization);
      console.log(`[BDV-AUDIT] ${req.method} ${req.path} -> ${res.statusCode} (${duration}ms) [Auth: ${authPresent ? 'SI' : 'NO'}]`);
    }
  });
  next();
});

// Middleware de autenticación estricta: Rechaza cualquier sesión anónima o token inválido
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Acceso no autorizado: Se requiere token de sesión Bearer válido para operar en BDV Digital.',
      },
    });
  }

  const token = authHeader.substring(7).trim();
  if (!token || token.length < 8) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_SESSION_TOKEN',
        message: 'Token de sesión bancaria inválido o expirado.',
      },
    });
  }

  (req as any).authToken = token;
  next();
}

// -----------------------------------------------------------------------------
// RUTAS API BANCARIAS
// -----------------------------------------------------------------------------

// 1. Auth Endpoint: /bdvx-oauth-server/oauth/token
app.post('/api/auth/token', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || typeof username !== 'string' || !username.trim()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PARAMETRO_REQUERIDO',
          message: 'Debe ingresar un usuario o número de documento válido.',
        },
      });
    }

    if (!password || typeof password !== 'string' || !password.trim()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PARAMETRO_REQUERIDO',
          message: 'Debe ingresar su contraseña bancaria.',
        },
      });
    }

    const session = await activeBankingAdapter.login(username.trim(), password);
    res.json({ success: true, data: session });
  } catch (error: any) {
    const isAuthError = error.message?.includes('CREDENCIALES_INVALIDAS') || error.message?.includes('401');
    res.status(isAuthError ? 401 : 502).json({
      success: false,
      error: {
        code: isAuthError ? 'AUTH_FAILED' : 'BANK_GATEWAY_ERROR',
        message: error.message || 'Error de autenticación con BDV Digital.',
      },
    });
  }
});

// 2. Cuentas: /bdvx-consulta-cuenta-v2/v1/cuenta/saldo-v2
app.get('/api/cuentas', requireAuth, async (req, res) => {
  try {
    const token = (req as any).authToken;
    const cuentas = await activeBankingAdapter.getCuentas(token);
    res.json({ success: true, data: cuentas });
  } catch (error: any) {
    const status = error.message?.includes('SESION_EXPIRADA') ? 401 : 500;
    res.status(status).json({
      success: false,
      error: {
        code: 'CUENTAS_FETCH_ERROR',
        message: error.message || 'No se pudieron consultar los saldos de las cuentas en el banco.',
      },
    });
  }
});

// 3. Reglas Cambiarias: /bdvx-intervencion-cambiaria/v1/intervencion/consultarReglasEXRI
app.get('/api/reglas', requireAuth, async (req, res) => {
  try {
    const token = (req as any).authToken;
    const reglas = await activeBankingAdapter.getReglas(token);
    res.json({ success: true, data: reglas });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'REGLAS_FETCH_ERROR',
        message: error.message || 'No se pudieron consultar las tasas oficiales de la mesa de cambio.',
      },
    });
  }
});

// 4. Cotización previa en tiempo real
app.post('/api/operaciones/cotizar', requireAuth, async (req, res) => {
  try {
    const token = (req as any).authToken;
    const { montoDivisa, codigoRegla, cuentaOrigen, cuentaDestino } = req.body;

    if (!montoDivisa || !codigoRegla || !cuentaOrigen || !cuentaDestino) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PARAMETROS_INCOMPLETOS',
          message: 'Debe especificar monto en divisa, regla cambiaria, cuenta origen y destino.',
        },
      });
    }

    const numMonto = parseFloat(montoDivisa);
    if (isNaN(numMonto) || numMonto <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MONTO_INVALIDO',
          message: 'El importe solicitado debe ser un número positivo mayor a 0.',
        },
      });
    }

    const cotizacion = await activeBankingAdapter.cotizar(token, {
      montoDivisa: numMonto,
      codigoRegla: String(codigoRegla).trim(),
      cuentaOrigen: String(cuentaOrigen).trim(),
      cuentaDestino: String(cuentaDestino).trim(),
    });

    res.json({ success: true, data: cotizacion });
  } catch (error: any) {
    res.status(422).json({
      success: false,
      error: {
        code: 'COTIZACION_ERROR',
        message: error.message || 'Error al validar cotización de compra.',
      },
    });
  }
});

// 5. Iniciar compra: /bdvx-operaciones-cambiarias/v1/operaciones/comprar
app.post('/api/operaciones/comprar', requireAuth, async (req, res) => {
  try {
    const token = (req as any).authToken;
    const { montoDivisa, codigoRegla, cuentaOrigen, cuentaDestino } = req.body;
    const idempotencyKey = (req.headers['x-idempotency-key'] as string) || req.body.idempotencyKey || '';

    if (!montoDivisa || !codigoRegla || !cuentaOrigen || !cuentaDestino) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'DATOS_REQUERIDOS_FALTANTES',
          message: 'Faltan campos obligatorios para registrar la orden de compra.',
        },
      });
    }

    const resultado = await activeBankingAdapter.iniciarCompra(token, {
      montoDivisa: parseFloat(montoDivisa),
      codigoRegla: String(codigoRegla).trim(),
      cuentaOrigen: String(cuentaOrigen).trim(),
      cuentaDestino: String(cuentaDestino).trim(),
      idempotencyKey: String(idempotencyKey).trim(),
    });

    res.json({ success: true, data: resultado });
  } catch (error: any) {
    res.status(422).json({
      success: false,
      error: {
        code: 'COMPRA_INICIAR_RECHAZADA',
        message: error.message || 'No fue posible iniciar la compra cambiaria en el banco.',
      },
    });
  }
});

// 6. Confirmar compra: /bdvx-operaciones-cambiarias/v1/operaciones/confirmar
app.post('/api/operaciones/confirmar', requireAuth, async (req, res) => {
  try {
    const token = (req as any).authToken;
    const { codigoOperacion } = req.body;
    const idempotencyKey = (req.headers['x-idempotency-key'] as string) || req.body.idempotencyKey || '';

    if (!codigoOperacion || typeof codigoOperacion !== 'string' || !codigoOperacion.trim()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CODIGO_OPERACION_REQUERIDO',
          message: 'Se requiere el código de referencia bancaria para confirmar la liquidación.',
        },
      });
    }

    const confirmacion = await activeBankingAdapter.confirmarCompra(token, {
      codigoOperacion: codigoOperacion.trim(),
      idempotencyKey: String(idempotencyKey).trim(),
    });

    res.json({ success: true, data: confirmacion });
  } catch (error: any) {
    res.status(422).json({
      success: false,
      error: {
        code: 'CONFIRMACION_FALLIDA',
        message: error.message || 'La operación cambiaria fue rechazada por el banco.',
      },
    });
  }
});

// 7. Consultar estado de operación (Previene reintentos a ciegas)
app.get('/api/operaciones/:codigoOperacion/estado', requireAuth, async (req, res) => {
  try {
    const token = (req as any).authToken;
    const { codigoOperacion } = req.params;
    const operacion = await activeBankingAdapter.consultarEstado(token, codigoOperacion);

    if (!operacion) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'OPERACION_NO_ENCONTRADA',
          message: `La referencia [${codigoOperacion}] no fue encontrada en los registros bancarios.`,
        },
      });
    }

    res.json({ success: true, data: operacion });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CONSULTA_ESTADO_ERROR',
        message: error.message || 'Error al consultar el estatus oficial en el banco.',
      },
    });
  }
});

// 8. Estado y metadatos de integración del adaptador
app.get('/api/adapter/info', (_req, res) => {
  const status = activeBankingAdapter.getAdapterStatus();
  res.json({
    success: true,
    data: {
      ...status,
      timestamp: new Date().toISOString(),
      version: 'BDV-Digital-Web-v2.2-Production',
      environment: process.env.NODE_ENV || 'development',
    },
  });
});

// -----------------------------------------------------------------------------
// VITE DEV SERVER O STATIC SERVING
// -----------------------------------------------------------------------------
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[BDV Digital] Servidor productivo activo en puerto ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[BDV Digital] Error al iniciar servidor:', err);
  process.exit(1);
});
