import React, { useState, useEffect } from 'react'
import { Folder, Image as ImageIcon, Video, Tag, Calendar, Upload, Settings, LogOut, ChevronRight, Loader2, Menu, X } from 'lucide-react'
import { supabase } from './supabase'
import { encryptFile, decryptFile, hashPassword, warmKey } from './cryptoUtils'
import EnhancedVideoPlayer from './EnhancedVideoPlayer'
import Login from './Login'
import { getCachedMedia, setCachedMedia, clearVaultCache } from './cacheUtils'

// Cache global en memoria para archivos ya desencriptados
const mediaCache = {};

// Datos de señuelo (paisajes, memes, recetas) para la Bóveda de Señuelo
const DECOY_FOLDERS = [
  { id: 'decoy-paisajes', name: 'paisajes', display_order: 1 },
  { id: 'decoy-memes', name: 'memes', display_order: 2 },
  { id: 'decoy-recetas', name: 'recetas', display_order: 3 }
];

const DECOY_FILES = [
  // Paisajes
  {
    id: 'decoy-f1',
    folder_id: 'decoy-paisajes',
    name: 'Atardecer en la montaña.jpg',
    type: 'image',
    mime_type: 'image/jpeg',
    url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80',
    storage_path: 'mock-drive-1',
    created_at: new Date(Date.now() - 3600000 * 24 * 3).toISOString()
  },
  {
    id: 'decoy-f2',
    folder_id: 'decoy-paisajes',
    name: 'Lago Espejo.jpg',
    type: 'image',
    mime_type: 'image/jpeg',
    url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1200&q=80',
    storage_path: 'mock-drive-2',
    created_at: new Date(Date.now() - 3600000 * 24 * 2).toISOString()
  },
  {
    id: 'decoy-v1',
    folder_id: 'decoy-paisajes',
    name: 'Rio Silencioso.mp4',
    type: 'video',
    mime_type: 'video/mp4',
    url: 'https://assets.mixkit.co/videos/preview/mixkit-forest-stream-in-the-sunlight-529-large.mp4',
    storage_path: 'mock-drive-v1',
    created_at: new Date(Date.now() - 3600000 * 24).toISOString()
  },
  // Memes
  {
    id: 'decoy-f3',
    folder_id: 'decoy-memes',
    name: 'Gato programador gracioso.jpg',
    type: 'image',
    mime_type: 'image/jpeg',
    url: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=1200&q=80',
    storage_path: 'mock-drive-3',
    created_at: new Date(Date.now() - 3600000 * 12).toISOString()
  },
  {
    id: 'decoy-f4',
    folder_id: 'decoy-memes',
    name: 'Trabajando duro.jpg',
    type: 'image',
    mime_type: 'image/jpeg',
    url: 'https://images.unsplash.com/photo-1531427186611-ecfd6d936c79?auto=format&fit=crop&w=1200&q=80',
    storage_path: 'mock-drive-4',
    created_at: new Date(Date.now() - 3600000 * 4).toISOString()
  },
  // Recetas
  {
    id: 'decoy-f5',
    folder_id: 'decoy-recetas',
    name: 'Panqueques perfectos.jpg',
    type: 'image',
    mime_type: 'image/jpeg',
    url: 'https://images.unsplash.com/photo-1528207776546-365bb710ee93?auto=format&fit=crop&w=1200&q=80',
    storage_path: 'mock-drive-5',
    created_at: new Date(Date.now() - 3600000 * 8).toISOString()
  }
];

