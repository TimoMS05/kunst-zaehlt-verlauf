# Kunst zählt

Studienprojekt „Geotools für SKULPTUR PROJEKTE 2027“ (Institut für Geoinformatik, Universität Münster).

An jeder Skulptur hängt ein QR-Code. Er führt auf eine Infoseite und zählt den Besuch.
Mit Zustimmung der Besucher setzt die Seite ein Cookie mit einer zufälligen Kennung. So lässt sich
auswerten, **in welcher Reihenfolge** Besucher die Skulpturen ansehen und **wann** sie kommen.

## Aufbau

| Teil | Wo | Aufgabe |
| --- | --- | --- |
| Website | GitHub Pages | Infoseiten, Einwilligung, Auswertung |
| Schnittstelle + Datenbank | IONOS-Webhosting (PHP + MySQL, Server in Deutschland) | speichert Stationen und Besuche |
| Anzeige | senseBox Eye (ESP32) | zeigt die Gesamtzahl der Scans |

| Datei | Inhalt |
| --- | --- |
| `station.html` | Infoseite einer Skulptur, Aufruf über QR-Code: `station.html?s=3&qr=1` |
| `index.html` | Liste aller Stationen |
| `datenschutz.html` | Datenschutzhinweise (Entwurf) und Widerruf |
| `admin.html` | Auswertung mit Passwort: Übersicht, Zeitverlauf, Routen, einzelne Rundgänge, Stationen, QR-Codes |
| `druck.html` | druckbares A4-Schild mit QR-Code |
| `config.js` | Adresse von `api.php` und Einstellungen |
| `server/api.php` | Schnittstelle zwischen Website und MySQL-Datenbank (kommt auf IONOS) |
| `server/konfiguration.beispiel.php` | Vorlage für Datenbank-Zugang und Admin-Passwort |
| `server/.htaccess` | sperrt alles außer `api.php` |
| `esp32/kunstzaehlt_anzeige/` | Arduino-Sketch für das Display |

Ausprobieren ohne Datenbank: `admin.html?demo=1` zeigt die Auswertung mit erfundenen Daten.

## Einrichtung bei IONOS

1. **Datenbank anlegen:** IONOS-Kundenbereich → *Hosting* → *Datenbanken* → *Datenbank anlegen*
   → **MySQL** (Version 8). Ein Datenbank-Passwort vergeben. Danach unter *Details* notieren:
   Hostname, Datenbankname, Benutzername.
2. **Konfiguration ausfüllen:** `server/konfiguration.beispiel.php` kopieren, als
   `konfiguration.php` speichern und eintragen:
   - die vier Datenbank-Angaben aus Schritt 1,
   - ein eigenes `admin_passwort` (mind. 8 Zeichen),
   - bei `erlaubte_herkunft` die Adresse der Website (bei GitHub Pages `https://timoms05.github.io`).
3. **Hochladen:** Im IONOS-*Webspace* (Webspace-Explorer oder SFTP) einen Ordner anlegen, z. B.
   `kunst-zaehlt`, und hineinladen: `api.php`, `konfiguration.php`, `.htaccess`.
4. **PHP-Version:** *Hosting* → *PHP-Einstellungen*: mindestens **PHP 8.1**.
5. **Testen:** Im Browser `https://eure-domain.de/kunst-zaehlt/api.php?aktion=anzahl` öffnen.
   Erwartet wird eine Meldung „Tabellen fehlen noch“ oder eine Zahl. Ein Aufruf von
   `…/kunst-zaehlt/konfiguration.php` muss **verboten** (403) sein.
6. **Website verbinden:** In `config.js` bei `apiUrl` die Adresse von `api.php` eintragen.
7. **Erster Login:** `admin.html` öffnen, mit dem Admin-Passwort anmelden. Dabei legt `api.php`
   die Tabellen `kz_stationen` und `kz_besuche` automatisch an (mit einer „Testskulptur“).
8. Stationen anlegen und unter „QR-Codes“ die Schilder drucken.

Die Domain muss per **https** erreichbar sein. Bei IONOS ist ein SSL-Zertifikat normalerweise
enthalten; es muss unter *Domains & SSL* aktiv sein.

Die Website kann statt auf GitHub Pages auch komplett auf IONOS liegen: dann alle Dateien in
denselben Ordner laden und bei `erlaubte_herkunft` die eigene Domain eintragen.

### ESP32-Anzeige

1. In `esp32/kunstzaehlt_anzeige/` die Datei `zugangsdaten.beispiel.h` kopieren, als `zugangsdaten.h`
   speichern, WLAN und die Adresse von `api.php` eintragen. Diese Datei wird nicht hochgeladen (`.gitignore`).
2. Arduino IDE: Board „senseBox MCU Eye“, Bibliotheken *Adafruit SSD1306* und *Adafruit GFX*, hochladen.

## Datenschutz

- Ohne Zustimmung wird nur der Aufruf gezählt (Station, Zeit, Sprachkürzel), **ohne** Kennung.
- Mit Zustimmung kommt eine zufällige Kennung aus dem Cookie `kz_id` dazu (30 Tage gültig).
- In der Datenbank stehen keine IP-Adressen. Ohne Admin-Passwort kann niemand Besuche lesen.
- Daten liegen bei IONOS in Deutschland. Den Auftragsverarbeitungsvertrag (AVV) im IONOS-Kundenbereich prüfen.
- Vor dem echten Betrieb: Datenschutzhinweise und Einwilligungstext mit dem Datenschutzbeauftragten
  der Universität abstimmen, Platzhalter in `datenschutz.html` ausfüllen.
- Nach der Studie die Kennungen entfernen (z. B. in phpMyAdmin bei IONOS):
  `UPDATE kz_besuche SET besucher_id = NULL;`
