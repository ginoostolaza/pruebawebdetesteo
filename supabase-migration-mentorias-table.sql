-- ============================================================
-- MIGRACIÓN: Crear tabla mentorias
-- Fecha: 2026-03-04
-- Descripción: Crea la tabla 'mentorias' necesaria para el
--              panel de administración de sesiones de mentoría.
-- ============================================================
--
-- INSTRUCCIONES:
-- Ejecutar en Supabase > SQL Editor
-- Requiere que ya exista la función public.is_admin()
-- (incluida en supabase-schema.sql)
-- ============================================================

-- ============================================================
-- TABLA: mentorias
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mentorias (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  titulo text NOT NULL,
  descripcion text,
  fecha date NOT NULL,
  hora time NOT NULL,
  link_zoom text NOT NULL,
  visible boolean DEFAULT true,
  acceso_requerido text DEFAULT 'ambas' CHECK (acceso_requerido IN ('fase-1', 'ambas')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Índices para mejorar performance en consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_mentorias_fecha ON public.mentorias(fecha);
CREATE INDEX IF NOT EXISTS idx_mentorias_visible ON public.mentorias(visible);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE public.mentorias ENABLE ROW LEVEL SECURITY;

-- Alumnos autenticados pueden ver mentorías visibles
CREATE POLICY "Alumnos pueden ver mentorias visibles"
  ON public.mentorias FOR SELECT
  TO authenticated
  USING (visible = true);

-- Admins pueden ver todas las mentorías (incluso las no visibles)
CREATE POLICY "Admins pueden ver todas las mentorias"
  ON public.mentorias FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Solo admins pueden insertar nuevas mentorías
CREATE POLICY "Admins pueden crear mentorias"
  ON public.mentorias FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- Solo admins pueden actualizar mentorías existentes
CREATE POLICY "Admins pueden actualizar mentorias"
  ON public.mentorias FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- Solo admins pueden eliminar mentorías
CREATE POLICY "Admins pueden eliminar mentorias"
  ON public.mentorias FOR DELETE
  TO authenticated
  USING (public.is_admin());
