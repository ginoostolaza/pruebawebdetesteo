// ============================================================
// Email Templates — Orbita Capital
// Dark-themed, mobile-responsive HTML emails
// ============================================================

const SITE_URL = process.env.URL || 'https://orbitacapital.io';
const LOGO_URL = `${SITE_URL}/assets/img/branding/logo.jpg`;
const DASHBOARD_URL = `${SITE_URL}/dashboard.html`;
const INSTAGRAM_URL = 'https://instagram.com/orbitacapital.io';

// ── Shared layout wrapper ────────────────────────────────────
function layout(content) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Orbita Capital</title>
</head>
<body style="margin:0;padding:0;background:#090d1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#090d1a;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#0f2042 0%,#141432 100%);border-radius:16px 16px 0 0;padding:36px 40px 28px;text-align:center;border:1px solid rgba(59,130,246,0.18);border-bottom:none;">
              <img src="${LOGO_URL}" alt="Orbita Capital" width="72" height="72"
                   style="display:block;margin:0 auto 16px;border-radius:12px;border:1px solid rgba(59,130,246,0.25);">
              <p style="margin:0;color:#60a5fa;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Orbita Capital</p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="background:#0d1225;border:1px solid rgba(59,130,246,0.18);border-top:none;border-bottom:none;padding:32px 40px;">
              ${content}
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#080b16;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;border:1px solid rgba(59,130,246,0.18);border-top:1px solid rgba(255,255,255,0.05);">
              <p style="margin:0 0 6px;color:#334155;font-size:12px;">
                © ${new Date().getFullYear()} Orbita Capital · Todos los derechos reservados
              </p>
              <p style="margin:0;color:#1e3a5f;font-size:11px;">
                <a href="${INSTAGRAM_URL}" style="color:#1d4ed8;text-decoration:none;">@orbitacapital.io</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Shared helpers ───────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function pill(text, color = '#3b82f6') {
  const bg = color === '#3b82f6' ? 'rgba(59,130,246,0.15)' : 'rgba(16,185,129,0.15)';
  const border = color === '#3b82f6' ? 'rgba(59,130,246,0.35)' : 'rgba(16,185,129,0.35)';
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 20px;">
    <tr>
      <td style="background:${bg};border:1px solid ${border};border-radius:50px;padding:5px 18px;">
        <span style="color:${color};font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">${text}</span>
      </td>
    </tr>
  </table>`;
}

function ctaButton(text, url) {
  return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 24px;">
    <tr>
      <td align="center">
        <a href="${url}"
           style="display:inline-block;background:linear-gradient(135deg,#2563eb,#4f46e5);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 44px;border-radius:10px;letter-spacing:0.3px;border:none;">
          ${text}
        </a>
      </td>
    </tr>
  </table>`;
}

function checkItem(text) {
  return `<tr>
    <td style="padding:5px 0;">
      <table cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="color:#34d399;font-size:15px;padding-right:10px;vertical-align:top;">✓</td>
        <td style="color:#cbd5e1;font-size:14px;line-height:1.5;">${text}</td>
      </tr></table>
    </td>
  </tr>`;
}

// ── Template 1: Bienvenida Fase 1 ───────────────────────────
function bienvenidaFase1({ nombre }) {
  const body = `
    ${pill('✓ Pago confirmado')}

    <h1 style="margin:0 0 8px;color:#f1f5f9;font-size:24px;font-weight:700;text-align:center;line-height:1.3;">
      ¡Tu acceso está activo!
    </h1>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px;text-align:center;">
      Ya podés empezar a operar con el sistema.
    </p>

    <p style="margin:0 0 6px;color:#94a3b8;font-size:14px;">
      Hola, <strong style="color:#e2e8f0;">${escapeHtml(nombre)}</strong>
    </p>
    <p style="margin:0 0 24px;color:#94a3b8;font-size:14px;line-height:1.7;">
      Tu compra del <strong style="color:#e2e8f0;">Curso Fase 1</strong> fue procesada exitosamente.
      Accedé a todos los módulos desde tu dashboard.
    </p>

    <!-- Contenido incluido -->
    <table cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background:#111c35;border:1px solid rgba(59,130,246,0.15);border-radius:12px;margin-bottom:24px;">
      <tr>
        <td style="padding:18px 22px;">
          <p style="margin:0 0 12px;color:#60a5fa;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
            Tu acceso incluye
          </p>
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            ${checkItem('Módulo: Preparación del Gráfico')}
            ${checkItem('Sistema FlexZone + Relleno de Zona')}
            ${checkItem('Psicología del trader y mentalidad')}
            ${checkItem('Glosario y consejos de trading')}
            ${checkItem('Comunidad Privada exclusiva')}
          </table>
        </td>
      </tr>
    </table>

    ${ctaButton('Ir a mi dashboard →', DASHBOARD_URL)}

    <!-- Tip de inicio -->
    <table cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background:rgba(245,158,11,0.07);border-left:3px solid #f59e0b;border-radius:0 10px 10px 0;margin-bottom:24px;">
      <tr>
        <td style="padding:14px 16px;">
          <p style="margin:0 0 4px;color:#fbbf24;font-size:13px;font-weight:700;">💡 ¿Por dónde empezar?</p>
          <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.6;">
            Arrancá por el módulo de <strong style="color:#e2e8f0;">Preparación del Gráfico</strong>.
            Es la base de todo el sistema.
          </p>
        </td>
      </tr>
    </table>

    <p style="margin:0;color:#475569;font-size:13px;text-align:center;line-height:1.7;">
      ¿Dudas o consultas? Escribinos por Instagram<br>
      <a href="${INSTAGRAM_URL}" style="color:#60a5fa;text-decoration:none;font-weight:600;">@orbitacapital.io</a>
    </p>
  `;
  return layout(body);
}

