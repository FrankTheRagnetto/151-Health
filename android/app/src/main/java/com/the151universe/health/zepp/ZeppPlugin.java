package com.the151universe.health.zepp;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * La porta della pagina verso Zepp: la pagina non ha rete (Rete.java), chiede qui.
 *
 *   Capacitor.Plugins.Zepp.salvaAccesso({ email, password })
 *   Capacitor.Plugins.Zepp.stato()      → { accesso, email, rifiutato, tokenValido,
 *                                           minutiFermo, minutiProssimoLogin }
 *   Capacitor.Plugins.Zepp.dimentica()
 *   Capacitor.Plugins.Zepp.scarica({ cosa, da, a, primaDi }) → { corpo }   (testo JSON di Zepp)
 *
 * Un no arriva come errore con `code` = uno dei codici di ZeppCloud (ATTESA, FERMO, …)
 * e `data.minuti` quando c'è da aspettare. Password e token non tornano MAI alla pagina.
 *
 * Tutto il lavoro di rete va su un filo suo, uno alla volta: un download lungo non
 * blocca gli altri plugin (la notifica della sera) e due richieste non si accavallano.
 */
@CapacitorPlugin(name = "Zepp")
public class ZeppPlugin extends Plugin {

    private ZeppCloud cloud;
    private final ExecutorService filo = Executors.newSingleThreadExecutor();

    @Override
    public void load() {
        cloud = new ZeppCloud(new Cassaforte(getContext()), System::currentTimeMillis);
    }

    @PluginMethod
    public void salvaAccesso(PluginCall call) {
        String email = call.getString("email"), password = call.getString("password");
        filo.execute(() -> {
            try {
                cloud.salvaAccesso(email, password);
                call.resolve();
            } catch (ZeppCloud.Errore e) {
                rifiuta(call, e);
            } catch (RuntimeException e) {
                call.reject("The phone's keystore is not answering.", "CASSAFORTE");
            }
        });
    }

    @PluginMethod
    public void stato(PluginCall call) {
        filo.execute(() -> {
            try {
                JSObject o = new JSObject();
                for (Map.Entry<String, Object> e : cloud.stato().entrySet()) o.put(e.getKey(), e.getValue());
                call.resolve(o);
            } catch (RuntimeException e) {
                call.reject("The phone's keystore is not answering.", "CASSAFORTE");
            }
        });
    }

    @PluginMethod
    public void dimentica(PluginCall call) {
        filo.execute(() -> {
            try {
                cloud.dimentica();
                call.resolve();
            } catch (RuntimeException e) {
                call.reject("The phone's keystore is not answering.", "CASSAFORTE");
            }
        });
    }

    @PluginMethod
    public void scarica(PluginCall call) {
        String cosa = call.getString("cosa"), da = call.getString("da"), a = call.getString("a"),
            primaDi = call.getString("primaDi");
        filo.execute(() -> {
            try {
                JSObject o = new JSObject();
                o.put("corpo", cloud.scarica(cosa, da, a, primaDi));
                call.resolve(o);
            } catch (ZeppCloud.Errore e) {
                rifiuta(call, e);
            } catch (RuntimeException e) {
                call.reject("The phone's keystore is not answering.", "CASSAFORTE");
            }
        });
    }

    private static void rifiuta(PluginCall call, ZeppCloud.Errore e) {
        JSObject d = new JSObject();
        d.put("minuti", e.minuti);
        call.reject(e.getMessage(), e.codice, d);
    }

    @Override
    protected void handleOnDestroy() {
        filo.shutdown();
    }
}
