import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-vault-session',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const encoder = new TextEncoder()

const agents: Record<string, { name: string; instruction: string }> = {
  assistant: {
    name: 'Asistente',
    instruction: 'Ayuda con claridad y criterio. Responde en el idioma del usuario y pregunta si falta contexto.',
  },
  organizer: {
    name: 'Organizador',
    instruction: 'Ayuda a ordenar ideas, convertirlas en pasos concretos y priorizar sin asumir acceso a archivos.',
  },
  analyst: {
    name: 'Analista',
    instruction: 'Analiza la información que el usuario escribe, separa hechos de supuestos y explica incertidumbres.',
  },
  creative: {
    name: 'Creativo',
    instruction: 'Propón ideas variadas y prácticas. Adapta el tono al usuario y evita afirmar que viste archivos no enviados.',
  },
}
const supportedModels = new Set([
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
])

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const geminiKey = Deno.env.get('GEMINI_API_KEY')
  const authorization = request.headers.get('Authorization')
  const vaultToken = request.headers.get('x-vault-session')
  const missingSecrets = [
    ['SUPABASE_URL', url],
    ['SUPABASE_ANON_KEY', anonKey],
    ['SUPABASE_SERVICE_ROLE_KEY', serviceRoleKey],
    ['GEMINI_API_KEY', geminiKey],
  ].filter(([, value]) => !value).map(([name]) => name)
  if (missingSecrets.length) return response({ error: `Faltan secretos de servidor: ${missingSecrets.join(', ')}.` }, 503)
  if (!authorization || !vaultToken) return response({ error: 'Desbloquea la bóveda para usar el chat.' }, 401)

  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return response({ error: 'Sesión no válida.' }, 401)

  const admin = createClient(url, serviceRoleKey)
  const tokenHash = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(vaultToken)))))
  const [{ data: vaultSession }, { data: access }] = await Promise.all([
    admin.from('vault_sessions').select('id').eq('user_id', userData.user.id).eq('token_hash', tokenHash).gt('expires_at', new Date().toISOString()).maybeSingle(),
    admin.from('vault_access').select('user_id').eq('user_id', userData.user.id).maybeSingle(),
  ])
  if (!vaultSession || !access) return response({ error: 'La sesión de bóveda venció. Vuelve a desbloquearla.' }, 401)

  let body: { agent?: string; messages?: { role?: string; content?: string }[]; image?: { dataUrl?: string } }
  try {
    body = await request.json()
  } catch {
    return response({ error: 'Solicitud inválida.' }, 400)
  }
  const agent = body.agent ? agents[body.agent] : undefined
  const messages = body.messages
  if (!agent || !Array.isArray(messages) || messages.length < 1 || messages.length > 24) {
    return response({ error: 'El chat o agente no es válido.' }, 400)
  }
  let totalCharacters = 0
  const safeMessages: { role: 'user' | 'assistant'; content: string }[] = []
  for (const message of messages) {
    if ((message.role !== 'user' && message.role !== 'assistant') || typeof message.content !== 'string' || !message.content.trim() || message.content.length > 6000) {
      return response({ error: 'Hay un mensaje inválido o demasiado largo.' }, 400)
    }
    totalCharacters += message.content.length
    safeMessages.push({ role: message.role, content: message.content })
  }
  if (totalCharacters > 24000 || safeMessages.at(-1)?.role !== 'user') {
    return response({ error: 'El historial excede el límite permitido.' }, 400)
  }

  if (body.image && (!body.image.dataUrl?.startsWith('data:image/jpeg;base64,') || body.image.dataUrl.length > 5_000_000)) {
    return response({ error: 'La foto adjunta no es válida o supera el límite.' }, 400)
  }

  const contents: { role: 'user' | 'model'; parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] }[] = safeMessages.map(message => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }))
  if (body.image) {
    const lastMessage = contents.at(-1)
    if (lastMessage?.role !== 'user') return response({ error: 'Adjunta una foto junto con un mensaje.' }, 400)
    const imageData = body.image.dataUrl.split(',')[1]
    lastMessage.parts.push({ inlineData: { mimeType: 'image/jpeg', data: imageData } })
  }

  const configuredModel = Deno.env.get('GEMINI_MODEL')?.trim() || ''
  const model = supportedModels.has(configuredModel) ? configuredModel : 'gemini-3.8-flash'
  const requestBody = JSON.stringify({
    systemInstruction: {
      parts: [{ text: `Eres ${agent.name}. ${agent.instruction} El usuario está en una bóveda privada. Solo puedes ver los mensajes de texto y la foto que adjunte expresamente en esta solicitud; no tienes acceso a su galería.` }],
    },
    contents,
    generationConfig: { temperature: 0.6, maxOutputTokens: 1200 },
  })
  let providerResponse: Response | null = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      providerResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': geminiKey,
        'Content-Type': 'application/json',
      },
      body: requestBody,
      })
      if (providerResponse.status !== 503 || attempt === 2) break
    } catch {
      if (attempt === 2) return response({ error: 'No se pudo conectar con Gemini después de varios intentos.' }, 502)
    }
    await new Promise(resolve => setTimeout(resolve, 700 * (attempt + 1)))
  }

  if (!providerResponse?.ok) {
    if (!providerResponse) return response({ error: 'Gemini no respondió después de varios intentos.' }, 502)
    const status = providerResponse.status
    const message = status === 401 || status === 403
      ? 'Gemini rechazó GEMINI_API_KEY. Revisa que la clave sea válida y tenga acceso a Generative Language API.'
      : status === 404
        ? 'Gemini no encuentra el modelo. Quita GEMINI_MODEL de los secretos o configúralo como gemini-3.8-flash.'
        : status === 429
          ? 'Gemini alcanzó el límite de solicitudes o cuota. Revisa la cuota y facturación del proyecto.'
          : status === 400
            ? 'Gemini rechazó el formato de la solicitud. Prueba sin imagen o inicia un chat nuevo.'
            : status === 503
              ? 'Gemini está temporalmente saturado o no disponible. Espera un momento y vuelve a enviar.'
            : `Gemini no pudo completar la respuesta (HTTP ${status}).`
    return response({ error: message }, status === 429 || status === 503 ? status : 502)
  }

  try {
    const result = await providerResponse.json()
    const reply = result.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text || '')
      .join('')
    if (typeof reply !== 'string' || !reply.trim()) return response({ error: 'El proveedor no devolvió una respuesta.' }, 502)
    return response({ reply, agent: body.agent })
  } catch {
    return response({ error: 'La respuesta del proveedor no se pudo leer.' }, 502)
  }
})
