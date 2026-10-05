package ye.edu.usr.fitcs.portal;

import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // A new Activity hosts a new WebView: drop any stale secure-screen request.
        BiometricKeystorePlugin.resetHostState();
        // Registered before super so the WebView bridge can resolve the plugin.
        registerPlugin(BiometricKeystorePlugin.class);
        super.onCreate(savedInstanceState);
    }

    /**
     * Protect the Recents / app-switcher snapshot regardless of whether the
     * student enabled the app lock: FLAG_SECURE is added whenever the activity
     * leaves the foreground.
     *
     * Best effort: on some Android versions / launchers the task snapshot can be
     * captured before onPause is delivered, in which case this does not hide it.
     * Screenshots while the app is in the foreground and unlocked stay allowed
     * by product decision, so the flag is not kept on permanently.
     */
    @Override
    public void onPause() {
        BiometricKeystorePlugin.setHostPaused(true);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        super.onPause();
    }

    @Override
    public void onResume() {
        super.onResume();
        BiometricKeystorePlugin.setHostPaused(false);
        // Keep the flag only if the web layer asked for it (app lock covered/locked).
        if (!BiometricKeystorePlugin.isSecureRequestedByWeb()) {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        }
    }
}
