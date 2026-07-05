import React, { useCallback, useState } from 'react';
import { UploadCloud, ShieldAlert, FileVideo, FileImage } from 'lucide-react';

export default function VideoUpload({ onUpload }) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState(null);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  }, []);

  const validateAndUpload = (file) => {
    setError(null);
    
    if (!file) return;

    // Validate size (max 50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      setError("PAYLOAD SIZE EXCEEDED: File size cannot exceed 50MB.");
      return;
    }

    // Validate extension
    const ext = file.name.split('.').pop().lowerCase || file.name.split('.').pop().toLowerCase();
    const allowed = ['mp4', 'avi', 'mov', 'jpeg', 'jpg', 'png'];
    if (!allowed.includes(ext)) {
      setError("UNSUPPORTED FILE FORMAT: Whitelisted formats: MP4, AVI, MOV, JPG, PNG");
      return;
    }

    onUpload(file);
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndUpload(e.dataTransfer.files[0]);
    }
  }, [onUpload]);

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      validateAndUpload(e.target.files[0]);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div 
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center transition-all duration-300 min-h-80 cursor-pointer ${
          isDragActive 
            ? "border-cyber-accent bg-cyber-accent/5 shadow-cyber-glow scale-[1.01]" 
            : "border-slate-800 bg-cyber-card/30 hover:border-slate-700 hover:bg-cyber-card/45"
        }`}
      >
        {/* Animated Scanner Grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0c1a30_1px,transparent_1px),linear-gradient(to_bottom,#0c1a30_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-30 pointer-events-none" />
        
        {isDragActive && <div className="scanner-line" />}

        <div className="z-10 flex flex-col items-center text-center">
          <div className={`mb-6 p-4 rounded-full bg-slate-900 border transition-all duration-300 ${
            isDragActive 
              ? "border-cyber-accent text-cyber-accent shadow-cyber-glow" 
              : "border-slate-800 text-slate-400"
          }`}>
            <UploadCloud size={40} className={isDragActive ? "animate-bounce" : ""} />
          </div>

          <h3 className="font-mono text-sm tracking-widest text-slate-200 font-bold uppercase mb-2">
            Ingest Forensic Evidence
          </h3>
          <p className="text-slate-400 text-xs max-w-sm mb-6 leading-relaxed">
            Drag & drop your digital assets or click to browse local files. Max size is 50MB.
          </p>

          <label className="bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-cyber-accent hover:text-cyber-accent text-slate-300 font-mono text-xs tracking-wider uppercase px-6 py-3 rounded-lg font-bold transition-all duration-200 cursor-pointer shadow-md">
            Browse Directory
            <input 
              type="file" 
              className="hidden" 
              accept=".mp4,.avi,.mov,.jpeg,.jpg,.png" 
              onChange={handleFileInput}
            />
          </label>
        </div>
      </div>

      {/* Visual Support Info */}
      <div className="flex justify-between items-center mt-4 px-2 text-[10px] font-mono text-slate-500 uppercase">
        <span className="flex items-center gap-1.5"><FileVideo size={12} /> Video Whitelist: MP4, AVI, MOV</span>
        <span className="flex items-center gap-1.5"><FileImage size={12} /> Image Whitelist: JPG, JPEG, PNG</span>
      </div>

      {error && (
        <div className="mt-6 flex items-start gap-3 bg-cyber-danger/10 border border-cyber-danger/30 rounded-xl p-4 text-cyber-danger shadow-danger-glow animate-shake">
          <ShieldAlert size={18} className="shrink-0 mt-0.5" />
          <div className="font-mono text-xs">
            <span className="font-bold block uppercase tracking-wider mb-1">INGESTION_ERROR</span>
            {error}
          </div>
        </div>
      )}
    </div>
  );
}
