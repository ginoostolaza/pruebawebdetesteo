/* ============================================================
   SUPABASE CONFIG
   ============================================================

   INSTRUCCIONES PARA CONFIGURAR:

   1. Anda a https://supabase.com y crea una cuenta gratis
   2. Crea un nuevo proyecto (elige una region cercana, ej: South America)
   3. Espera a que se cree el proyecto (~2 minutos)
   4. Anda a Project Settings > API
   5. Copia tu "Project URL" y pegala en SUPABASE_URL
   6. Copia tu "anon public" key y pegala en SUPABASE_ANON_KEY
   7. Listo! Tu sistema de auth ya funciona

   CONFIGURAR AUTENTICACION:
   - En el dashboard de Supabase, anda a Authentication > Settings
   - En "Site URL" pone tu URL de Netlify (ej: https://tudominio.netlify.app)
   - En "Redirect URLs" agrega: https://tudominio.netlify.app/dashboard.html

   ============================================================ */

const SUPABASE_URL = 'https://fabfhxreglyonjehvneu.supabase.co';
const SUPABASE_ANON_KEY = 'TU_SUPABASE_ANON_KEY_AQUI'; // Pega tu anon key aqui (empieza con eyJ...)
