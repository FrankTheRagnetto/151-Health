package com.the151universe.health.zepp;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Il collegamento di 151 Health al cloud Zepp: il login e i download, nient'altro.
 *
 * È il giro della libreria huami_token (accesso al cloud Zepp/Huami) portato dentro l'app.
 *
 * COSA PROTEGGE L'ACCOUNT (Zepp blocca per ore chi fa troppi login, ZEPP.md §1):
 *   - al massimo UN tentativo di login all'ora, contato PRIMA di partire, anche se
 *     poi va male; il conto sopravvive a «dimentica» e a una password nuova;
 *   - il token si riusa per 23 ore: scaricare non costa login;
 *   - password rifiutata → nessun altro tentativo finché l'utente non la riscrive;
 *   - 429 (troppe richieste) da qualunque parte → fermo per un'ora, senza rete;
 *   - un 401 sui dati → al massimo un login nuovo per richiesta (e sempre dentro
 *     l'ora), poi si ferma.
 *
 * COSA PROTEGGE LA RETE (decisione di progetto): solo https, solo gli
 * indirizzi di Rete.java, mai un redirect seguito, risposte con un tetto di grandezza.
 *
 * Java puro: il telefono gli dà la cassaforte (Cassaforte, Android Keystore) e l'ora;
 * la prova sul PC gli dà un deposito in memoria, un orologio finto e un finto server.
 * Mai stampare o restituire password e token: escono solo verso Zepp.
 */
public final class ZeppCloud {

    /** Dove vivono accesso e token: sul telefono è la Cassaforte (cifrata con Android Keystore). */
    public interface Deposito {
        String leggi(String chiave);
        void scrivi(String chiave, String valore);
        void togli(String chiave);
    }

    /** L'ora in millisecondi (finta nella prova, per saltare avanti di un'ora). */
    public interface Tempo {
        long ora();
    }

    /** Un no con il suo perché: il codice lo legge l'app, il messaggio lo legge l'utente. */
    public static final class Errore extends Exception {
        public final String codice;
        /** Per ATTESA e FERMO: fra quanti minuti si può riprovare. Altrimenti 0. */
        public final long minuti;

        Errore(String codice, String messaggio, long minuti) {
            super(messaggio);
            this.codice = codice;
            this.minuti = minuti;
        }
    }

    public static final String NIENTE_ACCESSO = "NIENTE_ACCESSO"; // email/password mai salvate
    public static final String ATTESA = "ATTESA";                 // un login c'è già stato nell'ultima ora
    public static final String RIFIUTATO = "RIFIUTATO";           // Zepp non accetta email/password o token
    public static final String FERMO = "FERMO";                   // Zepp ha detto «troppe richieste» (429)
    public static final String RETE = "RETE";                     // niente internet, o Zepp non risponde
    public static final String RISPOSTA = "RISPOSTA";             // Zepp ha risposto qualcosa di inatteso
    public static final String DOMANDA = "DOMANDA";               // la richiesta stessa non è valida

    static final long MINUTO = 60_000L;
    static final long ORA = 60 * MINUTO;
    static final long VITA_TOKEN = 23 * ORA;   // come CACHE_MAX_AGE di full_extract.py
    static final long PAUSA_LOGIN = ORA;       // un login all'ora: il limite del server
    static final long PAUSA_429 = ORA;
    static final int TETTO_RISPOSTA = 32 * 1024 * 1024;   // 90 giorni di minuti ≈ 1,1 MB: largo
    static final int GIORNI_MAX = 100;                    // una finestra di download

    // Le chiavi del deposito. Le ultime due sono le guardie dell'account: «dimentica» non le tocca.
    static final String K_EMAIL = "email", K_PASSWORD = "password", K_DEVICE = "device_id",
        K_APP_TOKEN = "app_token", K_LOGIN_TOKEN = "login_token", K_USER = "user_id",
        K_TOKEN_AT = "token_at", K_RIFIUTATO = "rifiutato",
        K_LOGIN_AT = "login_at", K_FERMO_FINO = "fermo_fino",
        // il tracciante (16/10, 0.8.0 sul telefono: token perso 2 minuti dopo il login): quando
        // Zepp ha detto «token non valido», su cosa, e quando c'è stato l'ultimo login riuscito
        K_401_AT = "rifiuto_401_at", K_401_COSA = "rifiuto_401_cosa", K_LOGIN_OK_AT = "login_ok_at";

    // Il login di Zepp, copiato dalla libreria huami_token 0.x (constants.py): Zepp crede
    // di parlare con la sua app 9.12.5. Chiave e vettore NON sono segreti: sono scritti
    // nell'app Zepp e nella libreria pubblica; servono solo a imbustare il primo passo.
    private static final byte[] AES_CHIAVE = "xeNtBVqzDc6tuNTh".getBytes(StandardCharsets.US_ASCII);
    private static final byte[] AES_VETTORE = "MAAAYAAAAAAAAABg".getBytes(StandardCharsets.US_ASCII);
    private static final String UA_APP = "Zepp/9.12.5 (Pixel 4; Android 12; Density/2.75)";

    private static final Pattern DATA = Pattern.compile("\\d{4}-\\d{2}-\\d{2}");
    private static final Pattern NUMERO = Pattern.compile("\\d{1,20}");

    private final Deposito dep;
    private final Tempo tempo;
    private final String urlTokens, urlLogin, urlDati;
    private final boolean prova;

    /** Quello vero: gli indirizzi sono quelli di Rete.java, non si scelgono da fuori. */
    public ZeppCloud(Deposito dep, Tempo tempo) {
        this(dep, tempo, "https://" + Rete.HOST_TOKENS, "https://" + Rete.HOST_LOGIN,
            "https://" + Rete.HOST_DATI, false);
    }

    /** Solo per la prova sul PC: il finto server su 127.0.0.1. Fuori dal pacchetto non si vede. */
    ZeppCloud(Deposito dep, Tempo tempo, String urlTokens, String urlLogin, String urlDati, boolean prova) {
        this.dep = dep;
        this.tempo = tempo;
        this.urlTokens = urlTokens;
        this.urlLogin = urlLogin;
        this.urlDati = urlDati;
        this.prova = prova;
    }

    // ------------------------------------------------------------- accesso

    /** Salva email e password (nella cassaforte). Non fa login: quello parte al primo download. */
    public synchronized void salvaAccesso(String email, String password) throws Errore {
        if (email == null || email.trim().isEmpty() || password == null || password.isEmpty())
            throw new Errore(DOMANDA, "The Zepp account email and password are needed.", 0);
        email = email.trim();
        if (!email.equals(dep.leggi(K_EMAIL))) togliToken();   // un altro account: via i token vecchi
        dep.scrivi(K_EMAIL, email);
        dep.scrivi(K_PASSWORD, password);
        dep.togli(K_RIFIUTATO);
    }

    /** Toglie accesso e token. Le guardie (ultimo login, fermo) restano: proteggono l'account. */
    public synchronized void dimentica() {
        dep.togli(K_EMAIL);
        dep.togli(K_PASSWORD);
        dep.togli(K_RIFIUTATO);
        dep.togli(K_DEVICE);
        togliToken();
    }

    /** Com'è messo il collegamento. Mai password né token qui dentro. */
    public synchronized Map<String, Object> stato() {
        long ora = tempo.ora();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("accesso", dep.leggi(K_EMAIL) != null && dep.leggi(K_PASSWORD) != null);
        m.put("email", dep.leggi(K_EMAIL));
        m.put("rifiutato", "1".equals(dep.leggi(K_RIFIUTATO)));
        m.put("tokenValido", tokenFresco(ora) != null);
        m.put("minutiFermo", minutiMancanti(numero(K_FERMO_FINO, 0) - ora));
        long ultimo = numero(K_LOGIN_AT, -1);
        m.put("minutiProssimoLogin", ultimo < 0 ? 0 : minutiMancanti(ultimo + PAUSA_LOGIN - ora));
        m.put("ultimoLogin", numero(K_LOGIN_OK_AT, 0));          // millisecondi, 0 = mai
        m.put("ultimoTokenRifiutato", numero(K_401_AT, 0));
        m.put("ultimoTokenRifiutatoSu", dep.leggi(K_401_COSA));
        return m;
    }

    // ------------------------------------------------------------- dati

    /**
     * Un pezzo del cloud, così come lo manda Zepp (testo JSON). Le richieste possibili
     * sono queste quattro e basta: la pagina non può chiedere un indirizzo a piacere.
     *
     *   riepilogo   da, a     sonno con le fasi, passi, calorie del giorno (band_data summary)
     *   minuti      da, a     battito e attività minuto per minuto (band_data detail)
     *   allenamenti [primaDi] la lista degli allenamenti, tutti i campi; primaDi = trackid
     *                         da cui continuare (si sfoglia all'indietro)
     *   profilo               nascita, altezza, peso…
     *
     * Finestre di date al massimo GIORNI_MAX giorni.
     */
    public synchronized String scarica(String cosa, String da, String a, String primaDi) throws Errore {
        Map<String, String> q = new LinkedHashMap<>();
        String strada;
        if ("riepilogo".equals(cosa) || "minuti".equals(cosa)) {
            controllaFinestra(da, a);
            strada = "/v1/data/band_data.json";
            q.put("query_type", "riepilogo".equals(cosa) ? "summary" : "detail");
            q.put("device_type", "0");
            q.put("from_date", da);
            q.put("to_date", a);
        } else if ("allenamenti".equals(cosa)) {
            strada = "/v1/sport/run/history.json";
            if (primaDi != null && !primaDi.isEmpty()) {
                if (!NUMERO.matcher(primaDi).matches())
                    throw new Errore(DOMANDA, "Invalid starting workout.", 0);
                q.put("trackid", primaDi);
            }
        } else if ("profilo".equals(cosa)) {
            strada = "/users/";
        } else {
            throw new Errore(DOMANDA, "Unknown request.", 0);
        }

        controllaFermo();
        boolean rifatto = false;
        while (true) {
            String token = token();
            String uid = dep.leggi(K_USER);
            String url = urlDati + ("/users/".equals(strada) ? "/users/" + codifica(uid) : strada)
                + "?" + modulo("userid", uid) + (q.isEmpty() ? "" : "&" + modulo(q));
            Map<String, String> h = new LinkedHashMap<>();
            h.put("apptoken", token);
            h.put("User-Agent", UA_APP);
            h.put("Accept-Language", "en-US");
            Risposta r = chiama("GET", url, h, null);
            if (r.codice == 200) return r.testo();
            if (r.codice == 429) throw fermati(r);
            if (r.codice == 401 && !rifatto) {   // token scaduto per Zepp: UN login nuovo, se l'ora lo permette
                // Misurato il 16/10/2026: Zepp tiene vivo UN token per account; ogni login nuovo
                // (l'app Zepp, il PC, un altro telefono) uccide quello di prima.
                dep.scrivi(K_401_AT, Long.toString(tempo.ora()));
                dep.scrivi(K_401_COSA, cosa);
                togliToken();
                rifatto = true;
                continue;
            }
            if (r.codice == 401) {
                togliToken();
                throw new Errore(RIFIUTATO, "Zepp refuses access even after a fresh login.", 0);
            }
            throw new Errore(RISPOSTA, "Zepp answered " + r.codice + ".", 0);
        }
    }

    // ------------------------------------------------------------- login

    private String token() throws Errore {
        String t = tokenFresco(tempo.ora());
        return t != null ? t : login();
    }

    private String tokenFresco(long ora) {
        String t = dep.leggi(K_APP_TOKEN);
        long at = numero(K_TOKEN_AT, -1);
        if (t == null || dep.leggi(K_USER) == null || at < 0) return null;
        long eta = ora - at;
        return eta >= 0 && eta < VITA_TOKEN ? t : null;
    }

    private String login() throws Errore {
        String email = dep.leggi(K_EMAIL), password = dep.leggi(K_PASSWORD);
        if (email == null || password == null)
            throw new Errore(NIENTE_ACCESSO, "No Zepp login yet: type email and password.", 0);
        if ("1".equals(dep.leggi(K_RIFIUTATO)))
            throw new Errore(RIFIUTATO, "Zepp did not accept the email and password: type them again.", 0);
        controllaFermo();

        long ora = tempo.ora();
        long ultimo = numero(K_LOGIN_AT, -1);
        if (ultimo >= 0) {
            long passato = ora - ultimo;
            if (passato < 0) {               // l'ora del telefono è tornata indietro: si riparte da adesso
                dep.scrivi(K_LOGIN_AT, Long.toString(ora));
                passato = 0;
            }
            if (passato < PAUSA_LOGIN) {
                long min = minutiMancanti(PAUSA_LOGIN - passato);
                long chiusoAt = numero(K_401_AT, 0);
                if (chiusoAt > 0 && chiusoAt >= numero(K_LOGIN_OK_AT, 0)) throw new Errore(ATTESA, "Zepp closed Health's access (it happens when the Zepp app "
                    + "or another device logs into the same account). To protect the account the next "
                    + "login happens in " + min + " minutes.", min);
                throw new Errore(ATTESA, "There was a Zepp login a short while ago: try again in " + min + " minutes.", min);
            }
        }
        dep.scrivi(K_LOGIN_AT, Long.toString(ora));   // contato PRIMA di partire, anche se va male

        // 1. email e password, cifrate → Zepp risponde 303 con il codice d'accesso nell'indirizzo
        String p1 = modulo(
            "emailOrPhone", email,
            "state", "REDIRECTION",
            "client_id", "HuaMi",
            "password", password,
            "redirect_uri", "https://s3-us-west-2.amazonaws.com/hm-registration/successsignin.html",
            "region", "us-west-2",
            "token", "access",
            "token", "refresh",
            "country_code", "US");
        Map<String, String> h1 = new LinkedHashMap<>();
        h1.put("app_name", "com.huami.midong");
        h1.put("appname", "com.huami.midong");
        h1.put("cv", "151689_9.12.5");
        h1.put("v", "2.0");
        h1.put("appplatform", "android_phone");
        h1.put("vb", "202509151347");
        h1.put("vn", "9.12.5");
        h1.put("User-Agent", UA_APP);
        h1.put("x-hm-ekv", "1");
        h1.put("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
        Risposta r1 = chiama("POST", urlTokens + "/v2/registrations/tokens", h1, cifra(p1));
        if (r1.codice == 429) throw fermati(r1);
        String accesso = r1.codice == 303 ? parametro(r1.dove, "access") : null;
        if (accesso == null) {
            if (r1.codice == 303 || (r1.codice >= 400 && r1.codice < 500)) {
                dep.scrivi(K_RIFIUTATO, "1");
                throw new Errore(RIFIUTATO, "Zepp did not accept the email and password: type them again.", 0);
            }
            throw new Errore(RISPOSTA, "The Zepp login answered " + r1.codice + ".", 0);
        }

        // 2. il codice → i token dell'app. Sempre lo stesso «telefono» per Zepp, non uno nuovo a ogni login.
        String device = dep.leggi(K_DEVICE);
        if (device == null) {
            device = UUID.randomUUID().toString();
            dep.scrivi(K_DEVICE, device);
        }
        String p2 = modulo(
            "code", accesso,
            "device_id", device,
            "device_model", "android_phone",
            "app_version", "9.12.5",
            "dn", "api-mifit.zepp.com,api-user.zepp.com,api-mifit.zepp.com,api-watch.zepp.com,"
                + "app-analytics.zepp.com,auth.zepp.com,api-analytics.zepp.com",
            "third_name", "huami",
            "source", "com.huami.watch.hmwatchmanager:9.12.5:151689",
            "app_name", "com.huami.midong",
            "country_code", "US",
            "grant_type", "access_token",
            "allow_registration", "false",
            "lang", "en",
            "countryState", "US-NY");
        Map<String, String> h2 = new LinkedHashMap<>();
        h2.put("app_name", "com.huami.webapp");
        h2.put("appname", "com.huami.webapp");
        h2.put("origin", "https://user.zepp.com");
        h2.put("referer", "https://user.zepp.com/");
        h2.put("User-Agent", "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0");
        h2.put("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
        h2.put("Accept", "application/json, text/plain, */*");
        h2.put("Accept-Language", "en-US,en;q=0.5");
        Risposta r2 = chiama("POST", urlLogin + "/v2/client/login", h2,
            p2.getBytes(StandardCharsets.UTF_8));
        if (r2.codice == 429) throw fermati(r2);
        if (r2.codice != 200) throw new Errore(RISPOSTA, "The Zepp login answered " + r2.codice + ".", 0);
        String app, ltok, uid;
        try {
            Object j = MiniJson.leggi(r2.testo());
            app = MiniJson.campo(j, "token_info", "app_token");
            ltok = MiniJson.campo(j, "token_info", "login_token");
            uid = MiniJson.campo(j, "token_info", "user_id");
        } catch (IllegalArgumentException e) {
            throw new Errore(RISPOSTA, "The Zepp login answered in a way I do not understand.", 0);
        }
        if (app == null || ltok == null || uid == null || !NUMERO.matcher(uid).matches())
            throw new Errore(RISPOSTA, "The Zepp login gave no tokens.", 0);
        dep.scrivi(K_APP_TOKEN, app);
        dep.scrivi(K_LOGIN_TOKEN, ltok);
        dep.scrivi(K_USER, uid);
        dep.scrivi(K_TOKEN_AT, Long.toString(tempo.ora()));
        dep.scrivi(K_LOGIN_OK_AT, Long.toString(tempo.ora()));
        return app;
    }

    // ------------------------------------------------------------- guardie

    private void controllaFermo() throws Errore {
        long resta = numero(K_FERMO_FINO, 0) - tempo.ora();
        if (resta > PAUSA_429 * 24) {              // un fermo nel futuro lontano: ora del telefono spostata
            dep.scrivi(K_FERMO_FINO, Long.toString(tempo.ora() + PAUSA_429));
            resta = PAUSA_429;
        }
        if (resta > 0) {
            long min = minutiMancanti(resta);
            throw new Errore(FERMO, "Zepp asked to slow down: try again in " + min + " minutes.", min);
        }
    }

    private Errore fermati(Risposta r) {
        long pausa = PAUSA_429;
        String ra = r.riprova;
        if (ra != null && NUMERO.matcher(ra.trim()).matches()) {
            long s = Long.parseLong(ra.trim()) * 1000;
            if (s > pausa && s <= 24 * ORA) pausa = s;   // si accetta di aspettare di più, mai di meno
        }
        dep.scrivi(K_FERMO_FINO, Long.toString(tempo.ora() + pausa));
        long min = minutiMancanti(pausa);
        return new Errore(FERMO, "Zepp asked to slow down: try again in " + min + " minutes.", min);
    }

    private void controllaFinestra(String da, String a) throws Errore {
        if (da == null || a == null || !DATA.matcher(da).matches() || !DATA.matcher(a).matches())
            throw new Errore(DOMANDA, "Invalid dates (YYYY-MM-DD needed).", 0);
        long g1 = giorno(da), g2 = giorno(a);
        if (g1 == Long.MIN_VALUE || g2 == Long.MIN_VALUE) throw new Errore(DOMANDA, "Invalid dates.", 0);
        if (g2 < g1 || g2 - g1 + 1 > GIORNI_MAX)
            throw new Errore(DOMANDA, "Invalid date window (at most " + GIORNI_MAX + " days).", 0);
    }

    /**
     * AAAA-MM-GG → giorni dal 1970 (Long.MIN_VALUE se la data non esiste). A mano perché
     * java.time c'è solo da Android 8 e Health parte da Android 7 (minSdk 24).
     */
    static long giorno(String iso) {
        int y = Integer.parseInt(iso.substring(0, 4)), m = Integer.parseInt(iso.substring(5, 7)),
            d = Integer.parseInt(iso.substring(8, 10));
        if (y < 2000 || m < 1 || m > 12 || d < 1) return Long.MIN_VALUE;
        int[] mesi = { 31, (y % 4 == 0 && (y % 100 != 0 || y % 400 == 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 };
        if (d > mesi[m - 1]) return Long.MIN_VALUE;
        long yy = m <= 2 ? y - 1 : y;                       // giorni dal calendario civile (H. Hinnant)
        long era = yy / 400, yoe = yy - era * 400;
        long doy = (153L * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
        long doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        return era * 146097 + doe - 719468;
    }

    private void togliToken() {
        dep.togli(K_APP_TOKEN);
        dep.togli(K_LOGIN_TOKEN);
        dep.togli(K_USER);
        dep.togli(K_TOKEN_AT);
    }

    private long numero(String k, long altrimenti) {
        String v = dep.leggi(k);
        if (v == null) return altrimenti;
        try { return Long.parseLong(v); } catch (NumberFormatException e) { return altrimenti; }
    }

    private static long minutiMancanti(long ms) {
        return ms <= 0 ? 0 : (ms + MINUTO - 1) / MINUTO;
    }

    // ------------------------------------------------------------- rete

    static final class Risposta {
        final int codice;
        final byte[] corpo;
        final String dove;      // Location
        final String riprova;   // Retry-After

        Risposta(int codice, byte[] corpo, String dove, String riprova) {
            this.codice = codice;
            this.corpo = corpo;
            this.dove = dove;
            this.riprova = riprova;
        }

        String testo() { return new String(corpo, StandardCharsets.UTF_8); }
    }

    /** Il muro della rete: solo gli indirizzi di Rete.java (nella prova: solo 127.0.0.1). */
    void controllaIndirizzo(String url) throws Errore {
        if (Rete.cloudPuo(url)) return;
        if (prova && url.startsWith("http://127.0.0.1:")) return;
        throw new Errore(DOMANDA, "Address not allowed.", 0);
    }

    private Risposta chiama(String metodo, String url, Map<String, String> testate, byte[] corpo) throws Errore {
        controllaIndirizzo(url);
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setInstanceFollowRedirects(false);   // un redirect non si segue MAI: è lì che sta il codice d'accesso
            c.setUseCaches(false);
            c.setConnectTimeout(20_000);
            c.setReadTimeout(60_000);
            c.setRequestMethod(metodo);
            for (Map.Entry<String, String> e : testate.entrySet()) c.setRequestProperty(e.getKey(), e.getValue());
            if (corpo != null) {
                c.setDoOutput(true);
                c.setFixedLengthStreamingMode(corpo.length);
                try (OutputStream o = c.getOutputStream()) { o.write(corpo); }
            }
            int codice = c.getResponseCode();
            InputStream in = codice >= 400 ? c.getErrorStream() : c.getInputStream();
            byte[] dati = in == null ? new byte[0] : leggiTutto(in);
            return new Risposta(codice, dati, c.getHeaderField("Location"), c.getHeaderField("Retry-After"));
        } catch (Errore e) {
            throw e;
        } catch (IOException e) {
            throw new Errore(RETE, "Zepp is not answering (are you online?).", 0);
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static byte[] leggiTutto(InputStream in) throws IOException, Errore {
        try (InputStream i = in) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = i.read(buf)) > 0) {
                if (b.size() + n > TETTO_RISPOSTA) throw new Errore(RISPOSTA, "Zepp's answer is too large.", 0);
                b.write(buf, 0, n);
            }
            return b.toByteArray();
        }
    }

    // ------------------------------------------------------------- piccoli attrezzi

    static byte[] cifra(String testo) throws Errore {
        try {
            Cipher c = Cipher.getInstance("AES/CBC/PKCS5Padding");
            c.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(AES_CHIAVE, "AES"), new IvParameterSpec(AES_VETTORE));
            return c.doFinal(testo.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new Errore(RISPOSTA, "Login encryption failed.", 0);
        }
    }

    /** chiave=valore&… da coppie in fila (una chiave può ripetersi: «token» nel login). */
    static String modulo(String... coppie) {
        StringBuilder b = new StringBuilder();
        for (int k = 0; k + 1 < coppie.length; k += 2) {
            if (b.length() > 0) b.append('&');
            b.append(codifica(coppie[k])).append('=').append(codifica(coppie[k + 1]));
        }
        return b.toString();
    }

    static String modulo(Map<String, String> m) {
        String[] c = new String[m.size() * 2];
        int k = 0;
        for (Map.Entry<String, String> e : m.entrySet()) { c[k++] = e.getKey(); c[k++] = e.getValue(); }
        return modulo(c);
    }

    private static String codifica(String s) {
        try {
            return URLEncoder.encode(s == null ? "" : s, "UTF-8");
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** Il valore di un parametro dentro un indirizzo (il codice d'accesso nel redirect del login). */
    static String parametro(String url, String nome) {
        if (url == null) return null;
        int q = url.indexOf('?');
        if (q < 0) return null;
        String resto = url.substring(q + 1);
        int h = resto.indexOf('#');
        if (h >= 0) resto = resto.substring(0, h);
        for (String coppia : resto.split("&")) {
            int u = coppia.indexOf('=');
            String k = u < 0 ? coppia : coppia.substring(0, u);
            if (!k.equals(nome)) continue;
            try {
                String v = URLDecoder.decode(u < 0 ? "" : coppia.substring(u + 1), "UTF-8");
                return v.isEmpty() ? null : v;
            } catch (Exception e) {
                return null;
            }
        }
        return null;
    }
}
