// ============================================================
// MercadoPago - Process Payment from Checkout Bricks
// Receives tokenized card data, creates the payment, and
// records it in the database + grants access if approved
// ============================================================

const { MercadoPagoConfig, Payment } = require('mercadopago');
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
    console.log('[MP Bricks] Email sent:', data?.id || data?.error);
  } catch (err) {
    console.error('[MP Bricks] Email error:', err.message);
  }
}

exports.handler = async (event) => {
  const allowedOrigin = process.env.SITE_URL || process.env.URL || 'https://orbitacapital.io';
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
      installments,
      payer,
      producto_id,
      user_id
    } = body;

    if (!token || !payment_method_id || !payer?.email) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Faltan datos de pago' }) };
    }

    // Server-side prices — never trust client-supplied amount
    const productos = {
      fase1: { title: 'Curso de Trading — Fase 1', unit_price: 47000 },
      bot: { title: 'Bot de Trading — Suscripcion Mensual', unit_price: 24900 }
    };

    const producto = productos[producto_id];
    if (!producto) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Producto no valido' }) };
    }

    const client = new MercadoPagoConfig({
      accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN
    });

    const payment = new Payment(client);

    const result = await payment.create({
      body: {
        token,
        issuer_id: issuer_id || undefined,
        payment_method_id,
        transaction_amount: producto.unit_price,
        installments: Number(installments) || 1,
        payer: {
          email: payer.email,
          identification: payer.identification || undefined
        },
        description: producto.title,
        statement_descriptor: 'ORBITA CAPITAL',
        metadata: {
          user_id: user_id || '',
          producto_id: producto_id || 'fase1'
        }
      }
    });

    // ── Record payment in database ──
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const statusMap = {
      approved: 'completado',
      pending: 'pendiente',
      authorized: 'pendiente',
      in_process: 'pendiente',
      rejected: 'rechazado',
      cancelled: 'rechazado'
    };
    const estado = statusMap[result.status] || 'pendiente';

    const paymentRecord = {
      user_id: user_id,
      monto: producto.unit_price,
      moneda: result.currency_id || 'ARS',
      metodo: 'MercadoPago',
      concepto: producto_id === 'fase1' ? 'Curso Fase 1 (MercadoPago)' : 'Bot de Trading (MercadoPago)',
      estado,
      producto: producto_id,
      provider: 'mercadopago',
      provider_payment_id: String(result.id),
      provider_status: result.status,
      metadata: {
        payment_method_id: result.payment_method_id,
        payment_type_id: result.payment_type_id,
        payer_email: payer.email,
        source: 'checkout_bricks'
      }
    };

    const { error: upsertError } = await supabase
      .from('pagos')
      .upsert(paymentRecord, {
        onConflict: 'provider,provider_payment_id',
        ignoreDuplicates: false
      });

    if (upsertError) {
      const { error: insertError } = await supabase.from('pagos').insert(paymentRecord);
      if (insertError) console.error('[MP Bricks] Error recording payment:', insertError);
    }

    // ── Grant access if payment approved ──
    if (estado === 'completado' && user_id) {
      if (producto_id === 'fase1') {
        const { data: profile } = await supabase
          .from('profiles')
          .select('fase')
          .eq('id', user_id)
          .single();

        let newFase = 'fase-1';
        if (profile?.fase === 'fase-2') newFase = 'ambas';
        else if (profile?.fase === 'ambas' || profile?.fase === 'fase-1') newFase = profile.fase;

        await supabase
          .from('profiles')
          .update({ fase: newFase })
          .eq('id', user_id);

        const modules = ['preparacion-grafico', 'flexzone', 'relleno-zona', 'glosario', 'consejos'];
        const rows = modules.map(m => ({ user_id, modulo: m, completado: false }));
        await supabase.from('progreso').upsert(rows, { onConflict: 'user_id,modulo', ignoreDuplicates: true });
      }

      if (producto_id === 'bot') {
        await supabase
          .from('profiles')
          .update({ bot_activo: true })
          .eq('id', user_id);
      }

      // Dashboard notification
      await supabase.from('notifications').insert({
        user_id,
        titulo: '¡Bienvenido a Orbita Capital!',
        mensaje: producto_id === 'fase1'
          ? 'Tu acceso está activo. Empezá por el módulo de Preparación del Gráfico en tu dashboard.'
          : 'Tu bot de trading está activo. Descargalo desde la sección Bot en tu dashboard.',
        tipo: 'success'
      });

      // Welcome email
      const { data: nameProfile } = await supabase
        .from('profiles')
        .select('nombre')
        .eq('id', user_id)
        .single();

      const nombre = nameProfile?.nombre || payer.email?.split('@')[0] || 'trader';

      if (producto_id === 'fase1') {
        await sendEmail(payer.email, '¡Bienvenido a Orbita Capital! Tu acceso está activo', bienvenidaFase1({ nombre }));
      } else if (producto_id === 'bot') {
        await sendEmail(payer.email, '¡Tu bot de trading está listo! — Orbita Capital', bienvenidaBot({ nombre }));
      }
    }

    console.log(`[MP Bricks] Payment ${result.id} — Status: ${result.status} — User: ${user_id} — Product: ${producto_id}`);

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
    console.error('[MP Bricks] Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Error al procesar el pago' })
    };
  }
};
