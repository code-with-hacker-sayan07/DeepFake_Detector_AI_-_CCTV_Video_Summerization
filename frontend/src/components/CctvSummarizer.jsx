import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldAlert, ShieldCheck, AlertTriangle, Cpu, Video, Play, Pause,
  Search, Clock, ArrowRight, UploadCloud, Terminal, Activity, FileText,
  ChevronRight, Maximize2, Eye, Filter, RefreshCw, X, AlertCircle, ShieldAlert as WarningIcon
} from 'lucide-react';

export default function CctvSummarizer() {
  // Telemetry States
  const [uiState, setUiState] = useState('IDLE'); // IDLE, PROCESSING, RESULTS
  const [logMessages, setLogMessages] = useState([]);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState(null);
  
  // Video and Interaction States
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [activeEventId, setActiveEventId] = useState(null);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL'); // ALL, PERSON, VEHICLE, ALERTS
  
  // Synopsis Mode States
  const [isSynopsisPlaying, setIsSynopsisPlaying] = useState(false);
  const [synopsisIndex, setSynopsisIndex] = useState(0);
  
  // Modals & Popups
  const [previewImage, setPreviewImage] = useState(null); // { url, title }

  const originalVideoRef = useRef(null);
  const summarizedVideoRef = useRef(null);
  const terminalEndRef = useRef(null);
  const dropZoneRef = useRef(null);

  // Auto-scroll the terminal logs console
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logMessages]);

  // Handle Synopsis Slideshow Mode interval loop
  useEffect(() => {
    let timer = null;
    if (isSynopsisPlaying && report && report.events.length > 0) {
      timer = setInterval(() => {
        setSynopsisIndex((prevIndex) => {
          const nextIndex = (prevIndex + 1) % report.events.length;
          // Sync video player if linked
          const event = report.events[nextIndex];
          if (originalVideoRef.current && event) {
            originalVideoRef.current.currentTime = event.time_seconds;
          }
          if (summarizedVideoRef.current && event) {
            summarizedVideoRef.current.currentTime = event.time_seconds;
          }
          return nextIndex;
        });
      }, 2000);
    }
    return () => clearInterval(timer);
  }, [isSynopsisPlaying, report]);

  const addLog = (message, type = 'INFO') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogMessages((prev) => [...prev, { timestamp, text: message, type }]);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (dropZoneRef.current) {
      dropZoneRef.current.classList.add('border-cyber-accent', 'bg-cyber-accent/5');
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    if (dropZoneRef.current) {
      dropZoneRef.current.classList.remove('border-cyber-accent', 'bg-cyber-accent/5');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (dropZoneRef.current) {
      dropZoneRef.current.classList.remove('border-cyber-accent', 'bg-cyber-accent/5');
    }
    
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) {
      processSelectedFile(file);
    } else {
      alert("UNSUPPORTED PAYLOAD: Please feed a valid CCTV video file (mp4, avi, mov, mkv).");
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      processSelectedFile(file);
    }
  };

  const processSelectedFile = (file) => {
    setVideoFile(file);
    // Create local object URL so the HTML5 video player can play the video locally instantly without network lags
    const localUrl = URL.createObjectURL(file);
    setVideoUrl(localUrl);
    triggerSummarization(file);
  };

  const triggerSummarization = async (file) => {
    setUiState('PROCESSING');
    setProgress(5);
    setLogMessages([]);
    
    addLog(`INITIALIZING FORENSIC CCTV NODE AX-9`, 'SYS');
    addLog(`Ingested CCTV asset: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`, 'INFO');
    
    // Simulate terminal logging steps linked to API requests
    const logSchedule = [
      { t: 800, m: "Spawning CV2 Video Reader stream wrapper...", p: 12 },
      { t: 1800, m: "Detecting frame indices... FPS identified: Adaptive Auto-Rate.", p: 20 },
      { t: 2800, m: "Executing Temporal Motion Subtraction (pixel differences)...", p: 35 },
      { t: 3800, m: "Analyzing continuous delta variances for event segmentation...", p: 48 },
      { t: 4800, m: "Loading pre-trained SSDLite neural classifier weights (MobileNetV3)...", p: 62 },
      { t: 5800, m: "Running class boundary inference on high-motion spatial zones...", p: 75 },
      { t: 6800, m: "Compiling timeline sequences, extracting keyframe previews...", p: 88 },
      { t: 7800, m: "Packaging summarized telemetry report data...", p: 95 }
    ];

    logSchedule.forEach((item) => {
      setTimeout(() => {
        addLog(item.m, 'INFO');
        setProgress(item.p);
      }, item.t);
    });

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/cctv/summarize', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Server pipeline returned non-200 code.");
      }

      const reportData = await response.json();
      
      // Delay results display slightly so user can read the beautiful simulated diagnostic logs
      setTimeout(() => {
        setProgress(100);
        addLog("INTELLIGENCE SUMMARY SYNTHESIZED SUCCESSFULLY.", 'SUCCESS');
        setTimeout(() => {
          setReport(reportData);
          setUiState('RESULTS');
          if (reportData.events.length > 0) {
            setActiveEventId(reportData.events[0].id);
          }
        }, 800);
      }, 8200);

    } catch (error) {
      addLog(`CRITICAL PIPELINE EXCEPTION: ${error.message}`, 'ERROR');
      addLog(`Aborting forensics node AX-9 compilation.`, 'SYS');
      setTimeout(() => {
        alert(`CCTV PIPELINE ERROR: ${error.message}`);
        setUiState('IDLE');
        setVideoFile(null);
        setVideoUrl('');
      }, 2000);
    }
  };

  const resetSummarizer = () => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    setReport(null);
    setVideoFile(null);
    setVideoUrl('');
    setUiState('IDLE');
    setProgress(0);
    setLogMessages([]);
    setIsSynopsisPlaying(false);
    setSynopsisIndex(0);
    setActiveEventId(null);
  };

  const handleJumpToEvent = (event) => {
    setActiveEventId(event.id);
    if (originalVideoRef.current) {
      originalVideoRef.current.currentTime = event.time_seconds;
      originalVideoRef.current.play().catch(() => {});
    }
    if (summarizedVideoRef.current) {
      summarizedVideoRef.current.currentTime = event.time_seconds;
      summarizedVideoRef.current.play().catch(() => {});
    }
  };

  const handleSummarizedTimeUpdate = () => {
    const player = summarizedVideoRef.current;
    if (!player || !report || !report.events || report.events.length === 0) return;

    const currentTime = player.currentTime;
    
    // Check if current time is inside any of the active events
    const currentEvent = report.events.find(ev => 
      currentTime >= ev.time_seconds && currentTime <= (ev.time_seconds + ev.duration)
    );

    if (!currentEvent) {
      // Find the next active event that starts after the current time
      const nextEvent = report.events.find(ev => ev.time_seconds > currentTime);
      
      if (nextEvent) {
        player.currentTime = nextEvent.time_seconds;
      } else {
        // Loop back to the first active event
        player.currentTime = report.events[0].time_seconds;
      }
    } else {
      // Keep active event highlighted dynamically as video plays
      if (currentEvent.id !== activeEventId) {
        setActiveEventId(currentEvent.id);
      }
    }
  };

  const handleSummarizedSeeking = () => {
    const player = summarizedVideoRef.current;
    if (!player || !report || !report.events || report.events.length === 0) return;

    const currentTime = player.currentTime;
    const inEvent = report.events.some(ev => 
      currentTime >= ev.time_seconds && currentTime <= (ev.time_seconds + ev.duration)
    );

    if (!inEvent) {
      // Snap playhead to closest event
      const nextEvent = report.events.find(ev => ev.time_seconds > currentTime);
      if (nextEvent) {
        player.currentTime = nextEvent.time_seconds;
      } else {
        player.currentTime = report.events[0].time_seconds;
      }
    }
  };

  const handleOriginalPlay = () => {
    if (summarizedVideoRef.current) {
      summarizedVideoRef.current.play().catch(() => {});
    }
  };

  const handleOriginalPause = () => {
    if (summarizedVideoRef.current) {
      summarizedVideoRef.current.pause();
    }
  };

  const handleSummarizedPlay = () => {
    if (originalVideoRef.current) {
      originalVideoRef.current.play().catch(() => {});
    }
  };

  const handleSummarizedPause = () => {
    if (originalVideoRef.current) {
      originalVideoRef.current.pause();
    }
  };

  const formatTimeRange = (startSeconds, duration) => {
    const endSeconds = startSeconds + duration;
    const mins = Math.floor(endSeconds / 60);
    const secs = Math.floor(endSeconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Custom SVG Chart Dimensions & Computations
  const getSvgPathData = (width = 800, height = 120) => {
    if (!report || !report.motion_profile || report.motion_profile.length === 0) return { path: '', points: [] };
    
    const profile = report.motion_profile;
    const maxX = profile.length - 1;
    // Scale motion relative to highest point, with a sensible minimum peak
    const maxVal = Math.max(...profile.map((p) => p.motion), 8.0);
    
    const points = profile.map((item, idx) => {
      const x = (idx / maxX) * width;
      const y = height - (item.motion / maxVal) * height;
      return { x, y, motion: item.motion, time: item.time };
    });
    
    const path = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    // Shadow closed path
    const shadowPath = `${path} L ${width} ${height} L 0 ${height} Z`;
    
    return { path, shadowPath, points };
  };

  // Filtered Events based on search + buttons
  const filteredEvents = report ? report.events.filter((ev) => {
    // 1. Text Search Filter
    const matchesSearch = 
      ev.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ev.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ev.category.toLowerCase().includes(searchQuery.toLowerCase());
      
    // 2. Tab Category Filter
    if (activeFilter === 'ALL') return matchesSearch;
    if (activeFilter === 'PERSON') return matchesSearch && ev.category === 'person';
    if (activeFilter === 'VEHICLE') return matchesSearch && ['car', 'truck', 'bus', 'motorcycle', 'vehicle'].includes(ev.category);
    if (activeFilter === 'ALERTS') return matchesSearch && ev.threat_score >= 50.0;
    
    return matchesSearch;
  }) : [];

  // Threat Color Mappers
  const getThreatStyle = (score) => {
    if (score >= 65.0) return { text: 'text-cyber-danger border-cyber-danger/30 bg-cyber-danger/10', glow: 'shadow-danger-glow', label: 'CRITICAL' };
    if (score >= 40.0) return { text: 'text-cyber-warning border-cyber-warning/30 bg-cyber-warning/10', glow: 'shadow-cyber-glow', label: 'WARNING' };
    return { text: 'text-cyber-success border-cyber-success/30 bg-cyber-success/10', glow: 'shadow-success-glow', label: 'SECURE' };
  };

  const getOverallThreatStyle = (status) => {
    if (status === 'CRITICAL') return {
      border: 'border-cyber-danger/40 shadow-danger-glow bg-cyber-danger/5',
      text: 'text-cyber-danger',
      bg: 'bg-cyber-danger/15',
      pulsing: 'bg-cyber-danger shadow-danger-glow'
    };
    if (status === 'WARNING') return {
      border: 'border-cyber-warning/40 shadow-cyber-glow bg-cyber-warning/5',
      text: 'text-cyber-warning',
      bg: 'bg-cyber-warning/15',
      pulsing: 'bg-cyber-warning shadow-cyber-glow'
    };
    return {
      border: 'border-cyber-success/40 shadow-success-glow bg-cyber-success/5',
      text: 'text-cyber-success',
      bg: 'bg-cyber-success/15',
      pulsing: 'bg-cyber-success shadow-success-glow'
    };
  };

  return (
    <div className="w-full">
      
      {/* 1. IDLE STATE: UPLOAD HUB */}
      {uiState === 'IDLE' && (
        <div className="animate-fadeIn max-w-2xl mx-auto py-8">
          <div className="text-center mb-10">
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className="h-1.5 w-1.5 rounded-full bg-cyber-accent animate-ping" />
              <span className="font-mono text-[9px] text-cyber-accent tracking-widest uppercase">
                COGNITIVE SUMMARIZATION CORE
              </span>
            </div>
            <h2 className="font-sans font-extrabold text-3xl md:text-4xl text-white tracking-tight mb-3">
              AI CCTV Security Summarizer
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed max-w-md mx-auto">
              Drop hours of security footage into our temporal motion parsing pipeline. Condense static feeds into active, searchable intelligence briefings instantly.
            </p>
          </div>

          {/* Upload Drop Zone */}
          <div 
            ref={dropZoneRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className="relative border-2 border-dashed border-cyber-border rounded-2xl p-12 text-center flex flex-col items-center justify-center cursor-pointer transition-all duration-300 group hover:border-cyber-accent/60 bg-black/40 hover:bg-slate-900/10 min-h-[300px]"
          >
            {/* Background scanner sweep effect */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.04),rgba(0,0,0,0))] pointer-events-none rounded-2xl" />
            <div className="absolute top-0 left-0 w-full h-[1px] bg-cyber-accent/10 group-hover:h-[2px] group-hover:bg-cyber-accent/40 animate-pulse pointer-events-none" />

            <div className="p-4 bg-slate-950/80 border border-slate-800/80 rounded-2xl mb-4 group-hover:border-cyber-accent/40 group-hover:shadow-cyber-glow transition-all duration-300 shrink-0">
              <UploadCloud size={36} className="text-slate-500 group-hover:text-cyber-accent transition-colors duration-300" />
            </div>

            <h3 className="font-mono text-xs font-bold tracking-widest text-slate-200 uppercase mb-2">
              DRAG & DROP SECURITY FOOTAGE
            </h3>
            <p className="text-slate-500 text-[11px] font-mono leading-relaxed mb-6">
              SUPPORTED EXTENSIONS: .MP4, .AVI, .MOV, .MKV // MAX SIZE: 50MB
            </p>

            <label className="bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-cyber-accent hover:text-cyber-accent text-slate-300 font-mono text-xs tracking-wider uppercase font-bold px-6 py-3 rounded-lg cursor-pointer transition-all duration-200 shadow-md">
              Browse Files
              <input 
                type="file" 
                accept="video/mp4,video/avi,video/quicktime,video/x-matroska"
                onChange={handleFileSelect}
                className="hidden" 
              />
            </label>
          </div>
        </div>
      )}

      {/* 2. PROCESSING STATE: CONSOLE LOGS & TELEMETRY */}
      {uiState === 'PROCESSING' && (
        <div className="animate-fadeIn max-w-4xl mx-auto py-6 flex flex-col gap-6">
          
          {/* Main loader */}
          <div className="bg-cyber-card border border-cyber-border rounded-xl p-8 flex flex-col items-center justify-center">
            <RefreshCw className="text-cyber-accent animate-spin mb-4" size={40} />
            <h3 className="font-mono text-sm tracking-widest text-slate-200 font-bold uppercase mb-1">
              Ingesting CCTV Specimen
            </h3>
            <p className="text-slate-500 text-[10px] uppercase font-mono tracking-widest mb-6">
              Neural Network layers analyzing motion matrices...
            </p>

            {/* Custom cyber-designed progress bar */}
            <div className="w-full max-w-md bg-slate-950 border border-slate-800/80 rounded-full h-3 overflow-hidden relative p-[2px]">
              <div 
                className="bg-cyber-accent h-full rounded-full transition-all duration-300 relative shadow-cyber-glow"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute top-0 right-0 w-2 h-full bg-white opacity-40 animate-ping" />
              </div>
            </div>
            <span className="font-mono text-xs text-cyber-accent font-bold mt-2">{progress}% ANALYZED</span>
          </div>

          {/* Diagnostic Console Logs Terminal */}
          <div className="bg-slate-950/95 border border-cyber-border rounded-xl p-5 flex flex-col gap-3 font-mono text-xs text-slate-300">
            <div className="flex justify-between items-center border-b border-slate-900 pb-3 mb-2">
              <span className="text-[10px] tracking-wider text-slate-500 uppercase flex items-center gap-2">
                <Terminal size={12} className="text-cyber-accent" /> Active Sub-System Diagnostics Console // Node AX-9
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-cyber-accent animate-ping" />
            </div>

            <div className="h-64 overflow-y-auto flex flex-col gap-1.5 scrollbar-thin select-text pr-2">
              {logMessages.map((log, index) => {
                let typeColor = "text-slate-400";
                if (log.type === 'ERROR') typeColor = "text-cyber-danger font-bold";
                if (log.type === 'SUCCESS') typeColor = "text-cyber-success font-bold";
                if (log.type === 'SYS') typeColor = "text-cyber-accent font-bold";

                return (
                  <div key={index} className="flex items-start gap-3 hover:bg-slate-900/50 py-0.5 rounded px-1 transition-colors">
                    <span className="text-slate-600 shrink-0 font-bold">[{log.timestamp}]</span>
                    <span className={`shrink-0 font-bold text-[10px] w-14 ${typeColor}`}>
                      [{log.type}]
                    </span>
                    <span className="text-slate-300 leading-normal">{log.text}</span>
                  </div>
                );
              })}
              <div ref={terminalEndRef} />
            </div>
          </div>
        </div>
      )}

      {/* 3. RESULTS STATE: INTEL CONTROL CENTER */}
      {uiState === 'RESULTS' && report && (() => {
        const illegalEvents = report.events.filter(ev => ev.is_illegal);
        const hasIllegalActivity = illegalEvents.length > 0;

        return (
          <div className="animate-fadeIn flex flex-col gap-8">
            
            {/* Dynamic Heading Section */}
            <div className="text-center py-2 border-b border-cyber-border/30 pb-6">
              {hasIllegalActivity ? (
                <>
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-cyber-danger animate-ping animate-duration-1000" />
                    <span className="font-mono text-xs text-cyber-danger tracking-widest uppercase font-bold">
                      🚨 SECURITY ALERTS REGISTERED: INTRUSION BREACH DETECTED
                    </span>
                  </div>
                  <h2 className="font-sans font-extrabold text-3xl md:text-4xl text-white tracking-tight">
                    CCTV Forensic Activity Intelligence Report
                  </h2>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-cyber-success" />
                    <span className="font-mono text-xs text-cyber-success tracking-widest uppercase font-bold font-semibold">
                      🛡️ SECURE MONITOR AREA COMPLIANT
                    </span>
                  </div>
                  <h2 className="font-sans font-extrabold text-3xl md:text-4xl text-white tracking-tight">
                    All Clear: No Illegal Activity Found
                  </h2>
                </>
              )}
            </div>

            {!hasIllegalActivity ? (
              /* Clean Path: No Illegal Activity Found */
              <div className="bg-cyber-card/30 border border-cyber-success/30 rounded-2xl p-12 text-center flex flex-col items-center justify-center max-w-2xl mx-auto w-full my-6 shadow-2xl relative overflow-hidden animate-fadeIn">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.04),transparent_70%)]" />
                <div className="p-5 bg-cyber-success/10 border border-cyber-success/30 rounded-full mb-6 shadow-success-glow animate-pulse">
                  <ShieldCheck className="text-cyber-success" size={48} />
                </div>
                <h3 className="font-sans font-extrabold text-2xl text-white tracking-tight mb-2 uppercase">
                  No Illegal Activity Found
                </h3>
                <p className="text-slate-400 text-xs font-mono max-w-md uppercase tracking-wider mb-6 leading-relaxed">
                  System analysis complete. All scanned frames, pixel contours, and spatial-temporal feeds show 100% compliance. Zero security breaches logged.
                </p>
                <div className="bg-slate-950/80 border border-slate-900 rounded-xl p-4 font-mono text-[10px] text-slate-500 w-full max-w-sm text-left flex flex-col gap-2 shadow-lg">
                  <span className="text-slate-400 font-bold border-b border-slate-900 pb-1.5 uppercase flex justify-between">
                    <span>Forensic Diagnostic Log</span>
                    <span className="text-cyber-success font-bold">PASS</span>
                  </span>
                  <div className="flex justify-between"><span>MONITORED ZONE</span><span>SECTOR ALPHA GATE</span></div>
                  <div className="flex justify-between"><span>ANALYZED FEEDS</span><span>{report.filename}</span></div>
                  <div className="flex justify-between"><span>BREACH INCIDENTS</span><span className="text-cyber-success">0 DETECTED</span></div>
                </div>
              </div>
            ) : (
              /* High Alert Path: Illegal Activity Found */
              <>
                {/* A. Overall Assessment Header Card */}
                {(() => {
                  const overallStyle = getOverallThreatStyle("CRITICAL");
                  return (
                    <div className={`border rounded-2xl p-6 md:p-8 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 transition-all duration-300 ${overallStyle.border}`}>
                      <div className="flex items-center gap-5">
                        <div className={`p-4 rounded-2xl border bg-black/60 shrink-0 flex items-center justify-center ${overallStyle.text} border-current shadow-danger-glow`}>
                          <ShieldAlert size={36} className="animate-pulse" />
                        </div>
                        <div>
                          <span className="font-mono text-[9px] tracking-widest block mb-1.5 uppercase text-slate-500">
                            INTELLIGENCE BRIEFING ZONE STATUS
                          </span>
                          <h2 className={`font-sans font-extrabold text-xl md:text-2xl uppercase tracking-tight flex items-center gap-3 ${overallStyle.text}`}>
                            CRITICAL / SECURITY BREACH DETECTED
                            <span className="relative flex h-2.5 w-2.5 shrink-0">
                              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${overallStyle.bg}`} />
                              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${overallStyle.pulsing}`} />
                            </span>
                          </h2>
                          <p className="text-slate-400 text-xs mt-1 font-mono leading-relaxed max-w-xl">
                            CCTV SOURCE: <span className="text-slate-200">{report.filename}</span> // ANALYSIS ENGINE: <span className="text-cyber-accent">{report.engine}</span>
                          </p>
                        </div>
                      </div>

                      {/* Condensed Activity ratio stats */}
                      <div className="w-full lg:w-auto flex items-center justify-between gap-8 px-6 py-4 bg-black/40 border border-slate-900 rounded-2xl shrink-0">
                        <div className="text-center">
                          <span className="font-mono text-[8px] tracking-widest text-slate-500 block mb-0.5 uppercase">
                            ORIGINAL VIDEO
                          </span>
                          <span className="font-mono text-sm text-slate-300 font-bold">
                            {report.original_duration.toFixed(1)}s
                          </span>
                        </div>
                        <div className="text-slate-600 font-bold text-xs shrink-0"><ArrowRight size={14} /></div>
                        <div className="text-center">
                          <span className="font-mono text-[8px] tracking-widest text-cyber-accent block mb-0.5 uppercase">
                            ACTIVE SUM
                          </span>
                          <span className="font-mono text-sm text-cyber-accent font-bold">
                            {report.summarized_duration.toFixed(1)}s
                          </span>
                        </div>
                        <div className="h-8 w-[1px] bg-slate-900" />
                        <div className="text-right">
                          <span className="font-mono text-[8px] tracking-widest text-cyber-success block mb-0.5 uppercase font-bold">
                            FOOTAGE REDUCTION
                          </span>
                          <span className="font-mono text-base font-extrabold text-cyber-success">
                            {((1 - (report.summarized_duration / report.original_duration)) * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}



                {/* C. Executive Brief Box */}
                <div className="bg-slate-950 border border-slate-900 rounded-xl p-5 font-mono text-xs leading-relaxed text-slate-400 shadow-lg">
                  <span className="text-[10px] font-bold text-slate-300 block mb-2 uppercase flex items-center gap-1.5">
                    <FileText size={12} className="text-cyber-accent" /> Intelligence Executive Briefing
                  </span>
                  <p className="select-text">{report.executive_summary}</p>
                </div>

                {/* D. Main Video Seek & Interactive Graph */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  
                  {/* Column 1: Video Player & SVG Chart (Span 7) */}
                  <div className="lg:col-span-7 flex flex-col gap-6">
                    
                    {/* AI-Summarized Active Feed */}
                    <div className="bg-black rounded-xl overflow-hidden border border-cyber-accent/30 hover:border-cyber-accent shadow-2xl relative group transition-colors duration-300">
                      <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-md px-2 py-0.5 rounded border border-cyber-accent/30 text-[8px] font-mono tracking-widest text-cyber-accent z-10 select-none uppercase font-bold flex items-center gap-1.5 font-semibold">
                        <span className="h-1.5 w-1.5 rounded-full bg-cyber-accent animate-ping animate-duration-1000" />
                        AI-Summarized Active Feed
                      </div>
                      <video 
                        ref={summarizedVideoRef}
                        src={videoUrl}
                        controls
                        onSeeking={handleSummarizedSeeking}
                        onTimeUpdate={handleSummarizedTimeUpdate}
                        className="w-full aspect-video outline-none bg-black animate-fadeIn"
                      />
                    </div>
                  </div>

                  {/* Column 2: Synopsis slideshow & timeline items list (Span 5) */}
                  <div className="lg:col-span-5 flex flex-col gap-6">
                    
                    {/* Dynamic Timeline Panel */}
                    <div className="bg-cyber-card border border-cyber-border rounded-2xl p-5 flex-1 flex flex-col min-h-[400px]">
                      
                      {/* Search and Filters Header */}
                      <div className="flex flex-col gap-3 mb-4">
                        
                        {/* Search box */}
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={12} />
                          <input 
                            type="text"
                            placeholder="Query logs (e.g. person, vehicle, EV_02)..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-900 hover:border-slate-800 focus:border-cyber-accent focus:outline-none rounded-xl pl-9 pr-4 py-2 font-mono text-[10px] text-slate-300 transition-all duration-200"
                          />
                        </div>

                        {/* Filter tabs */}
                        <div className="flex flex-wrap gap-1.5 font-mono text-[8px] tracking-wider uppercase font-bold">
                          <button 
                            onClick={() => setActiveFilter('ALL')}
                            className={`px-2.5 py-1 rounded transition-colors ${
                              activeFilter === 'ALL' ? 'bg-slate-800 text-white border border-slate-700' : 'bg-black/40 text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            ALL ({report.events.length})
                          </button>
                          <button 
                            onClick={() => setActiveFilter('PERSON')}
                            className={`px-2.5 py-1 rounded transition-colors ${
                              activeFilter === 'PERSON' ? 'bg-cyber-accent/15 text-cyber-accent border border-cyber-accent/30' : 'bg-black/40 text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            PEDESTRIANS ({report.pedestrians_count})
                          </button>
                          <button 
                            onClick={() => setActiveFilter('VEHICLE')}
                            className={`px-2.5 py-1 rounded transition-colors ${
                              activeFilter === 'VEHICLE' ? 'bg-cyber-success/15 text-cyber-success border border-cyber-success/30' : 'bg-black/40 text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            VEHICLES ({report.vehicles_count})
                          </button>
                          <button 
                            onClick={() => setActiveFilter('ALERTS')}
                            className={`px-2.5 py-1 rounded transition-colors ${
                              activeFilter === 'ALERTS' ? 'bg-cyber-danger/15 text-cyber-danger border border-cyber-danger/30' : 'bg-black/40 text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            ALERTS ({report.alerts_count})
                          </button>
                        </div>
                      </div>

                      {/* Timeline Scrollable Box */}
                      <div className="flex-1 overflow-y-auto max-h-[350px] pr-1 flex flex-col gap-4 scrollbar-thin">
                        {filteredEvents.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-12 text-center">
                            <Filter className="text-slate-700 mb-2" size={24} />
                            <h4 className="font-mono text-[9px] font-bold text-slate-500 uppercase">
                              No Timeline Matches
                            </h4>
                          </div>
                        ) : (
                          filteredEvents.map((ev, evIdx) => {
                            const isActive = activeEventId === ev.id;
                            const threat = getThreatStyle(ev.threat_score);
                            
                            return (
                              <div 
                                key={ev.id}
                                className={`bg-slate-950/40 border rounded-xl p-4 flex gap-4 transition-all duration-300 cursor-pointer ${
                                  isActive 
                                    ? "border-cyber-accent/40 shadow-cyber-glow bg-slate-900/10" 
                                    : ev.is_illegal 
                                      ? "border-cyber-danger/45 hover:border-cyber-danger bg-cyber-danger/5 shadow-danger-glow" 
                                      : "border-slate-900 hover:border-slate-800"
                                }`}
                                onClick={() => handleJumpToEvent(ev)}
                              >
                                {/* Left Event Thumbnail Crop */}
                                <div className="relative w-16 h-16 shrink-0 rounded-lg overflow-hidden border border-slate-800 bg-black group-hover:border-cyber-accent transition-colors">
                                  <img 
                                    src={ev.crop_url} 
                                    alt="Crop Preview" 
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                  />
                                  <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-all" />
                                  
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPreviewImage({ url: ev.keyframe_url, title: ev.title });
                                    }}
                                    className="absolute bottom-1 right-1 p-0.5 bg-black/80 rounded border border-slate-800 text-slate-400 hover:text-white"
                                    title="Maximize full keyframe"
                                  >
                                    <Maximize2 size={8} />
                                  </button>
                                </div>

                                {/* Right Event Content */}
                                <div className="flex-1 min-w-0 flex flex-col justify-between gap-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <span className={`font-mono text-[8px] font-bold block ${ev.is_illegal ? "text-cyber-danger" : "text-cyber-accent"}`}>
                                        {ev.id} {ev.is_illegal ? `// 🚨 ${ev.illegal_type.toUpperCase()}` : `// AT ${ev.timestamp}`}
                                      </span>
                                      
                                      {/* Highlighting exact time range (e.g. 00:15 - 00:23) */}
                                      <span className="font-mono text-[8px] text-slate-400 bg-black/40 border border-slate-900 rounded px-1.5 py-0.5 mt-0.5 inline-block font-bold">
                                        ⏱️ INTERVAL: {ev.timestamp} - {formatTimeRange(ev.time_seconds, ev.duration)}
                                      </span>

                                      <h4 className="font-sans font-bold text-xs text-slate-200 mt-1 leading-tight truncate">
                                        {ev.title}
                                      </h4>
                                    </div>
                                    <span className={`font-mono text-[8px] border px-1.5 py-0.5 rounded font-bold shrink-0 ${threat.text}`}>
                                      {ev.is_illegal ? "ALERT: " : "RISK: "}{ev.threat_score}%
                                    </span>
                                  </div>

                                  <p className="text-[10px] text-slate-400 leading-normal line-clamp-2 select-text">
                                    {ev.description}
                                  </p>

                                  <div className="flex justify-end pt-1 border-t border-slate-950">
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleJumpToEvent(ev);
                                      }}
                                      className={`font-mono text-[8px] tracking-wider uppercase font-bold flex items-center gap-1 group-hover:translate-x-0.5 transition-all ${ev.is_illegal ? "text-cyber-danger hover:text-white" : "text-cyber-accent hover:text-white"}`}
                                    >
                                      JUMP TO TIMESTAMP <ChevronRight size={10} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                  </div>
                </div>
              </>
            )}

            {/* Return/Reset Ingestion button */}
            <div className="flex justify-center border-t border-cyber-border pt-8 mt-4 animate-fadeIn">
              <button 
                onClick={resetSummarizer}
                className="bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-cyber-accent hover:text-cyber-accent text-slate-300 font-mono text-xs tracking-widest uppercase font-bold px-8 py-4 rounded-xl transition-all duration-200 shadow-lg flex items-center gap-3"
              >
                <RefreshCw size={14} /> Summarize New CCTV Feed
              </button>
            </div>

          </div>
        );
      })()}

      {/* 4. MAXIMIZED FULL KEYFRAME MODAL */}
      {previewImage && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-950 border border-cyber-border rounded-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl relative">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center p-4 border-b border-slate-900">
              <div className="flex items-center gap-2">
                <Eye size={14} className="text-cyber-accent" />
                <h4 className="font-sans font-bold text-sm text-slate-200">
                  Full Keyframe Capture Preview // <span className="text-slate-400">{previewImage.title}</span>
                </h4>
              </div>
              <button 
                onClick={() => setPreviewImage(null)}
                className="p-1 rounded-lg hover:bg-slate-900 text-slate-400 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Image Body */}
            <div className="flex-1 bg-black overflow-y-auto flex items-center justify-center p-4">
              <img 
                src={previewImage.url} 
                alt="Full Keyframe Maximize"
                className="max-w-full max-h-[60vh] object-contain border border-slate-900 shadow-2xl rounded"
              />
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-900 flex justify-end font-mono text-[9px] text-slate-500 uppercase">
              SECTOR CAMERA NODE AL-9 // CAPTURED KEYFRAME RAW RESOLUTION
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
