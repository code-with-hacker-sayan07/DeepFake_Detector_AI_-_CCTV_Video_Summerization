import React from 'react';
import { Sparkles, Activity, Layers, HelpCircle } from 'lucide-react';

export default function MetricCard({ title, score, icon: Icon, description, details }) {
  // Determine color levels based on anomaly severity
  const getColors = (val) => {
    if (val > 60) return {
      text: "text-cyber-danger",
      bg: "bg-cyber-danger/10",
      border: "border-cyber-danger/30",
      bar: "bg-cyber-danger",
      glow: "shadow-danger-glow"
    };
    if (val > 40) return {
      text: "text-cyber-warning",
      bg: "bg-cyber-warning/10",
      border: "border-cyber-warning/30",
      bar: "bg-cyber-warning",
      glow: ""
    };
    return {
      text: "text-cyber-success",
      bg: "bg-cyber-success/10",
      border: "border-cyber-success/30",
      bar: "bg-cyber-success",
      glow: "shadow-success-glow"
    };
  };

  const colors = getColors(score);

  return (
    <div className={`bg-cyber-card/60 backdrop-blur-md border border-cyber-border rounded-xl p-6 transition-all duration-300 hover:border-slate-700 flex flex-col justify-between ${colors.glow}`}>
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${colors.bg} ${colors.text} border ${colors.border}`}>
              <Icon size={18} />
            </div>
            <h3 className="font-mono text-xs font-bold tracking-widest text-slate-300">
              {title}
            </h3>
          </div>
          <span className={`font-mono text-xl font-bold ${colors.text}`}>
            {score.toFixed(1)}%
          </span>
        </div>

        <p className="text-slate-400 text-xs leading-relaxed mb-4">
          {description}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {/* Progress Bar meter */}
        <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
          <div 
            className={`h-full transition-all duration-1000 ${colors.bar}`}
            style={{ width: `${score}%` }}
          />
        </div>
        
        {/* Detail Panel */}
        <div className="bg-black/40 border border-slate-800/80 rounded-lg p-3 font-mono text-[10px] text-slate-500 leading-normal">
          <span className="text-slate-300 font-bold block mb-1">DETECTIONS STATS:</span>
          {details}
        </div>
      </div>
    </div>
  );
}