// ── Template 2: Bienvenida Bot ───────────────────────────────
function bienvenidaBot({ nombre }) {
  const body = `
    ${pill('✓ Bot activado', '#10b981')}

    <h1 style="margin:0 0 8px;color:#f1f5f9;font-size:24px;font-weight:700;text-align:center;line-height:1.3;">
      ¡Tu bot está listo para operar!
    </h1>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px;text-align:center;">
      Configuralo en minutos y dejalo trabajar.
    </p>

    <p style="margin:0 0 6px;color:#94a3b8;font-size:14px;">
      Hola, <strong style="color:#e2e8f0;">${escapeHtml(nombre)}</strong>
    </p>
    <p style="margin:0 0 24px;color:#94a3b8;font-size:14px;line-height:1.7;">
      Tu compra del <strong style="color:#e2e8f0;">Bot de Trading</strong> fue procesada exitosamente.
      Descargalo desde la sección Bot de tu dashboard y seguí las instrucciones de configuración.
    </p>

    <!-- Info del bot -->
    <table cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background:#111c35;border:1px solid rgba(16,185,129,0.15);border-radius:12px;margin-bottom:24px;">
      <tr>
        <td style="padding:18px 22px;">
          <p style="margin:0 0 12px;color:#34d399;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
            Próximos pasos
          </p>
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            ${checkItem('Ingresá al dashboard y entrá a la sección <strong style="color:#e2e8f0;">Bot</strong>')}
            ${checkItem('Descargá el archivo de instalación')}
            ${checkItem('Seguí el tutorial de configuración incluido')}
            ${checkItem('Ejecutá tu primer backtest para validar parámetros')}
          </table>
        </td>
      </tr>
    </table>

    ${ctaButton('Descargar mi Bot →', `${SITE_URL}/bot.html`)}

    <!-- Aviso -->
    <table cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background:rgba(99,102,241,0.07);border-left:3px solid #6366f1;border-radius:0 10px 10px 0;margin-bottom:24px;">
      <tr>
        <td style="padding:14px 16px;">
          <p style="margin:0 0 4px;color:#a5b4fc;font-size:13px;font-weight:700;">⚡ Soporte técnico</p>
          <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.6;">
            Si tenés algún problema con la instalación, contactanos por Instagram y te ayudamos.
          </p>
        </td>
      </tr>
    </table>

    <p style="margin:0;color:#475569;font-size:13px;text-align:center;line-height:1.7;">
      ¿Dudas o consultas? Escribinos por Instagram<br>
      <a href="${INSTAGRAM_URL}" style="color:#60a5fa;text-decoration:none;font-weight:600;">@orbitacapital.io</a>
    </p>
  `;
  return layout(body);
}

// ── Template 3: Confirmación Waitlist Fase 2 ─────────────────
function confirmacionWaitlist({ nombre }) {
  const body = `
    ${pill('✓ En lista de espera')}

    <h1 style="margin:0 0 8px;color:#f1f5f9;font-size:24px;font-weight:700;text-align:center;line-height:1.3;">
      ¡Estás en la lista!
    </h1>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px;text-align:center;">
      Te avisamos cuando haya cupos disponibles.
    </p>

    <p style="margin:0 0 6px;color:#94a3b8;font-size:14px;">
      Hola, <strong style="color:#e2e8f0;">${escapeHtml(nombre)}</strong>
    </p>
    <p style="margin:0 0 24px;color:#94a3b8;font-size:14px;line-height:1.7;">
      Te registraste correctamente en la lista de espera para la
      <strong style="color:#e2e8f0;">Fase 2 de Orbita Capital</strong>.
      Cuando abramos nuevos cupos, vas a ser de los primeros en enterarte.
    </p>

    <!-- Qué es Fase 2 -->
    <table cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background:#111c35;border:1px solid rgba(59,130,246,0.15);border-radius:12px;margin-bottom:24px;">
      <tr>
        <td style="padding:18px 22px;">
          <p style="margin:0 0 12px;color:#60a5fa;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
            ¿Qué es Fase 2?
          </p>
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            ${checkItem('Estrategias avanzadas de entrada y salida')}
            ${checkItem('Gestión de riesgo profesional')}
            ${checkItem('Sesiones en vivo con el equipo')}
            ${checkItem('Análisis de operaciones en tiempo real')}
          </table>
        </td>
      </tr>
    </table>

    <!-- Mientras tanto -->
    <table cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background:rgba(245,158,11,0.07);border-left:3px solid #f59e0b;border-radius:0 10px 10px 0;margin-bottom:24px;">
      <tr>
        <td style="padding:14px 16px;">
          <p style="margin:0 0 4px;color:#fbbf24;font-size:13px;font-weight:700;">🚀 Mientras tanto</p>
          <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.6;">
            Si aún no tenés la Fase 1, es el mejor momento para empezar.
            Es la base que necesitás para aprovechar al máximo la Fase 2.
          </p>
        </td>
      </tr>
    </table>

    ${ctaButton('Ver Fase 1', `${SITE_URL}/index.html#pricing`)}

    <p style="margin:0;color:#475569;font-size:13px;text-align:center;line-height:1.7;">
      Seguinos en Instagram para novedades<br>
      <a href="${INSTAGRAM_URL}" style="color:#60a5fa;text-decoration:none;font-weight:600;">@orbitacapital.io</a>
    </p>
  `;
  return layout(body);
}

// ── Exports ──────────────────────────────────────────────────
module.exports = { bienvenidaFase1, bienvenidaBot, confirmacionWaitlist };
