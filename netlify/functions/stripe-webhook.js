// ============================================================
// Stripe - Webhook Handler
// Processes payment events and auto-grants product access
// Handles both Checkout Sessions and PaymentIntents
// ============================================================

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const { bienvenidaFase1, bienvenidaBot } = require('./email-templates');

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
    console.log('[Stripe] Email sent:', data?.id || data?.error);
  } catch (err) {
    console.error('[Stripe] Email error:', err.message);
  }
}

// Grant product access, send notification + email
async function grantAccess(supabase, { userId, productoId, userEmail, userName }) {
  // Auto-grant access
  if (productoId === 'fase1') {
    const { data: faseProfile } = await supabase
      .from('profiles')
      .select('fase')
      .eq('id', userId)
      .single();

    let newFase = 'fase-1';
    if (faseProfile?.fase === 'fase-2') newFase = 'ambas';
    else if (faseProfile?.fase === 'ambas' || faseProfile?.fase === 'fase-1') newFase = faseProfile.fase;

    await supabase
      .from('profiles')
      .update({ fase: newFase })
      .eq('id', userId);

    // Initialize progress modules
    const modules = ['preparacion-grafico', 'flexzone', 'relleno-zona', 'glosario', 'consejos', 'protocolo-operacion'];
    const rows = modules.map(m => ({ user_id: userId, modulo: m, completado: false }));
    await supabase.from('progreso').upsert(rows, { onConflict: 'user_id,modulo', ignoreDuplicates: true });
  }

  if (productoId === 'bot') {
    await supabase
      .from('profiles')
      .update({ bot_activo: true })
      .eq('id', userId);
  }

  // Send welcome notification (only if not already sent — prevents duplicates on retries)
  const { data: existingNotif } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('titulo', '¡Bienvenido a Orbita Capital!')
    .limit(1);

  if (!existingNotif || existingNotif.length === 0) {
    await supabase.from('notifications').insert({
      user_id: userId,
      titulo: '¡Bienvenido a Orbita Capital!',
      mensaje: productoId === 'fase1'
        ? 'Tu acceso está activo. Empezá por el módulo de Preparación del Gráfico en tu dashboard.'
        : 'Tu bot de trading está activo. Descargalo desde la sección Bot en tu dashboard.',
      tipo: 'success'
    });

    // Get user name for email (only send with first notification)
    const { data: nameProfile } = await supabase
      .from('profiles')
      .select('nombre')
      .eq('id', userId)
      .single();

    const nombre = nameProfile?.nombre || userName || 'trader';

    if (productoId === 'fase1') {
      await sendEmail(userEmail, '¡Bienvenido a Orbita Capital! Tu acceso está activo', bienvenidaFase1({ nombre }));
    } else if (productoId === 'bot') {
      await sendEmail(userEmail, '¡Tu bot de trading está listo! — Orbita Capital', bienvenidaBot({ nombre }));
    }
  }
}

// Save payment record with upsert (handles webhook retries)
async function recordPayment(supabase, record) {
  const { error: upsertError } = await supabase
    .from('pagos')
    .upsert(record, {
      onConflict: 'provider,provider_payment_id',
      ignoreDuplicates: false
    });

  if (upsertError) {
    // Fallback to insert if upsert fails (no unique constraint yet)
    const { error: insertError } = await supabase.from('pagos').insert(record);
    if (insertError) console.error('[Stripe] Error recording payment:', insertError);
  }
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 200, headers, body: JSON.stringify({ received: true }) };
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    // Verify webhook signature (required for security)
    const sig = event.headers['stripe-signature'];

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      console.error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured — rejecting');
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Webhook secret not configured' }) };
    }

    if (!sig) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing signature' }) };
    }

    let stripeEvent;
    try {
      stripeEvent = stripe.webhooks.constructEvent(
        event.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('[Stripe Webhook] Signature verification failed');
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid signature' }) };
    }

    // Connect to Supabase with service role key (bypasses RLS)
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // ── Handle checkout.session.completed ──
    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object;
      const userId = session.metadata?.user_id;
      const productoId = session.metadata?.producto_id;

      if (!userId || !productoId) {
        console.error('[Stripe Webhook] Missing metadata in checkout session');
        return { statusCode: 200, headers, body: JSON.stringify({ error: 'Missing metadata' }) };
      }

      await recordPayment(supabase, {
        user_id: userId,
        monto: Number((session.amount_total / 100).toFixed(2)),
        moneda: (session.currency || 'usd').toUpperCase(),
        metodo: 'Stripe',
        concepto: productoId === 'fase1' ? 'Curso Fase 1 (Stripe)' : 'Bot de Trading (Stripe)',
        estado: 'completado',
        producto: productoId,
        provider: 'stripe',
        provider_payment_id: session.id,
        provider_status: session.payment_status,
        metadata: {
          customer_email: session.customer_email,
          payment_intent: session.payment_intent
        }
      });

      const userEmail = session.customer_email;
      const userName = session.customer_details?.name || userEmail?.split('@')[0];
      await grantAccess(supabase, { userId, productoId, userEmail, userName });

      console.log(`[Stripe Webhook] checkout.session.completed — Session: ${session.id} — User: ${userId} — Product: ${productoId}`);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // ── Handle payment_intent.succeeded (PaymentIntent / Payment Element flow) ──
    if (stripeEvent.type === 'payment_intent.succeeded') {
      const paymentIntent = stripeEvent.data.object;
      const userId = paymentIntent.metadata?.user_id;
      const productoId = paymentIntent.metadata?.producto_id;
      const userEmail = paymentIntent.metadata?.user_email || paymentIntent.receipt_email;

      if (!userId || !productoId) {
        console.error('[Stripe Webhook] Missing metadata in payment_intent');
        return { statusCode: 200, headers, body: JSON.stringify({ error: 'Missing metadata' }) };
      }

      await recordPayment(supabase, {
        user_id: userId,
        monto: Number((paymentIntent.amount / 100).toFixed(2)),
        moneda: (paymentIntent.currency || 'usd').toUpperCase(),
        metodo: 'Stripe',
        concepto: productoId === 'fase1' ? 'Curso Fase 1 (Stripe)' : 'Bot de Trading (Stripe)',
        estado: 'completado',
        producto: productoId,
        provider: 'stripe',
        provider_payment_id: paymentIntent.id,
        provider_status: paymentIntent.status,
        metadata: {
          receipt_email: paymentIntent.receipt_email,
          payment_method: paymentIntent.payment_method
        }
      });

      const userName = paymentIntent.metadata?.user_nombre || userEmail?.split('@')[0];
      await grantAccess(supabase, { userId, productoId, userEmail, userName });

      console.log(`[Stripe Webhook] payment_intent.succeeded — PI: ${paymentIntent.id} — User: ${userId} — Product: ${productoId}`);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // Other event types — acknowledge but don't process
    return { statusCode: 200, headers, body: JSON.stringify({ received: true, type: stripeEvent.type }) };
  } catch (error) {
    console.error('[Stripe Webhook] Error:', error);
    return {
      statusCode: 200, // Always return 200 to avoid infinite retries
      headers,
      body: JSON.stringify({ error: 'Internal error' })
    };
  }
};
