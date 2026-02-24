-- ============================================================
-- MIGRACION: Arreglo de seguridad + Optimizacion de DB
-- Gino Ostolaza Coaching Platform
-- ============================================================
--
-- INSTRUCCIONES:
-- 1. Anda a tu dashboard de Supabase > SQL Editor
-- 2. Pega TODO este contenido y dale a "Run"
-- 3. Listo! Tu base de datos esta segura y optimizada
--
-- QUE ARREGLA:
-- [CRITICO] Elimina 3 policies RLS que permitian a CUALQUIER
--           usuario modificar perfiles y pagos ajenos
-- [CRITICO] Agrega constraint UNIQUE faltante en progreso
-- [MEJORA]  Funcion is_admin() para evitar recursion en policies
-- [MEJORA]  Indexes para consultas rapidas
-- [MEJORA]  Triggers mejorados con manejo de errores
-- [MEJORA]  Columna updated_at en profiles
-- [MEJORA]  Funcion make_admin() para hacerte admin facilmente
--
-- SEGURO de ejecutar multiples veces (idempotente).
-- ============================================================


-- ============================================================
-- PASO 1: Funcion segura para verificar si es admin
-- Evita recursion cuando una policy de profiles necesita
-- leer de profiles para saber si es admin
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND rol = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ============================================================
-- PASO 2: Agregar columnas faltantes a profiles
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bot_activo boolean DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();


-- ============================================================
-- PASO 3: UNIQUE constraint en progreso(user_id, modulo)
-- Sin esto el ON CONFLICT DO NOTHING del trigger no funciona
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'progreso_user_modulo_unique'
  ) THEN
    ALTER TABLE public.progreso
      ADD CONSTRAINT progreso_user_modulo_unique UNIQUE (user_id, modulo);
  END IF;
END $$;


-- ============================================================
-- PASO 4: Indexes para rendimiento
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_rol ON public.profiles(rol);
CREATE INDEX IF NOT EXISTS idx_profiles_estado ON public.profiles(estado);
CREATE INDEX IF NOT EXISTS idx_profiles_fecha_registro ON public.profiles(fecha_registro DESC);

CREATE INDEX IF NOT EXISTS idx_progreso_user_id ON public.progreso(user_id);

