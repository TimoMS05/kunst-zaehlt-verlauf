// =====================================================================
// Kunst zählt – Anzeige der Besucherzahl auf dem senseBox Eye (ESP32-S3)
// ---------------------------------------------------------------------
// Was macht dieser Sketch?
//  - Verbindet sich mit einem WLAN mit Internet (z. B. Handy-Hotspot).
//  - Fragt alle 10 Sekunden bei Supabase die Gesamtzahl der Scans ab
//    (Funktion "anzahl_scans" aus supabase/schema.sql).
//  - Zeigt die Zahl groß auf dem OLED-Display. Steigt sie, blinkt die LED grün.
//  - Unten im Display steht der Zustand: "online", "kein WLAN", "Serverfehler".
//
// Der ESP32 bekommt nur die Gesamtzahl. Einzelne Besuche oder
// Besucher-Kennungen sieht er nie.
//
// Vorbereitung:
//  1. Datei "zugangsdaten.beispiel.h" kopieren und als "zugangsdaten.h"
//     speichern (im selben Ordner). WLAN und Supabase eintragen.
//     zugangsdaten.h wird NICHT zu GitHub hochgeladen (.gitignore).
//  2. Board "senseBox MCU Eye" wählen, hochladen.
//
// Bibliotheken: Adafruit SSD1306, Adafruit GFX Library (+ Adafruit BusIO)
// Serial Monitor: 115200 baud
// =====================================================================

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>   // https-Verbindung
#include <HTTPClient.h>

#if __has_include("zugangsdaten.h")
#include "zugangsdaten.h"
#else
#error "Bitte zugangsdaten.beispiel.h kopieren, als zugangsdaten.h speichern und ausfuellen."
#endif

// ---------- Einstellungen ----------
const unsigned long ABFRAGE_ALLE_MS = 10000;   // alle 10 Sekunden nachfragen

// ---------- Display ----------
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET   -1
#define OLED_ADDR    0x3D    // falls nichts angezeigt wird: 0x3C testen

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
bool displayGefunden = true;

// ---------- Zustand ----------
long angezeigteZahl = -1;          // -1 = noch keine Zahl bekommen
String status = "starte ...";
unsigned long letzteAbfrageMs = 0;


// Zeigt die Zahl groß in der Mitte, darunter klein den Zustand.
void zeigeZahl(long zahl, const String& statuszeile) {
  if (!displayGefunden) return;
  String text = (zahl < 0) ? String("--") : String(zahl);

  int textgroesse = 4;                       // 4 = 24 Pixel pro Zeichen, max. 5 Stellen
  if (text.length() > 5) textgroesse = 3;
  if (text.length() > 7) textgroesse = 2;

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  int16_t x1, y1;
  uint16_t w, h;
  display.setTextSize(textgroesse);
  display.getTextBounds(text, 0, 0, &x1, &y1, &w, &h);
  display.setCursor((SCREEN_WIDTH - w) / 2, (SCREEN_HEIGHT - h) / 2 - 4);
  display.print(text);

  display.setTextSize(1);
  display.getTextBounds(statuszeile, 0, 0, &x1, &y1, &w, &h);
  display.setCursor((SCREEN_WIDTH - w) / 2, SCREEN_HEIGHT - 8);
  display.print(statuszeile);

  display.display();
}

// Verbindet mit dem WLAN (wartet höchstens 15 Sekunden).
bool verbindeWlan() {
  if (WiFi.status() == WL_CONNECTED) return true;

  zeigeZahl(angezeigteZahl, "verbinde WLAN ...");
  Serial.print("Verbinde mit ");
  Serial.println(WLAN_NAME);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WLAN_NAME, WLAN_PASSWORT);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Verbunden, IP: ");
    Serial.println(WiFi.localIP());
    return true;
  }
  Serial.println("WLAN nicht erreichbar");
  return false;
}

// Fragt Supabase nach der Gesamtzahl. Rückgabe: Zahl oder -1 bei Fehler.
long holeAnzahl() {
  WiFiClientSecure client;
  // Vereinfachung fürs Studienprojekt: Das Zertifikat des Servers wird nicht geprüft.
  // Abgefragt wird nur eine öffentliche Zahl, daher vertretbar.
  client.setInsecure();

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/rpc/anzahl_scans";
  if (!http.begin(client, url)) return -1;

  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(8000);

  int code = http.POST("{}");
  long anzahl = -1;
  if (code == 200) {
    String antwort = http.getString();   // z. B. "42"
    antwort.trim();
    anzahl = antwort.toInt();
  } else {
    Serial.print("Server antwortet mit Code ");
    Serial.println(code);
  }
  http.end();
  return anzahl;
}

void kurzBlinken(uint8_t r, uint8_t g, uint8_t b) {
  rgbLedWrite(RGBLED_PIN, r, g, b);
  delay(120);
  rgbLedWrite(RGBLED_PIN, 0, 0, 0);
}


void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 3000) delay(10);

  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println("Display nicht gefunden - Kabel und Adresse pruefen");
    displayGefunden = false;
    rgbLedWrite(RGBLED_PIN, 40, 0, 0);
  }
  zeigeZahl(angezeigteZahl, status);

  if (strlen(SUPABASE_URL) == 0) {
    Serial.println("SUPABASE_URL fehlt in zugangsdaten.h");
  }
  verbindeWlan();
  letzteAbfrageMs = millis() - ABFRAGE_ALLE_MS;   // sofort das erste Mal abfragen
}

void loop() {
  if (millis() - letzteAbfrageMs < ABFRAGE_ALLE_MS) {
    delay(50);
    return;
  }
  letzteAbfrageMs = millis();

  if (strlen(SUPABASE_URL) == 0) {
    status = "Supabase fehlt";
  } else if (!verbindeWlan()) {
    status = "kein WLAN";
  } else {
    long neu = holeAnzahl();
    if (neu < 0) {
      status = "Serverfehler";
    } else {
      if (angezeigteZahl >= 0 && neu > angezeigteZahl) kurzBlinken(0, 40, 0);   // neuer Besuch
      angezeigteZahl = neu;
      status = "online";
      Serial.print("Scans gesamt: ");
      Serial.println(neu);
    }
  }
  zeigeZahl(angezeigteZahl, status);
}
