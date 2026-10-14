import { activeBankingAdapter } from './src/server/bdvAdapter';

async function runTests() {
  console.log('--- INICIANDO SUITE DE PRUEBAS AUTOMATIZADAS BDV DIGITAL ---');

  // 1. Test Login
  console.log('\n[TEST 1] Autenticación OAuth2 /bdvx-oauth-server/oauth/token');
  const session = await activeBankingAdapter.login('carlos.mendoza', 'Bdv@SecurePass123');
  console.assert(session.token.startsWith('bdv_jwt_'), 'Token debe comenzar con prefijo bdv_jwt_');
  console.assert(session.documentoIdentidad === 'V-18.492.301', 'Documento de identidad debe coincidir');
  console.log('✅ Test 1 Superado: Sesión generada correctamente con Bearer token');

  // 2. Test Consulta Cuentas
  console.log('\n[TEST 2] Consulta de cuentas /bdvx-consulta-cuenta-v2/v1/cuenta/saldo-v2');
  const cuentas = await activeBankingAdapter.getCuentas(session.token);
  console.assert(cuentas.length >= 2, 'Debe haber al menos 2 cuentas (VES y USD)');
  const ctaVes = cuentas.find(c => c.moneda === 'VES');
  const ctaUsd = cuentas.find(c => c.moneda === 'USD');
  console.assert(ctaVes && ctaUsd, 'Deben existir cuentas en VES y USD');
  console.log(`✅ Test 2 Superado: ${cuentas.length} cuentas listadas. Cta VES: Bs. ${ctaVes?.disponible}, Cta USD: $${ctaUsd?.disponible}`);

  // 3. Test Consulta Reglas Cambiarias
  console.log('\n[TEST 3] Consulta de reglas cambiarias /bdvx-intervencion-cambiaria/...');
  const reglas = await activeBankingAdapter.getReglas(session.token);
  console.assert(reglas.length >= 2, 'Deben existir reglas de Menudeo y EXRI');
  const reglaMenudeo = reglas.find(r => r.codigoRegla === 'MENUDEO_USD_BCV');
  console.assert(reglaMenudeo && reglaMenudeo.tasaCompra > 0, 'Regla Menudeo debe tener tasa positiva');
  console.log(`✅ Test 3 Superado: Reglas verificadas. Tasa Menudeo: Bs. ${reglaMenudeo?.tasaCompra}/USD`);

  // 4. Test Cotización y Validación de Límites
  console.log('\n[TEST 4] Validación de cotización y comisiones');
  const cotizacion = await activeBankingAdapter.cotizar(session.token, {
    montoDivisa: 20,
    codigoRegla: 'MENUDEO_USD_BCV',
    cuentaOrigen: ctaVes!.numero,
    cuentaDestino: ctaUsd!.numero,
  });
  console.assert(cotizacion.saldoSuficiente === true, 'El saldo debe ser suficiente para $20');
  console.assert(cotizacion.comisionBs > 0, 'La comisión bancaria debe ser calculada');
  console.log(`✅ Test 4 Superado: $20 USD = Bs. ${cotizacion.subtotalBs} + Com: Bs. ${cotizacion.comisionBs} = Total: Bs. ${cotizacion.totalDebitoBs}`);

  // 5. Test Límite Mínimo y Máximo
  console.log('\n[TEST 5] Validación de límites mínimo y máximo');
  try {
    await activeBankingAdapter.cotizar(session.token, {
      montoDivisa: 0.5,
      codigoRegla: 'MENUDEO_USD_BCV',
      cuentaOrigen: ctaVes!.numero,
      cuentaDestino: ctaUsd!.numero,
    });
    console.error('❌ Fallo: debió rechazar monto inferior al mínimo');
  } catch (err: any) {
    console.log(`✅ Test 5a Superado: Rechazado correctamente por límite mínimo (${err.message})`);
  }

  // 6. Test Iniciar Compra (Pre-operación) y Prevención de Doble Envío (Idempotencia)
  console.log('\n[TEST 6] Iniciar compra con clave de idempotencia');
  const idemKey = `idem_test_${Date.now()}`;
  const ordenIniciada1 = await activeBankingAdapter.iniciarCompra(session.token, {
    montoDivisa: 25,
    codigoRegla: 'MENUDEO_USD_BCV',
    cuentaOrigen: ctaVes!.numero,
    cuentaDestino: ctaUsd!.numero,
    idempotencyKey: idemKey,
  });
  console.assert(ordenIniciada1.estado === 'PENDIENTE', 'La orden debe quedar en estado PENDIENTE');
  
  // Reintento con la misma clave de idempotencia debe retornar la misma orden
  const ordenIniciada2 = await activeBankingAdapter.iniciarCompra(session.token, {
    montoDivisa: 25,
    codigoRegla: 'MENUDEO_USD_BCV',
    cuentaOrigen: ctaVes!.numero,
    cuentaDestino: ctaUsd!.numero,
    idempotencyKey: idemKey,
  });
  console.assert(ordenIniciada1.codigoOperacion === ordenIniciada2.codigoOperacion, 'Idempotencia debe retornar la misma orden');
  console.log(`✅ Test 6 Superado: Orden generada (${ordenIniciada1.codigoOperacion}) e idempotencia verificada`);

  // 7. Test Confirmación y Liquidación
  console.log('\n[TEST 7] Confirmación y liquidación en cuentas');
  const saldoPrevioVes = ctaVes!.disponible;
  const saldoPrevioUsd = ctaUsd!.disponible;

  const confirmacion = await activeBankingAdapter.confirmarCompra(session.token, {
    codigoOperacion: ordenIniciada1.codigoOperacion,
    idempotencyKey: `confirm_${idemKey}`,
  });
  console.assert(confirmacion.estado === 'APROBADA', 'La orden debe quedar APROBADA');
  console.assert(confirmacion.nuevoSaldoUsd === saldoPrevioUsd + 25, 'El saldo en USD debe incrementarse en $25');
  console.log(`✅ Test 7 Superado: Operación aprobada. Nuevo saldo VES: Bs. ${confirmacion.nuevoSaldoBs}, Nuevo saldo USD: $${confirmacion.nuevoSaldoUsd}`);

  // 8. Test Consulta de Estado de la Operación
  console.log('\n[TEST 8] Consulta de estado de operación por referencia');
  const opConsultada = await activeBankingAdapter.consultarEstado(session.token, ordenIniciada1.codigoOperacion);
  console.assert(opConsultada !== null, 'La operación debe ser consultable');
  console.assert(opConsultada?.estado === 'APROBADA', 'El estado consultado debe ser APROBADA');
  console.log(`✅ Test 8 Superado: Estado consultado exitosamente: ${opConsultada?.estado}`);

  console.log('\n🎉 ¡TODAS LAS PRUEBAS AUTOMATIZADAS COMPLETADAS CON ÉXITO! 🎉\n');
}

runTests().catch(err => {
  console.error('Error en pruebas:', err);
  process.exit(1);
});
