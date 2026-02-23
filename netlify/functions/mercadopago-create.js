// ============================================================
// MercadoPago - Create Checkout Preference
// Creates a MercadoPago Checkout Pro preference for ARS payments
// ============================================================

const { MercadoPagoConfig, Preference } = require('mercadopago');

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

    // Product definitions
    const productos = {
      fase1: {
        title: 'Curso de Trading — Fase 1',
        description: 'Acceso completo: 2 sistemas de trading, preparacion del grafico, glosario y consejos',
        unit_price: 9999,
        currency_id: 'ARS'
      },
      bot: {
        title: 'Bot de Trading — Suscripcion Mensual',
        description: 'Bot automatizado configurado por Gino, opera 24/7',
        unit_price: 7500,
        currency_id: 'ARS'
      }
    };

    const producto = productos[producto_id];
    if (!producto) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Producto no valido' }) };
    }

    const client = new MercadoPagoConfig({
      accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN
    });

    const preference = new Preference(client);

    const siteUrl = process.env.SITE_URL || 'https://tudominio.netlify.app';

    const result = await preference.create({
      body: {
        items: [{
          id: producto_id,
          title: producto.title,
          description: producto.description,
          quantity: 1,
          unit_price: producto.unit_price,
          currency_id: producto.currency_id
        }],
        payer: {
          email: user_email,
          name: user_nombre || ''
        },
        back_urls: {
          success: `${siteUrl}/pago-resultado.html?status=success&provider=mercadopago&producto=${producto_id}`,
          failure: `${siteUrl}/pago-resultado.html?status=failure&provider=mercadopago`,
          pending: `${siteUrl}/pago-resultado.html?status=pending&provider=mercadopago`
        },
        auto_return: 'approved',
        notification_url: `${siteUrl}/api/mercadopago-webhook`,
        external_reference: JSON.stringify({ user_id, producto_id }),
        metadata: {
          user_id,
          producto_id,
          user_email
        },
        statement_descriptor: 'GINO OSTOLAZA'
      }
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        id: result.id,
        init_point: result.init_point,
        sandbox_init_point: result.sandbox_init_point
      })
    };
  } catch (error) {
    console.error('MercadoPago error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Error al crear la preferencia de pago' })
    };
  }
};
