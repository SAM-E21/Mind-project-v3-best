import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, authorization, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const encoder = new TextEncoder()

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function constantTimeEqual(left: string, right: string) {
  const leftBytes = encoder.encode(left)
  const rightBytes = encoder.encode(right)
  if (leftBytes.length !== rightBytes.length) return false
  let difference = 0
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index]
  return difference === 0
}

async function getAttemptKey(email: string, address: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(`${email}\0${address}`)))
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const expectedEmail = Deno.env.get('VAULT_LOGIN_EMAIL')?.trim().toLowerCase()
  const expectedPassword = Deno.env.get('VAULT_LOGIN_PASSWORD')
  if (!url || !serviceRoleKey || !expectedEmail || !expectedPassword) {
    return response({ error: 'El acceso especial no está configurado.' }, 503)
  }

  let body: { email?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return response({ error: 'Solicitud inválida.' }, 400)
  }
  const email = body.email?.trim().toLowerCase() || ''
  const password = body.password || ''
  if (!email || password.length < 1 || password.length > 256) return response({ error: 'Correo o contraseña incorrectos.' }, 401)

  const admin = createClient(url, serviceRoleKey)
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  const attemptKey = await getAttemptKey(email, forwardedFor)
  const now = new Date()
  const { data: attempt, error: attemptReadError } = await admin
    .from('vault_login_attempts')
    .select('failure_count, locked_until')
    .eq('attempt_key', attemptKey)
    .maybeSingle()
  if (attemptReadError) return response({ error: 'No se pudo validar el acceso.' }, 503)
  if (attempt?.locked_until && new Date(attempt.locked_until) > now) {
    return response({ error: 'Demasiados intentos. Espera 15 minutos.' }, 429)
  }

  const credentialsMatch = constantTimeEqual(email, expectedEmail) && constantTimeEqual(password, expectedPassword)
  if (!credentialsMatch) {
    const previousFailures = attempt?.locked_until ? 0 : attempt?.failure_count || 0
    const failures = previousFailures + 1
    const locked = failures >= 5
    const { error: attemptWriteError } = await admin.from('vault_login_attempts').upsert({
      attempt_key: attemptKey,
      failure_count: locked ? 5 : failures,
      locked_until: locked ? new Date(now.getTime() + 15 * 60 * 1000).toISOString() : null,
      updated_at: now.toISOString(),
    })
    if (attemptWriteError) return response({ error: 'No se pudo validar el acceso.' }, 503)
    return response({ error: 'Correo o contraseña incorrectos.' }, 401)
  }

  const { data: listedUsers, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listError) return response({ error: 'No se pudo preparar la cuenta.' }, 503)
  let user = listedUsers.users.find(item => item.email?.toLowerCase() === expectedEmail)

  if (!user) {
    const { data, error: createError } = await admin.auth.admin.createUser({
      email: expectedEmail,
      password,
      email_confirm: true,
    })
    if (createError || !data.user) return response({ error: 'No se pudo crear la cuenta.' }, 503)
    user = data.user
  } else {
    const { data, error: updateError } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true })
    if (updateError || !data.user) return response({ error: 'No se pudo preparar la cuenta.' }, 503)
    user = data.user
  }

  const [{ error: accessError }, { error: attemptsDeleteError }] = await Promise.all([
    admin.from('vault_access').upsert({ user_id: user.id }),
    admin.from('vault_login_attempts').delete().eq('attempt_key', attemptKey),
  ])
  if (accessError || attemptsDeleteError) return response({ error: 'No se pudo habilitar la cuenta.' }, 503)

  return response({ authorized: true })
})