function MediaItem({ file, session, masterPassword, onEdit, onDelete, onSelect }) {
  const [url, setUrl] = useState(null)
  const [decrypting, setDecrypting] = useState(true)

  useEffect(() => {
    // Si es un archivo de señuelo, tiene su url directa cargada de internet y no requiere desencriptado pesado
    if (file.id && file.id.toString().startsWith('decoy')) {
      setUrl(file.url);
      setDecrypting(false);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        load();
        observer.disconnect();
      }
    }, { threshold: 0.1 });

    const el = document.getElementById(`media-${file.id}`);
    if (el) observer.observe(el);

    async function load() {
      try {
        if (!session?.provider_token) return;

        // 1. Revisar caché en memoria
        if (mediaCache[file.storage_path]) {
          setUrl(mediaCache[file.storage_path]);
          setDecrypting(false);
          return;
        }

        // 2. Revisar caché persistente (IndexedDB)
        console.log('🔍 Buscando en caché local persistente...', file.name);
        const cachedBlob = await getCachedMedia(file.storage_path);
        if (cachedBlob) {
          console.log('✨ Encontrado en caché persistente!');
          const localUrl = URL.createObjectURL(cachedBlob);
          mediaCache[file.storage_path] = localUrl;
          setUrl(localUrl);
          setDecrypting(false);
          return;
        }

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
        // Esto ahora corre en un Web Worker en segundo plano a 60 FPS
        const decryptedBuffer = await decryptFile(encryptedBuffer, masterPassword);

        console.log('✅ Desencriptado con éxito!');
        const blob = new Blob([decryptedBuffer], { type: file.mime_type || 'image/jpeg' });
        const localUrl = URL.createObjectURL(blob);

        // Guardar en ambos cachés
        mediaCache[file.storage_path] = localUrl;
        await setCachedMedia(file.storage_path, blob);

        setUrl(localUrl);
      } catch (err) {
        console.error('💥 Error crítico en MediaItem:', err);
      } finally {
        setDecrypting(false);
      }
    }

    return () => observer.disconnect();
  }, [file.storage_path, session, masterPassword]);

  return (
    <div id={`media-${file.id}`} className="media-card glass" onClick={() => (url && onSelect({ ...file, url }))} style={{ cursor: 'pointer' }}>
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

  // Estado para el modo señuelo y claves alternativas
  const [isDecoyMode, setIsDecoyMode] = useState(false)
  const [decoyFolders, setDecoyFolders] = useState([])
  const [decoyFiles, setDecoyFiles] = useState([])
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [decoyPasswordInput, setDecoyPasswordInput] = useState('')

  useEffect(() => {
    // Si no hay clave, pedirla nada más entrar
    async function checkPassword() {
      if (user && !masterPassword) {
        const pass = prompt('Introduce tu Clave Maestra para acceder a la bóveda encriptada:')
        if (pass) {
          // Comprobar Clave de Coacción (Señuelo)
          const enteredHash = await hashPassword(pass);
          const savedDecoyHash = localStorage.getItem('vault_decoy_hash');

          if (savedDecoyHash && enteredHash === savedDecoyHash) {
            console.log('⚠️ INICIANDO SESIÓN EN MODO SEÑUELO');
            setIsDecoyMode(true);
            setDecoyFolders(DECOY_FOLDERS);
            setDecoyFiles(DECOY_FILES);
            setFolders(DECOY_FOLDERS);
            setActiveTab('paisajes');
            setMasterPassword(pass);
          } else {
            console.log('🔐 INICIANDO SESIÓN REAL');
            setIsDecoyMode(false);
            setMasterPassword(pass);
            // ⚡ Pre-calentar la clave PBKDF2 en el Worker AHORA,
            // antes de que aparezca cualquier foto o video en pantalla.
            // Así el primer descifrado será instantáneo en lugar de tardar 1-2 seg.
            warmKey(pass).then(() => console.log('🔥 Clave pre-calentada en Worker'));
          }
        }
      }
    }
    checkPassword();
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
  }, [user, activeTab, isDecoyMode, decoyFolders])

  useEffect(() => {
    if (user && currentFolderId) {
      fetchFiles()
    }
  }, [user, currentFolderId, searchQuery, isDecoyMode, decoyFiles])

  const updateCurrentFolder = async () => {
    if (isDecoyMode) {
      const currentList = decoyFolders.length ? decoyFolders : DECOY_FOLDERS;
      const found = currentList.find(f => f.name === activeTab);
      if (found) {
        setCurrentFolderId(found.id);
      } else {
        setCurrentFolderId(null);
      }
      return;
    }

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
    if (isDecoyMode) {
      const currentList = decoyFolders.length ? decoyFolders : DECOY_FOLDERS;
      setFolders(currentList);
      return;
    }

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
      if (isDecoyMode) {
        // Simulamos una latencia de carga
        setTimeout(() => {
          const currentList = decoyFiles.length ? decoyFiles : DECOY_FILES;
          let filtered = currentList.filter(f => f.folder_id === currentFolderId);
          if (searchQuery) {
            filtered = filtered.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
          }
          setFiles(filtered);
          setLoading(false);
        }, 200);
        return;
      }

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
      if (!isDecoyMode) setLoading(false)
    }
  }

  const handleUpload = async (e) => {
    const selectedFiles = Array.from(e.target.files)
    if (selectedFiles.length === 0) return

    // 1. Simulación total en modo Señuelo
    if (isDecoyMode) {
      setUploading(true)
      let successCount = 0;
      
      // Simulamos la animación y carga de encriptación progresiva
      await new Promise(resolve => setTimeout(resolve, 800 * selectedFiles.length));
      
      const newFiles = [...decoyFiles];
      for (const file of selectedFiles) {
        const localUrl = URL.createObjectURL(file);
        newFiles.unshift({
          id: `decoy-uploaded-${Date.now()}-${successCount}`,
          folder_id: currentFolderId,
          name: file.name,
          type: file.type.startsWith('video') ? 'video' : 'image',
          mime_type: file.type,
          url: localUrl,
          storage_path: `mock-drive-uploaded-${Date.now()}`,
          created_at: new Date().toISOString()
        });
        successCount++;
      }
      
      setDecoyFiles(newFiles);
      setUploading(false);
      alert(`¡Éxito! Se han encriptado y subido ${successCount} archivos (Modo Señuelo).`);
      return;
    }

    if (!session?.provider_token) return alert('Inicia sesión con Google para usar el Drive');

    if (!masterPassword) {
      const pass = prompt('Clave Maestra requerida para encriptar:')
      if (!pass) return
      setMasterPassword(pass)
    }

    setUploading(true)
    let successCount = 0;

    try {
      for (const file of selectedFiles) {
        console.log(`🔐 Procesando (${successCount + 1}/${selectedFiles.length}): ${file.name}`);

        // 1. Encriptar
        const buffer = await file.arrayBuffer();
        // Esto ahora corre en un Web Worker en segundo plano sin congelar la UI
        const encryptedData = await encryptFile(buffer, masterPassword);

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
        if (!driveData.id) throw new Error(`Google Drive upload failed for ${file.name}`);

        // 3. Registrar en Supabase
        const { error: dbError } = await supabase
          .from('files')
          .insert({
            folder_id: currentFolderId,
            name: file.name,
            storage_path: driveData.id,
            type: file.type.startsWith('video') ? 'video' : 'image',
            mime_type: file.type,
            user_id: user.id
          });

        if (dbError) throw dbError;
        successCount++;
      }

      alert(`¡Éxito! Se han encriptado y subido ${successCount} archivos.`);
      fetchFiles();
    } catch (err) {
      console.error(err);
      alert(`Error tras subir ${successCount} archivos: ` + err.message);
    } finally {
      setUploading(false)
    }
  }

  const editFileName = async (fileId, currentName) => {
    if (isDecoyMode) {
      const newName = prompt('Nuevo nombre:', currentName)
      if (!newName || newName === currentName) return
      setDecoyFiles(prev => prev.map(f => f.id === fileId ? { ...f, name: newName } : f));
      return;
    }

    const newName = prompt('Nuevo nombre:', currentName)
    if (!newName || newName === currentName) return
    const { error } = await supabase.from('files').update({ name: newName }).eq('id', fileId)
    if (!error) fetchFiles()
  }

  const deleteFile = async (fileId) => {
    if (isDecoyMode) {
      if (!confirm('¿Borrar archivo?')) return
      setDecoyFiles(prev => prev.filter(f => f.id !== fileId));
      return;
    }

    if (!confirm('¿Borrar archivo?')) return
    const { error } = await supabase.from('files').delete().eq('id', fileId)
    if (!error) fetchFiles()
  }

  const createFolder = async (e) => {
    e.preventDefault()
    if (!newFolderName.trim()) return

    if (isDecoyMode) {
      const newFolder = {
        id: `decoy-folder-${Date.now()}`,
        name: newFolderName.toLowerCase(),
        display_order: decoyFolders.length + 1
      };
      const updated = [...decoyFolders, newFolder];
      setDecoyFolders(updated);
      setFolders(updated);
      setNewFolderName('')
      setShowNewFolderModal(false)
      return;
    }

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
    if (isDecoyMode) {
      if (!confirm(`¿Borrar carpeta ${name}?`)) return
      const updated = decoyFolders.filter(f => f.id !== id);
      setDecoyFolders(updated);
      setFolders(updated);
      if (activeTab === name) {
        setActiveTab(updated[0]?.name || '');
      }
      return;
    }

    if (!confirm(`¿Borrar carpeta ${name}?`)) return
    const { error } = await supabase.from('folders').delete().eq('id', id)
    if (!error) fetchFolders()
  }

  const handleLogout = async () => {
    if (isDecoyMode) {
      // Limpiar datos temporales
      setDecoyFiles([]);
      setDecoyFolders([]);
      setIsDecoyMode(false);
      setMasterPassword('');
      setSession(null);
      setUser(null);
      await supabase.auth.signOut();
      return;
    }

    if (confirm('¿Deseas borrar también el caché local persistente por seguridad? (Si no, las fotos cargarán más rápido la próxima vez)')) {
      await clearVaultCache();
    }
    // Limpiar caché de sesión
    Object.values(mediaCache).forEach(url => URL.revokeObjectURL(url));
    Object.keys(mediaCache).forEach(key => delete mediaCache[key]);
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.6rem', color: isDecoyMode ? '#60a5fa' : (masterPassword ? '#4ade80' : '#ff4444') }}>
            <Tag size={10} /> {isDecoyMode ? 'Bóveda de Señuelo Activa' : (masterPassword ? 'Bóveda Desbloqueada' : 'Bóveda Bloqueada')}
          </div>
        </div>

        <nav style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', fontWeight: 600, padding: '0 16px 8px', textTransform: 'uppercase' }}>Secciones</div>
          {folders.map(cat => (
            <div key={cat.id} className={`category-item ${activeTab === cat.name ? 'active' : ''}`} onClick={() => { setActiveTab(cat.name); setIsSidebarOpen(false); }} style={{ display: 'flex', justifyContent: 'space-between' }}>
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
          
          <div className="category-item" onClick={() => setShowSettingsModal(true)} style={{ border: '1px dashed var(--glass-border)', marginTop: '10px', justifyContent: 'center', background: 'rgba(96, 165, 250, 0.05)' }}>
            <Settings size={18} style={{ color: '#60a5fa' }} />
            <span style={{ color: '#60a5fa' }}>Configurar Señuelo</span>
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
            <input type="file" onChange={handleUpload} style={{ display: 'none' }} disabled={uploading} multiple />
          </label>
          <div className="category-item" onClick={handleLogout} style={{ cursor: 'pointer' }}>
            <LogOut size={18} /> Cerrar Bóveda
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 700, textTransform: 'capitalize' }}>{activeTab}</h2>
          <div className="glass" style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', gap: '8px' }}>
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

      {/* Settings Modal (Configurar Clave de Coacción) */}
      {showSettingsModal && (
        <div className="lightbox-overlay" onClick={() => setShowSettingsModal(false)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.85)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(10px)', padding: '20px'
        }}>
          <div className="lightbox-content glass" onClick={e => e.stopPropagation()} style={{
            position: 'relative', width: '100%', maxWidth: '420px', padding: '30px',
            display: 'flex', flexDirection: 'column', gap: '20px', borderRadius: '12px',
            border: '1px solid var(--glass-border)', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)'
          }}>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, color: 'white' }}>Clave de Coacción</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', lineHeight: '1.5' }}>
              Define una clave alternativa de señuelo. Si ingresas esta clave al abrir la bóveda frente a terceros, la aplicación fingirá abrirse con normalidad, pero solo mostrará fotos de paisajes e inofensivas en lugar de tus archivos reales.
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 600 }}>Nueva Clave de Señuelo:</label>
              <input 
                type="password" 
                className="glass" 
                placeholder="Ej. clavefalsa123" 
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', outline: 'none', color: 'white', borderRadius: '6px' }}
                value={decoyPasswordInput}
                onChange={e => setDecoyPasswordInput(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button className="glow-btn" style={{ flex: 1, padding: '10px', fontSize: '0.9rem', cursor: 'pointer' }} onClick={async () => {
                if (!decoyPasswordInput.trim()) {
                  alert('Por favor, introduce una clave válida');
                  return;
                }
                const hash = await hashPassword(decoyPasswordInput);
                localStorage.setItem('vault_decoy_hash', hash);
                alert('¡Clave de Coacción establecida con éxito! Pruébala la próxima vez que inicies sesión.');
                setDecoyPasswordInput('');
                setShowSettingsModal(false);
              }}>Guardar Clave</button>
              
              <button className="glow-btn" style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', fontSize: '0.9rem', cursor: 'pointer' }} onClick={() => {
                localStorage.removeItem('vault_decoy_hash');
                alert('Clave de Coacción eliminada.');
                setShowSettingsModal(false);
              }}>Desactivar</button>
            </div>
            
            <button onClick={() => setShowSettingsModal(false)} style={{
              position: 'absolute', top: '15px', right: '15px',
              background: 'none', border: 'none', color: 'white',
              cursor: 'pointer', fontSize: '1.2rem', outline: 'none'
            }}>✕</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
