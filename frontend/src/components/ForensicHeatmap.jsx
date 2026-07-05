import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, Activity } from 'lucide-react';

export default function ForensicHeatmap({ frames, mediaType }) {
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const imageRef = useRef(null);

  const totalFrames = frames.length;
  const currentFrame = frames[currentFrameIdx];

  // Auto-play timer loop
  useEffect(() => {
    let timer = null;
    if (isPlaying && totalFrames > 1) {
      timer = setInterval(() => {
        setCurrentFrameIdx((prev) => (prev + 1) % totalFrames);
      }, 250); // Play at 4fps for clear forensic inspection
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isPlaying, totalFrames]);

  // Handle canvas drawing on image resizing/frame changing
  const drawOverlay = () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !currentFrame) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Wait for image load or use current size
    const displayW = img.clientWidth;
    const displayH = img.clientHeight;
    
    // Set canvas dimensions identical to display sizes
    canvas.width = displayW;
    canvas.height = displayH;
    
    // Clear canvas
    ctx.clearRect(0, 0, displayW, displayH);

    // Get original frame sizes (assumed from bounding boxes or default to coordinate ratio)
    // Draw bounding boxes for faces
    if (currentFrame.faces && currentFrame.faces.length > 0) {
      currentFrame.faces.forEach((face) => {
        // Calculate display scaling
        // If face bbox is [0, 0, w, h] representing full screen
        const isFullScreen = face.bbox[0] === 0 && face.bbox[1] === 0;
        
        let fx, fy, fw, fh;
        
        if (isFullScreen) {
          fx = 0;
          fy = 0;
          fw = displayW;
          fh = displayH;
        } else {
          // Normalize coordinates assuming standard frame sizes (e.g. 960x540 default)
          // For high robustness, we scale coordinates based on image natural boundaries
          const naturalW = img.naturalWidth || 960;
          const naturalH = img.naturalHeight || 540;
          
          const scaleX = displayW / naturalW;
          const scaleY = displayH / naturalH;
          
          fx = face.bbox[0] * scaleX;
          fy = face.bbox[1] * scaleY;
          fw = face.bbox[2] * scaleX;
          fh = face.bbox[3] * scaleY;
        }

        // 1. Draw Bounding Box
        ctx.strokeStyle = face.spatial_score > 60 
          ? '#ef4444' // Neon Red
          : face.spatial_score > 40
            ? '#f59e0b' // Neon Amber
            : '#10b981'; // Neon Emerald
        
        ctx.lineWidth = 2.5;
        ctx.strokeRect(fx, fy, fw, fh);
        
        // Draw corners highlight
        ctx.fillStyle = ctx.strokeStyle;
        const cornerLen = 12;
        // Top Left
        ctx.fillRect(fx - 2, fy - 2, cornerLen, 3);
        ctx.fillRect(fx - 2, fy - 2, 3, cornerLen);
        // Top Right
        ctx.fillRect(fx + fw - cornerLen + 2, fy - 2, cornerLen, 3);
        ctx.fillRect(fx + fw - 3 + 2, fy - 2, 3, cornerLen);
        // Bottom Left
        ctx.fillRect(fx - 2, fy + fh - 3 + 2, cornerLen, 3);
        ctx.fillRect(fx - 2, fy + fh - cornerLen + 2, 3, cornerLen);
        // Bottom Right
        ctx.fillRect(fx + fw - cornerLen + 2, fy + fh - 3 + 2, cornerLen, 3);
        ctx.fillRect(fx + fw - 3 + 2, fy + fh - cornerLen + 2, 3, cornerLen);

        // 2. Draw Bounding Box Header label
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        const label = `ANOMALY: ${face.spectral_score.toFixed(1)}%`;
        const labelWidth = ctx.measureText(label).width;
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fillRect(fx - 1, fy - 14, labelWidth + 8, 14);
        ctx.fillStyle = '#000000';
        ctx.fillText(label, fx + 3, fy - 4);

        // 3. Draw 10x10 Heatmap Grid on Face region
        if (face.heatmap && face.heatmap.length === 10) {
          const cellW = fw / 10;
          const cellH = fh / 10;
          
          for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 10; col++) {
              const cellVal = face.heatmap[row][col];
              if (cellVal > 25) { // Only draw anomalous cells
                const cx = fx + col * cellW;
                const cy = fy + row * cellH;
                
                // Color mapping: scale opacity and color from amber to red
                let opacity = (cellVal - 25) / 75.0; // scale between 0.0 and 1.0
                opacity = Math.min(0.65, Math.max(0.15, opacity));
                
                let fillStyle = `rgba(239, 68, 68, ${opacity})`; // Red
                if (cellVal < 55) {
                  fillStyle = `rgba(245, 158, 11, ${opacity})`; // Amber
                }
                
                ctx.fillStyle = fillStyle;
                ctx.fillRect(cx + 0.5, cy + 0.5, cellW - 1, cellH - 1);
                
                // Draw tiny grid lines in cells with extremely high anomalies
                if (cellVal > 65) {
                  ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
                  ctx.lineWidth = 0.5;
                  ctx.strokeRect(cx, cy, cellW, cellH);
                }
              }
            }
          }
        }
      });
    }
  };

  useEffect(() => {
    drawOverlay();
    // Add event listener to redraw on resize
    window.addEventListener('resize', drawOverlay);
    return () => {
      window.removeEventListener('resize', drawOverlay);
    };
  }, [currentFrameIdx, frames]);

  return (
    <div className="bg-cyber-card border border-cyber-border rounded-xl p-6 shadow-cyber-glow flex flex-col gap-6">
      <div className="flex items-center justify-between border-b border-cyber-border pb-4">
        <div className="flex items-center gap-3">
          <Activity className="text-cyber-accent animate-pulse" size={20} />
          <h2 className="font-mono text-sm tracking-widest text-slate-300 font-bold uppercase">
            Spatiotemporal Artifact Heatmap
          </h2>
        </div>
        <div className="font-mono text-xs text-slate-400">
          FRAME: <span className="text-cyber-accent font-bold">{currentFrameIdx + 1}</span> / {totalFrames}
        </div>
      </div>

      {/* Frame Visual Overlay viewport */}
      <div 
        ref={containerRef}
        className="relative bg-black rounded-lg border border-slate-800 overflow-hidden mx-auto flex items-center justify-center max-w-full"
        style={{ minHeight: '320px' }}
      >
        <img 
          ref={imageRef}
          src={currentFrame.url} 
          alt={`Forensic frame ${currentFrameIdx}`}
          className="block w-full max-h-[500px] object-contain select-none pointer-events-none"
          onLoad={drawOverlay}
        />
        
        {/* Dynamic Canvas layer overlay */}
        <canvas 
          ref={canvasRef}
          className="absolute inset-0 block select-none pointer-events-none"
        />

        {/* Scanline grid texture inside the viewport */}
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:100%_4px] pointer-events-none opacity-40" />
      </div>

      {/* Video controls console */}
      {mediaType === 'video' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsPlaying(!isPlaying)}
              className="bg-slate-900 border border-slate-700 hover:border-cyber-accent hover:text-cyber-accent text-slate-300 rounded-lg p-2.5 transition-all duration-200"
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>
            
            <button 
              onClick={() => {
                setIsPlaying(false);
                setCurrentFrameIdx((prev) => (prev - 1 + totalFrames) % totalFrames);
              }}
              className="bg-slate-900 border border-slate-700 hover:border-cyber-accent hover:text-cyber-accent text-slate-300 rounded-lg p-2.5 transition-all duration-200"
            >
              <ChevronLeft size={16} />
            </button>
            
            {/* Timeline Slider */}
            <input 
              type="range"
              min={0}
              max={totalFrames - 1}
              value={currentFrameIdx}
              onChange={(e) => {
                setIsPlaying(false);
                setCurrentFrameIdx(parseInt(e.target.value));
              }}
              className="flex-1 accent-cyber-accent bg-slate-950 h-1.5 rounded-full appearance-none cursor-pointer border border-slate-800"
            />
            
            <button 
              onClick={() => {
                setIsPlaying(false);
                setCurrentFrameIdx((prev) => (prev + 1) % totalFrames);
              }}
              className="bg-slate-900 border border-slate-700 hover:border-cyber-accent hover:text-cyber-accent text-slate-300 rounded-lg p-2.5 transition-all duration-200"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Frame thumbnails timeline bar */}
          <div className="flex gap-2 overflow-x-auto py-2 border-t border-slate-800/60 max-w-full">
            {frames.map((frame, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentFrameIdx(idx);
                }}
                className={`relative shrink-0 rounded border overflow-hidden transition-all duration-200 ${
                  currentFrameIdx === idx 
                    ? "border-cyber-accent scale-105 shadow-cyber-glow" 
                    : "border-slate-800 opacity-60 hover:opacity-100"
                }`}
                style={{ width: '48px', height: '32px' }}
              >
                <img 
                  src={frame.url} 
                  alt={`Thumbnail ${idx}`} 
                  className="w-full h-full object-cover select-none pointer-events-none"
                />
                {frame.faces_detected > 0 && (
                  <div className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-cyber-accent" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
