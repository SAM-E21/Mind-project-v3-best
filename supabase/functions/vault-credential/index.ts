import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const encoder = new TextEncoder()

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function toBase64(bytes: Uint8Array) {
  let value = ''
  for (const byte of bytes) value += String.fromCharCode(byte)
  return btoa(value)
}

function fromBase64(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

async function deriveVerifier(secret: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
    material,
    256,
  ))
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index]
  return difference === 0
}

async function createVaultSession(admin: ReturnType<typeof createClient>, userId: string) {
  const rawToken = crypto.getRandomValues(new Uint8Array(32))
  const token = toBase64(rawToken).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
  const tokenHash = toBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(token))))
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString()
  const { error: cleanupError } = await admin.from('vault_sessions').delete().lt('expires_at', now.toISOString())
  if (cleanupError) throw cleanupError
  const { error: insertError } = await admin.from('vault_sessions').insert({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  })
  if (insertError) throw insertError
  return token
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('Authorization')
  if (!url || !anonKey || !serviceRoleKey || !authorization) return response({ error: 'Unauthorized' }, 401)

  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return response({ error: 'Unauthorized' }, 401)

  const admin = createClient(url, serviceRoleKey)
  const { data: access } = await admin.from('vault_access').select('user_id').eq('user_id', userData.user.id).maybeSingle()
  if (!access) return response({ error: 'Vault access is not enabled for this account.' }, 403)

  let body: { action?: string; secret?: string; salt?: string }
  try {
    body = await request.json()
  } catch {
    return response({ error: 'Invalid request.' }, 400)
  }
  if (!body.secret || body.secret.length < 16 || body.secret.length > 512) return response({ error: 'Invalid credential.' }, 400)

  if (body.action === 'register') {
    if (!body.salt) return response({ error: 'Missing salt.' }, 400)
    let salt: Uint8Array
    try {
      salt = fromBase64(body.salt)
    } catch {
      return response({ error: 'Invalid salt.' }, 400)
    }
    if (salt.length !== 16) return response({ error: 'Invalid salt.' }, 400)

    const { data: existing } = await admin.from('vault_config').select('user_id').eq('user_id', userData.user.id).maybeSingle()
    if (existing) return response({ error: 'Vault is already configured.' }, 409)

    const verifier = toBase64(await deriveVerifier(body.secret, salt))
    const { error: configError } = await admin.from('vault_config').insert({ user_id: userData.user.id, salt: body.salt })
    if (configError) return response({ error: 'Could not create vault.' }, 500)
    const { error: credentialError } = await admin.from('vault_credential').insert({ user_id: userData.user.id, verifier })
    if (credentialError) {
      await admin.from('vault_config').delete().eq('user_id', userData.user.id)
      return response({ error: 'Could not create vault.' }, 500)
    }
    await admin.from('vault_attempts').delete().eq('user_id', userData.user.id)
    try {
      const vaultSession = await createVaultSession(admin, userData.user.id)
      return response({ valid: true, salt: body.salt, vaultSession })
    } catch {
      return response({ error: 'Could not open vault session.' }, 500)
    }
  }

  if (body.action !== 'verify') return response({ error: 'Unknown action.' }, 400)

  const now = new Date()
  const { data: attempts } = await admin.from('vault_attempts').select('failure_count, locked_until').eq('user_id', userData.user.id).maybeSingle()
  if (attempts?.locked_until && new Date(attempts.locked_until) > now) {
    return response({ error: 'Demasiados intentos. Espera 15 minutos antes de volver a probar.' }, 429)
  }

  const [{ data: config }, { data: credential }] = await Promise.all([
    admin.from('vault_config').select('salt').eq('user_id', userData.user.id).maybeSingle(),
    admin.from('vault_credential').select('verifier').eq('user_id', userData.user.id).maybeSingle(),
  ])
  if (!config || !credential) return response({ error: 'La bóveda aún no está configurada.' }, 404)

  const expected = fromBase64(credential.verifier)
  const actual = await deriveVerifier(body.secret, fromBase64(config.salt))
  if (!constantTimeEqual(actual, expected)) {
    const failures = (attempts?.failure_count || 0) + 1
    await admin.from('vault_attempts').upsert({
      user_id: userData.user.id,
      failure_count: failures >= 5 ? 0 : failures,
      locked_until: failures >= 5 ? new Date(now.getTime() + 15 * 60 * 1000).toISOString() : null,
      updated_at: now.toISOString(),
    })
    return response({ error: 'La clave no coincide.' }, 401)
  }

  await admin.from('vault_attempts').delete().eq('user_id', userData.user.id)
  try {
    const vaultSession = await createVaultSession(admin, userData.user.id)
    return response({ valid: true, salt: config.salt, vaultSession })
  } catch {
    return response({ error: 'Could not open vault session.' }, 500)
  }
})
