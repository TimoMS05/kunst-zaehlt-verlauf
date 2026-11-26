# Kunst zählt

Studienprojekt „Geotools für SKULPTUR PROJEKTE 2027“ (Institut für Geoinformatik, Universität Münster).

An jeder Skulptur hängt ein QR-Code. Er führt auf eine Infoseite und zählt den Besuch.
Mit Zustimmung der Besucher setzt die Seite ein Cookie mit einer zufälligen Kennung. So lässt sich
auswerten, **in welcher Reihenfolge** Besucher die Skulpturen ansehen und **wann** sie kommen.

## Aufbau

| Teil | Wo | Aufgabe |
| --- | --- | --- |
| Website | GitHub Pages | Infoseiten, Einwilligung, Auswertung |
| Datenbank | Google Tabelle + Apps Script | speichert Stationen und Besuche (kostenlos, läuft nicht ab) |
| Anzeige | senseBox Eye (ESP32) | zeigt die Gesamtzahl der Scans |

| Datei | Inhalt |
| --- | --- |
| `station.html` | Infoseite einer Skulptur, Aufruf über QR-Code: `station.html?s=3&qr=1` |
| `index.html` | Liste aller Stationen |
| `datenschutz.html` | Datenschutzhinweise (Entwurf) und Widerruf |
| `admin.html` | Auswertung mit Passwort: Übersicht, Zeitverlauf, Routen, einzelne Rundgänge, Stationen, QR-Codes |
| `druck.html` | druckbares A4-Schild mit QR-Code |
| `config.js` | Adresse der Google-Web-App und Einstellungen |
| `google/Code.gs` | Apps Script: Schnittstelle zwischen Website und Google Tabelle |
| `esp32/kunstzaehlt_anzeige/` | Arduino-Sketch für das Display |

Ausprobieren ohne Datenbank: `admin.html?demo=1` zeigt die Auswertung mit erfundenen Daten.

## Einrichtung

1. **Google Tabelle anlegen:** auf [sheets.google.com](https://sheets.google.com) eine leere Tabelle,
   Name z. B. „Kunst zählt – Daten“.
2. **Script einfügen:** in der Tabelle *Erweiterungen → Apps Script*. Den Inhalt von
   `google/Code.gs` komplett hineinkopieren (vorhandenen Text ersetzen).
3. **Passwort setzen:** oben in `Code.gs` bei `ADMIN_PASSWORT` ein eigenes Passwort
   (mind. 8 Zeichen) eintragen. Speichern (Disketten-Symbol).
4. **Einrichten:** oben in der Leiste die Funktion `einrichten` auswählen → *Ausführen*.
   Google fragt nach Berechtigungen → eigenes Konto wählen → *Erweitert* → *Zu … wechseln* → *Zulassen*.
   Danach hat die Tabelle die Blätter „Stationen“ und „Besuche“.
5. **Veröffentlichen:** *Bereitstellen → Neue Bereitstellung* → Zahnrad → *Web-App*.
   „Ausführen als: **Ich**“, „Zugriff: **Jeder**“ → *Bereitstellen*. Die **Web-App-URL** (endet auf
   `/exec`) kopieren.
6. **URL eintragen:** in `config.js` bei `apiUrl`.
7. In `admin.html` mit dem Passwort anmelden, Stationen anlegen, unter „QR-Codes“ die Schilder drucken.

**Wichtig:** Nach jeder Änderung an `Code.gs` (z. B. neues Passwort) unter *Bereitstellen →
Bereitstellungen verwalten → Bearbeiten (Stift) → Version: Neue Version* neu bereitstellen.
Die URL bleibt dabei gleich.

### ESP32-Anzeige

1. In `esp32/kunstzaehlt_anzeige/` die Datei `zugangsdaten.beispiel.h` kopieren, als `zugangsdaten.h`
   speichern, WLAN und Web-App-URL eintragen. Diese Datei wird nicht hochgeladen (`.gitignore`).
2. Arduino IDE: Board „senseBox MCU Eye“, Bibliotheken *Adafruit SSD1306* und *Adafruit GFX*, hochladen.

## Datenschutz

- Ohne Zustimmung wird nur der Aufruf gezählt (Station, Zeit, Sprachkürzel), **ohne** Kennung.
- Mit Zustimmung kommt eine zufällige Kennung aus dem Cookie `kz_id` dazu (30 Tage gültig).
- In der Tabelle stehen keine IP-Adressen. Ohne Admin-Passwort kann niemand Besuche lesen.
- Die Tabelle selbst nicht freigeben: Nur das eigene Google-Konto sollte Zugriff haben.
- Vor dem echten Betrieb: Datenschutzhinweise und Einwilligungstext mit dem Datenschutzbeauftragten
  der Universität abstimmen, Platzhalter in `datenschutz.html` ausfüllen.
- Nach der Studie die Spalte `besucher_id` im Blatt „Besuche“ leeren.
