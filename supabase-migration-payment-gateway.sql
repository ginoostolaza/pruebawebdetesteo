-- ============================================================
-- MIGRATION: Payment Gateway Integration
-- MercadoPago (ARS) + Stripe (USD) - Auto-grant access
-- ============================================================

-- 1. Add bot_activo field to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS bot_activo boolean DEFAULT false;

-- 2. Add payment gateway fields to pagos table
ALTER TABLE public.pagos
ADD COLUMN IF NOT EXISTS provider text,
ADD COLUMN IF NOT EXISTS provider_payment_id text,
ADD COLUMN IF NOT EXISTS provider_status text,
ADD COLUMN IF NOT EXISTS producto text,
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

-- 3. Create products table for centralized pricing
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

-- 4. Insert product definitions
INSERT INTO public.productos (id, nombre, descripcion, precio_usd, precio_ars, tipo) VALUES
  ('fase1', 'Curso de Trading — Fase 1', 'Acceso completo al curso: 2 sistemas de trading, preparacion del grafico, glosario y consejos', 10.00, 9999.00, 'unico'),
  ('bot', 'Bot de Trading — Suscripcion Mensual', 'Bot automatizado configurado por Gino, opera 24/7', 5.00, 7500.00, 'suscripcion')
ON CONFLICT (id) DO UPDATE SET
  precio_usd = EXCLUDED.precio_usd,
  precio_ars = EXCLUDED.precio_ars;

-- 5. RLS for productos (public read, admin write)
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view products"
  ON public.productos FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage products"
  ON public.productos FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND rol = 'admin'
    )
  );

-- 6. Allow service role to insert payments (for webhooks)
-- This policy allows inserts when there's no auth context (service role)
CREATE POLICY "Service role can insert payments"
  ON public.pagos FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update payments"
  ON public.pagos FOR UPDATE
  USING (true);

-- 7. Allow service role to update profiles (for auto-granting access)
CREATE POLICY "Service role can update profiles"
  ON public.profiles FOR UPDATE
  USING (true);

-- 8. Function: Auto-grant access after payment confirmation
CREATE OR REPLACE FUNCTION public.handle_payment_confirmed()
RETURNS trigger AS $$
BEGIN
  -- Only process when payment status changes to 'completado'
  IF NEW.estado = 'completado' AND (OLD.estado IS NULL OR OLD.estado != 'completado') THEN
    -- Grant course access
    IF NEW.producto = 'fase1' THEN
      UPDATE public.profiles
      SET fase = CASE
        WHEN fase IS NULL THEN 'fase-1'
        WHEN fase = 'fase-2' THEN 'ambas'
        ELSE fase
      END
      WHERE id = NEW.user_id;

      -- Initialize progress modules if not exists
      INSERT INTO public.progreso (user_id, modulo, completado)
      SELECT NEW.user_id, m, false
      FROM unnest(ARRAY['preparacion-grafico', 'flexzone', 'relleno-zona', 'glosario', 'consejos']) AS m
      ON CONFLICT DO NOTHING;
    END IF;

    -- Grant bot access
    IF NEW.producto = 'bot' THEN
      UPDATE public.profiles
      SET bot_activo = true
      WHERE id = NEW.user_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Trigger: fire after payment insert or update
DROP TRIGGER IF EXISTS on_payment_confirmed ON public.pagos;
CREATE TRIGGER on_payment_confirmed
  AFTER INSERT OR UPDATE ON public.pagos
  FOR EACH ROW EXECUTE FUNCTION public.handle_payment_confirmed();

-- ============================================================
-- NOTE: After running this migration, you need to configure:
-- 1. MercadoPago: Get your Access Token from https://www.mercadopago.com.ar/developers
-- 2. Stripe: Get your API keys from https://dashboard.stripe.com/apikeys
-- 3. Set environment variables in Netlify (Site Settings > Environment Variables):
--    - MERCADOPAGO_ACCESS_TOKEN
--    - STRIPE_SECRET_KEY
--    - STRIPE_WEBHOOK_SECRET
--    - SUPABASE_SERVICE_ROLE_KEY (from Supabase > Settings > API > service_role)
--    - SUPABASE_URL (your Supabase project URL)
--    - SITE_URL (your Netlify site URL, e.g. https://tudominio.netlify.app)
-- ============================================================
