package com.the151universe.health;

import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.view.WindowManager;
import androidx.activity.OnBackPressedCallback;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import com.the151universe.health.zepp.Rete;
import com.the151universe.health.zepp.SenzaRetePlugin;
import com.the151universe.health.zepp.ZeppPlugin;
import java.io.ByteArrayInputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Il guscio di 151 Health (nato come guscio della Scheda). Tutto il programma è web (www/, copiato dal sito);
 * qui ci sono solo le due cose che una WebView da sola NON sa fare e che nel
 * browser funzionavano da sé:
 *
 *   SchedaNative.print()               window.print() in una WebView non fa niente
 *   SchedaNative.saveFile(nome, testo) un <a download> di un blob non scarica niente
 *   SchedaNative.keepAwake(sì/no)      lo schermo acceso durante l'allenamento
 *                                      (il Wake Lock del browser qui non c'è)
 *
 * E il tasto «indietro» del telefono: prima lo si chiede all'app
 * (window.SchedaBack: chiude il foglio, risale a Oggi); solo se lei dice «non
 * è roba mia» l'app va in secondo piano — viva, non chiusa.
 *
 * app.js li usa solo se esistono: nel browser non ci sono e resta tutto com'era.
 *
 * LA RETE (dal 16/10/2026, decisione di progetto): l'app ha il permesso INTERNET solo per
 * Zepp, e lo usa solo il pezzetto Android in zepp/ verso gli indirizzi di Rete.java.
 * La pagina resta senza rete, con due muri messi qui:
 *   - MuroPagina: la WebView carica solo i suoi file (https://localhost), il resto → 403;
 *   - SenzaRetePlugin: il modulo di rete di Capacitor, chiamabile dalla pagina anche
 *     spento, è sostituito da uno che dice sempre no.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ZeppPlugin.class);
        registerPlugin(SenzaRetePlugin.class);   // DOPO quello vero di Capacitor: ne prende il posto
        super.onCreate(savedInstanceState);
        getBridge().setWebViewClient(new MuroPagina(getBridge()));
        getBridge().getWebView().addJavascriptInterface(new SchedaNative(), "SchedaNative");
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                getBridge().getWebView().evaluateJavascript(
                    "(window.SchedaBack && window.SchedaBack()) ? '1' : '0'",
                    v -> { if (!"\"1\"".equals(v)) moveTaskToBack(true); });
            }
        });
    }

    /** La pagina carica solo da sé stessa: qualunque altro indirizzo riceve un 403 vuoto. */
    private static class MuroPagina extends BridgeWebViewClient {
        private final String hostLocale;

        MuroPagina(Bridge bridge) {
            super(bridge);
            hostLocale = Uri.parse(bridge.getLocalUrl()).getHost();
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            if (!Rete.paginaPuo(request.getUrl().toString(), hostLocale)) {
                return new WebResourceResponse("text/plain", "utf-8", 403, "No network", null,
                    new ByteArrayInputStream(new byte[0]));
            }
            return super.shouldInterceptRequest(view, request);
        }
    }

    private class SchedaNative {

        /** Stampa la pagina (con @media print) → il dialogo di Android offre «Salva come PDF». */
        @JavascriptInterface
        public void print() {
            runOnUiThread(() -> {
                WebView wv = getBridge().getWebView();
                PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                pm.print("Scheda", wv.createPrintDocumentAdapter("Scheda"), null);
            });
        }

        /** Schermo sempre acceso (sì) o di nuovo libero di spegnersi (no). */
        @JavascriptInterface
        public void keepAwake(boolean on) {
            runOnUiThread(() -> {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        /** Scrive un file di testo in Download. Vero se è andata. Serve Android 10+. */
        @JavascriptInterface
        public boolean saveFile(String name, String text) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false;
            ContentValues v = new ContentValues();
            v.put(MediaStore.Downloads.DISPLAY_NAME, name);
            v.put(MediaStore.Downloads.MIME_TYPE, "application/json");
            Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            if (uri == null) return false;
            try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                out.write(text.getBytes(StandardCharsets.UTF_8));
                return true;
            } catch (Exception e) {
                getContentResolver().delete(uri, null, null);
                return false;
            }
        }
    }
}
