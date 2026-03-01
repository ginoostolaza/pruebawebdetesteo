// ============================================================
// MercadoPago - Process Payment from Checkout Bricks
// Receives tokenized card data and creates the payment
// ============================================================

const { MercadoPagoConfig, Payment } = require('mercadopago');

exports.handler = async (event) => {
  const allowedOrigin = process.env.SITE_URL || process.env.URL || '*';
  const headers = {
    'Access-Control-Allow-Origin': allowedOrigin,
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
    const body = JSON.parse(event.body);
    const {
      token,
      issuer_id,
      payment_method_id,
      transaction_amount,
      installments,
      payer,
      producto_id,
      user_id
    } = body;

    if (!token || !payment_method_id || !transaction_amount || !payer?.email) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Faltan datos de pago' }) };
    }

    const productos = {
      fase1: 'Curso de Trading — Fase 1',
      bot: 'Bot de Trading — Suscripcion Mensual'
    };

    const client = new MercadoPagoConfig({
      accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN
    });

    const payment = new Payment(client);

    const result = await payment.create({
      body: {
        token,
        issuer_id: issuer_id || undefined,
        payment_method_id,
        transaction_amount: Number(transaction_amount),
        installments: Number(installments) || 1,
        payer: {
          email: payer.email,
          identification: payer.identification || undefined
        },
        description: productos[producto_id] || productos.fase1,
        statement_descriptor: 'ORBITA CAPITAL',
        metadata: {
          user_id: user_id || '',
          producto_id: producto_id || 'fase1'
        }
      }
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: result.status,
        status_detail: result.status_detail,
        id: result.id
      })
    };
  } catch (error) {
    console.error('MercadoPago process error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Error al procesar el pago' })
    };
  }
};
