import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_DIR = path.join(__dirname, '..', 'recuperacion', 'recup_dir.1');
const COMPRESSED_DIR = path.join(BASE_DIR, 'compressed');

// Credentials
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const USER_ID = process.env.VITE_USER_ID;

const s3Client = new S3Client({
  endpoint: `https://${process.env.VITE_S3_ENDPOINT}`,
  region: "us-east-005",
  credentials: {
    accessKeyId: process.env.VITE_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.VITE_S3_SECRET_ACCESS_KEY,
  },
});
const BUCKET_NAME = process.env.VITE_S3_BUCKET_NAME;

const supabase = createClient(supabaseUrl, supabaseKey);

async function uploadFile(folder, fileName) {
  const localDir = path.join(BASE_DIR, folder);
  const compressedPath = path.join(COMPRESSED_DIR, fileName);
  
  let filePath = path.join(localDir, fileName);
  if (fs.existsSync(compressedPath)) {
    console.log(`   📦 Using compressed version for ${fileName}`);
    filePath = compressedPath;
  }

  const fileBuffer = fs.readFileSync(filePath);
  const storagePath = `${folder}/${fileName}`;
  const fileExt = path.extname(fileName).toLowerCase();
  const type = ['.mp4', '.mov', '.avi', '.mkv'].includes(fileExt) ? 'video' : 'image';

  try {
    // 1. Upload to B2
    console.log(`   📤 Uploading ${fileName} to B2...`);
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: storagePath,
      Body: fileBuffer,
      ContentType: type === 'video' ? 'video/mp4' : 'image/jpeg',
    }));

    // 2. Get folder ID
    const { data: folderData } = await supabase
      .from('folders')
      .select('id')
      .eq('name', folder)
      .maybeSingle();

    let folderId = folderData?.id;
    if (!folderId) {
      const { data: newFolder } = await supabase
        .from('folders')
        .insert({ name: folder, user_id: USER_ID })
        .select()
        .single();
      folderId = newFolder.id;
    }

    // 3. Register in DB
    const { error: dbError } = await supabase
      .from('files')
      .upsert({
        folder_id: folderId,
        name: fileName,
        storage_path: storagePath,
        type: type,
        user_id: USER_ID
      }, { onConflict: 'storage_path' });

    if (dbError) throw dbError;
    console.log(`   ✅ Success`);

  } catch (error) {
    console.error(`   ❌ Failed ${fileName}:`, error.message);
  }
}

async function migrate() {
  console.log('🚀 Starting B2 Migration...');
  const folders = ['3d', 'fotos', 'grabaciones', 'mejores', 'otros'];

  for (const folder of folders) {
    const folderPath = path.join(BASE_DIR, folder);
    if (!fs.existsSync(folderPath)) continue;

    console.log(`\n📁 Processing folder: ${folder}`);
    const files = fs.readdirSync(folderPath).filter(f => f !== '.DS_Store' && fs.statSync(path.join(folderPath, f)).isFile());

    for (const file of files) {
      await uploadFile(folder, file);
    }
  }
  console.log('\n✨ Migration complete!');
}

migrate();
