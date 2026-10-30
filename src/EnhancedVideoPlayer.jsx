import { useEffect, useRef, useState } from 'react'
import { Maximize, Pause, Play, Repeat, RotateCcw, RotateCw } from 'lucide-react'

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00'
  const total = Math.floor(seconds)
  const minutes = Math.floor(total / 60)
  const remainder = String(total % 60).padStart(2, '0')
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${remainder}`
    : `${minutes}:${remainder}`
}

export default function EnhancedVideoPlayer({ src }) {
  const videoRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [loopAll, setLoopAll] = useState(false)
  const [loopA, setLoopA] = useState(null)
  const [loopB, setLoopB] = useState(null)

  useEffect(() => {
    setIsPlaying(false)
    setPlaybackRate(1)
    setCurrentTime(0)
    setDuration(0)
    setLoopAll(false)
    setLoopA(null)
    setLoopB(null)
  }, [src])

  function togglePlay() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) video.play().catch(() => setIsPlaying(false))
    else video.pause()
  }

  function skip(seconds) {
    if (videoRef.current) videoRef.current.currentTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds))
  }

  function markLoopStart() {
    setLoopA(currentTime)
    setLoopB(null)
    setLoopAll(false)
  }

  function markLoopEnd() {
    if (loopA === null || currentTime <= loopA) return
    setLoopB(currentTime)
  }

  function updateTime() {
    const video = videoRef.current
    if (!video) return
    if (loopA !== null && loopB !== null && video.currentTime >= loopB) {
      video.currentTime = loopA
    }
    setCurrentTime(video.currentTime)
  }

  function seek(event) {
    const time = Number(event.target.value)
    if (videoRef.current) videoRef.current.currentTime = time
    setCurrentTime(time)
  }

  function changeRate(event) {
    const rate = Number(event.target.value)
    if (videoRef.current) videoRef.current.playbackRate = rate
    setPlaybackRate(rate)
  }

  function toggleLoopAll() {
    setLoopAll(value => !value)
    setLoopA(null)
    setLoopB(null)
  }

  function toggleFullscreen() {
    const player = videoRef.current?.closest('.vault-video-player')
    if (player?.requestFullscreen) player.requestFullscreen()
  }

  return (
    <div className="vault-video-player">
      <video
        ref={videoRef}
        src={src}
        playsInline
        loop={loopAll && !(loopA !== null && loopB !== null)}
        onTimeUpdate={updateTime}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onClick={togglePlay}
      />
      <div className="vault-video-controls">
        <input aria-label="Posición del video" className="video-timeline" type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || 0)} onChange={seek} style={{ '--progress': `${duration ? currentTime / duration * 100 : 0}%` }} />
        <div className="video-control-row">
          <div className="video-control-group">
            <button type="button" title={isPlaying ? 'Pausar' : 'Reproducir'} onClick={togglePlay}>{isPlaying ? <Pause size={17} /> : <Play size={17} />}</button>
            <button type="button" title="Retroceder 5 segundos" onClick={() => skip(-5)}><RotateCcw size={16} /><small>5</small></button>
            <button type="button" title="Adelantar 5 segundos" onClick={() => skip(5)}><RotateCw size={16} /><small>5</small></button>
            <span className="video-time">{formatTime(currentTime)} <i>/</i> {formatTime(duration)}</span>
          </div>
          <div className="video-control-group video-control-options">
            <button type="button" className={loopAll ? 'active' : ''} title={loopAll ? 'Desactivar repetición' : 'Repetir video completo'} onClick={toggleLoopAll}><Repeat size={16} /></button>
            <button type="button" className={loopA !== null ? 'active' : ''} title="Marcar inicio del tramo A-B" onClick={markLoopStart}>A</button>
            <button type="button" className={loopB !== null ? 'active' : ''} title="Marcar final del tramo A-B" onClick={markLoopEnd} disabled={loopA === null || currentTime <= loopA}>B</button>
            {loopB !== null && <button type="button" title="Borrar tramo A-B" onClick={() => { setLoopA(null); setLoopB(null) }}>A-B <span>×</span></button>}
            <select aria-label="Velocidad de reproducción" value={playbackRate} onChange={changeRate}>{SPEEDS.map(speed => <option key={speed} value={speed}>{speed}×</option>)}</select>
            <button type="button" title="Pantalla completa" onClick={toggleFullscreen}><Maximize size={16} /></button>
          </div>
        </div>
        {(loopA !== null || loopB !== null) && <div className="loop-status">{loopB === null ? `Inicio A: ${formatTime(loopA)} · marca B después` : `Repetición A-B: ${formatTime(loopA)} – ${formatTime(loopB)}`}</div>}
      </div>
    </div>
  )
}