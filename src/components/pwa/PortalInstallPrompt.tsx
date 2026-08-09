import { Download, Share, Smartphone, X } from "lucide-react";
import collegeLogo from "@/assets/college-logo.jpg";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { usePwaInstall } from "@/lib/pwa/use-pwa-install";
import { cn } from "@/lib/utils";

type PortalInstallPromptProps = {
  className?: string;
};

/**
 * In-app PWA install prompt for بوابة الكلية.
 * Android/Chrome: uses deferred beforeinstallprompt (browser-authoritative).
 * iOS Safari: Share → Add to Home Screen instructions (no fake install button).
 * Never permanently blocks authentication — dismissable with cooldown.
 */
export function PortalInstallPrompt({ className }: PortalInstallPromptProps) {
  const {
    showAndroidPrompt,
    showIosFallback,
    installing,
    promptInstall,
    dismiss,
  } = usePwaInstall();

  const open = showAndroidPrompt || showIosFallback;
  if (!open) return null;

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
      shouldScaleBackground={false}
    >
      <DrawerContent
        dir="rtl"
        className={cn(
          "border-t-2 border-gold/40 bg-background text-foreground",
          className,
        )}
        data-testid="portal-pwa-install-prompt"
      >
        <DrawerHeader className="text-right sm:text-right px-5 pt-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={collegeLogo}
                alt=""
                className="h-12 w-12 rounded-full object-cover ring-2 ring-gold/50 shrink-0"
              />
              <div className="min-w-0">
                <DrawerTitle className="font-display text-lg font-extrabold text-primary-deep">
                  ثبّت بوابة الكلية على جهازك
                </DrawerTitle>
                <DrawerDescription className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                  {showIosFallback
                    ? "لتثبيت بوابة الكلية على الشاشة الرئيسية: اضغط مشاركة ثم اختر «إضافة إلى الشاشة الرئيسية»."
                    : "الوصول إلى البوابة مباشرة من الشاشة الرئيسية وتجربة أقرب إلى التطبيق."}
                </DrawerDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label="إغلاق"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </DrawerHeader>

        <div className="px-5 pb-2">
          <div className="flex items-center gap-2 rounded-lg border border-gold/25 bg-primary-deep/5 px-3 py-2.5 text-xs text-muted-foreground">
            {showIosFallback ? (
              <Share className="h-4 w-4 text-gold shrink-0" aria-hidden />
            ) : (
              <Smartphone className="h-4 w-4 text-gold shrink-0" aria-hidden />
            )}
            <span>
              {showIosFallback
                ? "متاح في Safari — التثبيت يتم عبر قائمة المشاركة في النظام."
                : "سيتم فتح نافذة التثبيت الرسمية للمتصفح بعد موافقتك."}
            </span>
          </div>
        </div>

        <DrawerFooter className="gap-2 px-5 pb-6">
          {showAndroidPrompt && (
            <Button
              type="button"
              variant="gold"
              size="lg"
              className="w-full"
              disabled={installing}
              data-testid="portal-pwa-install-accept"
              onClick={() => {
                void promptInstall();
              }}
            >
              <Download className="h-4 w-4" />
              {installing ? "جاري التثبيت…" : "تثبيت التطبيق"}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full border-primary/20"
            data-testid="portal-pwa-install-later"
            onClick={dismiss}
          >
            لاحقاً
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
