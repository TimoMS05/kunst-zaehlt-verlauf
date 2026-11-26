# Kunst zählt

Studienprojekt „Geotools für SKULPTUR PROJEKTE 2027“ (Institut für Geoinformatik, Universität Münster).

An jeder Skulptur hängt ein QR-Code. Er führt auf eine Infoseite und zählt den Besuch.
Mit Zustimmung der Besucher setzt die Seite ein Cookie mit einer zufälligen Kennung. So lässt sich
auswerten, **in welcher Reihenfolge** Besucher die Skulpturen ansehen und **wann** sie kommen.

## Aufbau

| Teil | Wo | Aufgabe |
| --- | --- | --- |
| Website | GitHub Pages | Infoseiten, Einwilligung, Auswertung |
| Datenbank | Supabase (Frankfurt) | speichert Stationen und Besuche |
| Anzeige | senseBox Eye (ESP32) | zeigt die Gesamtzahl der Scans |

| Datei | Inhalt |
| --- | --- |
| `station.html` | Infoseite einer Skulptur, Aufruf über QR-Code: `station.html?s=3&qr=1` |
| `index.html` | Liste aller Stationen |
| `datenschutz.html` | Datenschutzhinweise (Entwurf) und Widerruf |
| `admin.html` | Auswertung mit Anmeldung: Übersicht, Zeitverlauf, Routen, einzelne Rundgänge, Stationen, QR-Codes |
| `druck.html` | druckbares A4-Schild mit QR-Code |
| `config.js` | Supabase-Adresse und Einstellungen |
| `supabase/schema.sql` | Tabellen und Zugriffsregeln |
| `esp32/kunstzaehlt_anzeige/` | Arduino-Sketch für das Display |

Ausprobieren ohne Datenbank: `admin.html?demo=1` zeigt die Auswertung mit erfundenen Daten.

## Einrichtung

1. **Supabase-Projekt anlegen** auf [supabase.com](https://supabase.com), Region *Central EU (Frankfurt)*.
2. **Schema einspielen:** Im Supabase-Menü *SQL Editor* den Inhalt von `supabase/schema.sql` ausführen.
3. **Admin-Zugang:**
   - *Authentication → Users → Add user*: E-Mail und Passwort anlegen.
   - Im SQL Editor: `insert into public.admins (email) values ('deine@adresse.de');`
   - *Authentication → Sign In / Providers*: „Allow new users to sign up“ **ausschalten**.
4. **`config.js` ausfüllen:** *Project Settings → API* → „Project URL“ und „anon public“ Key eintragen.
5. **GitHub Pages:** *Settings → Pages → Branch `main`, Ordner `/ (root)`*.
6. In `admin.html` anmelden, Stationen anlegen, unter „QR-Codes“ die Schilder drucken.

### ESP32-Anzeige

1. In `esp32/kunstzaehlt_anzeige/` die Datei `zugangsdaten.beispiel.h` kopieren, als `zugangsdaten.h`
   speichern und WLAN sowie Supabase eintragen. Diese Datei wird nicht hochgeladen (`.gitignore`).
2. Arduino IDE: Board „senseBox MCU Eye“, Bibliotheken *Adafruit SSD1306* und *Adafruit GFX*, hochladen.

## Datenschutz

- Ohne Zustimmung wird nur der Aufruf gezählt (Station, Zeit, Sprachkürzel), **ohne** Kennung.
- Mit Zustimmung kommt eine zufällige Kennung aus dem Cookie `kz_id` dazu (30 Tage gültig).
- Die Datenbank speichert keine IP-Adressen. Besucher können Besuche nur eintragen, nicht lesen.
- Lesen dürfen nur angemeldete Admins aus der Tabelle `admins`.
- Vor dem echten Betrieb: Datenschutzhinweise und Einwilligungstext mit dem Datenschutzbeauftragten
  der Universität abstimmen, Platzhalter in `datenschutz.html` ausfüllen.
- Nach der Studie die Kennungen entfernen: `update public.besuche set besucher_id = null;`
