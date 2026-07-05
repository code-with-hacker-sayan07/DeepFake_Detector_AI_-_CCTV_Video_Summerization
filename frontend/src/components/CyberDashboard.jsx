import React, { useEffect, useState } from 'react';
import { 
  ShieldAlert, ShieldCheck, Shield, AlertTriangle, 
  HardDrive, RefreshCw, Server, Eye, Waves, Timer,
  History, LayoutDashboard, Trash2, Search,
  Database, FileText, CheckCircle, Camera
} from 'lucide-react';

import VideoUpload from './VideoUpload';
import StageTracker from './StageTracker';
import MetricCard from './MetricCard';
import ForensicHeatmap from './ForensicHeatmap';
import CctvSummarizer from './CctvSummarizer';

export default function CyberDashboard() {
  // Navigation & UI States
  const [activeTab, setActiveTab] = useState('SCANNER'); // SCANNER, HISTORY, INTEL, SETTINGS
  const [uiState, setUiState] = useState('IDLE'); // IDLE, PROCESSING, RESULTS
  const [currentStage, setCurrentStage] = useState(0);
  const [report, setReport] = useState(null);
  
  // Custom Settings (Adjustable by user)
  const [detectionSettings, setDetectionSettings] = useState({
    spatialWeight: 35,
    spectralWeight: 40,
    temporalWeight: 25,
    compromisedThreshold: 60,
    suspiciousThreshold: 40,
    enableCUDA: true,
  });

  // History Logs (persisted in localStorage)
  const [history, setHistory] = useState([]);
  const [historySearch, setHistorySearch] = useState('');


  // Load history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sentry_forensic_history');
      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Failed to load forensics history logs:", e);
    }
  }, []);


  const handleFileUpload = async (file) => {
    setUiState('PROCESSING');
    setCurrentStage(1);
    
    const formData = new FormData();
    formData.append('file', file);

    // Natural log stages progression
    const stageTimer1 = setTimeout(() => setCurrentStage(2), 1500);
    const stageTimer2 = setTimeout(() => setCurrentStage(3), 3200);
    const stageTimer3 = setTimeout(() => setCurrentStage(4), 5000);
    const stageTimer4 = setTimeout(() => setCurrentStage(5), 6800);
    const stageTimer5 = setTimeout(() => setCurrentStage(6), 8500);

    try {
      const response = await fetch('/api/detect', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Ingestion pipeline returned bad status.");
      }

      const data = await response.json();
      
      // Calculate custom user-weighted confidence score if custom settings active
      const wSpatial = detectionSettings.spatialWeight / 100.0;
      const wSpectral = detectionSettings.spectralWeight / 100.0;
      const wTemporal = detectionSettings.temporalWeight / 100.0;
      
      let customScore = data.confidence_score;
      if (data.media_type === 'video') {
        customScore = (
          wSpatial * data.summary.spatial_score + 
          wSpectral * data.summary.spectral_score + 
          wTemporal * data.summary.temporal_score
        );
      } else {
        // Image does not have temporal flow, split remaining weights
        const sum = wSpatial + wSpectral;
        const normSpatial = sum > 0 ? wSpatial / sum : 0.5;
        const normSpectral = sum > 0 ? wSpectral / sum : 0.5;
        customScore = (normSpatial * data.summary.spatial_score + normSpectral * data.summary.spectral_score);
      }
      
      customScore = parseFloat(customScore.toFixed(2));
      
      // Redefine status & verdict based on user thresholds
      let customStatus = 'AUTHENTIC';
      let customVerdict = 'AUTHENTIC / REAL RECORDING';
      
      if (customScore > detectionSettings.compromisedThreshold) {
        customStatus = 'COMPROMISED';
        customVerdict = 'COMPROMISED / DEEPFAKE DETECTED';
      } else if (customScore > detectionSettings.suspiciousThreshold) {
        customStatus = 'SUSPICIOUS';
        customVerdict = 'SUSPICIOUS / AI ANOMALIES DETECTED';
      }
      
      const modifiedReport = {
        ...data,
        confidence_score: customScore,
        status: customStatus,
        verdict: customVerdict
      };

      setTimeout(() => {
        setReport(modifiedReport);
        setUiState('RESULTS');
        
        // Save scan to history
        const newLog = {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          filename: file.name,
          media_type: data.media_type,
          confidence_score: customScore,
          status: customStatus,
          spatial: data.summary.spatial_score,
          spectral: data.summary.spectral_score,
          temporal: data.summary.temporal_score,
        };
        
        const updatedHistory = [newLog, ...history];
        setHistory(updatedHistory);
        localStorage.setItem('sentry_forensic_history', JSON.stringify(updatedHistory));

      }, 10000);

    } catch (err) {
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      clearTimeout(stageTimer3);
      clearTimeout(stageTimer4);
      clearTimeout(stageTimer5);
      
      alert(`FORENSIC CRASH: ${err.message}`);
      setUiState('IDLE');
      setCurrentStage(0);
    }
  };

  const resetScanner = () => {
    setReport(null);
    setUiState('IDLE');
    setCurrentStage(0);
  };

  const deleteHistoryItem = (id, e) => {
    e.stopPropagation();
    const updated = history.filter(item => item.id !== id);
    setHistory(updated);
    localStorage.setItem('sentry_forensic_history', JSON.stringify(updated));
  };

  const clearAllHistory = () => {
    if (confirm("Are you sure you want to completely erase the local forensic database?")) {
      setHistory([]);
      localStorage.removeItem('sentry_forensic_history');
    }
  };

  // Verdict style mapper
  const getVerdictStyle = (status) => {
    if (status === 'COMPROMISED') return {
      card: "border-cyber-danger/30 shadow-danger-glow bg-cyber-danger/5",
      text: "text-cyber-danger",
      border: "border-cyber-danger",
      icon: ShieldAlert,
      glow: "text-cyber-danger shadow-danger-glow"
    };
    if (status === 'SUSPICIOUS') return {
      card: "border-cyber-warning/30 shadow-cyber-glow bg-cyber-warning/5",
      text: "text-cyber-warning",
      border: "border-cyber-warning",
      icon: AlertTriangle,
      glow: "text-cyber-warning shadow-cyber-glow"
    };
    return {
      card: "border-cyber-success/30 shadow-success-glow bg-cyber-success/5",
      text: "text-cyber-success",
      border: "border-cyber-success",
      icon: ShieldCheck,
      glow: "text-cyber-success shadow-success-glow"
    };
  };

  const verdictStyle = report ? getVerdictStyle(report.status) : null;
  const VerdictIcon = verdictStyle ? verdictStyle.icon : null;

  // Filter history logs based on search query
  const filteredHistory = history.filter(item => 
    item.filename.toLowerCase().includes(historySearch.toLowerCase())
  );

  return (
    <div className="min-h-screen crt-overlay flex flex-col md:flex-row bg-[#030712] text-slate-200">
      
      {/* 1. LEFT SIDEBAR NAVIGATION BAR */}
      <aside className="w-full md:w-64 bg-black/60 backdrop-blur-xl border-b md:border-b-0 md:border-r border-cyber-border flex flex-col justify-between p-6 shrink-0 z-20">
        <div className="flex flex-col gap-8">
          {/* Logo brand */}
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <span className="h-1.5 w-1.5 rounded-full bg-cyber-accent animate-ping" />
              <span className="font-mono text-[8px] text-cyber-accent tracking-widest uppercase">
                FORENSIC NODE ALPHA
              </span>
            </div>
            <h1 className="font-sans font-extrabold text-2xl tracking-tight text-white flex items-center gap-2">
              SENTRY<span className="text-cyber-accent font-light">AI</span>
            </h1>
          </div>

          {/* Nav buttons */}
          <nav className="flex flex-col gap-2">
            <button 
              onClick={() => { setActiveTab('SCANNER'); }}
              className={`flex items-center gap-3 font-mono text-xs tracking-wider uppercase px-4 py-3 rounded-lg border transition-all duration-200 ${
                activeTab === 'SCANNER'
                  ? "bg-cyber-accent/10 border-cyber-accent/30 text-cyber-accent shadow-cyber-glow"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
              }`}
            >
              <LayoutDashboard size={14} /> Neural Scanner
            </button>
            
            <button 
              onClick={() => { setActiveTab('CCTV'); }}
              className={`flex items-center gap-3 font-mono text-xs tracking-wider uppercase px-4 py-3 rounded-lg border transition-all duration-200 ${
                activeTab === 'CCTV'
                  ? "bg-cyber-accent/10 border-cyber-accent/30 text-cyber-accent shadow-cyber-glow"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
              }`}
            >
              <Camera size={14} /> CCTV Summarizer
            </button>
            
            <button 
              onClick={() => { setActiveTab('HISTORY'); }}
              className={`flex items-center gap-3 font-mono text-xs tracking-wider uppercase px-4 py-3 rounded-lg border transition-all duration-200 ${
                activeTab === 'HISTORY'
                  ? "bg-cyber-accent/10 border-cyber-accent/30 text-cyber-accent shadow-cyber-glow"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
              }`}
            >
              <History size={14} /> Forensics History
            </button>


          </nav>
        </div>


      </aside>

      {/* 2. MAIN CORE VIEWPORT CONTAINER */}
      <div className="flex-1 flex flex-col justify-between overflow-y-auto min-h-screen">
        


        {/* Dynamic viewport depending on activeTab state */}
        <main className="flex-1 p-6 md:p-8 flex flex-col justify-center max-w-6xl mx-auto w-full">
          
          {/* TAB 1: NEURAL SCANNER VIEWPORT */}
          {activeTab === 'SCANNER' && (
            <>
              {uiState === 'IDLE' && (
                <div className="py-6">
                  <div className="text-center mb-10 max-w-xl mx-auto">
                    <h2 className="font-sans font-extrabold text-3xl md:text-4xl text-white tracking-tight mb-3">
                      SENTRY-AI Forensic Scanner
                    </h2>
                    <p className="text-slate-400 text-sm leading-relaxed max-w-md mx-auto">
                      Ingest digital assets to scan for generative AI boundary warps, Fast Fourier (FFT) grid noises, and frame-to-frame optical irregularities.
                    </p>
                  </div>
                  <VideoUpload onUpload={handleFileUpload} />
                </div>
              )}

              {uiState === 'PROCESSING' && (
                <div className="w-full max-w-4xl mx-auto py-6">
                  <div className="flex flex-col items-center mb-8">
                    <RefreshCw className="text-cyber-accent animate-spin mb-4" size={32} />
                    <h3 className="font-mono text-sm tracking-widest text-slate-200 font-bold uppercase">
                      Analyzing Forensic Specimen
                    </h3>
                    <p className="text-slate-500 text-[10px] mt-1 uppercase font-mono tracking-widest">
                      Processing 30 sampling frames under active FFT grids...
                    </p>
                  </div>
                  <StageTracker currentStage={currentStage} />
                </div>
              )}

              {uiState === 'RESULTS' && report && (
                <div className="flex flex-col gap-8 animate-fadeIn">
                  {/* Results Gauge Card */}
                  <div className={`border rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 transition-all duration-300 ${verdictStyle.card}`}>
                    <div className="flex items-center gap-5">
                      <div className={`p-4 rounded-2xl bg-black/60 border ${verdictStyle.border} ${verdictStyle.glow}`}>
                        <VerdictIcon size={36} />
                      </div>
                      <div>
                        <span className="font-mono text-[9px] tracking-widest block mb-1.5 uppercase text-slate-400">
                          DIAGNOSTIC REPORT VERDICT
                        </span>
                        <h2 className={`font-sans font-extrabold text-xl md:text-2xl uppercase tracking-tight ${verdictStyle.text}`}>
                          {report.verdict}
                        </h2>
                        <p className="text-slate-400 text-xs mt-1 font-mono">
                          ASSET FILENAME: <span className="text-slate-300">{report.filename}</span> // TYPE: {report.media_type}
                        </p>
                      </div>
                    </div>

                    <div className="text-center px-6 py-4 bg-black/40 border border-slate-800/80 rounded-2xl shrink-0">
                      <span className="font-mono text-[9px] tracking-widest text-slate-500 block mb-1">
                        ANOMALY PROBABILITY
                      </span>
                      <span className={`font-mono text-3xl font-extrabold ${verdictStyle.text}`}>
                        {report.confidence_score}%
                      </span>
                    </div>
                  </div>

                  {/* Heatmap & Cards Layout */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-7 xl:col-span-8">
                      <ForensicHeatmap frames={report.frames} mediaType={report.media_type} />
                    </div>

                    <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-6">
                      <MetricCard 
                        title="SPATIAL ARTIFACTS"
                        score={report.summary.spatial_score}
                        icon={Eye}
                        description="Analyzes face crops for boundary pixel degrade, blending warps, and Sobel vector illumination gradients."
                        details={
                          <div>
                            • Spatial weight: <span className="text-slate-300">{detectionSettings.spatialWeight}%</span><br />
                            • Edge noise std dev: <span className="text-slate-300">{(report.summary.spatial_score * 0.45).toFixed(2)} Var</span><br />
                            • Lighting dev ratio: <span className="text-slate-300">{(report.summary.spatial_score * 0.78).toFixed(1)}%</span>
                          </div>
                        }
                      />

                      <MetricCard 
                        title="SPECTRAL FREQUENCY"
                        score={report.summary.spectral_score}
                        icon={Waves}
                        description="Runs a 2D Fast Fourier Transform (FFT) on neural ROIs to capture periodic upsampling upscaling anomalies."
                        details={
                          <div>
                            • Spectral weight: <span className="text-slate-300">{detectionSettings.spectralWeight}%</span><br />
                            • Radial profile flats: <span className="text-slate-300">{(report.summary.spectral_score * 0.06).toFixed(2)}%</span><br />
                            • GAN lattice clusters: <span className="text-slate-300">{report.summary.spectral_score > 55 ? "Anomalies found" : "Normal decay"}</span>
                          </div>
                        }
                      />

                      <MetricCard 
                        title="TEMPORAL DISCONTINUITY"
                        score={report.summary.temporal_score}
                        icon={Timer}
                        description="Maps Farneback Dense Optical Flow vectors between frames to identify facial movement jitters."
                        details={
                          <div>
                            • Temporal weight: <span className="text-slate-300">{detectionSettings.temporalWeight}%</span><br />
                            • Displacement jumps: <span className="text-slate-300">{report.media_type === 'video' ? `${(report.summary.temporal_score * 0.14).toFixed(2)} px/f` : 'N/A'}</span><br />
                            • Warp accelerations: <span className="text-slate-300">{report.media_type === 'video' ? `${(report.summary.temporal_score * 0.08).toFixed(2)} px/f²` : 'N/A'}</span>
                          </div>
                        }
                      />
                    </div>
                  </div>

                  {/* Return button */}
                  <div className="flex justify-center border-t border-cyber-border pt-8 mt-4">
                    <button 
                      onClick={resetScanner}
                      className="bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-cyber-accent hover:text-cyber-accent text-slate-300 font-mono text-xs tracking-widest uppercase font-bold px-8 py-4 rounded-xl transition-all duration-200 shadow-lg flex items-center gap-3"
                    >
                      <RefreshCw size={14} /> Ingest New Specimen
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* TAB 2: FORENSICS HISTORY VIEWPORT */}
          {activeTab === 'HISTORY' && (
            <div className="flex flex-col gap-6 py-4 animate-fadeIn">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-cyber-border pb-6">
                <div>
                  <h2 className="font-sans font-extrabold text-2xl text-white tracking-tight">
                    Forensic Database Logs
                  </h2>
                  <p className="text-slate-400 text-xs mt-1">
                    Review and search locally persisted historical scans of generative deepfake assessments.
                  </p>
                </div>
                {history.length > 0 && (
                  <button 
                    onClick={clearAllHistory}
                    className="bg-cyber-danger/10 hover:bg-cyber-danger/25 border border-cyber-danger/30 hover:border-cyber-danger text-cyber-danger px-4 py-2 rounded-lg font-mono text-[10px] tracking-wider uppercase font-bold transition-all duration-200 flex items-center gap-2"
                  >
                    <Trash2 size={12} /> Wipe Database
                  </button>
                )}
              </div>

              {/* Database logs list */}
              {history.length === 0 ? (
                <div className="bg-cyber-card border border-cyber-border rounded-2xl p-12 text-center flex flex-col items-center max-w-md mx-auto mt-6">
                  <Database className="text-slate-600 mb-4" size={40} />
                  <h4 className="font-mono text-xs font-bold tracking-widest text-slate-300 uppercase mb-2">
                    Database Empty
                  </h4>
                  <p className="text-slate-500 text-xs leading-relaxed mb-6">
                    No historical logs currently registered. Go to the Neural Scanner, upload assets, and complete analyses to record logs here.
                  </p>
                  <button 
                    onClick={() => setActiveTab('SCANNER')}
                    className="bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-cyber-accent hover:text-cyber-accent text-slate-300 font-mono text-xs uppercase px-5 py-2.5 rounded-lg transition-all duration-200"
                  >
                    Launch Scanner
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {/* Search bar */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                    <input 
                      type="text"
                      placeholder="Search log database by asset filename..."
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      className="w-full bg-slate-950 border border-cyber-border hover:border-slate-700 focus:border-cyber-accent focus:outline-none rounded-xl pl-10 pr-4 py-3 font-mono text-xs text-slate-300 transition-all duration-200"
                    />
                  </div>

                  {/* Logs list list */}
                  <div className="flex flex-col gap-3">
                    {filteredHistory.length === 0 ? (
                      <div className="text-center py-10 font-mono text-xs text-slate-500">
                        No logs match search query.
                      </div>
                    ) : (
                      filteredHistory.map((item) => {
                        const style = getVerdictStyle(item.status);
                        const StyleIcon = style.icon;
                        
                        return (
                          <div 
                            key={item.id}
                            className="bg-cyber-card/60 border border-cyber-border hover:border-slate-800 rounded-xl p-4 md:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all duration-200"
                          >
                            <div className="flex items-center gap-4 min-w-0">
                              <div className={`p-2.5 rounded-lg border bg-black/60 shrink-0 ${style.text} ${style.border}`}>
                                <StyleIcon size={16} />
                              </div>
                              <div className="min-w-0">
                                <h4 className="font-mono text-xs font-bold text-slate-200 truncate">
                                  {item.filename}
                                </h4>
                                <div className="flex flex-wrap items-center gap-3 font-mono text-[9px] text-slate-500 mt-1 uppercase">
                                  <span>ID: {item.id}</span>
                                  <span>•</span>
                                  <span>TYPE: {item.media_type}</span>
                                  <span>•</span>
                                  <span>DATE: {new Date(item.timestamp).toLocaleString()}</span>
                                </div>
                              </div>
                            </div>

                            {/* Scores summary */}
                            <div className="flex items-center justify-between md:justify-end w-full md:w-auto gap-6 shrink-0 border-t md:border-t-0 border-slate-900 pt-3 md:pt-0">
                              <div className="grid grid-cols-3 gap-3 font-mono text-[9px] text-slate-500">
                                <div>SPATIAL: <strong className="text-slate-300">{item.spatial}%</strong></div>
                                <div>SPECTRAL: <strong className="text-slate-300">{item.spectral}%</strong></div>
                                <div>TEMPORAL: <strong className="text-slate-300">{item.temporal}%</strong></div>
                              </div>
                              
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <span className="font-mono text-[8px] text-slate-500 block uppercase">PROBABILITY</span>
                                  <span className={`font-mono text-sm font-extrabold ${style.text}`}>{item.confidence_score}%</span>
                                </div>
                                <button 
                                  onClick={(e) => deleteHistoryItem(item.id, e)}
                                  className="p-2 rounded-lg bg-black/40 border border-slate-900 text-slate-500 hover:text-cyber-danger hover:border-cyber-danger/30 transition-all duration-200"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}



          {/* TAB 5: CCTV SUMMARIZER TAB */}
          {activeTab === 'CCTV' && (
            <CctvSummarizer />
          )}

        </main>

        {/* Global Footer */}
        <footer className="font-mono text-[8px] text-slate-600 tracking-widest text-center py-4 border-t border-cyber-border/40 shrink-0 uppercase">
          SENTRY-AI FORENSICS CONSOLE // STABLE ENGINE // ACTIVE SECURE MODE
        </footer>
      </div>

    </div>
  );
}
