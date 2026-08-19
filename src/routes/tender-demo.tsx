import { createFileRoute } from '@tanstack/react-router';
import React, { lazy, Suspense } from 'react';

// Dynamic lazy import to allow full bundle exclusion when demo is not enabled
const isDemoEnabled = import.meta.env.VITE_TAIZ_TENDER_DEMO === 'true';

const LazyDemoShell = isDemoEnabled
  ? lazy(() => import('@/components/tender-demo/DemoShell').then(m => ({ default: m.DemoShell })))
  : null;

export const Route = createFileRoute('/tender-demo')({
  component: TenderDemoRoutePage,
});

function TenderDemoRoutePage() {
  if (!isDemoEnabled || !LazyDemoShell) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center" dir="rtl">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-400 font-bold text-2xl">
          404
        </div>
        <h1 className="text-2xl font-black text-slate-900 mb-2">الصفحة غير متوفرة</h1>
        <p className="text-slate-600 text-sm max-w-md mb-6">
          المسار المطلوب غير متاح أو تم تعطيله في هذه البيئة التشغيلية.
        </p>
        <a
          href="/"
          className="inline-flex items-center px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold transition-colors"
        >
          العودة للرئيسية
        </a>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh] p-8 text-slate-600 font-bold" dir="rtl">
          جاري تحميل منصة العرض التوضيحي...
        </div>
      }
    >
      <LazyDemoShell />
    </Suspense>
  );
}
