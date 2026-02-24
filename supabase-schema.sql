-- ============================================================
-- SUPABASE DATABASE SCHEMA (Referencia completa)
-- Gino Ostolaza Coaching Platform
-- ============================================================
--
-- Este archivo es la REFERENCIA COMPLETA del estado final
-- de la base de datos. Si estas empezando de cero, ejecuta
-- este archivo en Supabase > SQL Editor.
--
-- Si ya tenes la DB creada, ejecuta las migraciones en orden:
--   1. supabase-migration-payment-gateway.sql
--   2. supabase-migration-no-default-access.sql
--   3. supabase-migration-security-fix.sql  (ESTE ES EL IMPORTANTE)
--
-- ============================================================


-- ============================================================
-- FUNCION HELPER: Verificar si el usuario actual es admin
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND rol = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ============================================================
-- TABLA: profiles
-- Datos del usuario mas alla de la auth de Supabase
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  nombre text,
  email text,
  rol text DEFAULT 'alumno' CHECK (rol IN ('alumno', 'admin')),
  fase text DEFAULT NULL CHECK (fase IS NULL OR fase IN ('fase-1', 'fase-2', 'ambas')),
  estado text DEFAULT 'activo' CHECK (estado IN ('activo', 'suspendido', 'inactivo')),
  bot_activo boolean DEFAULT false,
  fecha_registro timestamptz DEFAULT now(),
  ultimo_acceso timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  avatar_url text,
  notas text
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_rol ON public.profiles(rol);
CREATE INDEX IF NOT EXISTS idx_profiles_estado ON public.profiles(estado);
CREATE INDEX IF NOT EXISTS idx_profiles_fecha_registro ON public.profiles(fecha_registro DESC);


-- ============================================================
-- TABLA: progreso
-- Progreso de modulos del curso por usuario
-- ============================================================
CREATE TABLE IF NOT EXISTS public.progreso (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  modulo text NOT NULL,
  completado boolean DEFAULT false,
  fecha_completado timestamptz,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT progreso_user_modulo_unique UNIQUE (user_id, modulo)
);

CREATE INDEX IF NOT EXISTS idx_progreso_user_id ON public.progreso(user_id);


-- ============================================================
-- TABLA: pagos
-- Historial de pagos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pagos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  monto decimal(10,2) NOT NULL,
  moneda text DEFAULT 'USD',
  metodo text,
  concepto text,
  estado text DEFAULT 'completado' CHECK (estado IN ('pendiente', 'completado', 'rechazado')),
  fecha timestamptz DEFAULT now(),
  provider text,
  provider_payment_id text,
  provider_status text,
  producto text,
  metadata jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_pagos_user_id ON public.pagos(user_id);
CREATE INDEX IF NOT EXISTS idx_pagos_estado ON public.pagos(estado);
CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON public.pagos(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_pagos_producto ON public.pagos(producto);
CREATE INDEX IF NOT EXISTS idx_pagos_provider_id ON public.pagos(provider_payment_id);


-- ============================================================
-- TABLA: productos
-- Catalogo de productos con precios
-- ============================================================
CREATE TABLE IF NOT EXISTS public.productos (
  id text PRIMARY KEY,
  nombre text NOT NULL,
  descripcion text,
  precio_usd decimal(10,2) NOT NULL,
  precio_ars decimal(10,2) NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('unico', 'suscripcion')),
  activo boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'
);

INSERT INTO public.productos (id, nombre, descripcion, precio_usd, precio_ars, tipo) VALUES
  ('fase1', 'Curso de Trading — Fase 1', 'Acceso completo: 2 sistemas, preparacion del grafico, glosario y consejos', 10.00, 9999.00, 'unico'),
  ('bot', 'Bot de Trading — Suscripcion Mensual', 'Bot automatizado configurado por Gino, opera 24/7', 5.00, 7500.00, 'suscripcion')
ON CONFLICT (id) DO UPDATE SET
  precio_usd = EXCLUDED.precio_usd,
  precio_ars = EXCLUDED.precio_ars;


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progreso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;

-- ---- PROFILES ----
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_select_admin"
  ON public.profiles FOR SELECT
  USING (public.is_admin());

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_admin"
  ON public.profiles FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "profiles_delete_admin"
  ON public.profiles FOR DELETE
  USING (public.is_admin());

-- ---- PROGRESO ----
CREATE POLICY "progreso_select_own"
  ON public.progreso FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "progreso_update_own"
  ON public.progreso FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "progreso_select_admin"
  ON public.progreso FOR SELECT
  USING (public.is_admin());

CREATE POLICY "progreso_insert_admin"
  ON public.progreso FOR INSERT
  WITH CHECK (public.is_admin());

-- ---- PAGOS ----
CREATE POLICY "pagos_select_own"
  ON public.pagos FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "pagos_select_admin"
  ON public.pagos FOR SELECT
  USING (public.is_admin());

CREATE POLICY "pagos_insert_admin"
  ON public.pagos FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "pagos_update_admin"
  ON public.pagos FOR UPDATE
  USING (public.is_admin());

-- ---- PRODUCTOS ----
CREATE POLICY "productos_select_public"
  ON public.productos FOR SELECT
  USING (true);

CREATE POLICY "productos_manage_admin"
  ON public.productos FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ============================================================
-- TRIGGERS Y FUNCIONES
-- ============================================================

-- Auto-crear perfil cuando se registra un usuario
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


-- Auto-otorgar acceso cuando un pago se completa
CREATE OR REPLACE FUNCTION public.handle_payment_confirmed()
RETURNS trigger AS $$
BEGIN
  IF NEW.estado = 'completado' AND (OLD IS NULL OR OLD.estado IS DISTINCT FROM 'completado') THEN

    IF NEW.producto = 'fase1' THEN
      UPDATE public.profiles
      SET fase = CASE
        WHEN fase IS NULL OR fase = '' THEN 'fase-1'
        WHEN fase = 'fase-2' THEN 'ambas'
        ELSE fase
      END,
      updated_at = now()
      WHERE id = NEW.user_id;

      INSERT INTO public.progreso (user_id, modulo, completado)
      SELECT NEW.user_id, m, false
      FROM unnest(ARRAY[
        'preparacion-grafico', 'flexzone', 'relleno-zona', 'glosario', 'consejos'
      ]) AS m
      ON CONFLICT ON CONSTRAINT progreso_user_modulo_unique DO NOTHING;
    END IF;

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


-- Auto-actualizar updated_at en profiles
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
-- HELPER: Hacerte admin
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
-- DESPUES DE EJECUTAR, hacete admin:
--   SELECT public.make_admin('tu@email.com');
-- ============================================================
