import { useEffect, useMemo, useState } from 'react'
import { Archive, Bot, CalendarDays, Check, CheckCheck, ChevronDown, CircleHelp, Download, FileKey2, FilePlus2, Film, Image as ImageIcon, KeyRound, ListTodo, LogOut, Menu, Pencil, Plus, Search, ShieldCheck, Star, Tag, Trash2, Upload, X, ZoomIn, ZoomOut } from 'lucide-react'
import { supabase } from './supabase'
import Login from './Login'
import EnhancedVideoPlayer from './EnhancedVideoPlayer'
import VaultChat from './VaultChat'
import { decryptBytes, deriveVaultKey, encryptBytes, exportKeyFile, fromBase64, generateUnlockSecret, readKeyFile, readNfcSecret, toBase64, writeNfcSecret } from './cryptoUtils'

const DEFAULT_CATEGORIES = ['Personal', 'Trabajo', 'Ideas']

function saveKeyFile(secret) {
  const url = URL.createObjectURL(exportKeyFile(secret))
  const link = document.createElement('a')
  link.href = url
  link.download = 'mi-clave.csdk'
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function encodeVaultPhotoForChat(item, key) {
  const { data, error: downloadError } = await supabase.storage.from('vault').download(item.storage_path)
  if (downloadError) throw downloadError
  const plaintext = await decryptBytes(await data.arrayBuffer(), key)
  const bitmap = await createImageBitmap(new Blob([plaintext], { type: item.type }))
  try {
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('No se pudo preparar la foto para el chat.')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const jpeg = await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo preparar la foto.')), 'image/jpeg', 0.78))
    const bytes = new Uint8Array(await jpeg.arrayBuffer())
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
    }
    return `data:image/jpeg;base64,${btoa(binary)}`
  } finally {
    bitmap.close()
  }
}

function VaultThumbnail({ item, vaultKey, onOpen }) {
  const [source, setSource] = useState(null)
  const [failed, setFailed] = useState(false)
  const video = item.type?.startsWith('video/')

  useEffect(() => {
    let cancelled = false
    let objectUrl = null
    let started = false
    const element = document.getElementById(`vault-thumb-${item.id}`)

    async function load() {
      if (started) return
      started = true
      try {
        const { data, error: downloadError } = await supabase.storage.from('vault').download(item.storage_path)
        if (downloadError) throw downloadError
        const plaintext = await decryptBytes(await data.arrayBuffer(), vaultKey)
        objectUrl = URL.createObjectURL(new Blob([plaintext], { type: item.type }))
        if (!cancelled) setSource(objectUrl)
      } catch {
        if (!cancelled) setFailed(true)
      }
    }

    if (element && 'IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        if (entries[0]?.isIntersecting) {
          observer.disconnect()
          load()
        }
      }, { rootMargin: '160px' })
      observer.observe(element)
      return () => {
        cancelled = true
        observer.disconnect()
        if (objectUrl) URL.revokeObjectURL(objectUrl)
      }
    }

    load()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [item.id, item.storage_path, item.type, vaultKey])

  return (
    <button id={`vault-thumb-${item.id}`} className="vault-media-card" onClick={() => onOpen(item)} title={`Abrir ${item.name}`}>
      {source && (video
        ? <video src={source} muted playsInline preload="metadata" />
        : <img src={source} alt={item.name} loading="lazy" />)}
      {!source && <span className="vault-media-placeholder">{failed ? <Archive size={24} /> : video ? <Film size={25} /> : <ImageIcon size={25} />}</span>}
      {video && <span className="media-kind"><Film size={12} /> VIDEO</span>}
      <span className="vault-media-caption"><strong>{item.name}</strong><small>{item.category}</small></span>
      {item.favorite && <Star className="media-favorite" size={15} fill="currentColor" />}
    </button>
  )
}

