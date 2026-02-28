// ============================================================
// Waitlist Signup — Binary Edge Academy
// Saves to Supabase + sends confirmation email via Resend
// ============================================================

const { createClient } = require('@supabase/supabase-js');
const { confirmacionWaitlist } = require('./email-templates');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM || 'Binary Edge Academy <onboarding@resend.dev>';

async function sendEmail(to, subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html })
  });
  return res.json();
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let nombre, email;
  try {
    ({ nombre, email } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  if (!nombre || !email || !email.includes('@')) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nombre y email son requeridos' }) };
  }

  nombre = String(nombre).trim().slice(0, 100);
  email  = String(email).trim().toLowerCase().slice(0, 200);

  // Save to Supabase
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { error: dbError } = await supabase
    .from('waitlist')
    .insert({ nombre, email, producto: 'fase-2' });

  if (dbError && !dbError.message?.includes('duplicate')) {
    console.error('Waitlist DB error:', dbError);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'No se pudo guardar. Intentá de nuevo.' }) };
  }

  // Send confirmation email
  if (RESEND_API_KEY) {
    const emailResult = await sendEmail(
      email,
      '¡Estás en la lista! — Binary Edge Academy',
      confirmacionWaitlist({ nombre })
    );
    console.log('[Waitlist] Email sent:', emailResult?.id || emailResult?.error);
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true })
  };
};
