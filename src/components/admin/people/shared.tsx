import { useEffect, useRef, useState } from "react";
import { Copy, Printer, CheckCircle2, Check } from "lucide-react";
import collegeLogo from "@/assets/college-logo.jpg";


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

/** Full portal login URL per account type — driven by slip.portal only. */
export const PORTAL_LOGIN_URL: Record<CredentialsSlipData["portal"], string> = {
  student: "https://quboolye.com/portal-login?type=student",
  faculty: "https://quboolye.com/portal-login?type=faculty",
  staff: "https://quboolye.com/portal-login?type=staff",
};


export function CredentialsSlip({
  slip,
  onClose,
}: {
  slip: CredentialsSlipData;
  onClose: () => void;
}) {
  const [copiedAll, setCopiedAll] = useState(false);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };
  const portalUrl = PORTAL_LOGIN_URL[slip.portal];
  const copyAll = async () => {
    const text =
      `الاسم: ${slip.full_name_ar}\n` +
      `الرقم الإداري: ${slip.identifier}\n` +
      `الإيميل الجامعي: ${slip.email}\n` +
      `كلمة المرور المؤقتة: ${slip.password}\n` +
      `رابط الدخول: ${portalUrl}`;

    const ok = await copy(text);
    if (ok) {
      setCopiedAll(true);
      window.setTimeout(() => setCopiedAll(false), 1800);
    }
  };

  const handlePrint = () => {
    const w = window.open("", "_blank", "width=600,height=700");
    if (!w) return;
    w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>بيانات الدخول</title>
      <style>
        body{font-family:'Amiri','Times New Roman',serif;padding:32px;color:#111827;}
        h1{font-size:18px;margin:0 0 8px;text-align:center;}
        h2{font-size:14px;margin:0 0 24px;text-align:center;color:#4B5563;font-weight:normal;}
        .box{border:2px solid #0B3D62;border-radius:8px;padding:20px;margin-top:16px;}
        .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #D1D5DB;font-size:14px;}
        .row:last-child{border:0;}
        .k{color:#4B5563;}
        .v{font-weight:bold;font-family:'Courier New',monospace;direction:ltr;}
        .note{margin-top:16px;font-size:11px;color:#4B5563;line-height:1.7;text-align:right;}
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
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">سيُطلب من المستخدم تغيير كلمة المرور عند أول دخول.</p>
            <button
              onClick={copyAll}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
                copiedAll
                  ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                  : "border-border bg-card hover:bg-secondary text-primary"
              }`}
              aria-live="polite"
            >
              {copiedAll ? (
                <>
                  <Check className="h-3.5 w-3.5" /> تم نسخ الكل
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> نسخ الكل
                </>
              )}
            </button>
          </div>
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

function SlipRow({ label, value, mono, onCopy }: { label: string; value: string; mono?: boolean; onCopy?: () => Promise<boolean> | void }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);
  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);

  const handleCopy = async () => {
    if (!onCopy) return;
    const result = await onCopy();
    if (result === false) return;
    setCopied(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center justify-between gap-2 border-b border-dashed border-border last:border-0 pb-2 last:pb-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`${mono ? "font-mono" : ""} font-bold`} dir={mono ? "ltr" : undefined}>{value}</span>
        {onCopy && (
          <button
            onClick={handleCopy}
            className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-bold transition-colors ${
              copied
                ? "bg-emerald-50 text-emerald-700"
                : "text-muted-foreground hover:bg-secondary"
            }`}
            aria-label={copied ? "تم النسخ" : "نسخ"}
            title={copied ? "تم النسخ" : "نسخ"}
            aria-live="polite"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" />
                <span>تم النسخ</span>
              </>
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
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
