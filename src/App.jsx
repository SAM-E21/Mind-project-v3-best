import React, { useState, useEffect } from 'react'
import { Folder, Image as ImageIcon, Video, Tag, Calendar, Upload, Settings, LogOut, ChevronRight, Loader2, Menu, X } from 'lucide-react'
import { supabase } from './supabase'
import { encryptFile, decryptFile } from './cryptoUtils'
import EnhancedVideoPlayer from './EnhancedVideoPlayer'
import Login from './Login'

function MediaItem({ file, session, masterPassword, onEdit, onDelete, onSelect }) {
  const [url, setUrl] = useState(null)
  const [decrypting, setDecrypting] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        if (!session?.provider_token) return;
        
        console.log('📦 Descargando de Drive...', file.storage_path);
        const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${file.storage_path}?alt=media`, {
          headers: { Authorization: `Bearer ${session.provider_token}` }
        });
        if (!resp.ok) {
          const errorText = await resp.text();
          console.error('❌ Error Drive:', resp.status, errorText);
          throw new Error('Drive error');
        }
        
        const encryptedBuffer = await resp.arrayBuffer();
        console.log('🔐 Desencriptando...', file.name);
        const decryptedBuffer = await decryptFile(encryptedBuffer, masterPassword);
        
        console.log('✅ Desencriptado con éxito!');
        const blob = new Blob([decryptedBuffer], { type: file.mime_type || 'image/jpeg' });
        const localUrl = URL.createObjectURL(blob);
        setUrl(localUrl);
      } catch (err) {
        console.error('💥 Error crítico en MediaItem:', err);
      } finally {
        setDecrypting(false);
      }
    }
    load();
  }, [file.storage_path, session, masterPassword]);

  return (
    <div className="media-card glass" onClick={() => (url && onSelect({ ...file, url }))} style={{ cursor: 'pointer' }}>
      {decrypting ? (
        <div style={{ height: '200px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <Loader2 className="animate-spin" size={24} />
          <span style={{ fontSize: '0.7rem' }}>Desencriptando...</span>
        </div>
      ) : !url ? (
        <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff4444' }}>⚠️ Error</div>
      ) : (
        file.type === 'video' ? <video src={url} /> : <img src={url} alt={file.name} loading="lazy" />
      )}
      <div className="card-overlay" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '8px', background: 'linear-gradient(transparent, rgba(0,0,0,0.8))', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Settings size={14} onClick={(e) => { e.stopPropagation(); onEdit(file.id, file.name); }} style={{ cursor: 'pointer' }} />
          <LogOut size={14} onClick={(e) => { e.stopPropagation(); onDelete(file.id); }} style={{ cursor: 'pointer', color: '#ef4444' }} />
        </div>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [files, setFiles] = useState([])
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('fotos')
  const [currentFolderId, setCurrentFolderId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [uploading, setUploading] = useState(false)
  const [showNewFolderModal, setShowNewFolderModal] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [masterPassword, setMasterPassword] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  useEffect(() => {
    // Si no hay clave, pedirla nada más entrar
    if (user && !masterPassword) {
      const pass = prompt('Introduce tu Clave Maestra para acceder a la bóveda encriptada:')
      if (pass) setMasterPassword(pass)
    }
  }, [user, masterPassword])

  useEffect(() => {
    console.log('🔄 App Montando. URL:', window.location.href);
    console.log('🔗 Supabase Config:', { 
      url: import.meta.env.VITE_SUPABASE_URL ? '✅ Definida' : '❌ UNDEFINED',
      key_prefix: import.meta.env.VITE_SUPABASE_ANON_KEY ? import.meta.env.VITE_SUPABASE_ANON_KEY.substring(0, 8) + '...' : '❌ UNDEFINED'
    });
    
    // Si hay un hash en la URL, es probable que estemos volviendo de Google
    const carriesSession = window.location.hash && window.location.hash.includes('access_token');
    
    if (carriesSession) {
      console.log('⚡ Detectado token en URL. Intentando captura manual...');
      const params = new URLSearchParams(window.location.hash.substring(1));
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      if (access_token && refresh_token) {
        supabase.auth.setSession({ access_token, refresh_token }).then(({ data, error }) => {
          if (error) console.error('❌ Error en setSession manual:', error);
          else if (data.session) {
            console.log('✅ Sesión manual establecida');
            setSession(data.session);
            setUser(data.session.user);
            setLoading(false);
          }
        });
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('📦 Sesión inicial SDK:', session ? '✅ Existe' : '❌ Nula');
      
      let finalSession = session;
      if (session) {
        if (session.provider_token) {
          sessionStorage.setItem('google_token', session.provider_token);
        } else {
          const storedToken = sessionStorage.getItem('google_token');
          if (storedToken) session.provider_token = storedToken;
        }
        setSession(session)
        setUser(session.user)
        setLoading(false)
      } else if (!carriesSession) {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('🔔 Evento Auth:', event, session ? '✅ Sesión Activa' : '❌ Sin Sesión');
      
      if (session) {
        if (session.provider_token) {
          sessionStorage.setItem('google_token', session.provider_token);
        } else {
          const storedToken = sessionStorage.getItem('google_token');
          if (storedToken) session.provider_token = storedToken;
        }
        setSession(session)
        setUser(session.user)
        setLoading(false)
      } else if (event === 'SIGNED_OUT') {
        sessionStorage.removeItem('google_token');
        setSession(null)
        setUser(null)
        setLoading(false)
      }
    })

    // Timeout de seguridad: Si pasan 5 segundos y seguimos en loading, mostramos algo
    const timer = setTimeout(() => {
      setLoading(false);
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    }
  }, [])

  useEffect(() => {
    if (user) {
      fetchFolders()
      updateCurrentFolder()
    }
  }, [user, activeTab])

  useEffect(() => {
    if (user && currentFolderId) {
      fetchFiles()
    }
  }, [user, currentFolderId, searchQuery])

  const updateCurrentFolder = async () => {
    const { data } = await supabase
      .from('folders')
      .select('id')
      .eq('name', activeTab)
      .limit(1)
    
    if (data && data.length > 0) {
      setCurrentFolderId(data[0].id)
    } else {
      setCurrentFolderId(null)
      setFiles([])
    }
  }

  const fetchFolders = async () => {
    const { data } = await supabase
      .from('folders')
      .select('*')
      .order('display_order', { ascending: true })
    if (data) setFolders(data)
  }

  const fetchFiles = async () => {
    if (!currentFolderId) {
      setFiles([])
      return
    }
    setLoading(true)
    try {
      let query = supabase
        .from('files')
        .select('*')
        .eq('folder_id', currentFolderId)
        .order('created_at', { ascending: false })

      if (searchQuery) {
        query = query.ilike('name', `%${searchQuery}%`)
      }

      const { data, error } = await query
      if (error) throw error
      setFiles(data || [])
    } catch (err) {
      console.error('Error al cargar archivos:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!session?.provider_token) return alert('Inicia sesión con Google para usar el Drive');

    const customTitle = prompt('Nombre del archivo:', file.name)
    if (!customTitle) return

    setUploading(true)
    try {
      if (!masterPassword) {
        const pass = prompt('Clave Maestra requerida para encriptar:')
        if (!pass) return
        setMasterPassword(pass)
      }
      
      // 1. Encriptar
      console.log('🔐 Encriptando...');
      const buffer = await file.arrayBuffer();
      const encryptedData = await encryptFile(buffer, masterPassword || pass);

      // 2. Subir a Google Drive
      const metadata = {
        name: `vault_${Date.now()}_${file.name}.enc`,
        mimeType: 'application/octet-stream'
      };

      const formData = new FormData();
      formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      formData.append('file', new Blob([encryptedData], { type: 'application/octet-stream' }));

      const driveResp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.provider_token}` },
        body: formData
      });
      
      const driveData = await driveResp.json();
      if (!driveData.id) throw new Error('Google Drive upload failed');

      // 3. Registrar en Supabase
      const { error: dbError } = await supabase
        .from('files')
        .insert({
          folder_id: currentFolderId,
          name: customTitle,
          storage_path: driveData.id,
          type: file.type.startsWith('video') ? 'video' : 'image',
          mime_type: file.type,
          user_id: user.id
        });

      if (dbError) throw dbError;
      
      alert('¡Encriptado y guardado en Drive con éxito!');
      fetchFiles();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setUploading(false)
    }
  }

  const editFileName = async (fileId, currentName) => {
    const newName = prompt('Nuevo nombre:', currentName)
    if (!newName || newName === currentName) return
    const { error } = await supabase.from('files').update({ name: newName }).eq('id', fileId)
    if (!error) fetchFiles()
  }

  const deleteFile = async (fileId) => {
    if (!confirm('¿Borrar archivo?')) return
    const { error } = await supabase.from('files').delete().eq('id', fileId)
    if (!error) fetchFiles()
  }

  const createFolder = async (e) => {
    e.preventDefault()
    if (!newFolderName.trim()) return
    const { data, error } = await supabase
      .from('folders')
      .insert({ name: newFolderName, user_id: user.id, display_order: folders.length + 1 })
      .select().single()
    if (!error) {
      setFolders([...folders, data])
      setNewFolderName('')
      setShowNewFolderModal(false)
    }
  }

  const deleteFolder = async (id, name) => {
    if (!confirm(`¿Borrar carpeta ${name}?`)) return
    const { error } = await supabase.from('folders').delete().eq('id', id)
    if (!error) fetchFolders()
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  if (loading && !user) return <div className="loading">Accediendo a la bóveda...</div>
  if (!user) return <Login onLogin={setUser} />

  return (
    <div className="app-container">
      {/* Mobile Toggle */}
      <button 
        className="mobile-nav-toggle glass" 
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        style={{ border: 'none', color: 'white', cursor: 'pointer' }}
      >
        {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar Overlay for Mobile */}
      {isSidebarOpen && <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)}></div>}

      <aside className={`sidebar glass ${isSidebarOpen ? 'open' : ''}`}>
        <div style={{ padding: '0 10px', marginBottom: '20px' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Vault.</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.6rem', color: masterPassword ? '#4ade80' : '#ff4444' }}>
            <Tag size={10} /> {masterPassword ? 'Bóveda Desbloqueada' : 'Bóveda Bloqueada'}
          </div>
        </div>
        
        <nav style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', fontWeight: 600, padding: '0 16px 8px', textTransform: 'uppercase' }}>Secciones</div>
          {folders.map(cat => (
          <div className={`category-item ${activeTab === cat.name ? 'active' : ''}`} onClick={() => { setActiveTab(cat.name); setIsSidebarOpen(false); }} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Folder size={18} />
                <span style={{ textTransform: 'capitalize' }}>{cat.name}</span>
              </div>
              <LogOut size={14} style={{ opacity: 0.3, cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); deleteFolder(cat.id, cat.name); }} />
            </div>
          ))}
          <div className="category-item" onClick={() => setShowNewFolderModal(true)} style={{ border: '1px dashed var(--glass-border)', marginTop: '20px', justifyContent: 'center' }}>
            <span>+ Nueva Carpeta</span>
          </div>
        </nav>

        {showNewFolderModal && (
          <form onSubmit={createFolder} className="glass" style={{ padding: '15px', display: 'flex', gap: '8px' }}>
            <input autoFocus className="glass" style={{ flex: 1, padding: '8px', border: 'none', color: 'white' }} placeholder="Nombre..." value={newFolderName} onChange={e => setNewFolderName(e.target.value)} />
            <button className="glow-btn" style={{ padding: '8px' }}>OK</button>
          </form>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <label className="glow-btn" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', opacity: uploading ? 0.7 : 1 }}>
            <Upload size={18} /> {uploading ? 'Encriptando...' : 'Subir a Drive'}
            <input type="file" onChange={handleUpload} style={{ display: 'none' }} disabled={uploading} />
          </label>
          <div className="category-item" onClick={handleLogout} style={{ cursor: 'pointer' }}>
            <LogOut size={18} /> Cerrar Bóveda
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 700, textTransform: 'capitalize' }}>{activeTab}</h2>
          <div className="glass" style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', gap: '8px' }}>
            <Settings size={16} />
            <input type="text" placeholder="Buscar en la bóveda..." className="glass" style={{ background: 'transparent', border: 'none', color: 'white', outline: 'none' }} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
        </header>

        <div className="media-grid">
          {loading && <div style={{ gridColumn: '1/-1', textAlign: 'center' }}>Abriendo archivos...</div>}
          {!loading && files.length === 0 ? (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '100px', color: 'var(--text-dim)' }}>La bóveda está vacía</div>
          ) : (
            files.map(file => (
              <MediaItem 
                key={file.id} 
                file={file} 
                session={session} 
                masterPassword={masterPassword}
                onEdit={editFileName}
                onDelete={deleteFile}
                onSelect={setSelectedFile}
              />
            ))
          )}
        </div>
      </main>

      {/* Lightbox Modal */}
      {selectedFile && (
        <div className="lightbox-overlay" onClick={() => setSelectedFile(null)} style={{ 
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          background: 'rgba(0,0,0,0.9)', zIndex: 1000, 
          display: 'flex', alignItems: 'center', justifyContent: 'center', 
          backdropFilter: 'blur(10px)', padding: '20px' 
        }}>
          <div className="lightbox-content" onClick={e => e.stopPropagation()} style={{ 
            position: 'relative', width: 'auto', maxWidth: '95vw', maxHeight: '95vh',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
          }}>
            <button onClick={() => setSelectedFile(null)} style={{ 
              position: 'absolute', top: '-45px', right: '0', 
              background: 'white', border: 'none', color: 'black', 
              cursor: 'pointer', borderRadius: '50%', width: '32px', height: '32px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold'
            }}>✕</button>
            
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {selectedFile.type === 'video' ? (
                <EnhancedVideoPlayer src={selectedFile.url} />
              ) : (
                <img src={selectedFile.url} alt={selectedFile.name} style={{ 
                  maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: '8px',
                  boxShadow: '0 0 50px rgba(0,0,0,0.8)'
                }} />
              )}
            </div>
            
            <div style={{ marginTop: '15px', color: 'white', textAlign: 'center' }}>
              <h3 style={{ margin: 0 }}>{selectedFile.name}</h3>
              <p style={{ opacity: 0.6, fontSize: '0.8rem' }}>{selectedFile.type === 'video' ? 'Video Encriptado' : 'Imagen Encriptada'}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
