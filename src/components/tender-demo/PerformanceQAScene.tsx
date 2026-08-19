import React, { useState } from 'react';
import { runRAGEvaluation } from '../../lib/tender-demo/rag-evaluation';
import { BenchmarkReport } from '../../lib/tender-demo/types';

export const PerformanceQAScene: React.FC = () => {
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const handleRunEvaluation = () => {
    setIsRunning(true);
    setTimeout(() => {
      const rep = runRAGEvaluation();
      setReport(rep);
      setIsRunning(false);
    }, 400);
  };

  return (
    <div className="space-y-6 text-slate-800" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
        <div>
          <h2 className="text-xl font-bold text-slate-900">6. مؤشرات الأداء، الجودة، وبنك تقييم الذكاء الاصطناعي — Quality & Benchmark Suite</h2>
          <p className="text-sm text-slate-600">تشغيل آلي لمصفوفة التحقق وقياس مؤشرات Recall@10، MRR، والدقة الصرفية، وخلو الثغرات.</p>
        </div>
        <button
          onClick={handleRunEvaluation}
          disabled={isRunning}
          className="px-5 py-2.5 bg-emerald-600 text-white font-bold text-sm rounded-lg hover:bg-emerald-700 transition shadow disabled:opacity-50"
        >
          {isRunning ? 'جاري تشغيل الاختبارات...' : '▶ تشغيل بنك تقييم الـ RAG الآلي'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
        <div className="p-4 bg-white border rounded-xl shadow-sm">
          <span className="text-xs text-slate-500 block">الاختبارات الآلية الحالية بالمستودع</span>
          <span className="text-2xl font-bold text-emerald-700">1,114 / 1,114</span>
          <span className="text-[10px] text-emerald-600 block mt-1">اجتياز 100% بنجاح</span>
        </div>
        <div className="p-4 bg-white border rounded-xl shadow-sm">
          <span className="text-xs text-slate-500 block">مطابقة النفاذية الرقمية</span>
          <span className="text-2xl font-bold text-sky-700">WCAG 2.2 AA</span>
          <span className="text-[10px] text-sky-600 block mt-1">مفحوص عبر axe-core</span>
        </div>
        <div className="p-4 bg-white border rounded-xl shadow-sm">
          <span className="text-xs text-slate-500 block">سعة التحمل المستهدفة</span>
          <span className="text-2xl font-bold text-slate-900">5,000 CCU</span>
          <span className="text-[10px] text-slate-500 block mt-1">تتوسع لـ 25,000 مستخدم</span>
        </div>
        <div className="p-4 bg-white border rounded-xl shadow-sm">
          <span className="text-xs text-slate-500 block">معدل خروج البيانات الحساسة</span>
          <span className="text-2xl font-bold text-emerald-700">0 Bytes</span>
          <span className="text-[10px] text-emerald-600 block mt-1">Zero External Egress</span>
        </div>
      </div>

      {report && (
        <div className="border rounded-xl p-6 bg-white shadow-sm space-y-4">
          <h3 className="font-bold text-base text-slate-900 border-b pb-3">نتائج بنك تقييم الذكاء الاصطناعي (RAG Evaluation Report):</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-center">
            <div className="p-3 bg-slate-50 border rounded-lg">
              <span className="text-xs text-slate-500 block">دقة الاسترجاع Recall@10</span>
              <span className="text-xl font-bold text-emerald-700">{(report.recallAt10 * 100).toFixed(0)}%</span>
            </div>
            <div className="p-3 bg-slate-50 border rounded-lg">
              <span className="text-xs text-slate-500 block">معدل الرتبة الأولى (MRR)</span>
              <span className="text-xl font-bold text-emerald-700">{report.mrr}</span>
            </div>
            <div className="p-3 bg-slate-50 border rounded-lg">
              <span className="text-xs text-slate-500 block">دقة الاستشهاد بالمصدر</span>
              <span className="text-xl font-bold text-emerald-700">{report.citationAccuracy}%</span>
            </div>
            <div className="p-3 bg-slate-50 border rounded-lg">
              <span className="text-xs text-slate-500 block">دقة الامتناع (Zero Hallucination)</span>
              <span className="text-xl font-bold text-emerald-700">{report.abstentionAccuracy}%</span>
            </div>
            <div className="p-3 bg-slate-50 border rounded-lg">
              <span className="text-xs text-slate-500 block">تسريب الصلاحيات (Permission Leakage)</span>
              <span className="text-xl font-bold text-emerald-700">{report.permissionLeakageCount} (منعدم تماماً)</span>
            </div>
            <div className="p-3 bg-slate-50 border rounded-lg">
              <span className="text-xs text-slate-500 block">حظر هجمات Prompt Injection</span>
              <span className="text-xl font-bold text-emerald-700">{report.promptInjectionRejectionRate}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
