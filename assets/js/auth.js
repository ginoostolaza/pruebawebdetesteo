/* ============================================================
   AUTH MODULE - Supabase Authentication
   ============================================================ */

const Auth = (function () {
  let supabase = null;

  function init() {
    if (typeof SUPABASE_URL === 'undefined' || SUPABASE_URL === 'TU_SUPABASE_URL_AQUI') {
      console.warn('[Auth] Supabase no configurado. Usando modo demo.');
      return false;
    }
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return true;
  }

  function isConfigured() {
    return supabase !== null;
  }

  // ---- LOGIN ----
  async function login(email, password) {
    if (!supabase) {
      return demoLogin(email, password);
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) {
      return { success: false, message: translateError(error.message) };
    }

    const user = data.user;
    const nombre = user.user_metadata?.nombre || user.email.split('@')[0];

    sessionStorage.setItem('usuario', JSON.stringify({
      nombre: nombre,
      email: user.email,
      id: user.id
    }));
    sessionStorage.setItem('accesoAutorizado', 'true');
    sessionStorage.setItem('timestampAcceso', Date.now().toString());

    return { success: true };
  }

  // ---- REGISTER ----
  async function register(email, password, nombre) {
    if (!supabase) {
      return { success: false, message: 'Registro no disponible en modo demo. Configura Supabase.' };
    }

    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        data: { nombre: nombre }
      }
    });

    if (error) {
      return { success: false, message: translateError(error.message) };
    }

    if (data.user && data.user.identities && data.user.identities.length === 0) {
      return { success: false, message: 'Este correo ya esta registrado.' };
    }

    return {
      success: true,
      message: 'Cuenta creada. Revisa tu correo para confirmar tu cuenta.',
      needsConfirmation: true
    };
  }

  // ---- RESET PASSWORD ----
  async function resetPassword(email) {
    if (!supabase) {
      return { success: false, message: 'Recuperacion no disponible en modo demo.' };
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/iniciar-sesion.html'
    });

    if (error) {
      return { success: false, message: translateError(error.message) };
    }

    return {
      success: true,
      message: 'Si el correo esta registrado, recibiras un enlace para restablecer tu contrasena.'
    };
  }

  // ---- LOGOUT ----
  async function logout() {
    if (supabase) {
      await supabase.auth.signOut();
    }
    sessionStorage.clear();
  }

  // ---- CHECK SESSION ----
  async function getSession() {
    if (!supabase) {
      const acceso = sessionStorage.getItem('accesoAutorizado');
      return acceso === 'true' ? { user: JSON.parse(sessionStorage.getItem('usuario') || '{}') } : null;
    }

    const { data } = await supabase.auth.getSession();
    if (data.session) {
      const user = data.session.user;
      sessionStorage.setItem('usuario', JSON.stringify({
        nombre: user.user_metadata?.nombre || user.email.split('@')[0],
        email: user.email,
        id: user.id
      }));
      sessionStorage.setItem('accesoAutorizado', 'true');
      return { user: user };
    }

    return null;
  }

  // ---- GUARD: redirect if not authenticated ----
  async function guard() {
    const quickCheck = sessionStorage.getItem('accesoAutorizado');
    if (!quickCheck || quickCheck !== 'true') {
      window.location.replace('iniciar-sesion.html');
      return false;
    }

    if (supabase) {
      const session = await getSession();
      if (!session) {
        sessionStorage.clear();
        window.location.replace('iniciar-sesion.html');
        return false;
      }
    }

    return true;
  }

  // ---- DEMO LOGIN (fallback when Supabase not configured) ----
  function demoLogin(email, password) {
    if (email === 'email@email.com' && password === 'contraseña') {
      sessionStorage.setItem('usuario', JSON.stringify({ nombre: 'Usuario Demo', email: email }));
      sessionStorage.setItem('accesoAutorizado', 'true');
      sessionStorage.setItem('timestampAcceso', Date.now().toString());
      return { success: true };
    }
    return { success: false, message: 'Email o contrasena incorrectos.' };
  }

  // ---- ERROR TRANSLATION ----
  function translateError(msg) {
    const translations = {
      'Invalid login credentials': 'Email o contrasena incorrectos.',
      'Email not confirmed': 'Debes confirmar tu correo antes de iniciar sesion.',
      'User already registered': 'Este correo ya esta registrado.',
      'Password should be at least 6 characters': 'La contrasena debe tener al menos 6 caracteres.',
      'Unable to validate email address: invalid format': 'El formato del correo no es valido.',
      'Signup requires a valid password': 'Debes ingresar una contrasena valida.',
      'For security purposes, you can only request this once every 60 seconds': 'Por seguridad, solo puedes solicitar esto una vez por minuto.'
    };
    return translations[msg] || msg;
  }

  return { init, isConfigured, login, register, resetPassword, logout, getSession, guard };
})();
