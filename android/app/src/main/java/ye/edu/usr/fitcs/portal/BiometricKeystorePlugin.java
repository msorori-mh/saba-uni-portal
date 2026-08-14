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
 */
@CapacitorPlugin(name = "PortalBiometricKeystore")
public class BiometricKeystorePlugin extends Plugin {

    private static final String KEYSTORE = "AndroidKeyStore";
    private static final int AUTHENTICATORS = BiometricManager.Authenticators.BIOMETRIC_STRONG;

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
        String alias = call.getString("alias");
        if (alias == null) {
            call.reject("PLUGIN_ERROR");
            return;
        }
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
        String alias = call.getString("alias");
        String message = call.getString("message");
        String reason = call.getString("reason", "التحقق المطلوب");
        if (alias == null || message == null) {
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
            prompt(call, reason, crypto, (result) -> {
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

    @PluginMethod
    public void authenticate(PluginCall call) {
        String reason = call.getString("reason", "التحقق المطلوب");
        prompt(call, reason, null, (result) -> {
            JSObject payload = new JSObject();
            payload.put("verified", true);
            call.resolve(payload);
        });
    }

    private interface OnSuccess {
        void handle(BiometricPrompt.AuthenticationResult result);
    }

    private void prompt(PluginCall call, String reason,
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
                    .setTitle("بوابة الكلية")
                    .setSubtitle(reason)
                    .setNegativeButtonText("إلغاء")
                    .setAllowedAuthenticators(AUTHENTICATORS)
                    .setConfirmationRequired(true)
                    .build();

            if (crypto != null) {
                biometricPrompt.authenticate(info, crypto);
            } else {
                biometricPrompt.authenticate(info);
            }
        });
    }

    @PluginMethod
    public void clearDeviceKey(PluginCall call) {
        String alias = call.getString("alias");
        try {
            KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
            keyStore.load(null);
            if (alias != null && keyStore.containsAlias(alias)) {
                keyStore.deleteEntry(alias);
            }
            call.resolve();
        } catch (Exception e) {
            call.resolve();
        }
    }

    /** FLAG_SECURE toggle — used only while the app is backgrounded or locked. */
    @PluginMethod
    public void setSecureScreen(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        getActivity().runOnUiThread(() -> {
            if (enabled) {
                getActivity().getWindow().setFlags(
                        WindowManager.LayoutParams.FLAG_SECURE,
                        WindowManager.LayoutParams.FLAG_SECURE);
            } else {
                getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            }
            call.resolve();
        });
    }
}
