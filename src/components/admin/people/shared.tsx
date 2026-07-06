import { useState } from "react";
import { Copy, Printer, CheckCircle2 } from "lucide-react";

export type CredentialsSlipData = {
  full_name_ar: string;
  identifier: string;
  email: string;
  password: string;
  portal: "student" | "faculty" | "staff";
};

const PORTAL_LABEL: Record<CredentialsSlipData["portal"], string> = {
  student: "بوابة الطالب",
  faculty: "بوابة عضو هيئة التدريس",
  staff: "بوابة الموظف",
};

export function CredentialsSlip({
  slip,
  onClose,
}: {
  slip: CredentialsSlipData;
  onClose: () => void;
}) {
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
  };

  const handlePrint = () => {
    const w = window.open("", "_blank", "width=600,height=700");
    if (!w) return;
    w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>بيانات الدخول</title>
      <style>
        body{font-family:Tahoma,Arial,sans-serif;padding:32px;color:#0f172a;}
        h1{font-size:18px;margin:0 0 8px;text-align:center;}
        h2{font-size:14px;margin:0 0 24px;text-align:center;color:#64748b;font-weight:normal;}
        .box{border:2px solid #0f3460;border-radius:8px;padding:20px;margin-top:16px;}
        .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #e2e8f0;font-size:14px;}
        .row:last-child{border:0;}
        .k{color:#64748b;}
        .v{font-weight:bold;font-family:'Courier New',monospace;direction:ltr;}
        .note{margin-top:16px;font-size:11px;color:#64748b;line-height:1.7;text-align:right;}
      </style></head><body>
      <h1>كلية تكنولوجيا المعلومات وعلوم الحاسوب</h1>
      <h2>${PORTAL_LABEL[slip.portal]} — بيانات الدخول</h2>
      <div class="box">
        <div class="row"><span class="k">الاسم:</span><span>${slip.full_name_ar}</span></div>
        <div class="row"><span class="k">الإيميل الجامعي (اسم الدخول):</span><span class="v">${slip.email}</span></div>
        <div class="row"><span class="k">كلمة المرور المؤقتة:</span><span class="v">${slip.password}</span></div>
        <div class="row"><span class="k">الرقم الإداري:</span><span class="v">${slip.identifier}</span></div>
      </div>
      <p class="note">
        • يُرجى الدخول إلى البوابة عبر <strong>/portal-login</strong> باستخدام الإيميل الجامعي.<br>
        • سيتم طلب تغيير كلمة المرور عند أول دخول.<br>
        • لا تشارك بيانات الدخول مع أي شخص.
      </p>
      <script>window.onload=()=>{window.print();}</script>
      </body></html>`);
    w.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-card rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-l from-emerald-600 to-emerald-700 px-5 py-4 text-white flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5" />
          <h3 className="font-display text-lg font-bold">تم بنجاح</h3>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">احفظ بيانات الدخول التالية وسلّمها للمستخدم:</p>
          <div className="rounded-lg border-2 border-primary/20 bg-secondary/30 p-4 space-y-2.5 text-sm">
            <SlipRow label="الاسم" value={slip.full_name_ar} />
            <SlipRow label="الرقم الإداري" value={slip.identifier} mono onCopy={() => copy(slip.identifier)} />
            <SlipRow label="الإيميل الجامعي (اسم الدخول)" value={slip.email} mono onCopy={() => copy(slip.email)} />
            <SlipRow label="كلمة المرور المؤقتة" value={slip.password} mono onCopy={() => copy(slip.password)} />
          </div>
          <p className="text-xs text-muted-foreground">سيُطلب من المستخدم تغيير كلمة المرور عند أول دخول.</p>
        </div>
        <div className="p-4 border-t border-border flex justify-end gap-2 bg-secondary/30">
          <button onClick={onClose} className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-bold">إغلاق</button>
          <button onClick={handlePrint} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-5 py-2 text-sm font-bold hover:opacity-90">
            <Printer className="h-4 w-4" /> طباعة إشعار بيانات الدخول
          </button>
        </div>
      </div>
    </div>
  );
}

function SlipRow({ label, value, mono, onCopy }: { label: string; value: string; mono?: boolean; onCopy?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-dashed border-border last:border-0 pb-2 last:pb-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`${mono ? "font-mono" : ""} font-bold`} dir={mono ? "ltr" : undefined}>{value}</span>
        {onCopy && (
          <button onClick={onCopy} className="p-1 hover:bg-secondary rounded text-muted-foreground" aria-label="نسخ" title="نسخ">
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-sm font-extrabold text-primary mb-3 pb-1 border-b border-border">{title}</h4>
      {children}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-bold text-primary">{label}</span>
      {children}
    </label>
  );
}

export function useBusyError() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<any>, after?: () => void) => {
    setBusy(key); setError(null);
    try { await fn(); after?.(); }
    catch (e: any) { setError(e?.message ?? "خطأ"); }
    finally { setBusy(null); }
  };
  return { busy, error, setError, run };
}
