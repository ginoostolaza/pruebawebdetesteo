// ============================================================
// Stripe - Create Checkout Session
// Creates a Stripe Checkout session for USD payments
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

    // Product definitions (prices in cents)
    const productos = {
      fase1: {
        name: 'Curso de Trading — Fase 1',
        description: 'Acceso completo: 2 sistemas de trading, preparacion del grafico, glosario y consejos',
        price: 1000, // $10.00 USD in cents
        mode: 'payment'
      },
      bot: {
        name: 'Bot de Trading — Suscripcion Mensual',
        description: 'Bot automatizado configurado por Binary Edge, opera 24/7',
        price: 500, // $5.00 USD in cents
        mode: 'payment' // Using payment mode (not subscription) for simplicity
      }
    };

    const producto = productos[producto_id];
    if (!producto) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Producto no valido' }) };
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const siteUrl = process.env.SITE_URL || 'https://tudominio.netlify.app';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: producto.mode,
      customer_email: user_email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: producto.name,
            description: producto.description,
            images: [`${siteUrl}/assets/img/branding/logo.png`]
          },
          unit_amount: producto.price
        },
        quantity: 1
      }],
      metadata: {
        user_id,
        producto_id,
        user_email,
        user_nombre: user_nombre || ''
      },
      success_url: `${siteUrl}/pago-resultado.html?status=success&provider=stripe&producto=${producto_id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/pago-resultado.html?status=failure&provider=stripe`
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        sessionId: session.id,
        url: session.url
      })
    };
  } catch (error) {
    console.error('Stripe error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Error al crear la sesion de pago' })
    };
  }
};
