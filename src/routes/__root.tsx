import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import collegeLogo from "@/assets/college-logo.jpg";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
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
        <h1 className="mt-8 text-8xl font-extrabold tracking-tight text-gold">
          404
        </h1>
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
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center" role="alert" aria-live="assertive">
        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
          تعذّر تحميل الصفحة
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          حدث خطأ أثناء التحميل. يمكنك المحاولة مرة أخرى أو العودة للرئيسية.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            إعادة المحاولة
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            العودة للرئيسية
          </a>
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
      { name: "description", content: "البوابة الإلكترونية لكلية تكنولوجيا المعلومات وعلوم الحاسوب في جامعة إقليم سبأ — أقسام أكاديمية، أبحاث، وأخبار الكلية." },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "كلية تكنولوجيا المعلومات وعلوم الحاسوب — جامعة إقليم سبأ" },
      { name: "twitter:title", content: "كلية تكنولوجيا المعلومات وعلوم الحاسوب — جامعة إقليم سبأ" },
      { property: "og:description", content: "البوابة الإلكترونية لكلية تكنولوجيا المعلومات وعلوم الحاسوب في جامعة إقليم سبأ — أقسام أكاديمية، أبحاث، وأخبار الكلية." },
      { name: "twitter:description", content: "البوابة الإلكترونية لكلية تكنولوجيا المعلومات وعلوم الحاسوب في جامعة إقليم سبأ — أقسام أكاديمية، أبحاث، وأخبار الكلية." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/bde3b3ec-c0bf-4bfa-a138-5e61caca0649/id-preview-b1084417--90f4dcde-07fb-4441-b86a-6ad5510833b8.lovable.app-1780267338048.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/bde3b3ec-c0bf-4bfa-a138-5e61caca0649/id-preview-b1084417--90f4dcde-07fb-4441-b86a-6ad5510833b8.lovable.app-1780267338048.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/jpeg", href: collegeLogo },
      { rel: "apple-touch-icon", href: collegeLogo },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;500;600;700&display=swap" },
    ],
    scripts: [{
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
    }],
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

  return (
    <QueryClientProvider client={queryClient}>
      {isAdmin ? (
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
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}
