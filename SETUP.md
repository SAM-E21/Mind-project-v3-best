# Puesta en marcha

## Servicios

La versión actual utiliza Supabase Auth para las cuentas, Postgres para las tareas y metadatos de la bóveda, y un bucket privado de Supabase Storage para los blobs cifrados. Usar un único servicio simplifica el primer despliegue; el cliente no necesita credenciales de administrador ni acceso a Google Drive.

## Configuración

1. Crea o recupera un proyecto Supabase y habilita Email/Password en Authentication.
2. En `web/.env.local`, configura solo las variables públicas del navegador:

   ```env
   VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
   VITE_SUPABASE_ANON_KEY=TU_CLAVE_PUBLICA
   VITE_VAULT_LOGIN_EMAIL=CORREO_DE_ACCESO_ESPECIAL
   ```

3. Ejecuta `supabase_setup.sql` desde el SQL Editor del proyecto. Esto crea tablas, políticas RLS y el bucket privado `vault`.
4. En Supabase Dashboard > Edge Functions > Secrets, configura `VAULT_LOGIN_EMAIL`, `VAULT_LOGIN_PASSWORD` y `GEMINI_API_KEY`. Usa una contraseña nueva: la que se compartió en el chat debe considerarse expuesta. `GEMINI_MODEL` es opcional; por defecto se usa `gemini-3.8-flash`. Si ya guardaste un nombre de modelo distinto, elimínalo o actualízalo. Luego, desde `web/`, inicia sesión en Supabase CLI, enlaza el proyecto y despliega las funciones:

   ```powershell
   npx supabase login
   npx supabase link --project-ref TU_PROJECT_REF
   npx supabase functions deploy vault-first-login --no-verify-jwt
   npx supabase functions deploy vault-credential
   npx supabase functions deploy vault-ai-chat
   ```

   `vault-first-login` valida el primer par en servidor, crea la cuenta Auth si aún no existe y concede acceso a la bóveda; bloquea 15 minutos después de cinco intentos fallidos. `vault-credential` verifica la segunda clave, devuelve un ticket temporal y permite derivar localmente la clave AES. `vault-ai-chat` exige ese ticket antes de aceptar mensajes y llamar al proveedor.
5. Instala y ejecuta el frontend desde `web/`:

   ```powershell
   npm install
   npm run dev
   ```

6. La cuenta especial se crea automáticamente al primer acceso correcto. Las demás cuentas se crean desde la pantalla de registro. Después de iniciar sesión con la cuenta autorizada, configura la segunda clave y guarda una copia del `.csdk`; también puedes escribirla en NFC.

## Cifrado y límites

Las tareas se guardan como texto normal. Los archivos y metadatos de la bóveda se cifran en el navegador con AES-GCM antes de subirse. La contraseña del primer acceso no es la clave de descifrado: el servidor la valida y solo la segunda clave deriva localmente la clave AES. La segunda clave se envía por HTTPS a la Edge Function para verificarla; se guarda solo un verificador PBKDF2 en una tabla inaccesible al cliente, nunca la clave en texto plano.

Las conversaciones de agentes se cifran con la clave de la bóveda al guardarse en `vault_conversations`. Al pedir una respuesta, el texto de los últimos mensajes se envía a Gemini a través de la Edge Function. Si eliges adjuntar una foto, solo esa imagen se descifra y se envía con esa solicitud; ninguna otra foto ni video se adjunta automáticamente. Revisa las condiciones de privacidad y retención del proveedor antes de enviar información sensible.

El archivo `.csdk` y el registro NFC contienen la clave secreta en texto legible para el dispositivo que los lea. Protégelos como una copia de la clave. Las etiquetas NFC comunes se pueden copiar; NFC es una alternativa práctica de acceso, no un factor resistente a clonación. Web NFC requiere HTTPS y compatibilidad del navegador/dispositivo, normalmente Chrome en Android.

Si pierdes la clave, el archivo `.csdk` y todas las etiquetas NFC, los archivos no se pueden recuperar desde Supabase. Guarda respaldos separados y prueba la recuperación antes de subir datos importantes.

El navegador puede modificarse por su propio usuario, pero saltar la interfaz no elimina el cifrado: los archivos siguen requiriendo la clave correcta para descifrarse. La verificación del secreto y el límite de intentos se hacen en la Edge Function. No guardes contraseñas maestras ni claves de servicio en el frontend.

## Variables de servidor

Nunca uses una clave `service_role` en una variable `VITE_*`. Las claves con ese prefijo pueden exponerse al cliente. Para scripts Node que realmente necesiten administración, usa una variable privada como `SUPABASE_SERVICE_ROLE_KEY`, que no tenga prefijo `VITE_`, y no la despliegues con el frontend.
