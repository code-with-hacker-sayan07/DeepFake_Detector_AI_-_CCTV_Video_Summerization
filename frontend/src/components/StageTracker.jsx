import React, { useEffect, useState } from 'react';
import { Terminal, Shield, Cpu, RefreshCw, Layers } from 'lucide-react';

const STAGES = [
  { id: 1, title: "INGESTION PIPELINE", desc: "Verifying MIME-type & enforcing size bounds (50MB)..." },
  { id: 2, title: "DYNAMIC FRAME SAMPLING", desc: "Decompressing codecs & capturing 30 uniform checkpoints..." },
  { id: 3, title: "NEURAL ROI DETECTION", desc: "Running MTCNN Face Extraction & local coordinate alignment..." },
  { id: 4, title: "SPECTRAL FFT TRANSFORM", desc: "Generating 2D Fast Fourier matrices & radial power spectra..." },
  { id: 5, title: "SPATIO-TEMPORAL DENSE FLOW", desc: "Tracking Farneback optical vectors & frame boundary jitters..." },
  { id: 6, title: "FORENSIC SYNTHESIS REPORT", desc: "Averaging weights & compiling neural anomaly metrics..." }
];

export default function StageTracker({ currentStage }) {
  const [logs, setLogs] = useState([]);
  
  useEffect(() => {
    // Generate simulated sub-logs for each stage transition
    if (currentStage === 0) {
      setLogs(["[SENTRY-AI] // System Idle. Awaiting digital asset ingestion..."]);
      return;
    }
    
    const newLogs = [];
    for (let i = 1; i <= currentStage; i++) {
      const stage = STAGES[i - 1];
      if (stage) {
        newLogs.push(`[SYSTEM] Initializing ${stage.title}...`);
        newLogs.push(`[PROCESS] ${stage.desc}`);
        if (i < currentStage) {
          newLogs.push(`[OK] ${stage.title} completed successfully.`);
        } else {
          newLogs.push(`[ACTIVE] Processing ${stage.title}...`);
        }
      }
    }
    setLogs(newLogs);
  }, [currentStage]);

  return (
    <div className="bg-cyber-card border border-cyber-border rounded-xl p-6 shadow-cyber-glow overflow-hidden">
      <div className="flex items-center justify-between border-b border-cyber-border pb-4 mb-4">
        <div className="flex items-center gap-3">
          <Terminal className="text-cyber-accent animate-pulse" size={20} />
          <h2 className="font-mono text-sm tracking-widest text-slate-300 font-bold uppercase">
            Forensic Core Core Logs
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-cyber-accent animate-ping" />
          <span className="font-mono text-xs text-cyber-accent">ANALYZING</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Terminal Printouts */}
        <div className="bg-black/80 border border-slate-800 rounded-lg p-4 font-mono text-xs text-slate-400 h-64 overflow-y-auto flex flex-col gap-2">
          {logs.map((log, index) => {
            let colorClass = "text-slate-400";
            if (log.startsWith("[OK]")) colorClass = "text-cyber-success";
            if (log.startsWith("[ACTIVE]")) colorClass = "text-cyber-accent font-bold";
            if (log.startsWith("[SYSTEM]")) colorClass = "text-slate-300 font-semibold";
            
            return (
              <div key={index} className={`${colorClass} leading-relaxed`}>
                {log}
              </div>
            );
          })}
          <div className="terminal-cursor h-4 w-1 inline-block" />
        </div>

        {/* Stages Checklist */}
        <div className="flex flex-col gap-4">
          {STAGES.map((stage) => {
            const isActive = currentStage === stage.id;
            const isCompleted = currentStage > stage.id;
            
            return (
              <div 
                key={stage.id} 
                className={`flex gap-4 p-3 rounded-lg border transition-all duration-300 ${
                  isActive 
                    ? "bg-cyber-accent/5 border-cyber-accent/30 shadow-cyber-glow"
                    : isCompleted
                      ? "bg-cyber-success/5 border-cyber-success/20 opacity-80"
                      : "bg-transparent border-transparent opacity-40"
                }`}
              >
                <div className="flex flex-col items-center">
                  <div className={`h-6 w-6 rounded-full flex items-center justify-center font-mono text-xs border ${
                    isActive 
                      ? "border-cyber-accent text-cyber-accent font-bold"
                      : isCompleted
                        ? "border-cyber-success bg-cyber-success text-black font-bold"
                        : "border-slate-800 text-slate-500"
                  }`}>
                    {isCompleted ? "✓" : stage.id}
                  </div>
                  {stage.id < 6 && (
                    <div className={`w-[1px] h-full ${
                      isCompleted ? "bg-cyber-success/30" : "bg-slate-800"
                    }`} />
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <h3 className={`font-mono text-xs tracking-wider font-semibold ${
                    isActive ? "text-cyber-accent" : isCompleted ? "text-cyber-success" : "text-slate-500"
                  }`}>
                    {stage.title}
                  </h3>
                  <p className="text-slate-400 text-[10px] mt-1 truncate">
                    {stage.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
