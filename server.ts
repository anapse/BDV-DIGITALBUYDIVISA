import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { activeBankingAdapter } from './src/server/bdvAdapter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

// Logging middleware para auditoría de transacciones bancarias
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api')) {
      const duration = Date.now() - start;
      console.log(`[BDV-API] ${req.method} ${req.path} -> ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// Helper de extracción de Bearer token
function getBearerToken(req: express.Request): string {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return 'anonymous_session';
}

// -----------------------------------------------------------------------------
// RUTAS API BANCARIAS
// -----------------------------------------------------------------------------

// 1. Auth Endpoint: /bdvx-oauth-server/oauth/token (documentado en APK)
app.post('/api/auth/token', async (req, res) => {
  try {
    const { username, password } = req.body;
    const session = await activeBankingAdapter.login(username, password);
    res.json({ success: true, data: session });
  } catch (error: any) {
    res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_FAILED',
        message: error.message || 'Error de autenticación con BDV Digital.',
      },
    });
  }
});

// 2. Cuentas: /bdvx-consulta-cuenta-v2/v1/cuenta/saldo-v2
app.get('/api/cuentas', async (req, res) => {
  try {
    const token = getBearerToken(req);
    const cuentas = await activeBankingAdapter.getCuentas(token);
    res.json({ success: true, data: cuentas });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CUENTAS_FETCH_ERROR',
        message: error.message || 'No se pudieron consultar las cuentas.',
      },
    });
  }
});

// 3. Reglas Cambiarias: /bdvx-intervencion-cambiaria/v1/intervencion/consultarReglasEXRI
app.get('/api/reglas', async (req, res) => {
  try {
    const token = getBearerToken(req);
    const reglas = await activeBankingAdapter.getReglas(token);
    res.json({ success: true, data: reglas });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'REGLAS_FETCH_ERROR',
        message: error.message || 'No se pudieron consultar las reglas cambiarias.',
      },
    });
  }
});

// 4. Cotización previa en tiempo real
app.post('/api/operaciones/cotizar', async (req, res) => {
  try {
    const token = getBearerToken(req);
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

    const cotizacion = await activeBankingAdapter.cotizar(token, {
      montoDivisa: parseFloat(montoDivisa),
      codigoRegla,
      cuentaOrigen,
      cuentaDestino,
    });

    res.json({ success: true, data: cotizacion });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: {
        code: 'COTIZACION_ERROR',
        message: error.message || 'Error al cotizar la operación.',
      },
    });
  }
});

// 5. Iniciar compra: /bdvx-operaciones-cambiarias/v1/operaciones/comprar
app.post('/api/operaciones/comprar', async (req, res) => {
  try {
    const token = getBearerToken(req);
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
      codigoRegla,
      cuentaOrigen,
      cuentaDestino,
      idempotencyKey,
    });

    res.json({ success: true, data: resultado });
  } catch (error: any) {
    res.status(422).json({
      success: false,
      error: {
        code: 'COMPRA_INICIAR_RECHAZADA',
        message: error.message || 'No fue posible iniciar la compra cambiaria.',
      },
    });
  }
});

// 6. Confirmar compra: /bdvx-operaciones-cambiarias/v1/operaciones/confirmar
app.post('/api/operaciones/confirmar', async (req, res) => {
  try {
    const token = getBearerToken(req);
    const { codigoOperacion } = req.body;
    const idempotencyKey = (req.headers['x-idempotency-key'] as string) || req.body.idempotencyKey || '';

    if (!codigoOperacion) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CODIGO_OPERACION_REQUERIDO',
          message: 'Se requiere el código de operación para confirmar.',
        },
      });
    }

    const confirmacion = await activeBankingAdapter.confirmarCompra(token, {
      codigoOperacion,
      idempotencyKey,
    });

    res.json({ success: true, data: confirmacion });
  } catch (error: any) {
    res.status(422).json({
      success: false,
      error: {
        code: 'CONFIRMACION_FALLIDA',
        message: error.message || 'La operación no pudo ser confirmada.',
      },
    });
  }
});

// 7. Consultar estado de operación (Previene reintentos a ciegas)
app.get('/api/operaciones/:codigoOperacion/estado', async (req, res) => {
  try {
    const token = getBearerToken(req);
    const { codigoOperacion } = req.params;
    const operacion = await activeBankingAdapter.consultarEstado(token, codigoOperacion);

    if (!operacion) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'OPERACION_NO_ENCONTRADA',
          message: `La referencia [${codigoOperacion}] no fue encontrada en el registro.`,
        },
      });
    }

    res.json({ success: true, data: operacion });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CONSULTA_ESTADO_ERROR',
        message: error.message || 'Error al consultar el estado de la operación.',
      },
    });
  }
});

// 8. Estado y metadatos del adaptador
app.get('/api/adapter/info', (_req, res) => {
  const status = activeBankingAdapter.getAdapterStatus();
  res.json({
    success: true,
    data: {
      ...status,
      timestamp: new Date().toISOString(),
      version: 'BDV-Digital-Web-v2.1',
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
    console.log(`[BDV Digital] Servidor activo en http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[BDV Digital] Error al iniciar servidor:', err);
  process.exit(1);
});
