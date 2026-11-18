package com.the151universe.health.zepp;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Dove vivono email, password e token di Zepp sul telefono (decisione di progetto:
 * password salvata chiusa a chiave, non riscritta ogni volta).
 *
 * Ogni valore è cifrato (AES-GCM) con una chiave che sta nella cassaforte di Android
 * (Android Keystore): la chiave non esce mai dal telefono e non si può copiare. I valori
 * cifrati stanno in un file privato dell'app, che Android non copia da nessuna parte
 * (allowBackup=false + data_extraction_rules, 0.7.2).
 *
 * Se la chiave sparisce o un valore non si apre più, il valore vale «assente»: Health
 * chiederà di nuovo l'accesso, non si blocca.
 */
public final class Cassaforte implements ZeppCloud.Deposito {

    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String ALIAS = "health-zepp";
    private static final String FILE = "zepp-cassaforte";

    private final SharedPreferences prefs;

    public Cassaforte(Context ctx) {
        prefs = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    @Override
    public synchronized String leggi(String chiave) {
        String v = prefs.getString(chiave, null);
        if (v == null) return null;
        try {
            int p = v.indexOf(':');
            byte[] iv = Base64.decode(v.substring(0, p), Base64.NO_WRAP);
            byte[] ct = Base64.decode(v.substring(p + 1), Base64.NO_WRAP);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, chiave(), new GCMParameterSpec(128, iv));
            c.updateAAD(chiave.getBytes(StandardCharsets.UTF_8));   // un valore non si sposta sotto un altro nome
            return new String(c.doFinal(ct), StandardCharsets.UTF_8);
        } catch (Exception e) {
            prefs.edit().remove(chiave).commit();
            return null;
        }
    }

    @Override
    public synchronized void scrivi(String chiave, String valore) {
        try {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, chiave());
            c.updateAAD(chiave.getBytes(StandardCharsets.UTF_8));
            byte[] ct = c.doFinal(valore.getBytes(StandardCharsets.UTF_8));
            String v = Base64.encodeToString(c.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP);
            if (!prefs.edit().putString(chiave, v).commit()) throw new IllegalStateException("write failed");
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("keystore not available", e);
        }
    }

    @Override
    public synchronized void togli(String chiave) {
        prefs.edit().remove(chiave).commit();
    }

    private static SecretKey chiave() throws Exception {
        KeyStore ks = KeyStore.getInstance(KEYSTORE);
        ks.load(null);
        KeyStore.Entry e = ks.getEntry(ALIAS, null);
        if (e instanceof KeyStore.SecretKeyEntry) return ((KeyStore.SecretKeyEntry) e).getSecretKey();
        KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        g.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build());
        return g.generateKey();
    }
}
