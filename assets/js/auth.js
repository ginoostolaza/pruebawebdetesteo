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

  // ---- Build user data from profile, with fallbacks ----
  function buildUserData(authUser, profile, fallback) {
    return {
      id: authUser.id,
      nombre: profile?.nombre || fallback?.nombre || authUser.user_metadata?.nombre || authUser.email.split('@')[0],
      email: authUser.email,
      rol: profile?.rol || fallback?.rol || 'alumno',
      fase: profile ? profile.fase : (fallback ? fallback.fase : null),
      estado: profile?.estado || fallback?.estado || 'activo',
      bot_activo: profile ? !!profile.bot_activo : (fallback ? !!fallback.bot_activo : false),
      bot_licencia: profile?.bot_licencia || fallback?.bot_licencia || null,
      comunidad_activa: profile ? !!profile.comunidad_activa : (fallback ? !!fallback.comunidad_activa : false),
      telefono: profile?.telefono || fallback?.telefono || null,
      bio: profile?.bio || fallback?.bio || null,
      fecha_registro: profile?.fecha_registro || fallback?.fecha_registro || null
    };
  }

  // ---- LOGIN ----
  async function login(email, password) {
    if (!supabase) return demoLogin(email, password);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, message: translateError(error.message) };

    const user = data.user;
    const profile = await getProfile(user.id);

    if (!profile) {
      console.warn('[Auth] No se pudo leer el perfil del usuario. Verificar políticas RLS en la tabla profiles.');
    }

    const userData = buildUserData(user, profile, null);

    localStorage.setItem('usuario', JSON.stringify(userData));
    localStorage.setItem('accesoAutorizado', 'true');
    localStorage.setItem('timestampAcceso', Date.now().toString());

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
      return { success: false, message: 'Este correo ya está registrado.' };
    }

    return { success: true, message: 'Cuenta creada. Revisá tu correo para confirmar tu cuenta.', needsConfirmation: true };
  }

  // ---- RESET PASSWORD ----
  async function resetPassword(email) {
    if (!supabase) return { success: false, message: 'Recuperación no disponible en modo demo.' };

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/iniciar-sesion.html'
    });

    if (error) return { success: false, message: translateError(error.message) };
    return { success: true, message: 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.' };
  }

  // ---- LOGOUT ----
  async function logout() {
    if (supabase) await supabase.auth.signOut();
    localStorage.removeItem('usuario');
    localStorage.removeItem('accesoAutorizado');
    localStorage.removeItem('timestampAcceso');
  }

  // ---- GET PROFILE ----
  async function getProfile(userId) {
    if (!supabase) return null;
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (error) {
      console.error('[Auth] Error fetching profile');
    }
    return data;
  }

  // ---- GET USER PROGRESS ----
  async function getProgress(userId) {
    const userData = JSON.parse(localStorage.getItem('usuario') || '{}');
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
      const acceso = localStorage.getItem('accesoAutorizado');
      return acceso === 'true' ? { user: JSON.parse(localStorage.getItem('usuario') || '{}') } : null;
    }

    const { data } = await supabase.auth.getSession();
    if (data.session) {
      const user = data.session.user;
      const profile = await getProfile(user.id);

      // Use existing sessionStorage data as fallback if profile fetch fails
      const existing = JSON.parse(localStorage.getItem('usuario') || '{}');
      const userData = buildUserData(user, profile, existing);

      if (!profile) {
        console.warn('[Auth] Perfil no leído desde DB. Usando datos en caché. Rol actual:', userData.rol);
      }

      localStorage.setItem('usuario', JSON.stringify(userData));
      localStorage.setItem('accesoAutorizado', 'true');
      return { user: userData };
    }
    return null;
  }

  // ---- GUARD: redirect if not authenticated ----
  // Always re-fetches profile from DB to pick up role/fase/estado changes
  async function guard() {
    const quickCheck = localStorage.getItem('accesoAutorizado');
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
      // Check if account is suspended
      const userData = JSON.parse(localStorage.getItem('usuario') || '{}');
      if (userData.estado === 'suspendido') {
        localStorage.removeItem('usuario');
        localStorage.removeItem('accesoAutorizado');
        localStorage.removeItem('timestampAcceso');
        window.location.replace('iniciar-sesion.html');
        return false;
      }
    }
    return true;
  }

  // ---- REFRESH PROFILE: force re-fetch from DB ----
  async function refreshProfile() {
    if (!supabase) return null;
    const existing = JSON.parse(localStorage.getItem('usuario') || '{}');
    if (!existing.id) return null;
    const profile = await getProfile(existing.id);
    if (profile) {
      const userData = {
        ...existing,
        nombre: profile.nombre || existing.nombre,
        rol: profile.rol || existing.rol,
        fase: profile.fase,
        estado: profile.estado || existing.estado,
        bot_activo: !!profile.bot_activo,
        bot_licencia: profile.bot_licencia || null,
        comunidad_activa: !!profile.comunidad_activa,
        telefono: profile.telefono || null,
        bio: profile.bio || null,
        fecha_registro: profile.fecha_registro || existing.fecha_registro || null
      };
      localStorage.setItem('usuario', JSON.stringify(userData));
      return userData;
    }
    return existing;
  }

  // ---- CHECK COURSE ACCESS ----
  function hasAccess(requiredFase) {
    const userData = JSON.parse(localStorage.getItem('usuario') || '{}');
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

    const userData = JSON.parse(localStorage.getItem('usuario') || '{}');
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

  // ---- NOTIFICATIONS: Get user notifications ----
  async function getNotifications(userId) {
    if (!supabase) return [];
    const { data } = await supabase.from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);
    return data || [];
  }

  // ---- NOTIFICATIONS: Get unread count ----
  async function getUnreadCount(userId) {
    if (!supabase) return 0;
    const { count } = await supabase.from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('leida', false);
    return count || 0;
  }

  // ---- NOTIFICATIONS: Mark as read ----
  async function markNotificationRead(notificationId) {
    if (!supabase) return { success: false };
    const { error } = await supabase.from('notifications')
      .update({ leida: true })
      .eq('id', notificationId);
    return { success: !error, error: error?.message };
  }

  // ---- NOTIFICATIONS: Mark all as read ----
  async function markAllNotificationsRead(userId) {
    if (!supabase) return { success: false };
    const { error } = await supabase.from('notifications')
      .update({ leida: true })
      .eq('user_id', userId)
      .eq('leida', false);
    return { success: !error, error: error?.message };
  }

  // ---- ADMIN: Send notification to one user ----
  async function sendNotification(userId, titulo, mensaje, tipo) {
    if (!supabase) return { success: false };
    const { error } = await supabase.from('notifications').insert({
      user_id: userId,
      titulo: titulo,
      mensaje: mensaje,
      tipo: tipo || 'info'
    });
    return { success: !error, error: error?.message };
  }

  // ---- ADMIN: Send notification to multiple users ----
  async function sendBulkNotification(userIds, titulo, mensaje, tipo) {
    if (!supabase) return { success: false };
    const rows = userIds.map(uid => ({
      user_id: uid,
      titulo: titulo,
      mensaje: mensaje,
      tipo: tipo || 'info'
    }));
    const { error } = await supabase.from('notifications').insert(rows);
    return { success: !error, error: error?.message };
  }

  // ---- DEMO LOGIN (development only) ----
  function demoLogin(email, password) {
    var isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isDev) return { success: false, message: 'Servicio no disponible. Intentá de nuevo más tarde.' };

    if (email === 'admin@admin.com' && password === 'admin123') {
      localStorage.setItem('usuario', JSON.stringify({
        nombre: 'Admin', email, rol: 'admin', fase: 'ambas', estado: 'activo'
      }));
      localStorage.setItem('accesoAutorizado', 'true');
      localStorage.setItem('timestampAcceso', Date.now().toString());
      return { success: true };
    }
    if (email === 'email@email.com' && password === 'contraseña') {
      localStorage.setItem('usuario', JSON.stringify({
        nombre: 'Usuario Demo', email, rol: 'alumno', fase: null, estado: 'activo'
      }));
      localStorage.setItem('accesoAutorizado', 'true');
      localStorage.setItem('timestampAcceso', Date.now().toString());
      return { success: true };
    }
    return { success: false, message: 'Email o contraseña incorrectos.' };
  }

  // ---- ERROR TRANSLATION ----
  function translateError(msg) {
    const t = {
      'Invalid login credentials': 'Email o contraseña incorrectos.',
      'Email not confirmed': 'Debés confirmar tu correo antes de iniciar sesión.',
      'User already registered': 'Este correo ya está registrado.',
      'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres.',
      'Unable to validate email address: invalid format': 'El formato del correo no es válido.',
      'Signup requires a valid password': 'Debés ingresar una contraseña válida.',
      'For security purposes, you can only request this once every 60 seconds': 'Por seguridad, solo puedes solicitar esto una vez por minuto.'
    };
    return t[msg] || msg;
  }

  // ---- SIGN OUT OTHER SESSIONS ----
  async function signOutOthers() {
    if (!supabase) return { success: false, error: 'No disponible en modo demo.' };
    var { error } = await supabase.auth.signOut({ scope: 'others' });
    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  // ---- DEACTIVATE ACCOUNT ----
  async function deactivateAccount() {
    if (!supabase) return { success: false, error: 'No disponible en modo demo.' };
    var session = await supabase.auth.getSession();
    var user = session?.data?.session?.user;
    if (!user) return { success: false, error: 'No autenticado.' };
    var { error } = await supabase.from('profiles').update({ estado: 'suspendido' }).eq('id', user.id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  // ---- GET FULL USER DATA FOR EXPORT ----
  async function getFullUserData() {
    if (!supabase) return null;
    var session = await supabase.auth.getSession();
    var user = session?.data?.session?.user;
    if (!user) return null;
    var profile = await getProfile(user.id);
    var progress = await getProgress(user.id);
    var payments = await getPayments(user.id);
    return {
      perfil: profile || {},
      email: user.email,
      progreso: progress || [],
      pagos: payments || [],
      exportado_el: new Date().toISOString()
    };
  }

  // ---- UPDATE OWN PROFILE ----
  async function updateProfile(updates) {
    if (!supabase) return { success: false, error: 'No disponible en modo demo.' };
    var session = await supabase.auth.getSession();
    var user = session?.data?.session?.user;
    if (!user) return { success: false, error: 'No autenticado.' };

    var { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  // ---- UPDATE PASSWORD ----
  async function updatePassword(newPassword) {
    if (!supabase) return { success: false, error: 'No disponible en modo demo.' };
    var { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { success: false, error: translateError(error.message) };
    return { success: true };
  }

  // ---- SITE CONFIG: Get all config ----
  async function getSiteConfig() {
    if (!supabase) return {};
    var { data, error } = await supabase.from('site_config').select('*');
    if (error) {
      console.warn('[Auth] site_config table not found or error:', error.message);
      return {};
    }
    var config = {};
    (data || []).forEach(function(row) {
      config[row.key] = row.value;
    });
    return config;
  }

  // ---- SITE CONFIG: Update a config key ----
  async function updateSiteConfig(key, value) {
    if (!supabase) return { success: false, error: 'No disponible en modo demo.' };
    var { error } = await supabase.from('site_config').upsert(
      { key: key, value: value, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
    return { success: !error, error: error?.message };
  }

  return {
    init, isConfigured, getClient,
    login, register, resetPassword, logout,
    getSession, getProfile, getProgress, updateProgress, getPayments,
    guard, courseGuard, adminGuard, hasAccess, refreshProfile,
    updateProfile, updatePassword, signOutOthers, deactivateAccount, getFullUserData,
    getAllUsers, updateUser, getAllProgress, getAllPayments, addPayment, initProgress,
    getNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead,
    sendNotification, sendBulkNotification,
    getSiteConfig, updateSiteConfig
  };
})();
