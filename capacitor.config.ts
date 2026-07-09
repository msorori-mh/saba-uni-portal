import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration — Student Mobile Portal (Android)
 *
 * Package: usr.student
 * App Name: بوابة الطالب
 * Mode: Remote shell (server.url) — TanStack Start is SSR; the deployed
 * production URL is loaded inside the native WebView. This means web updates
 * apply instantly without rebuilding APK/AAB. HTTPS only.
 */
const config: CapacitorConfig = {
  appId: "usr.student",
  appName: "بوابة الطالب",
  webDir: "dist",
  server: {
    url: "https://saba-uni-portal.lovable.app/mobile/student-login",
    cleartext: false,
    androidScheme: "https",
    allowNavigation: [
      "saba-uni-portal.lovable.app",
      "*.lovable.app",
      "quboolye.com",
      "*.quboolye.com",
      "*.supabase.co",
    ],
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: "#061F33",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#061F33",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#061F33",
      overlaysWebView: false,
    },
  },
};

export default config;
