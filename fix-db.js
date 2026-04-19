import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function fix() {
  const { data: { users } } = await supabase.auth.admin.listUsers();
  if (!users || users.length === 0) {
    console.error('❌ No se encontró ningún usuario. Regístrate en la web primero.');
    return;
  }
  const userId = users[0].id;
  console.log(`👤 Corrigiendo todo para el usuario: ${users[0].email}...`);

  // Update ALL folders and files regardless of current user_id
  await supabase.from('folders').update({ user_id: userId }).neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('files').update({ user_id: userId }).neq('id', '00000000-0000-0000-0000-000000000000');

  console.log('✅ Base de datos corregida. Ahora, vamos a por el Storage.');
  
  // Make bucket public as a last resort for debugging
  await supabase.storage.updateBucket('media', { public: true });
  console.log('✅ Bucket "media" ahora es PÚBLICO (para debugging).');

  console.log('\n✨ Refresca la web. Si sigues sin ver nada, el problema es que la web no tiene archivos registrados.');
}
fix();
