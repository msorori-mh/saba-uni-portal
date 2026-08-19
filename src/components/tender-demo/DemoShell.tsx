import React, { useState } from 'react';
import { MultiSiteCMSScene } from './MultiSiteCMSScene';
import { LocalRAGScene } from './LocalRAGScene';
import { PerformanceQAScene } from './PerformanceQAScene';

export const DemoShell: React.FC = () => {
  const [activeScene, setActiveScene] = useState<number>(1);
  const isDemoEnabled = import.meta.env.VITE_TAIZ_TENDER_DEMO === 'true';

  if (!isDemoEnabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 text-slate-800 p-6" dir="rtl">
        <div className="max-w-md p-6 bg-white border border-slate-300 rounded-2xl shadow text-center space-y-3">
          <span className="text-4xl block">🔒</span>
          <h2 className="text-lg font-bold text-slate-900">بوابة العرض التوضيحي مغلقة افتراضياً</h2>
          <p className="text-xs text-slate-600">
            لتفعيل بيئة العرض التجريبي المعزولة، يرجى ضبط المتغير في ملف البيئة:
          </p>
          <code className="text-xs font-mono bg-slate-100 p-2 rounded block text-sky-800">
            VITE_TAIZ_TENDER_DEMO=true
          </code>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 font-sans" dir="rtl">
      {/* Top Banner */}
      <div className="bg-amber-500 text-amber-950 px-4 py-2 text-xs font-bold flex items-center justify-between border-b border-amber-600 shadow-sm">
        <div className="flex items-center gap-2">
          <span>⚠️</span>
          <span>DEMO ONLY — SYNTHETIC DATA — TA'IZ UNIVERSITY PORTAL PROTOTYPE (ISOLATED WORKTREE)</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-2 py-0.5 rounded bg-amber-600 text-white font-mono text-[10px]">AIR-GAPPED 100%</span>
          <span className="font-mono text-[10px]">Zero Production Touch</span>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 p-2 bg-white border rounded-xl shadow-sm">
          <button
            onClick={() => setActiveScene(1)}
            className={`px-4 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeScene === 1 ? 'bg-sky-600 text-white shadow' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span>🏛️</span>
            <span>1. المواقع المتعددة (25 موقعاً)</span>
          </button>
          <button
            onClick={() => setActiveScene(2)}
            className={`px-4 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeScene === 2 ? 'bg-sky-600 text-white shadow' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span>🤖</span>
            <span>2. الذكاء الاصطناعي السيادي Local RAG</span>
          </button>
          <button
            onClick={() => setActiveScene(3)}
            className={`px-4 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeScene === 3 ? 'bg-sky-600 text-white shadow' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span>📊</span>
            <span>3. مؤشرات الأداء وبنك الاختبارات</span>
          </button>
        </div>

        {/* Active Scene Container */}
        <div className="bg-white border rounded-2xl p-6 shadow-sm min-h-[600px]">
          {activeScene === 1 && <MultiSiteCMSScene />}
          {activeScene === 2 && <LocalRAGScene />}
          {activeScene === 3 && <PerformanceQAScene />}
        </div>
      </div>
    </div>
  );
};
