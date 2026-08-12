import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration — Android mobile shell.
 *
 * FROZEN IDENTITY (see docs/mobile/ANDROID-PLAY-IDENTITY-CONTRACT.md):
 *   applicationId : ye.edu.usr.fitcs.portal
 *   app name      : بوابة الكلية
 *
 * Mode: remote shell (server.url) — TanStack Start is SSR, so the deployed
 * production URL is loaded inside the native WebView and web updates apply
 * without rebuilding the APK/AAB. HTTPS only, no cleartext, no SSL bypass.
 *
 * The app is STUDENT-FIRST: the entry URL is the mobile student login, which
 * redirects to /mobile/student after a valid student session.
 */
const config: CapacitorConfig = {
  appId: "ye.edu.usr.fitcs.portal",
  appName: "بوابة الكلية",
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
