console.error('fix-db.js pertenece al esquema antiguo de carpetas/archivos y no debe ejecutarse con la app actual.')
console.error('Configura el esquema nuevo con supabase_setup.sql desde el SQL Editor de Supabase.')
process.exitCode = 1