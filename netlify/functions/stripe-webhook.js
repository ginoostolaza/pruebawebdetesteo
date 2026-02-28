// ============================================================
// Stripe - Webhook Handler
// Processes payment events and auto-grants product access
// ============================================================

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

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
      console.error('STRIPE_WEBHOOK_SECRET not configured - rejecting webhook');
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
      console.error('Webhook signature verification failed');
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid signature' }) };
    }

    // Only process checkout.session.completed events
    if (stripeEvent.type !== 'checkout.session.completed') {
      return { statusCode: 200, headers, body: JSON.stringify({ received: true, type: stripeEvent.type }) };
    }

    const session = stripeEvent.data.object;
    const userId = session.metadata?.user_id;
    const productoId = session.metadata?.producto_id;

    if (!userId || !productoId) {
      console.error('Missing user_id or producto_id in session metadata');
      return { statusCode: 200, headers, body: JSON.stringify({ error: 'Missing metadata' }) };
    }

    // Connect to Supabase with service role key (bypasses RLS)
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Record the payment
    const { error: paymentError } = await supabase.from('pagos').insert({
      user_id: userId,
      monto: (session.amount_total / 100).toFixed(2),
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

    if (paymentError) {
      console.error('Error inserting payment:', paymentError);
    }

    // Auto-grant access
    if (productoId === 'fase1') {
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

      // Initialize progress modules
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

    console.log(`[Stripe Webhook] Session ${session.id} - User: ${userId} - Product: ${productoId}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    console.error('Stripe webhook error:', error);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ error: 'Internal error' })
    };
  }
};
