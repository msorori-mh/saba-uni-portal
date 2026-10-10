package ye.edu.usr.fitcs.portal;

import android.content.pm.PackageManager;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.view.WindowManager;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.nio.charset.StandardCharsets;

/**
 * Android Keystore + BiometricPrompt bridge for the student portal.
 *
 * Security contract:
 *  - EC P-256 private key is generated inside the Android Keystore with
 *    setUserAuthenticationRequired(true) and
 *    setInvalidatedByBiometricEnrollment(true); it never leaves the device.
 *  - Only the SubjectPublicKeyInfo (DER, base64) is exposed to JS.
 *  - Signing happens inside the CryptoObject bound to a successful biometric
 *    authentication, so there is no JS-visible "biometric passed" flag.
 *  - No biometric image/template/score is read, stored, logged or returned.
 *  - The web layer is remote content, so this class does NOT trust it with the
 *    signing scope: the key alias is a native constant, only the known message
 *    formats are signed, and the BiometricPrompt wording is chosen natively
 *    from the message type (any JS-supplied prompt text is ignored).
 */
@CapacitorPlugin(name = "PortalBiometricKeystore")
public class BiometricKeystorePlugin extends Plugin {

    private static final String KEYSTORE = "AndroidKeyStore";
    private static final int AUTHENTICATORS = BiometricManager.Authenticators.BIOMETRIC_STRONG;

    /** The one Keystore alias this app uses. Must equal BIOMETRIC_KEY_ALIAS in biometrics.ts. */
    static final String KEY_ALIAS = "ye.edu.usr.fitcs.portal.stepup.v1";

    // Signing-message allow-list. Anything else is refused before any prompt.
    static final String MSG_APP_UNLOCK = "usrp-app-unlock-v1";
    static final String MSG_STEP_UP_PREFIX = "usrp-stepup-v1|";
    static final String MSG_DEVICE_REGISTER_PREFIX = "usrp-device-register-v1|";
    /** version|challengeId|nonce|userId|deviceId|actionCode|requestId|payloadHash|expiresAt */
    private static final int STEP_UP_FIELD_COUNT = 9;
    private static final int STEP_UP_ACTION_INDEX = 5;
    /** version|nonce|userId|deviceId|expiresAt */
    private static final int DEVICE_REGISTER_FIELD_COUNT = 5;
    private static final int MAX_MESSAGE_LENGTH = 1024;

    private static final String PROMPT_TITLE = "بوابة الكلية";
    private static final String SUBTITLE_UNLOCK = "افتح بوابة الطالب";
    private static final String SUBTITLE_STEP_UP_GENERIC = "تأكيد عملية حساسة في بوابة الطالب";
    private static final String SUBTITLE_DEVICE_REGISTER = "تأكيد ربط هذا الجهاز بحسابك في بوابة الطالب";

    // FLAG_SECURE coordination with MainActivity (see MainActivity.onPause/onResume).
    private static volatile boolean secureRequestedByWeb = false;
    private static volatile boolean hostPaused = false;

    /** True while the web layer has asked for FLAG_SECURE to stay on (app lock covered/locked). */
    static boolean isSecureRequestedByWeb() {
        return secureRequestedByWeb;
    }

    static void setHostPaused(boolean paused) {
        hostPaused = paused;
    }

    /** A new Activity means a new WebView/JS state: forget any stale web request. */
    static void resetHostState() {
        secureRequestedByWeb = false;
        hostPaused = false;
    }

    private static boolean isCanonicalAlias(String alias) {
        return KEY_ALIAS.equals(alias);
    }

    /**
     * Returns the fixed, natively chosen prompt subtitle for an allowed signing
     * message, or null when the message is not one of the known formats.
     */
    static String promptSubtitleFor(String message) {
        if (message == null || message.isEmpty() || message.length() > MAX_MESSAGE_LENGTH) {
            return null;
        }
        for (int i = 0; i < message.length(); i++) {
            char c = message.charAt(i);
            if (c < 0x20 || c > 0x7e) {
                return null;
            }
        }
        if (MSG_APP_UNLOCK.equals(message)) {
            return SUBTITLE_UNLOCK;
        }
        if (message.startsWith(MSG_STEP_UP_PREFIX)) {
            String[] parts = message.split("\\|", -1);
            if (parts.length != STEP_UP_FIELD_COUNT || hasEmptyField(parts)) {
                return null;
            }
            return stepUpSubtitleFor(parts[STEP_UP_ACTION_INDEX]);
        }
        if (message.startsWith(MSG_DEVICE_REGISTER_PREFIX)) {
            String[] parts = message.split("\\|", -1);
            if (parts.length != DEVICE_REGISTER_FIELD_COUNT || hasEmptyField(parts)) {
                return null;
            }
            return SUBTITLE_DEVICE_REGISTER;
        }
        return null;
    }

