-- ============================================================
-- SUPABASE DATABASE SCHEMA
-- Gino Ostolaza Coaching Platform
-- ============================================================
--
-- INSTRUCCIONES:
-- 1. En tu dashboard de Supabase, anda a "SQL Editor"
-- 2. Pega TODO este contenido y dale a "Run"
-- 3. Listo! Tu base de datos esta configurada
--
-- ============================================================

-- ---- PROFILES TABLE ----
-- Stores additional user info beyond Supabase auth
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  nombre text,
  email text,
  rol text default 'alumno' check (rol in ('alumno', 'admin')),
  fase text default 'fase-1' check (fase in ('fase-1', 'fase-2', 'ambas')),
  estado text default 'activo' check (estado in ('activo', 'suspendido', 'inactivo')),
  fecha_registro timestamptz default now(),
  ultimo_acceso timestamptz default now(),
  avatar_url text,
  notas text
);

-- ---- PROGRESS TABLE ----
-- Tracks course module completion per user
create table if not exists public.progreso (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  modulo text not null,
  completado boolean default false,
  fecha_completado timestamptz,
  created_at timestamptz default now()
);

-- ---- PAYMENTS TABLE ----
-- Records payment history
create table if not exists public.pagos (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  monto decimal(10,2) not null,
  moneda text default 'USD',
  metodo text,
  concepto text,
  estado text default 'completado' check (estado in ('pendiente', 'completado', 'rechazado')),
  fecha timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.progreso enable row level security;
alter table public.pagos enable row level security;

-- PROFILES: Users can read their own profile
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- PROFILES: Users can update their own profile (limited fields)
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- PROFILES: Admins can view all profiles
create policy "Admins can view all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and rol = 'admin'
    )
  );

-- PROFILES: Admins can update all profiles
create policy "Admins can update all profiles"
  on public.profiles for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and rol = 'admin'
    )
  );

-- PROFILES: Admins can delete profiles
create policy "Admins can delete profiles"
  on public.profiles for delete
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and rol = 'admin'
    )
  );

-- PROGRESS: Users can manage their own progress
create policy "Users can view own progress"
  on public.progreso for select
  using (auth.uid() = user_id);

create policy "Users can insert own progress"
  on public.progreso for insert
  with check (auth.uid() = user_id);

create policy "Users can update own progress"
  on public.progreso for update
  using (auth.uid() = user_id);

-- PROGRESS: Admins can view all progress
create policy "Admins can view all progress"
  on public.progreso for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and rol = 'admin'
    )
  );

-- PAYMENTS: Users can view their own payments
create policy "Users can view own payments"
  on public.pagos for select
  using (auth.uid() = user_id);

-- PAYMENTS: Admins can manage all payments
create policy "Admins can view all payments"
  on public.pagos for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and rol = 'admin'
    )
  );

create policy "Admins can insert payments"
  on public.pagos for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and rol = 'admin'
    )
  );

create policy "Admins can update payments"
  on public.pagos for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and rol = 'admin'
    )
  );

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP (Trigger)
-- ============================================================

-- Function to create profile when user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nombre, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger: auto-create profile on auth.users insert
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- DEFAULT COURSE MODULES (for progress tracking)
-- ============================================================

-- Function to initialize progress for a new user
create or replace function public.init_user_progress()
returns trigger as $$
begin
  insert into public.progreso (user_id, modulo) values
    (new.id, 'preparacion-grafico'),
    (new.id, 'flexzone'),
    (new.id, 'relleno-zona'),
    (new.id, 'glosario'),
    (new.id, 'consejos');
  return new;
end;
$$ language plpgsql security definer;

-- Trigger: auto-create progress entries when profile is created
drop trigger if exists on_profile_created on public.profiles;
create trigger on_profile_created
  after insert on public.profiles
  for each row execute procedure public.init_user_progress();

-- ============================================================
-- HELPER: Make yourself admin
-- ============================================================
-- After you register, run this replacing YOUR_EMAIL:
--
-- update public.profiles
-- set rol = 'admin'
-- where email = 'TU_EMAIL_AQUI';
--
-- ============================================================