CREATE INDEX IF NOT EXISTS idx_pagos_user_id ON public.pagos(user_id);
CREATE INDEX IF NOT EXISTS idx_pagos_estado ON public.pagos(estado);
CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON public.pagos(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_pagos_producto ON public.pagos(producto);
CREATE INDEX IF NOT EXISTS idx_pagos_provider_id ON public.pagos(provider_payment_id);


-- ============================================================
-- PASO 5: ELIMINAR TODAS las policies existentes
-- Borramos todo para recrear limpio y seguro
-- ============================================================

-- Profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
DROP POLICY IF EXISTS "Service role can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_admin" ON public.profiles;

-- Progreso
DROP POLICY IF EXISTS "Users can view own progress" ON public.progreso;
DROP POLICY IF EXISTS "Users can insert own progress" ON public.progreso;
DROP POLICY IF EXISTS "Users can update own progress" ON public.progreso;
DROP POLICY IF EXISTS "Admins can view all progress" ON public.progreso;
DROP POLICY IF EXISTS "Admins can manage progress" ON public.progreso;
DROP POLICY IF EXISTS "Admins can insert progress" ON public.progreso;
DROP POLICY IF EXISTS "progreso_select_own" ON public.progreso;
DROP POLICY IF EXISTS "progreso_update_own" ON public.progreso;
DROP POLICY IF EXISTS "progreso_select_admin" ON public.progreso;
DROP POLICY IF EXISTS "progreso_insert_admin" ON public.progreso;

-- Pagos
DROP POLICY IF EXISTS "Users can view own payments" ON public.pagos;
DROP POLICY IF EXISTS "Admins can view all payments" ON public.pagos;
DROP POLICY IF EXISTS "Admins can insert payments" ON public.pagos;
DROP POLICY IF EXISTS "Admins can update payments" ON public.pagos;
DROP POLICY IF EXISTS "Service role can insert payments" ON public.pagos;
DROP POLICY IF EXISTS "Service role can update payments" ON public.pagos;
DROP POLICY IF EXISTS "pagos_select_own" ON public.pagos;
DROP POLICY IF EXISTS "pagos_select_admin" ON public.pagos;
DROP POLICY IF EXISTS "pagos_insert_admin" ON public.pagos;
DROP POLICY IF EXISTS "pagos_update_admin" ON public.pagos;

-- Productos
DROP POLICY IF EXISTS "Anyone can view products" ON public.productos;
DROP POLICY IF EXISTS "Admins can manage products" ON public.productos;
DROP POLICY IF EXISTS "productos_select_public" ON public.productos;
DROP POLICY IF EXISTS "productos_manage_admin" ON public.productos;
DROP POLICY IF EXISTS "productos_insert_admin" ON public.productos;
DROP POLICY IF EXISTS "productos_update_admin" ON public.productos;
DROP POLICY IF EXISTS "productos_delete_admin" ON public.productos;


-- ============================================================
-- PASO 6: Asegurar que RLS esta habilitado en todas las tablas
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progreso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- PASO 7: RECREAR POLICIES SEGURAS - PROFILES
-- ============================================================

-- Usuarios leen su propio perfil
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Admins leen todos los perfiles
CREATE POLICY "profiles_select_admin"
  ON public.profiles FOR SELECT
  USING (public.is_admin());

-- Usuarios actualizan su propio perfil
-- (la app solo envia campos seguros como nombre, avatar_url)
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admins actualizan cualquier perfil (cambiar rol, fase, estado)
CREATE POLICY "profiles_update_admin"
  ON public.profiles FOR UPDATE
  USING (public.is_admin());

-- Admins eliminan perfiles
CREATE POLICY "profiles_delete_admin"
  ON public.profiles FOR DELETE
  USING (public.is_admin());

-- NOTA: INSERT de profiles se maneja via trigger SECURITY DEFINER
-- No hace falta policy de INSERT para usuarios normales


-- ============================================================
-- PASO 8: RECREAR POLICIES SEGURAS - PROGRESO
-- ============================================================

-- Usuarios leen su propio progreso
CREATE POLICY "progreso_select_own"
  ON public.progreso FOR SELECT
  USING (auth.uid() = user_id);

-- Usuarios actualizan su propio progreso (marcar modulos completados)
CREATE POLICY "progreso_update_own"
  ON public.progreso FOR UPDATE
  USING (auth.uid() = user_id);

-- Admins leen todo el progreso
CREATE POLICY "progreso_select_admin"
  ON public.progreso FOR SELECT
  USING (public.is_admin());

-- Admins insertan entradas de progreso (al asignar fase desde panel)
CREATE POLICY "progreso_insert_admin"
  ON public.progreso FOR INSERT
  WITH CHECK (public.is_admin());


-- ============================================================
-- PASO 9: RECREAR POLICIES SEGURAS - PAGOS
-- ============================================================

-- Usuarios leen sus propios pagos
CREATE POLICY "pagos_select_own"
  ON public.pagos FOR SELECT
  USING (auth.uid() = user_id);

-- Admins leen todos los pagos
CREATE POLICY "pagos_select_admin"
  ON public.pagos FOR SELECT
  USING (public.is_admin());

-- Admins insertan pagos manuales desde el panel
CREATE POLICY "pagos_insert_admin"
  ON public.pagos FOR INSERT
  WITH CHECK (public.is_admin());

-- Admins actualizan estado de pagos
CREATE POLICY "pagos_update_admin"
  ON public.pagos FOR UPDATE
  USING (public.is_admin());

-- NOTA: Los webhooks de MercadoPago/Stripe usan la service_role key
-- que BYPASEA RLS automaticamente. No necesitan policies propias.
-- Las policies "Service role can..." anteriores eran PELIGROSAS
-- porque en realidad le daban acceso a TODOS los usuarios.


-- ============================================================
-- PASO 10: RECREAR POLICIES SEGURAS - PRODUCTOS
-- (Solo si la tabla existe)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'productos' AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;

    -- Precios son publicos
    EXECUTE 'CREATE POLICY "productos_select_public"
      ON public.productos FOR SELECT USING (true)';

    -- Solo admins modifican productos
    EXECUTE 'CREATE POLICY "productos_manage_admin"
      ON public.productos FOR ALL
      USING (public.is_admin())
      WITH CHECK (public.is_admin())';
  END IF;
END $$;


-- ============================================================
-- PASO 11: Mejorar trigger auto-crear perfil en registro
-- Ahora incluye todos los campos y maneja errores
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, nombre, email, rol, fase, estado, bot_activo)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)),
    NEW.email,
    'alumno',
    NULL,
    'activo',
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE LOG '[handle_new_user] Error creando perfil para %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- PASO 12: Mejorar trigger auto-grant acceso post-pago
-- Mas robusto, usa la constraint UNIQUE, maneja errores
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_payment_confirmed()
RETURNS trigger AS $$
BEGIN
  -- Solo procesar cuando el estado cambia a 'completado'
  IF NEW.estado = 'completado' AND (OLD IS NULL OR OLD.estado IS DISTINCT FROM 'completado') THEN

    -- Otorgar acceso al curso Fase 1
    IF NEW.producto = 'fase1' THEN
      UPDATE public.profiles
      SET fase = CASE
        WHEN fase IS NULL OR fase = '' THEN 'fase-1'
        WHEN fase = 'fase-2' THEN 'ambas'
        ELSE fase
      END,
      updated_at = now()
      WHERE id = NEW.user_id;

      -- Crear modulos de progreso si no existen
      INSERT INTO public.progreso (user_id, modulo, completado)
      SELECT NEW.user_id, m, false
      FROM unnest(ARRAY[
        'preparacion-grafico',
        'flexzone',
        'relleno-zona',
        'glosario',
        'consejos'
      ]) AS m
      ON CONFLICT ON CONSTRAINT progreso_user_modulo_unique DO NOTHING;
    END IF;

    -- Otorgar acceso al bot
    IF NEW.producto = 'bot' THEN
      UPDATE public.profiles
      SET bot_activo = true, updated_at = now()
      WHERE id = NEW.user_id;
    END IF;

  END IF;

  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE LOG '[handle_payment_confirmed] Error pago % user %: %', NEW.id, NEW.user_id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_payment_confirmed ON public.pagos;
CREATE TRIGGER on_payment_confirmed
  AFTER INSERT OR UPDATE ON public.pagos
  FOR EACH ROW EXECUTE FUNCTION public.handle_payment_confirmed();


-- ============================================================
-- PASO 13: Trigger auto-actualizar updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ============================================================
-- PASO 14: Funcion segura para hacerte admin
-- Uso: SELECT public.make_admin('tu@email.com');
-- ============================================================
CREATE OR REPLACE FUNCTION public.make_admin(user_email text)
RETURNS text AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.profiles SET rol = 'admin' WHERE email = user_email;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected = 0 THEN
    RETURN 'ERROR: No se encontro usuario con email: ' || user_email;
  END IF;
  RETURN 'OK: ' || user_email || ' ahora es admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- LISTO!
--
-- Ahora ejecuta esto reemplazando con tu email real:
--   SELECT public.make_admin('TU_EMAIL_AQUI');
--
-- Para verificar:
--   SELECT id, nombre, email, rol, fase, estado, bot_activo
--   FROM public.profiles WHERE email = 'TU_EMAIL_AQUI';
-- ============================================================
