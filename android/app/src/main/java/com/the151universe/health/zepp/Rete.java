package com.the151universe.health.zepp;

import java.net.URI;

/**
 * Le due regole della rete di Health, in un posto solo (decisione di progetto):
 *
 *   1. Il cloud: parla in rete SOLO il pezzetto Android di Zepp (ZeppCloud), e SOLO
 *      verso i tre indirizzi scritti qui sotto, solo in https.
 *   2. La pagina (la WebView) resta SENZA rete: può caricare solo i suoi file da
 *      https://localhost (dentro l'APK). Il muro sta in MainActivity, la regola qui.
 *
 * Java puro (niente android.*): si prova sul PC, tests/java/ZeppProva.java.
 */
public final class Rete {

    private Rete() {}

    /** Il primo passo del login (email e password cifrate → codice d'accesso). */
    public static final String HOST_TOKENS = "api-user-us2.zepp.com";
    /** Il secondo passo del login (codice → token dell'app). */
    public static final String HOST_LOGIN = "api-mifit-us2.zepp.com";
    /** I dati, regione europea (ZEPP.md §2: il «de2» non si cambia). */
    public static final String HOST_DATI = "api-mifit-de2.huami.com";

    private static final String[] CLOUD = { HOST_TOKENS, HOST_LOGIN, HOST_DATI };

    /** Vero solo per https verso uno dei tre indirizzi Zepp, porta normale, senza utente. */
    public static boolean cloudPuo(String url) {
        URI u = analizza(url);
        if (u == null || !"https".equals(u.getScheme())) return false;
        if (u.getRawUserInfo() != null) return false;
        if (u.getPort() != -1 && u.getPort() != 443) return false;
        String h = u.getHost();
        if (h == null) return false;
        for (String c : CLOUD) if (c.equals(h)) return true;
        return false;
    }

    /**
     * Cosa può caricare la pagina: i suoi file (https://localhost, l'indirizzo con cui
     * Capacitor serve www/ dall'APK) e i dati già in memoria (data:, blob:). Nient'altro.
     */
    public static boolean paginaPuo(String url, String hostLocale) {
        if (url == null) return false;
        String low = url.toLowerCase();
        if (low.startsWith("data:") || low.startsWith("blob:")) return true;
        URI u = analizza(url);
        if (u == null || !"https".equals(u.getScheme())) return false;
        if (u.getRawUserInfo() != null) return false;
        if (u.getPort() != -1 && u.getPort() != 443) return false;
        return hostLocale != null && hostLocale.equals(u.getHost());
    }

    private static URI analizza(String url) {
        if (url == null) return null;
        try {
            URI u = new URI(url);
            return u.getHost() == null ? null : u;
        } catch (Exception e) {
            return null;
        }
    }
}
