// ============================================================
// MercadoPago - Webhook Handler
// Processes payment notifications and auto-grants product access
// ============================================================

const { MercadoPagoConfig, Payment } = require('mercadopago');
const { createClient } = require('@supabase/supabase-js');
const { bienvenidaFase1, bienvenidaBot } = require('./email-templates');
const crypto = require('crypto');

// Verify MercadoPago webhook signature
// https://www.mercadopago.com.ar/developers/en/docs/your-integrations/notifications/webhooks
function verifyMercadoPagoSignature(event, paymentId) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return false;

  const xSignature = event.headers['x-signature'];
  const xRequestId = event.headers['x-request-id'];
  if (!xSignature || !xRequestId) return false;

  // Parse "ts=<timestamp>,v1=<hash>" from header
  const parts = {};
  xSignature.split(',').forEach(part => {
    const idx = part.indexOf('=');
    if (idx > 0) parts[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  });
  const { ts, v1 } = parts;
  if (!ts || !v1) return false;

  // Build manifest and compute HMAC-SHA256
  const manifest = `id:${paymentId};request-id:${xRequestId};ts:${ts};`;
  const computed = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  // Constant-time comparison to prevent timing attacks
  try {
    const a = Buffer.from(computed, 'hex');
    const b = Buffer.from(v1, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM || 'Orbita Capital <onboarding@resend.dev>';

async function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY || !to) return;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html })
    });
    const data = await res.json();
    console.log('[MP] Email sent:', data?.id || data?.error);
  } catch (err) {
    console.error('[MP] Email error:', err.message);
  }
}

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

    // Verify webhook signature — reject unauthenticated requests
    if (!process.env.MP_WEBHOOK_SECRET) {
      console.error('[MP Webhook] MP_WEBHOOK_SECRET not configured — rejecting webhook');
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Webhook secret not configured' }) };
    }
    if (!verifyMercadoPagoSignature(event, paymentId)) {
      console.error('[MP Webhook] Invalid signature for payment', paymentId);
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid signature' }) };
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
        titulo: '¡Bienvenido a Orbita Capital!',
        mensaje: productoId === 'fase1'
          ? 'Tu acceso está activo. Empezá por el módulo de Preparación del Gráfico en tu dashboard.'
          : 'Tu bot de trading está activo. Descargalo desde la sección Bot en tu dashboard.',
        tipo: 'success'
      });

      // Send welcome email via Resend
      const { data: profile } = await supabase
        .from('profiles')
        .select('nombre')
        .eq('id', userId)
        .single();

      const nombre = profile?.nombre || payment.payer?.first_name || payment.payer?.email?.split('@')[0] || 'trader';
      const userEmail = payment.payer?.email;

      if (productoId === 'fase1') {
        await sendEmail(userEmail, '¡Bienvenido a Orbita Capital! Tu acceso está activo', bienvenidaFase1({ nombre }));
      } else if (productoId === 'bot') {
        await sendEmail(userEmail, '¡Tu bot de trading está listo! — Orbita Capital', bienvenidaBot({ nombre }));
      }
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
