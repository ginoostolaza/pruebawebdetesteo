// ============================================================
// Stripe - Create PaymentIntent for Embedded Checkout
// Returns clientSecret for Stripe Payment Element
// ============================================================

const Stripe = require('stripe');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { producto_id, user_id, user_email, user_nombre } = JSON.parse(event.body);

    if (!producto_id || !user_id || !user_email) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Faltan datos requeridos' }) };
    }

    const productos = {
      fase1: {
        amount: 1000,
        description: 'Curso de Trading — Fase 1'
      },
      bot: {
        amount: 500,
        description: 'Bot de Trading — Suscripcion Mensual'
      }
    };

    const producto = productos[producto_id];
    if (!producto) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Producto no valido' }) };
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: producto.amount,
      currency: 'usd',
      description: producto.description,
      receipt_email: user_email,
      metadata: {
        user_id,
        producto_id,
        user_email,
        user_nombre: user_nombre || ''
      },
      automatic_payment_methods: { enabled: true }
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        clientSecret: paymentIntent.client_secret
      })
    };
  } catch (error) {
    console.error('Stripe PaymentIntent error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Error al crear el pago' })
    };
  }
};
