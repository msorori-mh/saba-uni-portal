import React, { useState } from 'react';
import { MultiSiteCMSScene } from './MultiSiteCMSScene';
import { LocalRAGScene } from './LocalRAGScene';
import { PerformanceQAScene } from './PerformanceQAScene';

export const DemoShell: React.FC = () => {
  const [activeScene, setActiveScene] = useState<number>(1);
  const isDemoEnabled = import.meta.env.VITE_TAIZ_TENDER_DEMO === 'true';

  if (!isDemoEnabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-800 p-6" dir="rtl">
        <div className="max-w-md p-8 bg-white border border-slate-200 rounded-2xl shadow-sm text-center space-y-4">
          <div className="w-12 h-12 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
            404
          </div>
          <h2 className="text-lg font-bold text-slate-900">الصفحة غير متوفرة</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            المسار المطلوب غير متاح في بيئة الإنتاج أو تم تعطيله لأسباب أمنية.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 font-sans" dir="rtl">
      {/* Top Warning Banner */}
      <div className="bg-amber-500 text-amber-950 px-4 py-2 text-xs font-bold flex items-center justify-between border-b border-amber-600 shadow-sm">
        <div className="flex items-center gap-2">
          <span>⚠️</span>
          <span>DEMO ONLY — SYNTHETIC DATA — TA'IZ UNIVERSITY PORTAL PROTOTYPE (ISOLATED WORKTREE)</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-2 py-0.5 rounded bg-slate-900 text-amber-300 font-mono text-[10px]">LOCAL_OFFLINE_ONLY</span>
          <span className="font-mono text-[10px]">Zero Production Mutation</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 p-2 bg-white border rounded-xl shadow-sm">
          <button
            onClick={() => setActiveScene(1)}
            className={`px-4 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeScene === 1 ? 'bg-slate-900 text-white shadow' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span>🏛️</span>
            <span>1. المواقع المتعددة (25 موقعاً)</span>
          </button>
          <button
            onClick={() => setActiveScene(2)}
            className={`px-4 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeScene === 2 ? 'bg-slate-900 text-white shadow' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span>🤖</span>
            <span>2. الاسترجاع المعجمي المقيد (Local Lexical PoC)</span>
          </button>
          <button
            onClick={() => setActiveScene(3)}
            className={`px-4 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeScene === 3 ? 'bg-slate-900 text-white shadow' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span>📊</span>
            <span>3. مصفوفة التقييم (32 حالة)</span>
          </button>
        </div>

        {/* Active Scene Panel */}
        <div className="bg-white border rounded-2xl p-6 shadow-sm min-h-[600px]">
          {activeScene === 1 && <MultiSiteCMSScene />}
          {activeScene === 2 && <LocalRAGScene />}
          {activeScene === 3 && <PerformanceQAScene />}
        </div>
      </div>
    </div>
  );
};
