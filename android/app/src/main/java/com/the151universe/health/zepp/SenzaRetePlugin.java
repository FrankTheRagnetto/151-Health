package com.the151universe.health.zepp;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Il tappo sul modulo di rete di Capacitor.
 *
 * Capacitor porta sempre con sé «CapacitorHttp»: anche spento (enabled=false, il
 * nostro caso) la pagina può chiamarlo a mano — Capacitor.Plugins.CapacitorHttp.request —
 * e uscire in rete dal lato Android, dove il muro della WebView non arriva. Da quando
 * Health ha il permesso INTERNET (16/10/2026, solo per Zepp) quella porta va chiusa.
 *
 * Capacitor registra i plugin per nome in una mappa: registrato DOPO il suo (MainActivity),
 * questo prende il posto di quello vero e dice di no a tutto.
 */
@CapacitorPlugin(name = "CapacitorHttp")
public class SenzaRetePlugin extends Plugin {

    private static void no(PluginCall call) {
        call.reject("The Health page has no network.", "SENZA_RETE");
    }

    @PluginMethod public void request(PluginCall call) { no(call); }
    @PluginMethod public void get(PluginCall call) { no(call); }
    @PluginMethod public void post(PluginCall call) { no(call); }
    @PluginMethod public void put(PluginCall call) { no(call); }
    @PluginMethod public void patch(PluginCall call) { no(call); }
    @PluginMethod public void delete(PluginCall call) { no(call); }
}
