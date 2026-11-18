# 151 Health

An Android app for your own health diary: a calendar of your days, your gym plan and workouts, sleep, weight and substances, all on the phone. No account, no cloud, no ads, no tracking.

Part of The 151 Universe family of apps.

## What it does
- **Days** – a calendar where every day shows four small tiles: sleep, sport, weight, substances. "On this day" looks back at the same date in past years.
- **Sport** – the gym (load your plan from a saved `.mht` page, tick sets with a stopwatch, records) and every workout from the watch, merged by day and time. **My workouts** builds your own sessions from a catalogue of 873 exercises with photos.
- **Sleep** – nights from the watch, with score and phases.
- **Substances** – tick what you took that day from a large catalogue you choose from in Settings; a quiet evening reminder at the time you pick.
- **Weight** – read from a screenshot of your scale app on the phone (offline OCR); you confirm the numbers before saving.
- **Watch** – optional: downloads your data from a Zepp (Amazfit) account. It is the only part that uses the internet, only towards Zepp's addresses, over https.
- **Your data** – export everything to one `.json` file you keep, and import it back.

## Build
Requirements: Node 20+, JDK 17 and JDK 21 (Capacitor 8 plugins use 17, the Android build 21), the Android SDK.

```
npm install --include=dev
npx cap sync android
cd android && ./gradlew assembleDebug    # app/build/outputs/apk/debug/app-debug.apk
```

If Gradle does not find both JDKs, list them in `~/.gradle/gradle.properties`: `org.gradle.java.installations.paths=/path/jdk-17,/path/jdk-21`.

Signing is optional: put `keystore.properties` (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`) and your keystore in `.signing/` (ignored by git). Without it, debug uses the Android debug key and release is unsigned.

## Tests
`npm test` runs the whole app in a real Chromium (Playwright: `npx playwright install chromium-headless-shell` once, or point `CHROME_PATH` to a Chromium; the Java section needs `javac` in the PATH or `JAVA_HOME`), with made-up data built on the spot (`tests/make-fixtures.mjs`), and fails on any error in the console. One section compiles and runs `tests/java/ZeppProva.java` with the JDK: the Zepp connection against a fake server, no network.

Code comments are in Italian.

## License
The app code is released under the MIT License (see `LICENSE`).

Bundled third-party code and data keep their own license, each next to it:
- `www/ocr/` – Tesseract.js and tesseract.js-core (Apache 2.0), English trained data.
- `www/esercizi/` – exercises and photos from free-exercise-db (Unlicense, public domain).
- `www/fonts/` – Barlow and Barlow Condensed (SIL Open Font License).
- `tests/vendor/` – acorn (MIT).
- Capacitor and its plugins are fetched by npm under their own licenses.

A personal project, shared as is: no support, but issues are welcome. Not a medical device.