    private static boolean hasEmptyField(String[] parts) {
        for (String part : parts) {
            if (part.isEmpty()) {
                return true;
            }
        }
        return false;
    }

    /** Action codes mirror src/lib/security/step-up-contract.ts (submit_<service>). */
    private static String stepUpSubtitleFor(String actionCode) {
        switch (actionCode) {
            case "submit_file_withdrawal":
                return "تأكيد عملية حساسة: طلب سحب الملف";
            case "submit_enrollment_suspension":
                return "تأكيد عملية حساسة: طلب إيقاف القيد";
            case "submit_department_transfer":
                return "تأكيد عملية حساسة: طلب التحويل";
            case "submit_final_chance":
                return "تأكيد عملية حساسة: طلب الفرصة النهائية";
            case "submit_excused_absence":
                return "تأكيد عملية حساسة: طلب الغياب بعذر";
            default:
                return SUBTITLE_STEP_UP_GENERIC;
        }
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        BiometricManager manager = BiometricManager.from(getContext());
        int status = manager.canAuthenticate(AUTHENTICATORS);
        JSObject result = new JSObject();
        result.put("available", status == BiometricManager.BIOMETRIC_SUCCESS);
        result.put("enrolled", status != BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED
                && status == BiometricManager.BIOMETRIC_SUCCESS);
        result.put("kind", kindLabel());
        call.resolve(result);
    }

