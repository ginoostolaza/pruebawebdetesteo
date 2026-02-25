// ============================================================
// Payment Config - Returns public keys for frontend SDKs
// Stripe publishable key + MercadoPago public key
// ============================================================

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      stripe_publishable_key: process.env.STRIPE_PUBLISHABLE_KEY || '',
      mercadopago_public_key: process.env.MERCADOPAGO_PUBLIC_KEY || ''
    })
  };
};
