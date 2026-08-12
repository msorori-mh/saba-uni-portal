import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import collegeLogo from "@/assets/college-logo.jpg";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { getErrorRecoveryHomePath, retryRouteError } from "../lib/route-error-recovery";
import { BUILD_SHA } from "@/lib/build-provenance";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Toaster } from "@/components/ui/sonner";
import { PortalInstallPrompt } from "@/components/pwa/PortalInstallPrompt";
import { GlobalBackButton } from "@/components/navigation/PageBackButton";
import { registerPortalPWA } from "@/lib/pwa/register-portal-pwa";

function NotFoundComponent() {
  // Unknown /admin/* paths get an admin-scoped 404 that keeps the admin
  // inside the portal (no public-site link, no technical details).
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname.startsWith("/admin")) {
    return (
      <div dir="rtl" className="flex min-h-dvh items-center justify-center bg-surface px-4">
        <div className="max-w-md text-center" data-testid="admin-not-found">
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
            الصفحة غير موجودة
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            عذراً، الصفحة المطلوبة غير متوفرة ضمن لوحة الإدارة.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link
              to="/admin"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              العودة إلى لوحة الإدارة
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      className="flex min-h-dvh items-center justify-center bg-hero-gradient px-4 text-primary-foreground"
    >
      <div className="max-w-lg text-center">
        <img
          src={collegeLogo}
          alt="شعار كلية تكنولوجيا المعلومات"
          className="mx-auto h-24 w-24 rounded-full border-2 border-gold object-cover shadow-elegant"
        />
        <h1 className="mt-8 text-8xl font-extrabold tracking-tight text-gold">404</h1>
        <h2 className="mt-4 text-2xl font-bold">الصفحة غير موجودة</h2>
        <p className="mt-3 text-sm text-primary-foreground/70">
          عذراً، الصفحة التي تبحث عنها غير متوفرة أو تم نقلها إلى موقع آخر.
        </p>
        <div className="mt-8">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-gold-gradient px-6 py-3 text-sm font-bold text-primary-deep shadow-gold transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
          >
            ← العودة للرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const pathname = router.state.location.pathname;
  const homePath = getErrorRecoveryHomePath(pathname);
  const homeLabel = homePath === "/admin" ? "العودة إلى لوحة الإدارة" : "العودة للرئيسية";

  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background px-4">
      <div
        className="max-w-md text-center"
        role="alert"
        aria-live="assertive"
        data-testid="root-error-fallback"
      >
        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
          تعذّر تحميل الصفحة
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          حدث خطأ أثناء التحميل. يمكنك المحاولة مرة أخرى أو العودة للصفحة المناسبة.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              void retryRouteError({
                reset,
                invalidate: () => router.invalidate(),
                error,
                reload: () => window.location.reload(),
              });
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            إعادة المحاولة
          </button>
          <Link
            to={homePath}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {homeLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "كلية تكنولوجيا المعلومات وعلوم الحاسوب — جامعة إقليم سبأ" },
      {
        name: "description",
        content:
          "البوابة الإلكترونية لكلية تكنولوجيا المعلومات وعلوم الحاسوب في جامعة إقليم سبأ — أقسام أكاديمية، أبحاث، وأخبار الكلية.",
      },
      // Deployed-commit provenance (track F): build-time-injected git SHA or
      // the "unknown" sentinel. Read via document.querySelector('meta[name="build-sha"]')
      // or curl + grep. Never secret; never fails the build.
      { name: "build-sha", content: BUILD_SHA },
      { name: "theme-color", content: "#061F33" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "بوابة الكلية" },
      { name: "application-name", content: "بوابة الكلية" },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "كلية تكنولوجيا المعلومات وعلوم الحاسوب — جامعة إقليم سبأ" },
      {
        name: "twitter:title",
        content: "كلية تكنولوجيا المعلومات وعلوم الحاسوب — جامعة إقليم سبأ",
      },
      {
        property: "og:description",
        content:
          "البوابة الإلكترونية لكلية تكنولوجيا المعلومات وعلوم الحاسوب في جامعة إقليم سبأ — أقسام أكاديمية، أبحاث، وأخبار الكلية.",
      },
      {
        name: "twitter:description",
        content:
          "البوابة الإلكترونية لكلية تكنولوجيا المعلومات وعلوم الحاسوب في جامعة إقليم سبأ — أقسام أكاديمية، أبحاث، وأخبار الكلية.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/bde3b3ec-c0bf-4bfa-a138-5e61caca0649/id-preview-b1084417--90f4dcde-07fb-4441-b86a-6ad5510833b8.lovable.app-1780267338048.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/bde3b3ec-c0bf-4bfa-a138-5e61caca0649/id-preview-b1084417--90f4dcde-07fb-4441-b86a-6ad5510833b8.lovable.app-1780267338048.png",
      },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/jpeg", href: collegeLogo },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&family=Tajawal:wght@500;700;800&display=swap",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "EducationalOrganization",
          name: "كلية تكنولوجيا المعلومات وعلوم الحاسوب — جامعة إقليم سبأ",
          alternateName: "College of IT & Computer Science — Saba Region University",
          url: "https://quboolye.com",
          logo: "https://quboolye.com/icon-512.png",
          email: "itandcs@usr.edu.ye",
          telephone: "+967-6302008",
          address: {
            "@type": "PostalAddress",
            addressLocality: "مأرب",
            addressCountry: "YE",
          },
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouter().state.location.pathname;
  const isAdmin = pathname.startsWith("/admin");
  // The mobile app surface is a standalone product: no public-site chrome,
  // no global back button, no install prompt, no service-worker registration.
  const isMobileApp = isMobileAppPath(pathname);
  const bare = isAdmin || isMobileApp;

  useEffect(() => {
    if (isMobileApp) {
      void disablePwaInNativeShell();
      return;
    }
    registerPortalPWA();
  }, [isMobileApp]);

  return (
    <QueryClientProvider client={queryClient}>
      {bare ? (
        <Outlet />
      ) : (
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="flex-1">
            <Outlet />
          </main>
          <Footer />
        </div>
      )}
      <GlobalBackButton />
      <PortalInstallPrompt />
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}
