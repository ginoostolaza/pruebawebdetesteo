/* ============================================================
   AUTH MODULE - Supabase Authentication + Profile Management
   ============================================================ */

const Auth = (function () {
  let supabase = null;

  function init() {
    if (typeof SUPABASE_URL === 'undefined' || SUPABASE_URL === 'TU_SUPABASE_URL_AQUI') {
      console.warn('[Auth] Supabase no configurado. Usando modo demo.');
      return false;
    }
    if (typeof SUPABASE_ANON_KEY === 'undefined' || SUPABASE_ANON_KEY === 'TU_SUPABASE_ANON_KEY_AQUI') {
      console.warn('[Auth] Anon key no configurada. Usando modo demo.');
      return false;
    }
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return true;
  }

  function isConfigured() {
    return supabase !== null;
  }

  function getClient() {
    return supabase;
  }

  // ---- LOGIN ----
  async function login(email, password) {
    if (!supabase) return demoLogin(email, password);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, message: translateError(error.message) };

    const user = data.user;
    const profile = await getProfile(user.id);

    const userData = {
      id: user.id,
      nombre: profile?.nombre || user.user_metadata?.nombre || user.email.split('@')[0],
      email: user.email,
      rol: profile?.rol || 'alumno',
      fase: profile?.fase || null,
      estado: profile?.estado || 'activo'
    };

    sessionStorage.setItem('usuario', JSON.stringify(userData));
    sessionStorage.setItem('accesoAutorizado', 'true');
    sessionStorage.setItem('timestampAcceso', Date.now().toString());

    // Update last access
    if (profile) {
      await supabase.from('profiles').update({ ultimo_acceso: new Date().toISOString() }).eq('id', user.id);
    }

    return { success: true, user: userData };
  }

  // ---- REGISTER ----
  async function register(email, password, nombre) {
    if (!supabase) return { success: false, message: 'Registro no disponible en modo demo. Configura Supabase.' };

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nombre } }
    });

    if (error) return { success: false, message: translateError(error.message) };
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      return { success: false, message: 'Este correo ya esta registrado.' };
    }

    return { success: true, message: 'Cuenta creada. Revisa tu correo para confirmar tu cuenta.', needsConfirmation: true };
  }

  // ---- RESET PASSWORD ----
  async function resetPassword(email) {
    if (!supabase) return { success: false, message: 'Recuperacion no disponible en modo demo.' };

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/iniciar-sesion.html'
    });

    if (error) return { success: false, message: translateError(error.message) };
    return { success: true, message: 'Si el correo esta registrado, recibiras un enlace para restablecer tu contrasena.' };
  }

  // ---- LOGOUT ----
  async function logout() {
    if (supabase) await supabase.auth.signOut();
    sessionStorage.clear();
  }

  // ---- GET PROFILE ----
  async function getProfile(userId) {
    if (!supabase) return null;
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    return data;
  }

  // ---- GET USER PROGRESS ----
  async function getProgress(userId) {
    const userData = JSON.parse(sessionStorage.getItem('usuario') || '{}');
    if (!userData.fase) return [];

    if (!supabase) {
      return [
        { modulo: 'preparacion-grafico', completado: true },
        { modulo: 'flexzone', completado: false },
        { modulo: 'relleno-zona', completado: false },
        { modulo: 'glosario', completado: false },
        { modulo: 'consejos', completado: false }
      ];
    }
    const { data } = await supabase.from('progreso').select('*').eq('user_id', userId).order('id');
    return data || [];
  }

  // ---- UPDATE PROGRESS ----
  async function updateProgress(userId, modulo, completado) {
    if (!supabase) return;
    await supabase.from('progreso')
      .update({ completado, fecha_completado: completado ? new Date().toISOString() : null })
      .eq('user_id', userId).eq('modulo', modulo);
  }

  // ---- GET PAYMENTS ----
  async function getPayments(userId) {
    if (!supabase) return [];
    const { data } = await supabase.from('pagos').select('*').eq('user_id', userId).order('fecha', { ascending: false });
    return data || [];
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
      const profile = await getProfile(user.id);

      const userData = {
        id: user.id,
        nombre: profile?.nombre || user.user_metadata?.nombre || user.email.split('@')[0],
        email: user.email,
        rol: profile?.rol || 'alumno',
        fase: profile?.fase || null,
        estado: profile?.estado || 'activo'
      };

      sessionStorage.setItem('usuario', JSON.stringify(userData));
      sessionStorage.setItem('accesoAutorizado', 'true');
      return { user: userData };
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

  // ---- CHECK COURSE ACCESS ----
  function hasAccess(requiredFase) {
    const userData = JSON.parse(sessionStorage.getItem('usuario') || '{}');
    const fase = userData.fase;
    if (!fase) return false;
    if (fase === 'ambas') return true;
    return fase === requiredFase;
  }

  // ---- COURSE GUARD: redirect if no course access ----
  async function courseGuard(requiredFase) {
    const isAuth = await guard();
    if (!isAuth) return false;

    if (!hasAccess(requiredFase)) {
      window.location.replace('dashboard.html');
      return false;
    }
    return true;
  }

  // ---- ADMIN GUARD ----
  async function adminGuard() {
    const isAuth = await guard();
    if (!isAuth) return false;

    const userData = JSON.parse(sessionStorage.getItem('usuario') || '{}');
    if (userData.rol !== 'admin') {
      window.location.replace('dashboard.html');
      return false;
    }
    return true;
  }

  // ---- ADMIN: Get all users ----
  async function getAllUsers() {
    if (!supabase) return [];
    const { data } = await supabase.from('profiles').select('*').order('fecha_registro', { ascending: false });
    return data || [];
  }

  // ---- ADMIN: Update user profile ----
  async function updateUser(userId, updates) {
    if (!supabase) return { success: false };
    const { error } = await supabase.from('profiles').update(updates).eq('id', userId);
    return { success: !error, error: error?.message };
  }

  // ---- ADMIN: Get all progress ----
  async function getAllProgress() {
    if (!supabase) return [];
    const { data } = await supabase.from('progreso').select('*, profiles(nombre, email)').order('user_id');
    return data || [];
  }

  // ---- ADMIN: Get all payments ----
  async function getAllPayments() {
    if (!supabase) return [];
    const { data } = await supabase.from('pagos').select('*, profiles(nombre, email)').order('fecha', { ascending: false });
    return data || [];
  }

  // ---- ADMIN: Initialize progress for a user ----
  async function initProgress(userId) {
    if (!supabase) return { success: false };
    const modules = ['preparacion-grafico', 'flexzone', 'relleno-zona', 'glosario', 'consejos'];
    const rows = modules.map(m => ({ user_id: userId, modulo: m, completado: false }));
    const { error } = await supabase.from('progreso').upsert(rows, { onConflict: 'user_id,modulo', ignoreDuplicates: true });
    return { success: !error, error: error?.message };
  }

  // ---- ADMIN: Add payment ----
  async function addPayment(payment) {
    if (!supabase) return { success: false };
    const { error } = await supabase.from('pagos').insert(payment);
    return { success: !error, error: error?.message };
  }

  // ---- DEMO LOGIN ----
  function demoLogin(email, password) {
    if (email === 'admin@admin.com' && password === 'admin123') {
      sessionStorage.setItem('usuario', JSON.stringify({
        nombre: 'Gino Ostolaza', email, rol: 'admin', fase: 'ambas', estado: 'activo'
      }));
      sessionStorage.setItem('accesoAutorizado', 'true');
      sessionStorage.setItem('timestampAcceso', Date.now().toString());
      return { success: true };
    }
    if (email === 'email@email.com' && password === 'contraseña') {
      sessionStorage.setItem('usuario', JSON.stringify({
        nombre: 'Usuario Demo', email, rol: 'alumno', fase: null, estado: 'activo'
      }));
      sessionStorage.setItem('accesoAutorizado', 'true');
      sessionStorage.setItem('timestampAcceso', Date.now().toString());
      return { success: true };
    }
    return { success: false, message: 'Email o contrasena incorrectos.' };
  }

  // ---- ERROR TRANSLATION ----
  function translateError(msg) {
    const t = {
      'Invalid login credentials': 'Email o contrasena incorrectos.',
      'Email not confirmed': 'Debes confirmar tu correo antes de iniciar sesion.',
      'User already registered': 'Este correo ya esta registrado.',
      'Password should be at least 6 characters': 'La contrasena debe tener al menos 6 caracteres.',
      'Unable to validate email address: invalid format': 'El formato del correo no es valido.',
      'Signup requires a valid password': 'Debes ingresar una contrasena valida.',
      'For security purposes, you can only request this once every 60 seconds': 'Por seguridad, solo puedes solicitar esto una vez por minuto.'
    };
    return t[msg] || msg;
  }

  return {
    init, isConfigured, getClient,
    login, register, resetPassword, logout,
    getSession, getProfile, getProgress, updateProgress, getPayments,
    guard, courseGuard, adminGuard, hasAccess,
    getAllUsers, updateUser, getAllProgress, getAllPayments, addPayment, initProgress
  };
})();