    private String kindLabel() {
        PackageManager pm = getContext().getPackageManager();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                && pm.hasSystemFeature(PackageManager.FEATURE_FACE)) {
            return "face";
        }
        if (pm.hasSystemFeature(PackageManager.FEATURE_FINGERPRINT)) {
            return "fingerprint";
        }
        return "unknown";
    }

    @PluginMethod
    public void ensureDeviceKey(PluginCall call) {
        // The JS-supplied alias is only accepted when it is the canonical one.
        if (!isCanonicalAlias(call.getString("alias"))) {
            call.reject("PLUGIN_ERROR");
            return;
        }
        final String alias = KEY_ALIAS;
        try {
            KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
            keyStore.load(null);
            PublicKey publicKey;
            if (keyStore.containsAlias(alias)) {
                publicKey = keyStore.getCertificate(alias).getPublicKey();
            } else {
                KeyPairGenerator generator = KeyPairGenerator.getInstance(
                        KeyProperties.KEY_ALGORITHM_EC, KEYSTORE);
                KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(
                        alias, KeyProperties.PURPOSE_SIGN)
                        .setDigests(KeyProperties.DIGEST_SHA256)
                        .setUserAuthenticationRequired(true);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    builder.setInvalidatedByBiometricEnrollment(true);
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    builder.setUserAuthenticationParameters(0,
                            KeyProperties.AUTH_BIOMETRIC_STRONG);
                }
                generator.initialize(builder.build());
                KeyPair pair = generator.generateKeyPair();
                publicKey = pair.getPublic();
            }
            byte[] der = publicKey.getEncoded();
            JSObject result = new JSObject();
            result.put("deviceId", deviceIdFor(der));
            result.put("publicKeyDer", Base64.encodeToString(der, Base64.NO_WRAP));
            result.put("algorithm", "SHA256withECDSA");
            call.resolve(result);
        } catch (Exception e) {
            call.reject("PLUGIN_ERROR");
        }
    }

    private String deviceIdFor(byte[] der) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] hash = digest.digest(der);
        StringBuilder builder = new StringBuilder();
        for (byte b : hash) {
            builder.append(String.format("%02x", b));
        }
        return builder.toString();
    }

    @PluginMethod
    public void signChallenge(PluginCall call) {
        // Scope of this signing oracle is enforced natively: one alias, known
        // message formats only, and prompt wording derived from the message.
        // Any JS-supplied prompt text is deliberately not read.
        if (!isCanonicalAlias(call.getString("alias"))) {
            call.reject("PLUGIN_ERROR");
            return;
        }
        final String alias = KEY_ALIAS;
        final String message = call.getString("message");
        final String subtitle = promptSubtitleFor(message);
        if (message == null || subtitle == null) {
            call.reject("PLUGIN_ERROR");
            return;
        }
        try {
            KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
            keyStore.load(null);
            PrivateKey privateKey = (PrivateKey) keyStore.getKey(alias, null);
            if (privateKey == null) {
                call.reject("KEY_INVALIDATED");
                return;
            }
            Signature signature = Signature.getInstance("SHA256withECDSA");
            signature.initSign(privateKey);
            BiometricPrompt.CryptoObject crypto = new BiometricPrompt.CryptoObject(signature);
            prompt(call, subtitle, crypto, (result) -> {
                try {
                    Signature bound = result.getCryptoObject().getSignature();
                    bound.update(message.getBytes(StandardCharsets.UTF_8));
                    byte[] signed = bound.sign();
                    JSObject payload = new JSObject();
                    payload.put("signature", Base64.encodeToString(signed, Base64.NO_WRAP));
                    payload.put("algorithm", "SHA256withECDSA");
                    call.resolve(payload);
                } catch (Exception e) {
                    call.reject("AUTH_FAILED");
                }
            });
        } catch (KeyPermanentlyInvalidatedException e) {
            call.reject("KEY_INVALIDATED");
        } catch (Exception e) {
            call.reject("PLUGIN_ERROR");
        }
    }

    private interface OnSuccess {
        void handle(BiometricPrompt.AuthenticationResult result);
    }

    private void prompt(PluginCall call, String subtitle,
                        BiometricPrompt.CryptoObject crypto, OnSuccess onSuccess) {
        FragmentActivity activity = (FragmentActivity) getActivity();
        activity.runOnUiThread(() -> {
            BiometricPrompt biometricPrompt = new BiometricPrompt(activity,
                    ContextCompat.getMainExecutor(getContext()),
                    new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationError(int errorCode, CharSequence errString) {
                            if (errorCode == BiometricPrompt.ERROR_USER_CANCELED
                                    || errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON
                                    || errorCode == BiometricPrompt.ERROR_CANCELED) {
                                call.reject("USER_CANCELED");
                            } else if (errorCode == BiometricPrompt.ERROR_NO_BIOMETRICS) {
                                call.reject("NOT_ENROLLED");
                            } else if (errorCode == BiometricPrompt.ERROR_HW_NOT_PRESENT
                                    || errorCode == BiometricPrompt.ERROR_HW_UNAVAILABLE) {
                                call.reject("NOT_AVAILABLE");
                            } else {
                                call.reject("AUTH_FAILED");
                            }
                        }

                        @Override
                        public void onAuthenticationFailed() {
                            // Non-terminal: the prompt stays open for a retry.
                        }

                        @Override
                        public void onAuthenticationSucceeded(
                                BiometricPrompt.AuthenticationResult result) {
                            onSuccess.handle(result);
                        }
                    });

            BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle(PROMPT_TITLE)
                    .setSubtitle(subtitle)
                    .setNegativeButtonText("إلغاء")
                    .setAllowedAuthenticators(AUTHENTICATORS)
                    .setConfirmationRequired(true)
                    .build();

            // Always bound to a Keystore CryptoObject: there is no prompt-only path.
            biometricPrompt.authenticate(info, crypto);
        });
    }

    @PluginMethod
    public void clearDeviceKey(PluginCall call) {
        if (!isCanonicalAlias(call.getString("alias"))) {
            call.reject("PLUGIN_ERROR");
            return;
        }
        try {
            KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
            keyStore.load(null);
            if (keyStore.containsAlias(KEY_ALIAS)) {
                keyStore.deleteEntry(KEY_ALIAS);
            }
            call.resolve();
        } catch (Exception e) {
            call.resolve();
        }
    }

    /**
     * FLAG_SECURE toggle requested by the web layer (app lock covered/locked).
     * MainActivity independently sets the flag while the activity is paused so
     * the Recents snapshot is protected even when the app lock is disabled;
     * a web "disable" therefore never clears the flag while paused — it is
     * cleared by MainActivity.onResume instead.
     */
    @PluginMethod
    public void setSecureScreen(PluginCall call) {
        final boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        secureRequestedByWeb = enabled;
        getActivity().runOnUiThread(() -> {
            if (enabled) {
                getActivity().getWindow().setFlags(
                        WindowManager.LayoutParams.FLAG_SECURE,
                        WindowManager.LayoutParams.FLAG_SECURE);
            } else if (!hostPaused) {
                getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            }
            call.resolve();
        });
    }
}
