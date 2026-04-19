import React, { useRef, useState } from 'react';
import { Play, Pause, RotateCcw, RotateCw, FastForward, Maximize } from 'lucide-react';

export default function EnhancedVideoPlayer({ src, type }) {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlay = () => {
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const skip = (amount) => {
    videoRef.current.currentTime += amount;
  };

  const changeRate = (rate) => {
    videoRef.current.playbackRate = rate;
    setPlaybackRate(rate);
  };

  const handleTimeUpdate = () => {
    setCurrentTime(videoRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    setDuration(videoRef.current.duration);
  };

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  return (
    <div className="video-player-container glass" style={{ position: 'relative', width: '100%', borderRadius: '12px', overflow: 'hidden' }}>
      <video
        ref={videoRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onClick={togglePlay}
        style={{ 
          width: '100%', 
          maxHeight: '75vh', 
          display: 'block', 
          objectFit: 'contain',
          background: '#000' 
        }}
      />
      
      <div className="video-controls" style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '15px',
        background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        opacity: 0,
        transition: 'opacity 0.3s'
      }}>
        {/* Progress Bar */}
        <input
          type="range"
          min="0"
          max={duration || 0}
          value={currentTime}
          onChange={handleSeek}
          style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary-color)' }}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <button onClick={togglePlay} className="control-btn glass" style={{ border: 'none', color: 'white', padding: '5px' }}>
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <button onClick={() => skip(-10)} className="control-btn" style={{ background: 'none', border: 'none', color: 'white' }}>
              <RotateCcw size={18} />
            </button>
            <button onClick={() => skip(10)} className="control-btn" style={{ background: 'none', border: 'none', color: 'white' }}>
              <RotateCw size={18} />
            </button>
            <span style={{ fontSize: '0.8rem', color: 'white' }}>
              {Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60).toString().padStart(2, '0')} / 
              {Math.floor(duration / 60)}:{Math.floor(duration % 60).toString().padStart(2, '0')}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <select 
              value={playbackRate} 
              onChange={(e) => changeRate(parseFloat(e.target.value))}
              className="glass"
              style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', padding: '2px 5px', fontSize: '0.8rem', borderRadius: '4px' }}
            >
              {speeds.map(s => (
                <option key={s} value={s} style={{ background: '#222' }}>{s}x</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      
      <style>{`
        .video-player-container:hover .video-controls { opacity: 1 !important; }
        .control-btn:hover { color: var(--primary-color) !important; transform: scale(1.1); }
      `}</style>
    </div>
  );
}
