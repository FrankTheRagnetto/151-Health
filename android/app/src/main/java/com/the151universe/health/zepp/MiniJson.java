package com.the151universe.health.zepp;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Un lettore JSON piccolo e severo, solo per le poche risposte che il nucleo deve
 * capire da sé (il login). I dati veri non passano di qui: arrivano alla pagina
 * così come li manda il cloud.
 *
 * Perché non org.json: su Android c'è, ma sul PC (dove gira la prova col finto
 * server) no, e il nucleo deve essere lo stesso codice in tutti e due i posti.
 *
 * Oggetti → Map, liste → List, numeri → Double, poi String, Boolean, null.
 * Testo non valido → IllegalArgumentException.
 */
final class MiniJson {

    private final String s;
    private int i;

    private MiniJson(String s) { this.s = s; }

    static Object leggi(String testo) {
        if (testo == null) throw new IllegalArgumentException("vuoto");
        MiniJson p = new MiniJson(testo);
        p.spazi();
        Object v = p.valore(0);
        p.spazi();
        if (p.i != p.s.length()) throw p.errore("data after the end");
        return v;
    }

    /** Il testo di un campo dentro oggetti annidati: campo(radice, "token_info", "app_token"). */
    static String campo(Object radice, String... strada) {
        Object v = radice;
        for (String k : strada) {
            if (!(v instanceof Map)) return null;
            v = ((Map<?, ?>) v).get(k);
        }
        if (v == null) return null;
        if (v instanceof Double) {
            double d = (Double) v;
            if (d == Math.rint(d) && Math.abs(d) < 1e15) return Long.toString((long) d);
        }
        return v.toString();
    }

    private Object valore(int fondo) {
        if (fondo > 64) throw errore("nested too deep");
        if (i >= s.length()) throw errore("ended too early");
        char c = s.charAt(i);
        switch (c) {
            case '{': return oggetto(fondo);
            case '[': return lista(fondo);
            case '"': return testo();
            case 't': parola("true"); return Boolean.TRUE;
            case 'f': parola("false"); return Boolean.FALSE;
            case 'n': parola("null"); return null;
            default:
                if (c == '-' || (c >= '0' && c <= '9')) return numero();
                throw errore("unexpected character");
        }
    }

    private Map<String, Object> oggetto(int fondo) {
        Map<String, Object> m = new LinkedHashMap<>();
        i++;
        spazi();
        if (prende('}')) return m;
        while (true) {
            spazi();
            if (i >= s.length() || s.charAt(i) != '"') throw errore("key expected");
            String k = testo();
            spazi();
            if (!prende(':')) throw errore("':' atteso");
            spazi();
            m.put(k, valore(fondo + 1));
            spazi();
            if (prende('}')) return m;
            if (!prende(',')) throw errore("',' o '}' atteso");
        }
    }

    private List<Object> lista(int fondo) {
        List<Object> l = new ArrayList<>();
        i++;
        spazi();
        if (prende(']')) return l;
        while (true) {
            spazi();
            l.add(valore(fondo + 1));
            spazi();
            if (prende(']')) return l;
            if (!prende(',')) throw errore("',' o ']' atteso");
        }
    }

    private String testo() {
        StringBuilder b = new StringBuilder();
        i++;
        while (true) {
            if (i >= s.length()) throw errore("unterminated string");
            char c = s.charAt(i++);
            if (c == '"') return b.toString();
            if (c < 0x20) throw errore("control character in string");
            if (c != '\\') { b.append(c); continue; }
            if (i >= s.length()) throw errore("truncated escape");
            char e = s.charAt(i++);
            switch (e) {
                case '"': b.append('"'); break;
                case '\\': b.append('\\'); break;
                case '/': b.append('/'); break;
                case 'b': b.append('\b'); break;
                case 'f': b.append('\f'); break;
                case 'n': b.append('\n'); break;
                case 'r': b.append('\r'); break;
                case 't': b.append('\t'); break;
                case 'u':
                    if (i + 4 > s.length()) throw errore("\\u a metà");
                    try {
                        b.append((char) Integer.parseInt(s.substring(i, i + 4), 16));
                    } catch (NumberFormatException x) {
                        throw errore("invalid \\u");
                    }
                    i += 4;
                    break;
                default: throw errore("unknown escape");
            }
        }
    }

    private Double numero() {
        int a = i;
        if (s.charAt(i) == '-') i++;
        while (i < s.length() && "0123456789+-.eE".indexOf(s.charAt(i)) >= 0) i++;
        try {
            return Double.valueOf(s.substring(a, i));
        } catch (NumberFormatException x) {
            throw errore("invalid number");
        }
    }

    private void parola(String w) {
        if (!s.startsWith(w, i)) throw errore("unknown word");
        i += w.length();
    }

    private boolean prende(char c) {
        if (i < s.length() && s.charAt(i) == c) { i++; return true; }
        return false;
    }

    private void spazi() {
        while (i < s.length() && " \t\r\n".indexOf(s.charAt(i)) >= 0) i++;
    }

    private IllegalArgumentException errore(String m) {
        return new IllegalArgumentException("JSON: " + m + " (position " + i + ")");
    }
}
