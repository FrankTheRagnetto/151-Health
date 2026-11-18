package com.the151universe.health.zepp;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * La prova del collegamento a Zepp, sul PC, contro un FINTO server Zepp (nessuna rete vera,
 * nessun dato dell'utente: email, password e token sono inventati qui).
 *
 * Gira dentro `npm test` (sezione 17 di tests/run.mjs): javac + java, nient'altro.
 * Stampa «  ok  …» / «  NO  …» ed esce 1 se anche un solo controllo fallisce.
 *
 * Il finto server fa quello che fa Zepp (ZEPP.md §1-2, huami_token):
 *   POST /v2/registrations/tokens  corpo cifrato AES-CBC → 303 con ?access=…&refresh=…
 *   POST /v2/client/login          code=access → {"token_info":{app_token,login_token,user_id}}
 *   GET  /v1/data/band_data.json   apptoken giusto → dati, altrimenti 401
 *   GET  /v1/sport/run/history.json, GET /users/<uid>
 */
public class ZeppProva {

    static int falliti = 0;

    static void check(boolean cond, String m) {
        System.out.println((cond ? "  ok  " : "  NO  ") + m);
        if (!cond) falliti++;
    }

    // ------------------------------------------------------------ il finto Zepp

    static final String EMAIL = "prova@esempio.it", PASSWORD = "p&ss=wörd 7*";
    static final String UID = "1234567";

    static class FintoZepp {
        HttpServer srv;
        int porta;
        int passo1 = 0, passo2 = 0, dati = 0, altrove = 0;
        String token = null;                 // il token che il server accetta adesso
        int nToken = 0;
        String modoPasso1 = "ok";            // ok | sbagliata | 429 | 500
        String modoDati = "ok";              // ok | 401 | 429 | redirect
        String ultimoModulo1 = null, ultimoDevice = null, ultimoAppToken = null, ultimaQuery = null;
        Map<String, String> testate1 = new HashMap<>();
        List<String> deviceVisti = new ArrayList<>();

        FintoZepp() throws Exception {
            srv = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            srv.createContext("/v2/registrations/tokens", this::passo1);
            srv.createContext("/v2/client/login", this::passo2);
            srv.createContext("/v1/data/band_data.json", this::dati);
            srv.createContext("/v1/sport/run/history.json", this::dati);
            srv.createContext("/users/", this::dati);
            srv.createContext("/altrove", x -> { altrove++; manda(x, 200, "{}"); });
            srv.start();
            porta = srv.getAddress().getPort();
        }

        String base() { return "http://127.0.0.1:" + porta; }

        void passo1(HttpExchange x) {
            try {
                passo1++;
                testate1.clear();
                for (String k : new String[] { "appname", "x-hm-ekv", "vn", "User-Agent" })
                    testate1.put(k, x.getRequestHeaders().getFirst(k));
                byte[] cif = leggi(x.getRequestBody());
                Cipher c = Cipher.getInstance("AES/CBC/PKCS5Padding");
                c.init(Cipher.DECRYPT_MODE,
                    new SecretKeySpec("xeNtBVqzDc6tuNTh".getBytes(StandardCharsets.US_ASCII), "AES"),
                    new IvParameterSpec("MAAAYAAAAAAAAABg".getBytes(StandardCharsets.US_ASCII)));
                String modulo = new String(c.doFinal(cif), StandardCharsets.UTF_8);
                ultimoModulo1 = modulo;
                Map<String, List<String>> f = forma(modulo);
                if ("429".equals(modoPasso1)) { manda(x, 429, ""); return; }
                if ("500".equals(modoPasso1)) { manda(x, 500, ""); return; }
                boolean giusta = "ok".equals(modoPasso1) && EMAIL.equals(uno(f, "emailOrPhone"))
                    && PASSWORD.equals(uno(f, "password"));
                String dove = "https://s3-us-west-2.amazonaws.com/hm-registration/successsignin.html?"
                    + (giusta ? "region=us-west-2&access=ACC-" + passo1 + "&country_code=US&refresh=REF"
                              : "error=0106&state=REDIRECTION");
                x.getResponseHeaders().add("Location", dove);
                manda(x, 303, "");
            } catch (Exception e) {
                manda(x, 500, "rotto: " + e);
            }
        }

        void passo2(HttpExchange x) {
            try {
                passo2++;
                Map<String, List<String>> f = forma(new String(leggi(x.getRequestBody()), StandardCharsets.UTF_8));
                String code = uno(f, "code");
                ultimoDevice = uno(f, "device_id");
                deviceVisti.add(ultimoDevice);
                if (code == null || !code.startsWith("ACC-") || !"access_token".equals(uno(f, "grant_type"))) {
                    manda(x, 400, "{}");
                    return;
                }
                nToken++;
                token = "APP\\/" + nToken;       // con un escape JSON dentro: il lettore deve toglierlo
                manda(x, 200, "{\"result\":\"ok\",\"token_info\":{\"login_token\":\"LT-" + nToken
                    + "\",\"app_token\":\"" + token + "\",\"user_id\":\"" + UID + "\"},\"regist_info\":{}}");
                token = token.replace("\\/", "/");
            } catch (Exception e) {
                manda(x, 500, "rotto");
            }
        }

        void dati(HttpExchange x) {
            dati++;
            ultimoAppToken = x.getRequestHeaders().getFirst("apptoken");
            ultimaQuery = x.getRequestURI().getRawQuery();
            if ("429".equals(modoDati)) { x.getResponseHeaders().add("Retry-After", "7200"); manda(x, 429, ""); return; }
            if ("redirect".equals(modoDati)) {
                x.getResponseHeaders().add("Location", base() + "/altrove");
                manda(x, 302, "");
                return;
            }
            if ("401".equals(modoDati) || token == null || !token.equals(ultimoAppToken)) { manda(x, 401, "{}"); return; }
            manda(x, 200, "{\"code\":1,\"strada\":\"" + x.getRequestURI().getPath() + "\"}");
        }

        void scadeToken() { token = "SCADUTO"; }
    }

    static Map<String, List<String>> forma(String s) throws Exception {
        Map<String, List<String>> m = new HashMap<>();
        for (String c : s.split("&")) {
            int u = c.indexOf('=');
            String k = URLDecoder.decode(c.substring(0, u), "UTF-8"), v = URLDecoder.decode(c.substring(u + 1), "UTF-8");
            m.computeIfAbsent(k, z -> new ArrayList<>()).add(v);
        }
        return m;
    }

    static String uno(Map<String, List<String>> f, String k) {
        List<String> l = f.get(k);
        return l == null ? null : l.get(0);
    }

    static byte[] leggi(InputStream in) throws Exception {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
        return b.toByteArray();
    }

    static void manda(HttpExchange x, int codice, String corpo) {
        try {
            byte[] b = corpo.getBytes(StandardCharsets.UTF_8);
            x.sendResponseHeaders(codice, b.length == 0 ? -1 : b.length);
            if (b.length > 0) try (OutputStream o = x.getResponseBody()) { o.write(b); }
            x.close();
        } catch (Exception e) {
            x.close();
        }
    }

    // ------------------------------------------------------------ attrezzi della prova

    static class Memoria implements ZeppCloud.Deposito {
        final Map<String, String> m = new HashMap<>();
        public String leggi(String k) { return m.get(k); }
        public void scrivi(String k, String v) { m.put(k, v); }
        public void togli(String k) { m.remove(k); }
    }

    static class Orologio implements ZeppCloud.Tempo {
        long t = 1_800_000_000_000L;
        public long ora() { return t; }
        void avanti(long ms) { t += ms; }
    }

    static final long MIN = 60_000L, ORA = 60 * MIN;

    static String codice(ThrowingRunnable r) {
        try {
            r.run();
            return "nessun errore";
        } catch (ZeppCloud.Errore e) {
            return e.codice;
        } catch (Exception e) {
            return "eccezione " + e;
        }
    }

    interface ThrowingRunnable { void run() throws Exception; }

    static ZeppCloud.Errore errore(ThrowingRunnable r) {
        try { r.run(); } catch (ZeppCloud.Errore e) { return e; } catch (Exception e) { return null; }
        return null;
    }

    // ------------------------------------------------------------ le prove

    public static void main(String[] a) {
        // Un crollo a metà è un rosso, subito: il finto server tiene vivo Java, senza
        // System.exit la prova resterebbe appesa invece di fallire.
        try {
            prove();
        } catch (Throwable e) {
            System.out.println("  NO  la prova è crollata a metà: " + e);
            System.exit(1);
        }
    }

    static void prove() throws Exception {
        FintoZepp z = new FintoZepp();
        Memoria mem = new Memoria();
        Orologio t = new Orologio();
        ZeppCloud c = new ZeppCloud(mem, t, z.base(), z.base(), z.base(), true);

        System.out.println("  · accesso e primo download");
        check(ZeppCloud.NIENTE_ACCESSO.equals(codice(() -> c.scarica("riepilogo", "2026-10-01", "2026-10-15", null)))
            && z.passo1 + z.passo2 + z.dati == 0,
            "senza email e password: NIENTE_ACCESSO, e nessuna chiamata a Zepp");
        c.salvaAccesso(EMAIL, PASSWORD);
        String corpo = c.scarica("riepilogo", "2026-10-01", "2026-10-15", null);
        check(corpo.contains("band_data") && z.passo1 == 1 && z.passo2 == 1,
            "primo download: un login (due passi) e i dati arrivano così come li manda Zepp");
        Map<String, List<String>> f1 = forma(z.ultimoModulo1);
        check(EMAIL.equals(uno(f1, "emailOrPhone")) && PASSWORD.equals(uno(f1, "password"))
                && f1.get("token") != null && f1.get("token").contains("access") && f1.get("token").contains("refresh")
                && "HuaMi".equals(uno(f1, "client_id")),
            "il passo 1 è cifrato come lo vuole Zepp (AES-CBC) e porta email, password (con & = spazi accenti), token=access e token=refresh");
        check("com.huami.midong".equals(z.testate1.get("appname")) && "1".equals(z.testate1.get("x-hm-ekv"))
                && "9.12.5".equals(z.testate1.get("vn")) && z.testate1.get("User-Agent").startsWith("Zepp/9.12.5"),
            "il passo 1 si presenta come l'app Zepp 9.12.5 (testate della libreria)");
        check("APP/1".equals(z.ultimoAppToken), "i dati si chiedono col token del login (escape JSON letto giusto)");
        check(z.ultimaQuery.startsWith("userid=" + UID + "&query_type=summary&device_type=0&from_date=2026-10-01&to_date=2026-10-15"),
            "riepilogo = band_data summary con userid e finestra di date");

        System.out.println("  · il token si riusa: scaricare non costa login");
        c.scarica("minuti", "2026-07-01", "2026-09-28", null);
        check(z.ultimaQuery.contains("query_type=detail") && z.passo1 == 1, "minuti = band_data detail, stesso token, nessun login");
        c.scarica("allenamenti", null, null, null);
        check(z.ultimaQuery.equals("userid=" + UID), "allenamenti: la lista intera");
        c.scarica("allenamenti", null, null, "1685698644");
        check(z.ultimaQuery.equals("userid=" + UID + "&trackid=1685698644"), "allenamenti all'indietro da un trackid");
        String prof = c.scarica("profilo", null, null, null);
        check(prof.contains("/users/" + UID), "profilo = /users/<uid>");
        t.avanti(22 * ORA);
        c.scarica("profilo", null, null, null);
        check(z.passo1 == 1, "dopo 22 ore il token vale ancora: nessun login");

        System.out.println("  · 23 ore: token vecchio, un login nuovo (l'ultimo è lontano)");
        t.avanti(2 * ORA);
        c.scarica("profilo", null, null, null);
        check(z.passo1 == 2 && z.passo2 == 2 && "APP/2".equals(z.ultimoAppToken), "dopo 24 ore: un login e il token nuovo");
        check(z.deviceVisti.size() == 2 && z.deviceVisti.get(0).equals(z.deviceVisti.get(1)),
            "per Zepp è sempre lo stesso telefono (device_id che non cambia a ogni login)");

        System.out.println("  · Zepp scade il token prima: un solo login, e solo se l'ora lo permette");
        t.avanti(10 * MIN);
        z.scadeToken();
        ZeppCloud.Errore e1 = errore(() -> c.scarica("profilo", null, null, null));
        check(e1 != null && ZeppCloud.ATTESA.equals(e1.codice) && e1.minuti == 50 && z.passo1 == 2,
            "401 a 10 minuti dall'ultimo login: ATTESA «fra 50 minuti», nessun login tentato");
        check(e1 != null && e1.getMessage().contains("Zepp closed Health's access"),
            "il messaggio dice la verità: è Zepp che ha chiuso il token (un login altrove), non «troppo presto»");
        Map<String, Object> st1 = c.stato();
        check("profilo".equals(st1.get("ultimoTokenRifiutatoSu")) && ((Long) st1.get("ultimoTokenRifiutato")) == t.ora()
                && ((Long) st1.get("ultimoLogin")) > 0 && ((Long) st1.get("ultimoLogin")) < t.ora(),
            "il tracciante: lo stato dice quando e su cosa Zepp ha rifiutato il token, e quando c'è stato l'ultimo login");
        int datiPrima = z.dati;
        ZeppCloud.Errore e1b = errore(() -> c.scarica("profilo", null, null, null));
        check(e1b != null && ZeppCloud.ATTESA.equals(e1b.codice) && e1b.getMessage().contains("closed Health") && z.dati == datiPrima,
            "ripremuto durante l'attesa: stesso messaggio, e nessuna rete");
        t.avanti(51 * MIN);
        c.scarica("profilo", null, null, null);
        check(z.passo1 == 3 && "APP/3".equals(z.ultimoAppToken), "passata l'ora: un login e i dati");
        t.avanti(5 * MIN);
        String tok = mem.leggi(ZeppCloud.K_APP_TOKEN);
        mem.togli(ZeppCloud.K_APP_TOKEN);
        ZeppCloud.Errore e1c = errore(() -> c.scarica("profilo", null, null, null));
        mem.scrivi(ZeppCloud.K_APP_TOKEN, tok);   // il resto della prova riparte col token buono
        check(e1c != null && !e1c.getMessage().contains("closed Health") && e1c.getMessage().contains("a short while ago"),
            "dopo un login riuscito il rifiuto vecchio non conta più: l'attesa normale ha il suo messaggio");
        t.avanti(ORA);

        System.out.println("  · un 401 che non passa: un login, poi stop");
        t.avanti(2 * ORA);
        z.modoDati = "401";
        int p1 = z.passo1;
        check(ZeppCloud.RIFIUTATO.equals(codice(() -> c.scarica("profilo", null, null, null))) && z.passo1 == p1 + 1,
            "401 anche col token nuovo: RIFIUTATO dopo UN solo login");
        check(ZeppCloud.ATTESA.equals(codice(() -> c.scarica("profilo", null, null, null))) && z.passo1 == p1 + 1,
            "e riprovando subito non parte un altro login");
        z.modoDati = "ok";

        System.out.println("  · password sbagliata: nessun altro tentativo finché l'utente non la riscrive");
        t.avanti(2 * ORA);
        z.modoPasso1 = "sbagliata";
        p1 = z.passo1;
        int p2 = z.passo2;
        check(ZeppCloud.RIFIUTATO.equals(codice(() -> c.scarica("profilo", null, null, null))) && z.passo1 == p1 + 1 && z.passo2 == p2,
            "Zepp dice no alla password: RIFIUTATO, il secondo passo non parte");
        t.avanti(5 * ORA);
        check(ZeppCloud.RIFIUTATO.equals(codice(() -> c.scarica("profilo", null, null, null))) && z.passo1 == p1 + 1,
            "ore dopo, stessa password: RIFIUTATO senza rete (non si martella l'account)");
        z.modoPasso1 = "ok";
        c.salvaAccesso(EMAIL, PASSWORD);
        c.scarica("profilo", null, null, null);
        check(z.passo1 == p1 + 2, "riscritta la password: si riprova, una volta");

        System.out.println("  · le guardie sopravvivono a «dimentica» e a una password nuova");
        t.avanti(5 * MIN);
        c.dimentica();
        check(mem.leggi(ZeppCloud.K_PASSWORD) == null && mem.leggi(ZeppCloud.K_APP_TOKEN) == null
                && mem.leggi(ZeppCloud.K_LOGIN_AT) != null,
            "dimentica toglie accesso e token, non l'ora dell'ultimo login");
        c.salvaAccesso(EMAIL, PASSWORD);
        p1 = z.passo1;
        ZeppCloud.Errore e2 = errore(() -> c.scarica("profilo", null, null, null));
        check(e2 != null && ZeppCloud.ATTESA.equals(e2.codice) && e2.minuti == 55 && z.passo1 == p1,
            "dimentica + riscrivi subito: ATTESA 55 minuti, nessun login");
        mem.scrivi(ZeppCloud.K_LOGIN_AT, Long.toString(t.ora() + 30 * 24 * ORA));
        ZeppCloud.Errore e3 = errore(() -> c.scarica("profilo", null, null, null));
        check(e3 != null && ZeppCloud.ATTESA.equals(e3.codice) && e3.minuti == 60,
            "ora del telefono tornata indietro: si aspetta un'ora, non un mese");
        t.avanti(ORA);
        c.scarica("profilo", null, null, null);
        check(z.passo1 == p1 + 1, "e dopo l'ora si entra");

        System.out.println("  · 429 (troppe richieste): fermo, senza rete");
        z.modoDati = "429";
        int d0 = z.dati;
        ZeppCloud.Errore e4 = errore(() -> c.scarica("profilo", null, null, null));
        check(e4 != null && ZeppCloud.FERMO.equals(e4.codice) && e4.minuti == 120,
            "429 con Retry-After di 2 ore: FERMO 120 minuti (si aspetta di più, mai di meno)");
        z.modoDati = "ok";
        check(ZeppCloud.FERMO.equals(codice(() -> c.scarica("profilo", null, null, null))) && z.dati == d0 + 1,
            "durante il fermo nessuna chiamata parte");
        t.avanti(121 * MIN);
        check(c.scarica("profilo", null, null, null).contains("users"), "finito il fermo, si scarica");
        t.avanti(2 * ORA);
        mem.togli(ZeppCloud.K_APP_TOKEN);
        z.modoPasso1 = "429";
        check(ZeppCloud.FERMO.equals(codice(() -> c.scarica("profilo", null, null, null)))
                && mem.leggi(ZeppCloud.K_RIFIUTATO) == null,
            "429 sul login: FERMO, e la password NON viene data per sbagliata");
        z.modoPasso1 = "500";
        t.avanti(3 * ORA);
        check(ZeppCloud.RISPOSTA.equals(codice(() -> c.scarica("profilo", null, null, null)))
                && mem.leggi(ZeppCloud.K_RIFIUTATO) == null,
            "Zepp guasto (500) sul login: RISPOSTA, password non segnata come sbagliata");
        z.modoPasso1 = "ok";

        System.out.println("  · la rete: solo Zepp, mai un redirect");
        t.avanti(2 * ORA);
        c.scarica("profilo", null, null, null);
        z.modoDati = "redirect";
        check(ZeppCloud.RISPOSTA.equals(codice(() -> c.scarica("profilo", null, null, null))) && z.altrove == 0,
            "un redirect sui dati non si segue (RISPOSTA, l'altro indirizzo non viene mai toccato)");
        z.modoDati = "ok";
        ZeppCloud vero = new ZeppCloud(new Memoria(), t);
        String[] no = { "http://127.0.0.1:" + z.porta + "/x", "https://esempio.com/", "http://api-mifit-de2.huami.com/v1",
            "https://api-mifit-de2.huami.com.esempio.com/", "https://api-mifit-de2.huami.com:8443/",
            "https://utente@api-mifit-de2.huami.com/", "https://huami.com/", "ftp://api-mifit-de2.huami.com/" };
        boolean tuttiNo = true;
        for (String u : no) tuttiNo &= ZeppCloud.DOMANDA.equals(codice(() -> vero.controllaIndirizzo(u)));
        check(tuttiNo, "quello vero rifiuta 127.0.0.1, altri siti, http, sottodomini finti, porte strane, utenti nell'indirizzo");
        boolean tuttiSi = true;
        for (String h : new String[] { Rete.HOST_TOKENS, Rete.HOST_LOGIN, Rete.HOST_DATI })
            tuttiSi &= "nessun errore".equals(codice(() -> vero.controllaIndirizzo("https://" + h + "/v1/x?y=1")));
        check(tuttiSi, "e accetta i tre indirizzi Zepp, in https");

        System.out.println("  · la pagina senza rete (la regola del muro in MainActivity)");
        check(Rete.paginaPuo("https://localhost/index.html", "localhost") && Rete.paginaPuo("data:image/png;base64,AA", "localhost")
                && Rete.paginaPuo("blob:https://localhost/1", "localhost"),
            "la pagina carica i suoi file (https://localhost), data: e blob:");
        boolean pag = true;
        for (String u : new String[] { "https://api-mifit-de2.huami.com/v1", "https://esempio.com/", "http://localhost/x",
                "https://localhost.esempio.com/", "https://localhost:8080/", "wss://localhost/", "file:///sdcard/x" })
            pag &= !Rete.paginaPuo(u, "localhost");
        check(pag, "e nient'altro: nemmeno Zepp, né http, né sottodomini o porte diverse");

        System.out.println("  · domande sbagliate: nessuna rete");
        int tot = z.passo1 + z.dati;
        boolean dom = ZeppCloud.DOMANDA.equals(codice(() -> c.scarica("tutto", null, null, null)))
            && ZeppCloud.DOMANDA.equals(codice(() -> c.scarica("minuti", "2026/10/01", "2026-10-02", null)))
            && ZeppCloud.DOMANDA.equals(codice(() -> c.scarica("minuti", "2026-02-30", "2026-03-02", null)))
            && ZeppCloud.DOMANDA.equals(codice(() -> c.scarica("minuti", "2026-10-02", "2026-10-01", null)))
            && ZeppCloud.DOMANDA.equals(codice(() -> c.scarica("minuti", "2026-01-01", "2026-04-11", null)))
            && ZeppCloud.DOMANDA.equals(codice(() -> c.scarica("allenamenti", null, null, "12&userid=9")))
            && ZeppCloud.DOMANDA.equals(codice(() -> c.salvaAccesso("", "x")));
        check(dom && z.passo1 + z.dati == tot,
            "cosa sconosciuta, date storte o inesistenti, finestre rovesce o oltre 100 giorni, trackid con trucchi, email vuota → DOMANDA");
        check("nessun errore".equals(codice(() -> c.scarica("minuti", "2024-02-29", "2024-06-07", null))),
            "100 giorni giusti, anno bisestile compreso: si scarica");
        check(ZeppCloud.giorno("1970-01-01") == Long.MIN_VALUE && ZeppCloud.giorno("2026-10-16") == 20742
                && ZeppCloud.giorno("2000-03-01") - ZeppCloud.giorno("2000-02-28") == 2,
            "il conto dei giorni fatto a mano torna (2026-10-16 = giorno 20742, 2000 bisestile)");

        System.out.println("  · niente segreti fuori");
        String st = c.stato().toString();
        check(!st.contains(PASSWORD) && !st.contains("APP/") && !st.contains("LT-") && st.contains("accesso=true"),
            "lo stato dice com'è messo il collegamento ma non contiene password né token");
        ZeppCloud.Errore e5 = errore(() -> { mem.togli(ZeppCloud.K_APP_TOKEN); z.modoPasso1 = "sbagliata"; t.avanti(2 * ORA); c.scarica("profilo", null, null, null); });
        check(e5 != null && !e5.getMessage().contains(PASSWORD) && !e5.getMessage().contains(EMAIL),
            "i messaggi d'errore non ripetono email né password");

        System.out.println("  · il lettore JSON");
        Object j = MiniJson.leggi(" {\"a\":[1,2.5,-3e2,true,false,null],\"b\":{\"c\":\"\\u00e8\\n\\\"x\\\"\"},\"n\":7068450874} ");
        check("è\n\"x\"".equals(MiniJson.campo(j, "b", "c")) && "7068450874".equals(MiniJson.campo(j, "n"))
                && MiniJson.campo(j, "z") == null,
            "legge escape, unicode, numeri grandi come user id");
        boolean rotti = true;
        for (String r : new String[] { "{", "{\"a\":}", "[1,]", "{\"a\":1}x", "\"\\q\"", "tru" }) {
            try { MiniJson.leggi(r); rotti = false; } catch (IllegalArgumentException x) { /* giusto */ }
        }
        check(rotti, "e rifiuta il JSON rotto invece di indovinare");

        z.srv.stop(0);
        System.out.println(falliti == 0 ? "  TUTTO VERDE" : "  " + falliti + " FALLITI");
        System.exit(falliti == 0 ? 0 : 1);
    }
}
