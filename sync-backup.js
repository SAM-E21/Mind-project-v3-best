import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY; 
const supabase = createClient(supabaseUrl, supabaseKey);

const BACKUP_DIR = path.join(__dirname, 'backups');

async function sync() {
  console.log('🔄 Checking for new files in Supabase...');

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  // 1. Fetch all files from DB
  const { data: dbFiles, error } = await supabase
    .from('files')
    .select('name, storage_path');

  if (error) {
    console.error('❌ Error fetching file list:', error.message);
    return;
  }

  console.log(`📡 Found ${dbFiles.length} files in cloud.`);

  for (const file of dbFiles) {
    const localPath = path.join(BACKUP_DIR, file.storage_path);
    const localDir = path.dirname(localPath);

    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }

    if (!fs.existsSync(localPath)) {
      console.log(`   ⬇️ Downloading new file: ${file.name}...`);
      
      const { data, error: dlError } = await supabase.storage
        .from('media')
        .download(file.storage_path);

      if (dlError) {
        console.error(`   ❌ Failed to download ${file.name}:`, dlError.message);
        continue;
      }

      const buffer = Buffer.from(await data.arrayBuffer());
      fs.writeFileSync(localPath, buffer);
      console.log(`   ✅ Saved to ${localPath}`);
    }
  }

  console.log('🏁 Sync complete. All files are backed up locally.');
}

sync();
