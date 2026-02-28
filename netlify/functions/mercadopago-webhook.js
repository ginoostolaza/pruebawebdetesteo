// ============================================================
// MercadoPago - Webhook Handler
// Processes payment notifications and auto-grants product access
// ============================================================

const { MercadoPagoConfig, Payment } = require('mercadopago');
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json'
  };

  // MercadoPago sends GET for back_urls and POST for notifications
  if (event.httpMethod !== 'POST') {
    return { statusCode: 200, headers, body: JSON.stringify({ received: true }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');

    // Only process payment notifications
    if (body.type !== 'payment' && body.action !== 'payment.created' && body.action !== 'payment.updated') {
      return { statusCode: 200, headers, body: JSON.stringify({ ignored: true }) };
    }

    const paymentId = body.data?.id;
    if (!paymentId) {
      return { statusCode: 200, headers, body: JSON.stringify({ error: 'No payment ID' }) };
    }

    // Fetch payment details from MercadoPago
    const client = new MercadoPagoConfig({
      accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN
    });

    const paymentApi = new Payment(client);
    const payment = await paymentApi.get({ id: paymentId });

    if (!payment) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Payment not found' }) };
    }

    // Extract user and product info from external_reference
    let externalRef;
    try {
      externalRef = JSON.parse(payment.external_reference);
    } catch {
      externalRef = payment.metadata || {};
    }

    const userId = externalRef.user_id || payment.metadata?.user_id;
    const productoId = externalRef.producto_id || payment.metadata?.producto_id;

    if (!userId || !productoId) {
      console.error('Missing user_id or producto_id in payment metadata');
      return { statusCode: 200, headers, body: JSON.stringify({ error: 'Missing metadata' }) };
    }

    // Map MercadoPago status to our status
    const statusMap = {
      approved: 'completado',
      pending: 'pendiente',
      authorized: 'pendiente',
      in_process: 'pendiente',
      in_mediation: 'pendiente',
      rejected: 'rechazado',
      cancelled: 'rechazado',
      refunded: 'rechazado',
      charged_back: 'rechazado'
    };

    const estado = statusMap[payment.status] || 'pendiente';

    // Connect to Supabase with service role key (bypasses RLS)
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Upsert payment record
    const { error: paymentError } = await supabase
      .from('pagos')
      .upsert({
        user_id: userId,
        monto: payment.transaction_amount,
        moneda: payment.currency_id || 'ARS',
        metodo: 'MercadoPago',
        concepto: productoId === 'fase1' ? 'Curso Fase 1 (MercadoPago)' : 'Bot de Trading (MercadoPago)',
        estado,
        producto: productoId,
        provider: 'mercadopago',
        provider_payment_id: String(paymentId),
        provider_status: payment.status,
        metadata: {
          payment_method_id: payment.payment_method_id,
          payment_type_id: payment.payment_type_id,
          payer_email: payment.payer?.email
        }
      }, {
        onConflict: 'provider,provider_payment_id',
        ignoreDuplicates: false
      });

    if (paymentError) {
      // If upsert fails (no unique constraint yet), try insert
      await supabase.from('pagos').insert({
        user_id: userId,
        monto: payment.transaction_amount,
        moneda: payment.currency_id || 'ARS',
        metodo: 'MercadoPago',
        concepto: productoId === 'fase1' ? 'Curso Fase 1 (MercadoPago)' : 'Bot de Trading (MercadoPago)',
        estado,
        producto: productoId,
        provider: 'mercadopago',
        provider_payment_id: String(paymentId),
        provider_status: payment.status
      });
    }

    // Auto-grant access if payment is approved (trigger also handles this)
    if (estado === 'completado') {
      if (productoId === 'fase1') {
        // Get current profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('fase')
          .eq('id', userId)
          .single();

        let newFase = 'fase-1';
        if (profile?.fase === 'fase-2') newFase = 'ambas';
        else if (profile?.fase === 'ambas' || profile?.fase === 'fase-1') newFase = profile.fase;

        await supabase
          .from('profiles')
          .update({ fase: newFase })
          .eq('id', userId);

        // Initialize progress
        const modules = ['preparacion-grafico', 'flexzone', 'relleno-zona', 'glosario', 'consejos'];
        const rows = modules.map(m => ({ user_id: userId, modulo: m, completado: false }));
        await supabase.from('progreso').upsert(rows, { onConflict: 'user_id,modulo', ignoreDuplicates: true });
      }

      if (productoId === 'bot') {
        await supabase
          .from('profiles')
          .update({ bot_activo: true })
          .eq('id', userId);
      }

      // Send welcome notification to user's dashboard
      await supabase.from('notifications').insert({
        user_id: userId,
        titulo: '¡Bienvenido a Binary Edge Academy!',
        mensaje: productoId === 'fase1'
          ? 'Tu acceso está activo. Empezá por el módulo de Preparación del Gráfico en tu dashboard.'
          : 'Tu bot de trading está activo. Descargalo desde la sección Bot en tu dashboard.',
        tipo: 'success'
      });
    }

    console.log(`[MP Webhook] Payment ${paymentId} - Status: ${payment.status} - User: ${userId} - Product: ${productoId}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, status: estado })
    };
  } catch (error) {
    console.error('MercadoPago webhook error:', error);
    return {
      statusCode: 200, // Always return 200 to avoid retries
      headers,
      body: JSON.stringify({ error: 'Internal error' })
    };
  }
};
