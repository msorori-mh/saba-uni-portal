# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ---------------------------------------------------------------------------
# ITCS Portal — conservative R8 keep rules (release: minifyEnabled true).
# Capacitor resolves plugins and @PluginMethod handlers by reflection from the
# WebView bridge, so nothing in the shell or the bridge may be renamed/removed.
# ---------------------------------------------------------------------------
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# App shell: MainActivity + the biometric/Keystore plugin.
-keep class ye.edu.usr.fitcs.portal.** { *; }

# Capacitor bridge, core plugins and the Cordova compatibility layer.
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-keep class org.apache.cordova.** { *; }
-keep interface org.apache.cordova.** { *; }

# Any plugin class (first or third party) and its bridge-invoked methods.
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod <methods>;
}
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# No -dontwarn rules: none are known to be needed. Add one only for a specific
# missing-class warning reported by an actual R8 release build.
