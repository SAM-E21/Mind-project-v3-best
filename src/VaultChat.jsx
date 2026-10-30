import { useEffect, useRef, useState } from 'react'
import { Bot, ChevronDown, Image as ImageIcon, MessageSquarePlus, Send, Trash2, X } from 'lucide-react'

export const VAULT_AGENTS = [
  { id: 'assistant', name: 'Asistente', detail: 'Ayuda general' },
  { id: 'organizer', name: 'Organizador', detail: 'Ordena ideas y pasos' },
  { id: 'analyst', name: 'Analista', detail: 'Examina lo que compartes' },
  { id: 'creative', name: 'Creativo', detail: 'Propone ideas nuevas' },
]

export default function VaultChat({ conversations, photos, selectedId, onSelect, onCreate, onDelete, onSend, sending, error, onClearError, onClose }) {
  const [agent, setAgent] = useState(VAULT_AGENTS[0].id)
  const [draft, setDraft] = useState('')
  const [selectedPhotoId, setSelectedPhotoId] = useState('')
  const messageEnd = useRef(null)
  const selected = conversations.find(item => item.id === selectedId)
  const selectedAgent = VAULT_AGENTS.find(item => item.id === selected?.agent) || VAULT_AGENTS[0]

  useEffect(() => {
    messageEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [selected?.messages.length, sending])

  function submit(event) {
    event.preventDefault()
    if (!draft.trim() || sending || !selected) return
    onSend(draft, selectedPhotoId)
    setDraft('')
    setSelectedPhotoId('')
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <aside className="vault-chat-panel" aria-label="Chats de la bóveda">
      <header className="vault-chat-header">
        <div className="vault-chat-heading"><span className="chat-brand-icon"><Bot size={17} /></span><div><strong>Agentes</strong><small>Chats de la bóveda</small></div></div>
        <button type="button" className="chat-icon-button" title="Cerrar chat" onClick={onClose}><X size={18} /></button>
      </header>
      <div className="vault-chat-create">
        <label htmlFor="vault-agent-select">Nuevo chat</label>
        <div className="vault-chat-create-row">
          <span className="select-wrap"><select id="vault-agent-select" value={agent} onChange={event => setAgent(event.target.value)}>{VAULT_AGENTS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={14} /></span>
          <button type="button" className="chat-new-button" title="Crear conversación" onClick={() => onCreate(agent)}><MessageSquarePlus size={16} /></button>
        </div>
      </div>

      <div className="vault-chat-list" aria-label="Conversaciones">
        {conversations.map(conversation => {
          const itemAgent = VAULT_AGENTS.find(item => item.id === conversation.agent) || VAULT_AGENTS[0]
          return <div key={conversation.id} className={`vault-chat-list-row ${conversation.id === selectedId ? 'selected' : ''}`}>
            <button type="button" className="vault-chat-select" onClick={() => onSelect(conversation.id)}><strong>{conversation.title || 'Nuevo chat'}</strong><small>{itemAgent.name} · {conversation.messages.length} mensajes</small></button>
            <button type="button" className="chat-icon-button chat-delete-button" title="Eliminar conversación" onClick={() => onDelete(conversation.id)}><Trash2 size={14} /></button>
          </div>
        })}
      </div>

      <section className="vault-chat-conversation">
        {selected ? <>
          <div className="vault-chat-conversation-heading"><span className="agent-status-dot" /><div><strong>{selectedAgent.name}</strong><small>{selectedAgent.detail}</small></div></div>
          <div className="vault-chat-messages">
            {selected.messages.length ? selected.messages.map((message, index) => <article key={`${selected.id}-${index}`} className={`vault-chat-message ${message.role === 'assistant' ? 'from-agent' : 'from-user'}`}><span className="message-avatar">{message.role === 'assistant' ? <Bot size={14} /> : 'T'}</span><div><small>{message.role === 'assistant' ? selectedAgent.name : 'Tú'}</small><p>{message.content}</p>{message.attachment && <span className="chat-image-attachment"><ImageIcon size={12} />{message.attachment.name}</span>}</div></article>) : <div className="chat-empty"><Bot size={24} /><strong>Empieza la conversación</strong><span>Este agente solo conoce lo que escribas aquí.</span></div>}
            {sending && <div className="chat-typing"><span /><span /><span />{selectedAgent.name} está pensando</div>}
            <div ref={messageEnd} />
          </div>
          {error && <div className="vault-chat-error" role="alert">{error}<button type="button" title="Cerrar aviso" onClick={onClearError}><X size={13} /></button></div>}
          <form className="vault-chat-composer" onSubmit={submit}>
            <textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={handleKeyDown} placeholder={`Mensaje para ${selectedAgent.name.toLowerCase()}…`} rows={2} maxLength={6000} disabled={sending} />
            {photos.length > 0 && <label className="chat-photo-picker"><ImageIcon size={14} /><select value={selectedPhotoId} onChange={event => setSelectedPhotoId(event.target.value)} disabled={sending}><option value="">Sin foto adjunta</option>{photos.map(photo => <option key={photo.id} value={photo.id}>{photo.name}</option>)}</select></label>}
            <div className="chat-composer-footer"><small>Enter para enviar · Mayús+Enter para salto</small><button type="submit" title="Enviar mensaje" disabled={!draft.trim() || sending}><Send size={15} /></button></div>
          </form>
        </> : <div className="chat-no-selection"><Bot size={26} /><p>Crea un chat con un agente para empezar.</p></div>}
      </section>

      <footer className="vault-chat-privacy">Los chats se guardan cifrados. Gemini recibe el texto y solo la foto que adjuntes; nunca se envía la galería ni video.</footer>
    </aside>
  )
}