function VaultGallery({ items, photos, categories, vaultKey, secret, busy, error, previewItem, previewUrl, zoom, onZoom, onOpen, onUpload, onUpdate, onDownload, onDelete, onClosePreview, onWriteNfc, onLock, onLogout, search, onSearch, category, onCategory, favoritesOnly, onFavoritesOnly, onClearError, conversations, selectedConversationId, chatOpen, chatSending, chatError, onOpenChat, onCloseChat, onCreateChat, onSelectChat, onDeleteChat, onSendChat, onClearChatError }) {
  const isVideo = previewItem?.type?.startsWith('video/')

  useEffect(() => {
    if (!previewItem) return undefined
    const closeOnEscape = event => {
      if (event.key === 'Escape') onClosePreview()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [previewItem, onClosePreview])

  function renameItem(item) {
    const name = window.prompt('Nuevo nombre', item.name)
    if (name?.trim()) onUpdate(item, { name: name.trim() })
  }

  function categorizeItem(item) {
    const categoryName = window.prompt('Categoría', item.category || 'Sin categoría')
    if (categoryName?.trim()) onUpdate(item, { category: categoryName.trim() })
  }

  return (
    <main className="vault-screen">
      <header className="vault-topbar">
        <div className="vault-brand"><span className="vault-brand-mark"><Archive size={18} /></span><span>ARCHIVO <i>PRIVADO</i></span></div>
        <div className="vault-top-actions">
          <button type="button" title="Descargar copia de acceso .csdk" onClick={() => saveKeyFile(secret)}><FileKey2 size={16} /><span>Clave .csdk</span></button>
          <button type="button" title="Escribir clave en NFC" onClick={onWriteNfc}><Tag size={16} /><span>Grabar NFC</span></button>
          <button type="button" title="Abrir chats con agentes" onClick={onOpenChat}><Bot size={16} /><span>Agentes</span></button>
          <button type="button" className="vault-lock-button" title="Bloquear bóveda" onClick={onLock}><KeyRound size={16} /><span>Bloquear</span></button>
          <button type="button" className="vault-icon-button" title="Cerrar sesión" onClick={onLogout}><LogOut size={17} /></button>
        </div>
      </header>

      {error && <div className="vault-notice">{error}<button type="button" title="Cerrar aviso" onClick={onClearError}><X size={15} /></button></div>}

      <section className="vault-page-content">
        <div className="vault-page-heading"><div><div className="vault-kicker"><span /> ESPACIO CIFRADO</div><h1>Fotos & videos<span>.</span></h1><p>Tus recuerdos, ordenados a tu manera.</p></div><div className="vault-count"><strong>{items.length}</strong><span>elementos</span></div></div>

        <label className="vault-upload-zone"><span className="vault-upload-icon"><Upload size={19} /></span><span className="vault-upload-copy"><strong>{busy ? 'Procesando archivo…' : 'Añadir fotos o videos'}</strong><small>Se cifran antes de subirlos</small></span><span className="vault-upload-cta"><Plus size={16} /> Añadir</span><input type="file" accept="image/*,video/*" multiple onChange={onUpload} disabled={busy} /></label>

        <div className="vault-gallery-toolbar">
          <label className="vault-search"><Search size={16} /><input value={search} onChange={event => onSearch(event.target.value)} placeholder="Buscar por nombre" /></label>
          <div className="vault-gallery-filters">
            <label className="vault-category-filter"><Tag size={14} /><select value={category} onChange={event => onCategory(event.target.value)}><option value="Todas">Todas las categorías</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
            <button type="button" className={`vault-favorite-filter ${favoritesOnly ? 'selected' : ''}`} onClick={() => onFavoritesOnly(!favoritesOnly)}><Star size={15} fill={favoritesOnly ? 'currentColor' : 'none'} /> Favoritos</button>
          </div>
        </div>

        {items.length ? <div className="vault-gallery-grid">{items.map(item => <article className="vault-card" key={item.id}>
          <VaultThumbnail item={item} vaultKey={vaultKey} onOpen={onOpen} />
          <div className="vault-card-actions">
            <button type="button" className={item.favorite ? 'is-favorite' : ''} title={item.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'} onClick={() => onUpdate(item, { favorite: !item.favorite })}><Star size={15} fill={item.favorite ? 'currentColor' : 'none'} /></button>
            <button type="button" title="Renombrar" onClick={() => renameItem(item)}><Pencil size={15} /></button>
            <button type="button" title="Cambiar categoría" onClick={() => categorizeItem(item)}><Tag size={15} /></button>
            <button type="button" title="Descargar descifrado" onClick={() => onDownload(item)}><Download size={15} /></button>
            <button type="button" className="vault-delete-action" title="Eliminar" onClick={() => onDelete(item)}><Trash2 size={15} /></button>
          </div>
        </article>)}</div> : <div className="vault-empty"><Archive size={30} /><h2>{search || category !== 'Todas' || favoritesOnly ? 'No hay coincidencias' : 'Tu archivo está vacío'}</h2><p>{search || category !== 'Todas' || favoritesOnly ? 'Ajusta los filtros o la búsqueda.' : 'Añade una foto o video para empezar.'}</p></div>}
      </section>

      {previewItem && previewUrl && <div className="vault-preview-backdrop" onClick={onClosePreview}>
        <section className="vault-preview-window" role="dialog" aria-modal="true" aria-label={`Vista previa de ${previewItem.name}`} onClick={event => event.stopPropagation()}>
          <header className="vault-preview-header"><div><strong>{previewItem.name}</strong><span>{previewItem.category}</span></div><div className="vault-preview-tools">{!isVideo && <><button type="button" title="Alejar" onClick={() => onZoom(value => Math.max(1, value - 0.25))} disabled={zoom <= 1}><ZoomOut size={17} /></button><span>{Math.round(zoom * 100)}%</span><button type="button" title="Acercar" onClick={() => onZoom(value => Math.min(4, value + 0.25))}><ZoomIn size={17} /></button><button type="button" title="Restablecer zoom" onClick={() => onZoom(1)}>1:1</button></>}<button type="button" title="Descargar" onClick={() => onDownload(previewItem)}><Download size={17} /></button><button type="button" title="Cerrar vista previa" onClick={onClosePreview}><X size={19} /></button></div></header>
          {isVideo ? <EnhancedVideoPlayer src={previewUrl} /> : <div className="vault-image-stage" onWheel={event => { event.preventDefault(); onZoom(value => Math.max(1, Math.min(4, value + (event.deltaY < 0 ? 0.15 : -0.15)))) }}><img src={previewUrl} alt={previewItem.name} style={{ transform: `scale(${zoom})` }} /></div>}
        </section>
      </div>}
      {chatOpen && <VaultChat
        conversations={conversations}
        photos={photos}
        selectedId={selectedConversationId}
        onSelect={onSelectChat}
        onCreate={onCreateChat}
        onDelete={onDeleteChat}
        onSend={onSendChat}
        sending={chatSending}
        error={chatError}
        onClearError={onClearChatError}
        onClose={onCloseChat}
      />}
    </main>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [view, setView] = useState('tasks')
  const [mobileNav, setMobileNav] = useState(false)
  const [tasks, setTasks] = useState([])
  const [customCategories, setCustomCategories] = useState([])
  const [filter, setFilter] = useState('Hoy')
  const [categoryFilter, setCategoryFilter] = useState('Todas')
  const [query, setQuery] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskCategory, setTaskCategory] = useState('Personal')
  const [taskDate, setTaskDate] = useState('')
  const [taskPriority, setTaskPriority] = useState('Normal')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [vaultConfig, setVaultConfig] = useState(null)
  const [vaultUnlocked, setVaultUnlocked] = useState(false)
  const [vaultKey, setVaultKey] = useState(null)
  const [vaultSessionToken, setVaultSessionToken] = useState('')
  const [unlockSecret, setUnlockSecret] = useState('')
  const [setupSecret, setSetupSecret] = useState('')
  const [vaultObjects, setVaultObjects] = useState([])
  const [showVaultGate, setShowVaultGate] = useState(false)
  const [vaultCategoryFilter, setVaultCategoryFilter] = useState('Todas')
  const [vaultFavoritesOnly, setVaultFavoritesOnly] = useState(false)
  const [vaultSearch, setVaultSearch] = useState('')
  const [previewItem, setPreviewItem] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewZoom, setPreviewZoom] = useState(1)
  const [vaultConversations, setVaultConversations] = useState([])
  const [selectedConversationId, setSelectedConversationId] = useState(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatSending, setChatSending] = useState(false)
  const [chatError, setChatError] = useState('')

  const user = session?.user
  const categories = useMemo(() => [...new Set([...DEFAULT_CATEGORIES, ...customCategories, ...tasks.map(task => task.category).filter(Boolean)])], [customCategories, tasks])
  const vaultCategories = useMemo(() => [...new Set(vaultObjects.map(item => item.category).filter(Boolean))].sort(), [vaultObjects])
  const visibleVaultObjects = useMemo(() => vaultObjects.filter(item => {
    const matchesText = item.name.toLowerCase().includes(vaultSearch.toLowerCase())
    const matchesCategory = vaultCategoryFilter === 'Todas' || item.category === vaultCategoryFilter
    return matchesText && matchesCategory && (!vaultFavoritesOnly || item.favorite)
  }), [vaultObjects, vaultSearch, vaultCategoryFilter, vaultFavoritesOnly])

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false)
      return undefined
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthLoading(false)
    }).catch(() => setAuthLoading(false))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession) clearVaultState()
      setAuthLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user || !supabase) return
    setError('')
    Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('vault_access').select('user_id').maybeSingle(),
    ]).then(async ([taskResult, accessResult]) => {
      if (taskResult.error) throw taskResult.error
      if (accessResult.error) throw accessResult.error
      setTasks(taskResult.data || [])
      const allowed = Boolean(accessResult.data)
      if (!allowed) return
      const { data: config, error: configError } = await supabase.from('vault_config').select('salt').maybeSingle()
      if (configError) throw configError
      setVaultConfig(config)
      setShowVaultGate(true)
    }).catch(loadError => setError(loadError.message))
  }, [user])

  function clearVaultState() {
    setVaultKey(null)
    setVaultSessionToken('')
    setVaultUnlocked(false)
    setUnlockSecret('')
    setSetupSecret('')
    setVaultObjects([])
    setVaultConfig(null)
    setShowVaultGate(false)
    setPreviewItem(null)
    setPreviewUrl(null)
    setVaultConversations([])
    setSelectedConversationId(null)
    setChatOpen(false)
    setChatSending(false)
    setChatError('')
  }

  async function addTask(event) {
    event.preventDefault()
    if (!taskTitle.trim() || !user) return
    setBusy(true)
    setError('')
    const { data, error: insertError } = await supabase.from('tasks').insert({
      user_id: user.id,
      title: taskTitle.trim(),
      category: taskCategory.trim() || 'Personal',
      due_date: taskDate || null,
      priority: taskPriority,
    }).select().single()
    if (insertError) setError(insertError.message)
    else {
      setTasks(current => [data, ...current])
      setTaskTitle('')
      setTaskDate('')
      setTaskPriority('Normal')
    }
    setBusy(false)
  }

  async function toggleTask(task) {
    const { data, error: updateError } = await supabase.from('tasks').update({ completed: !task.completed }).eq('id', task.id).select().single()
    if (updateError) setError(updateError.message)
    else setTasks(current => current.map(item => item.id === task.id ? data : item))
  }

  async function removeTask(taskId) {
    const { error: deleteError } = await supabase.from('tasks').delete().eq('id', taskId)
    if (deleteError) setError(deleteError.message)
    else setTasks(current => current.filter(task => task.id !== taskId))
  }

  async function loadVaultObjects(key) {
    const { data, error: listError } = await supabase.from('vault_objects').select('id, storage_path, metadata_cipher, created_at').order('created_at', { ascending: false })
    if (listError) throw listError
    const decrypted = await Promise.all((data || []).map(async item => {
      const plaintext = await decryptBytes(fromBase64(item.metadata_cipher), key)
      return { ...item, ...JSON.parse(new TextDecoder().decode(plaintext)) }
    }))
    setVaultObjects(decrypted)
  }

  async function loadVaultConversations(key) {
    const { data, error: listError } = await supabase.from('vault_conversations').select('id, payload_cipher').order('updated_at', { ascending: false })
    if (listError) throw listError
    const decrypted = await Promise.all((data || []).map(async row => {
      const plaintext = await decryptBytes(fromBase64(row.payload_cipher), key)
      return JSON.parse(new TextDecoder().decode(plaintext))
    }))
    setVaultConversations(decrypted)
    setSelectedConversationId(decrypted[0]?.id || null)
  }

  async function persistVaultConversation(conversation, key = vaultKey) {
    const payloadCipher = toBase64(await encryptBytes(new TextEncoder().encode(JSON.stringify(conversation)), key))
    const { error: saveError } = await supabase.from('vault_conversations').upsert({
      id: conversation.id,
      user_id: user.id,
      payload_cipher: payloadCipher,
      updated_at: new Date().toISOString(),
    })
    if (saveError) throw saveError
  }

  async function configureVault(secret) {
    if (secret.length < 16) throw new Error('Usa una clave de al menos 16 caracteres; recomendamos generar una aleatoria.')
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const saltValue = toBase64(salt)
    const { data, error: credentialError } = await supabase.functions.invoke('vault-credential', {
      body: { action: 'register', secret, salt: saltValue },
    })
    if (credentialError) throw credentialError
    if (!data?.valid || !data.salt || !data.vaultSession) throw new Error('No se pudo configurar la sesión de bóveda.')
    const key = await deriveVaultKey(secret, fromBase64(data.salt))
    setVaultConfig({ salt: data.salt })
    setVaultKey(key)
    setVaultSessionToken(data.vaultSession)
    setUnlockSecret(secret)
    setVaultUnlocked(true)
    setView('vault')
    setShowVaultGate(false)
  }

  async function unlockVault(secret) {
    if (!vaultConfig) return configureVault(secret)
    const { data, error: credentialError } = await supabase.functions.invoke('vault-credential', {
      body: { action: 'verify', secret },
    })
    if (credentialError) throw credentialError
    if (!data?.valid || !data.salt || !data.vaultSession) throw new Error('No se pudo crear la sesión de bóveda.')
    const key = await deriveVaultKey(secret, fromBase64(data.salt))
    setVaultKey(key)
    setVaultSessionToken(data.vaultSession)
    setUnlockSecret(secret)
    setVaultUnlocked(true)
    await Promise.all([loadVaultObjects(key), loadVaultConversations(key)])
    setShowVaultGate(false)
    setView('vault')
  }

  async function handleUnlockSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await unlockVault(setupSecret || unlockSecret)
      setSetupSecret('')
    } catch (unlockError) {
      setError(unlockError.message)
    } finally {
      setBusy(false)
    }
  }

  async function unlockFromFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    setError('')
    try {
      await unlockVault(await readKeyFile(file))
    } catch (unlockError) {
      setError(unlockError.message)
    } finally {
      setBusy(false)
    }
  }

  async function unlockFromNfc() {
    setBusy(true)
    setError('')
    try {
      await unlockVault(await readNfcSecret())
    } catch (unlockError) {
      setError(unlockError.message)
    } finally {
      setBusy(false)
    }
  }

  async function addVaultFiles(event) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length || !vaultKey) return
    const unsupported = files.find(file => !file.type.startsWith('image/') && !file.type.startsWith('video/'))
    if (unsupported) {
      setError(`${unsupported.name}: solo se admiten fotos y videos.`)
      return
    }
    setBusy(true)
    setError('')
    try {
      for (const file of files) {
        const id = crypto.randomUUID()
        const storagePath = `${user.id}/${id}.bin`
        const encrypted = await encryptBytes(await file.arrayBuffer(), vaultKey)
        const { error: uploadError } = await supabase.storage.from('vault').upload(storagePath, new Blob([encrypted]), { contentType: 'application/octet-stream' })
        if (uploadError) throw uploadError
        const metadata = { name: file.name, type: file.type || 'application/octet-stream', category: 'Sin categoría', favorite: false, size: file.size }
        const metadataCipher = toBase64(await encryptBytes(new TextEncoder().encode(JSON.stringify(metadata)), vaultKey))
        const { error: rowError } = await supabase.from('vault_objects').insert({ id, user_id: user.id, storage_path: storagePath, metadata_cipher: metadataCipher })
        if (rowError) {
          await supabase.storage.from('vault').remove([storagePath])
          throw rowError
        }
      }
      await loadVaultObjects(vaultKey)
    } catch (uploadError) {
      setError(uploadError.message)
    } finally {
      setBusy(false)
    }
  }

  async function updateVaultMetadata(item, patch) {
    const metadata = { name: item.name, type: item.type, category: item.category, favorite: item.favorite, size: item.size, ...patch }
    const metadataCipher = toBase64(await encryptBytes(new TextEncoder().encode(JSON.stringify(metadata)), vaultKey))
    const { error: updateError } = await supabase.from('vault_objects').update({ metadata_cipher: metadataCipher }).eq('id', item.id)
    if (updateError) setError(updateError.message)
    else setVaultObjects(current => current.map(value => value.id === item.id ? { ...value, ...metadata } : value))
  }

  async function downloadVaultObject(item) {
    setBusy(true)
    setError('')
    try {
      const { data, error: downloadError } = await supabase.storage.from('vault').download(item.storage_path)
      if (downloadError) throw downloadError
      const plaintext = await decryptBytes(await data.arrayBuffer(), vaultKey)
      const url = URL.createObjectURL(new Blob([plaintext], { type: item.type }))
      const link = document.createElement('a')
      link.href = url
      link.download = item.name
      link.click()
      URL.revokeObjectURL(url)
    } catch (downloadError) {
      setError(downloadError.message)
    } finally {
      setBusy(false)
    }
  }

  async function openVaultPreview(item) {
    setBusy(true)
    setError('')
    try {
      const { data, error: downloadError } = await supabase.storage.from('vault').download(item.storage_path)
      if (downloadError) throw downloadError
      const plaintext = await decryptBytes(await data.arrayBuffer(), vaultKey)
      const url = URL.createObjectURL(new Blob([plaintext], { type: item.type }))
      setPreviewItem(item)
      setPreviewUrl(url)
      setPreviewZoom(1)
    } catch (previewError) {
      setError(previewError.message)
    } finally {
      setBusy(false)
    }
  }

  async function removeVaultObject(item) {
    if (!window.confirm(`¿Eliminar ${item.name}?`)) return
    const { error: removeError } = await supabase.storage.from('vault').remove([item.storage_path])
    if (removeError) return setError(removeError.message)
    const { error: rowError } = await supabase.from('vault_objects').delete().eq('id', item.id)
    if (rowError) setError(rowError.message)
    else setVaultObjects(current => current.filter(value => value.id !== item.id))
  }

  async function createVaultConversation(agent) {
    const conversation = {
      id: crypto.randomUUID(),
      agent,
      title: 'Nuevo chat',
      messages: [],
      updatedAt: new Date().toISOString(),
    }
    try {
      await persistVaultConversation(conversation)
      setVaultConversations(current => [conversation, ...current])
      setSelectedConversationId(conversation.id)
      setChatError('')
    } catch (saveError) {
      setChatError(saveError.message)
    }
  }

  async function sendVaultMessage(text, photoId = '') {
    if (!text.trim() || !vaultSessionToken || chatSending) return
    const current = vaultConversations.find(item => item.id === selectedConversationId)
    if (!current) {
      setChatError('Crea o selecciona un chat antes de enviar mensajes.')
      return
    }
    const photo = photoId ? vaultObjects.find(item => item.id === photoId && item.type?.startsWith('image/')) : null
    if (photoId && !photo) {
      setChatError('No se encontró la foto seleccionada en la bóveda.')
      return
    }
    const userMessage = {
      role: 'user',
      content: text.trim(),
      ...(photo ? { attachment: { id: photo.id, name: photo.name } } : {}),
    }
    const updated = {
      ...current,
      title: current.messages.length ? current.title : text.trim().slice(0, 52),
      messages: [...current.messages, userMessage],
      updatedAt: new Date().toISOString(),
    }
    setVaultConversations(items => items.map(item => item.id === updated.id ? updated : item))
    setChatSending(true)
    setChatError('')
    try {
      await persistVaultConversation(updated)
      const image = photo ? { dataUrl: await encodeVaultPhotoForChat(photo, vaultKey) } : undefined
      const { data, error: invokeError } = await supabase.functions.invoke('vault-ai-chat', {
        body: { agent: updated.agent, messages: updated.messages.slice(-24), ...(image ? { image } : {}) },
        headers: { 'x-vault-session': vaultSessionToken },
      })
      if (invokeError) {
        let detail = ''
        if (invokeError.context instanceof Response) {
          const responseBody = await invokeError.context.clone().json().catch(() => null)
          detail = responseBody?.error || ''
        }
        throw new Error(detail || invokeError.message)
      }
      if (!data?.reply) throw new Error('El agente no devolvió una respuesta.')
      const completed = {
        ...updated,
        messages: [...updated.messages, { role: 'assistant', content: data.reply }],
        updatedAt: new Date().toISOString(),
      }
      await persistVaultConversation(completed)
      setVaultConversations(items => items.map(item => item.id === completed.id ? completed : item))
    } catch (sendError) {
      setChatError(sendError.message || 'No se pudo contactar con el agente.')
    } finally {
      setChatSending(false)
    }
  }

  async function deleteVaultConversation(conversationId) {
    const { error: deleteError } = await supabase.from('vault_conversations').delete().eq('id', conversationId)
    if (deleteError) return setChatError(deleteError.message)
    const remaining = vaultConversations.filter(item => item.id !== conversationId)
    setVaultConversations(remaining)
    if (selectedConversationId === conversationId) setSelectedConversationId(remaining[0]?.id || null)
  }

  async function handleLogout() {
    clearVaultState()
    await supabase.auth.signOut()
  }

  if (authLoading) return <div className="boot-screen"><span className="boot-mark">T</span><p>Preparando tu espacio</p></div>
  if (!supabase) return <div className="config-error"><ShieldCheck size={30} /><h1>Configura el acceso</h1><p>Faltan los datos de conexión del espacio. Revisa la configuración local de Supabase.</p></div>
  if (!session) return <Login />

  const today = new Date().toISOString().slice(0, 10)
  const visibleTasks = tasks.filter(task => {
    const matchesText = `${task.title} ${task.category}`.toLowerCase().includes(query.toLowerCase())
    const matchesCategory = categoryFilter === 'Todas' || task.category === categoryFilter
    const matchesFilter = filter === 'Todas' || (filter === 'Hoy' && (!task.due_date || task.due_date <= today) && !task.completed) || (filter === 'Próximas' && task.due_date > today && !task.completed) || (filter === 'Completadas' && task.completed)
    return matchesText && matchesCategory && matchesFilter
  })
  const pendingCount = tasks.filter(task => !task.completed).length

  if (view === 'vault' && vaultUnlocked && !showVaultGate) {
    return <VaultGallery
      items={visibleVaultObjects}
      photos={vaultObjects.filter(item => item.type?.startsWith('image/'))}
      categories={vaultCategories}
      vaultKey={vaultKey}
      secret={unlockSecret}
      busy={busy}
      error={error}
      previewItem={previewItem}
      previewUrl={previewUrl}
      zoom={previewZoom}
      onZoom={setPreviewZoom}
      onOpen={openVaultPreview}
      onUpload={addVaultFiles}
      onUpdate={updateVaultMetadata}
      onDownload={downloadVaultObject}
      onDelete={removeVaultObject}
      onClosePreview={() => { setPreviewItem(null); setPreviewUrl(null) }}
      onWriteNfc={async () => {
        try {
          await writeNfcSecret(unlockSecret)
          setError('Clave escrita en NFC. Protégela físicamente; una etiqueta NFC puede copiarse.')
        } catch (nfcError) {
          setError(nfcError.message)
        }
      }}
      onLock={() => {
        setVaultKey(null)
        setVaultSessionToken('')
        setVaultUnlocked(false)
        setUnlockSecret('')
        setVaultObjects([])
        setVaultConversations([])
        setSelectedConversationId(null)
        setChatOpen(false)
        setPreviewItem(null)
        setPreviewUrl(null)
        setView('tasks')
      }}
      onLogout={handleLogout}
      search={vaultSearch}
      onSearch={setVaultSearch}
      category={vaultCategoryFilter}
      onCategory={setVaultCategoryFilter}
      favoritesOnly={vaultFavoritesOnly}
      onFavoritesOnly={setVaultFavoritesOnly}
      onClearError={() => setError('')}
      conversations={vaultConversations}
      selectedConversationId={selectedConversationId}
      chatOpen={chatOpen}
      chatSending={chatSending}
      chatError={chatError}
      onOpenChat={() => { setChatOpen(true); setChatError('') }}
      onCloseChat={() => setChatOpen(false)}
      onCreateChat={createVaultConversation}
      onSelectChat={setSelectedConversationId}
      onDeleteChat={deleteVaultConversation}
      onSendChat={sendVaultMessage}
      onClearChatError={() => setChatError('')}
    />
  }

  return (
    <div className="workspace">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand"><span className="brand-mark">T</span><span>tarea<span className="brand-dot">.</span></span><button className="icon-button mobile-close" title="Cerrar menú" onClick={() => setMobileNav(false)}><X size={18} /></button></div>
        <div className="workspace-label">MI ESPACIO</div>
        <nav className="primary-nav" aria-label="Navegación principal">
          <button className={`nav-item ${view === 'tasks' ? 'selected' : ''}`} onClick={() => { setView('tasks'); setShowVaultGate(false); setMobileNav(false) }}><ListTodo size={18} /><span>Mis tareas</span><span className="nav-count">{pendingCount}</span></button>
        </nav>
        <div className="side-divider" />
        <div className="workspace-label categories-label">CATEGORÍAS <button className="mini-add" title="Añadir categoría" onClick={() => { const name = window.prompt('Nombre de categoría'); if (name?.trim()) { setCustomCategories(current => [...new Set([...current, name.trim()])]); setTaskCategory(name.trim()) } }}><Plus size={14} /></button></div>
        <nav className="category-nav" aria-label="Categorías">
          <button className={`category-link ${categoryFilter === 'Todas' ? 'active' : ''}`} onClick={() => setCategoryFilter('Todas')}><span className="category-dot all-dot" />Todas</button>
          {categories.map((category, index) => <button key={category} className={`category-link ${categoryFilter === category ? 'active' : ''}`} onClick={() => setCategoryFilter(category)}><span className={`category-dot category-${index % 4}`} />{category}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="account-chip"><span className="avatar">{user.email?.slice(0, 1).toUpperCase()}</span><div className="account-copy"><strong>{user.email?.split('@')[0]}</strong><span>{user.email}</span></div><button className="icon-button" title="Cerrar sesión" onClick={handleLogout}><LogOut size={16} /></button></div>
        </div>
      </aside>
      {mobileNav && <button className="nav-scrim" aria-label="Cerrar menú" onClick={() => setMobileNav(false)} />}

      <main className="main-panel">
        <header className="topbar">
          <button className="icon-button mobile-menu" title="Abrir menú" onClick={() => setMobileNav(true)}><Menu size={20} /></button>
          <div className="breadcrumb"><span>Mi espacio</span><span className="crumb-slash">/</span><strong>{view === 'vault' && vaultUnlocked ? 'Archivo privado' : 'Mis tareas'}</strong></div>
          <div className="topbar-right"><span className="today-label"><CalendarDays size={15} />{new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</span><button className="avatar top-avatar" title={user.email}>{user.email?.slice(0, 1).toUpperCase()}</button></div>
        </header>

        {(error || busy) && <div className={`notice ${error ? 'notice-error' : ''}`}>{error || 'Guardando…'}{error && <button className="icon-button" title="Cerrar aviso" onClick={() => setError('')}><X size={16} /></button>}</div>}

        {showVaultGate && <VaultGate config={vaultConfig} busy={busy} setupSecret={setupSecret} setSetupSecret={setSetupSecret} unlockSecret={unlockSecret} setUnlockSecret={setUnlockSecret} onSubmit={handleUnlockSubmit} onFile={unlockFromFile} onNfc={unlockFromNfc} onGenerate={() => setSetupSecret(generateUnlockSecret())} onExport={() => saveKeyFile(setupSecret || unlockSecret)} onWriteNfc={async () => { try { await writeNfcSecret(setupSecret || unlockSecret); setError('Clave escrita en NFC. Protégela físicamente; una etiqueta NFC puede copiarse.') } catch (nfcError) { setError(nfcError.message) } }} onContinue={() => { setShowVaultGate(false); setView('tasks') }} />}

        {!showVaultGate && view === 'tasks' && <section className="page-content">
          <div className="page-heading"><div><div className="eyebrow">TU DÍA, CON ORDEN</div><h1>Mis tareas<span className="heading-period">.</span></h1><p>Un paso a la vez. Lo importante, a la vista.</p></div><div className="heading-stat"><strong>{pendingCount.toString().padStart(2, '0')}</strong><span>pendientes</span></div></div>
          <form className="task-composer" onSubmit={addTask}><span className="composer-plus"><Plus size={18} /></span><input aria-label="Nueva tarea" value={taskTitle} onChange={event => setTaskTitle(event.target.value)} placeholder="¿Qué necesitas hacer?" required /><select aria-label="Categoría" value={taskCategory} onChange={event => setTaskCategory(event.target.value)}>{categories.map(category => <option key={category}>{category}</option>)}</select><input aria-label="Fecha" type="date" value={taskDate} onChange={event => setTaskDate(event.target.value)} /><select aria-label="Prioridad" value={taskPriority} onChange={event => setTaskPriority(event.target.value)}><option>Normal</option><option>Alta</option><option>Baja</option></select><button className="add-task-button" type="submit" disabled={busy}><Plus size={16} /><span>Añadir</span></button></form>
          <div className="task-toolbar"><div className="filter-tabs">{['Hoy', 'Próximas', 'Todas', 'Completadas'].map(item => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}{item === 'Hoy' && <span className="tab-count">{pendingCount}</span>}</button>)}</div><label className="search-box"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar tareas" /></label></div>
          <div className="task-list">{visibleTasks.length ? visibleTasks.map(task => <article className={`task-row ${task.completed ? 'task-complete' : ''}`} key={task.id}><button className={`task-check ${task.completed ? 'checked' : ''}`} aria-label={task.completed ? 'Marcar pendiente' : 'Completar tarea'} onClick={() => toggleTask(task)}>{task.completed && <Check size={14} />}</button><div className="task-copy"><strong>{task.title}</strong><div className="task-meta"><span className="task-category"><span className="category-dot category-0" />{task.category}</span>{task.due_date && <span className={task.due_date < today && !task.completed ? 'overdue' : ''}><CalendarDays size={13} />{new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(new Date(`${task.due_date}T12:00:00`))}</span>}</div></div><span className={`priority priority-${task.priority?.toLowerCase()}`}>{task.priority}</span><button className="icon-button task-delete" title="Eliminar tarea" onClick={() => removeTask(task.id)}><Trash2 size={16} /></button></article>) : <div className="empty-tasks"><CheckCheck size={26} /><h3>{query ? 'Sin coincidencias' : 'Todo en orden'}</h3><p>{query ? 'Prueba con otro término.' : 'No hay tareas en esta vista. Añade una y empieza por ahí.'}</p></div>}</div>
          <footer className="list-footer">Mostrando {visibleTasks.length} de {tasks.length} tareas <span>Guardado en tu espacio</span></footer>
        </section>}

        {!showVaultGate && view === 'vault' && vaultUnlocked && <section className="page-content vault-content"><div className="page-heading"><div><div className="eyebrow vault-eyebrow"><ShieldCheck size={14} /> CIFRADO EN ESTE DISPOSITIVO</div><h1>Archivo privado<span className="heading-period">.</span></h1><p>Los archivos y sus nombres se cifran antes de subirlos.</p></div><div className="vault-actions"><button className="secondary-button" onClick={() => saveKeyFile(unlockSecret)}><FileKey2 size={16} /> Exportar .csdk</button><button className="secondary-button" onClick={async () => { try { await writeNfcSecret(unlockSecret); setError('Clave escrita en NFC. La etiqueta puede copiarse: guárdala en un lugar seguro.') } catch (nfcError) { setError(nfcError.message) } }}><Tag size={16} /> Grabar NFC</button><button className="secondary-button lock-button" onClick={() => { setVaultKey(null); setVaultUnlocked(false); setUnlockSecret(''); setVaultObjects([]); setView('tasks') }}><KeyRound size={16} /> Bloquear</button></div></div><label className="upload-zone"><Upload size={19} /><span><strong>{busy ? 'Cifrando y subiendo…' : 'Añadir archivos cifrados'}</strong><small>El contenido se cifra localmente antes de salir del dispositivo</small></span><input type="file" multiple onChange={addVaultFiles} disabled={busy} /></label><div className="vault-file-list">{vaultObjects.length ? vaultObjects.map(item => <article className="vault-file-row" key={item.id}><div className="file-type-icon"><Archive size={17} /></div><div className="vault-file-copy"><strong>{item.name}</strong><span>{item.category} · {(item.size / 1024 / 1024).toFixed(2)} MB</span></div><button className={`icon-button ${item.favorite ? 'favorite-active' : ''}`} title={item.favorite ? 'Quitar favorito' : 'Añadir a favoritos'} onClick={() => updateVaultMetadata(item, { favorite: !item.favorite })}><Star size={17} fill={item.favorite ? 'currentColor' : 'none'} /></button><button className="icon-button" title="Renombrar" onClick={() => { const name = window.prompt('Nuevo nombre', item.name); if (name?.trim()) updateVaultMetadata(item, { name: name.trim() }) }}><FilePlus2 size={17} /></button><button className="icon-button" title="Cambiar categoría" onClick={() => { const category = window.prompt('Categoría', item.category); if (category?.trim()) updateVaultMetadata(item, { category: category.trim() }) }}><Tag size={17} /></button><button className="icon-button" title="Descargar y descifrar" onClick={() => downloadVaultObject(item)}><Upload className="download-icon" size={17} /></button><button className="icon-button danger-icon" title="Eliminar archivo" onClick={() => removeVaultObject(item)}><Trash2 size={17} /></button></article>) : <div className="empty-vault"><Archive size={25} /><h3>Tu archivo privado está vacío</h3><p>Sube un archivo para cifrarlo en este dispositivo.</p></div>}</div><div className="vault-note"><CircleHelp size={15} /><span>La clave no se puede recuperar desde el servidor. Conserva una copia segura del archivo .csdk o configura tu etiqueta NFC.</span></div></section>}
      </main>
    </div>
  )
}

function VaultGate({ config, busy, setupSecret, setSetupSecret, unlockSecret, setUnlockSecret, onSubmit, onFile, onNfc, onGenerate, onExport, onWriteNfc, onContinue }) {
  const [mode, setMode] = useState('password')
  const value = config ? unlockSecret : setupSecret
  const setValue = config ? setUnlockSecret : setSetupSecret
  return <div className="gate-backdrop"><section className="vault-gate"><div className="gate-icon"><KeyRound size={22} /></div><div className="eyebrow">{config ? 'ACCESO CIFRADO' : 'CONFIGURACIÓN INICIAL'}</div><h2>{config ? 'Desbloquea tu archivo' : 'Crea tu archivo privado'}</h2><p>{config ? 'La clave se verifica en servidor; los archivos se descifran en este dispositivo.' : 'Elige una clave de alta entropía. Solo se guarda un verificador protegido, nunca la clave.'}</p><div className="credential-tabs"><button className={mode === 'password' ? 'selected' : ''} onClick={() => setMode('password')}><KeyRound size={15} />Clave</button><button className={mode === 'file' ? 'selected' : ''} onClick={() => setMode('file')}><FileKey2 size={15} />.csdk</button><button className={mode === 'nfc' ? 'selected' : ''} onClick={() => setMode('nfc')}><Tag size={15} />NFC</button></div>{mode === 'password' ? <form onSubmit={onSubmit} className="gate-form">{!config && <button type="button" className="generate-key" onClick={onGenerate}><FileKey2 size={15} />Generar clave aleatoria</button>}<input type="password" autoComplete="off" value={value} onChange={event => setValue(event.target.value)} placeholder={config ? 'Clave de bóveda' : 'Mínimo 16 caracteres'} minLength={16} required /><button className="unlock-button" disabled={busy}>{config ? 'Desbloquear' : 'Crear bóveda'}<ChevronDown size={16} /></button></form> : mode === 'file' ? <div className="credential-action"><label className="secondary-button"><FileKey2 size={16} />Seleccionar archivo .csdk<input type="file" accept=".csdk,application/vnd.csdk+json,application/json" onChange={onFile} /></label><small>El archivo contiene la clave secreta; guárdalo protegido.</small></div> : <div className="credential-action"><button className="secondary-button" onClick={onNfc} disabled={busy}><Tag size={16} />Leer etiqueta NFC</button><small>Requiere HTTPS y un navegador compatible, normalmente Chrome en Android.</small></div>}{!config && value.length >= 16 && <div className="setup-key-actions"><button className="text-action" onClick={onExport}><FileKey2 size={14} />Descargar .csdk</button><button className="text-action" onClick={onWriteNfc}><Tag size={14} />Grabar NFC</button></div>}<button className="continue-tasks" onClick={onContinue}>Continuar a mis tareas</button><div className="gate-warning"><CircleHelp size={14} /><span>Una etiqueta NFC normal puede copiarse. Úsala como acceso alternativo, no como único factor.</span></div></section></div>
}

export default App