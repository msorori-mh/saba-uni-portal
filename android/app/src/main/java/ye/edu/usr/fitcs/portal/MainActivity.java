package ye.edu.usr.fitcs.portal;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registered before super so the WebView bridge can resolve the plugin.
        registerPlugin(BiometricKeystorePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
