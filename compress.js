import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_DIR = path.join(__dirname, '..', 'recuperacion', 'recup_dir.1');
const COMPRESSED_DIR = path.join(BASE_DIR, 'compressed');
const targetSizeMB = 48;

// --- ESTRATEGIA DE RUTA PARA WINDOWS ---
const wingetLinks = 'C:\\Users\\Hp\\AppData\\Local\\Microsoft\\WinGet\\Links';
const ffmpegExe = path.join(wingetLinks, 'ffmpeg.exe');
const ffprobeExe = path.join(wingetLinks, 'ffprobe.exe');

if (fs.existsSync(ffmpegExe)) {
  ffmpeg.setFfmpegPath(ffmpegExe);
  console.log(`📍 FFmpeg encontrado en: ${ffmpegExe}`);
}
if (fs.existsSync(ffprobeExe)) {
  ffmpeg.setFfprobePath(ffprobeExe);
  console.log(`📍 FFprobe encontrado en: ${ffprobeExe}`);
}

if (!fs.existsSync(COMPRESSED_DIR)) {
  fs.mkdirSync(COMPRESSED_DIR, { recursive: true });
}

async function compressVideo(folder, filename) {
  const inputPath = path.join(BASE_DIR, folder, filename);
  const outputPath = path.join(COMPRESSED_DIR, filename);

  if (fs.existsSync(outputPath)) {
    console.log(`Skipping ${filename}, already exists.`);
    return;
  }

  console.log(`\n🎬 Comprimiendo: ${filename}...`);

  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        console.error(`❌ Error de ffprobe en ${filename}:`, err.message);
        return reject(err);
      }

      const duration = metadata.format.duration;
      const targetBitrate = Math.floor((targetSizeMB * 8192) / duration) - 128;

      ffmpeg(inputPath)
        .outputOptions([
          `-b:v ${targetBitrate}k`,
          '-vcodec libx264',
          '-acodec aac',
          '-b:a 128k',
          '-preset fast'
        ])
        .output(outputPath)
        .on('end', () => {
          console.log(`✅ ¡Éxito! -> ${filename}`);
          resolve();
        })
        .on('error', (err) => {
          console.error(`❌ Falló la compresión de ${filename}:`, err.message);
          reject(err);
        })
        .run();
    });
  });
}

async function main() {
  const folders = ['3d', 'fotos', 'grabaciones', 'mejores', 'otros'];
  for (const folder of folders) {
    const folderPath = path.join(BASE_DIR, folder);
    if (!fs.existsSync(folderPath)) continue;

    const files = fs.readdirSync(folderPath).filter(f => 
      ['.mp4', '.mov', '.avi', '.mkv'].includes(path.extname(f).toLowerCase())
    );

    for (const file of files) {
      try { await compressVideo(folder, file); } catch (e) {}
    }
  }
}

main();
