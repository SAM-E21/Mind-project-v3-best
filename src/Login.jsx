import { useState } from 'react'
import { ArrowRight, ListTodo, LoaderCircle, LockKeyhole, Mail } from 'lucide-react'
import { supabase } from './supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    setError('')
    const normalizedEmail = email.trim().toLowerCase()
    const specialEmail = import.meta.env.VITE_VAULT_LOGIN_EMAIL?.trim().toLowerCase()

    try {
      if (!creating && specialEmail && normalizedEmail === specialEmail) {
        const { data: gate, error: gateError } = await supabase.functions.invoke('vault-first-login', {
          body: { email: normalizedEmail, password },
        })
        if (gateError || !gate?.authorized) {
          const status = gateError?.context instanceof Response ? gateError.context.status : undefined
          setError(status === 429
            ? 'Demasiados intentos. Espera 15 minutos.'
            : status === 404 ? 'El acceso especial aún no está desplegado en Supabase.'
              : status === 503 ? 'El acceso especial no está configurado en el servidor.'
            : status === 401 || !gateError ? 'Correo o contraseña incorrectos.' : 'No se pudo validar el acceso especial. Comprueba la configuración del servidor.')
          return
        }
      }

      const result = creating
        ? await supabase.auth.signUp({ email: normalizedEmail, password })
        : await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
      if (result.error?.code === 'invalid_credentials' && !creating) {
        setError('No coincide el correo y la contraseña de este proyecto. Crea la cuenta aquí o confirma el correo antes de iniciar sesión.')
      } else if (result.error) setError(result.error.message)
      else if (creating && !result.data.session) setMessage('Cuenta creada. Revisa tu correo para confirmar el acceso.')
    } catch {
      setError('No se pudo completar el inicio de sesión. Inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <div className="login-aside">
        <div className="login-brand"><span className="brand-mark">T</span><span>tarea<span className="brand-dot">.</span></span></div>
        <div className="login-message">
          <span className="eyebrow">UN LUGAR PARA PENSAR CLARO</span>
          <h1>Haz espacio<br />para lo que<br /><em>importa.</em></h1>
          <p>Un espacio sencillo para poner tus tareas y proyectos en orden.</p>
          <div className="login-assurance"><span><ListTodo size={16} />Organizador personal</span></div>
        </div>
        <div className="login-aside-foot">TU ESPACIO, A TU RITMO <span>© {new Date().getFullYear()}</span></div>
      </div>
      <section className="login-panel">
        <div className="login-panel-inner">
          <div className="login-icon"><ListTodo size={20} /></div>
          <div className="eyebrow">BIENVENIDO DE VUELTA</div>
          <h2>{creating ? 'Crea tu cuenta' : 'Inicia sesión'}</h2>
          <p className="login-subtitle">{creating ? 'Empieza a organizarte con tu espacio personal.' : 'Entra a tu espacio de organización.'}</p>
          <form className="login-form" onSubmit={submit}>
            <label>Correo electrónico<span className="login-input-wrap"><Mail size={17} /><input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="tu@correo.com" required /></span></label>
            <label>Contraseña<span className="login-input-wrap"><LockKeyhole size={17} /><input type="password" autoComplete={creating ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="Al menos 8 caracteres" minLength={8} required /></span></label>
            {error && <div className="form-error" role="alert">{error}</div>}
            {message && <div className="form-success" role="status">{message}</div>}
            <button className="login-submit" disabled={loading}>{loading ? <LoaderCircle className="spin" size={18} /> : <>{creating ? 'Crear cuenta' : 'Entrar'}<ArrowRight size={17} /></>}</button>
          </form>
          <div className="login-switch">{creating ? '¿Ya tienes cuenta?' : '¿Primera vez aquí?'} <button onClick={() => { setCreating(!creating); setError(''); setMessage('') }}>{creating ? 'Inicia sesión' : 'Crear una cuenta'}</button></div>
        </div>
      </section>
    </main>
  )
}