// =====================================================================
// Kunst zählt – Google Tabelle als Datenbank (Google Apps Script)
// ---------------------------------------------------------------------
// So einrichten (Details in der README):
//  1. Neue Google Tabelle anlegen, z. B. "Kunst zählt – Daten".
//  2. Menü "Erweiterungen" -> "Apps Script", diesen Code komplett einfügen.
//  3. Unten bei ADMIN_PASSWORT ein eigenes Passwort eintragen, speichern.
//  4. Oben die Funktion "einrichten" auswählen und auf "Ausführen" klicken
//     (einmalig, Google fragt nach Berechtigungen).
//  5. "Bereitstellen" -> "Neue Bereitstellung" -> Typ "Web-App",
//     Ausführen als: "Ich", Zugriff: "Jeder" -> Bereitstellen.
//     Die Web-App-URL in config.js (Website) und zugangsdaten.h (ESP32) eintragen.
//
// Die Tabelle hat zwei Blätter:
//  - "Stationen": id | name | text | aktiv | erstellt
//  - "Besuche":   id | station_id | zeit | besucher_id | sprache
//
// Wer darf was?
//  - Jeder:  aktive Stationen lesen, Besuch eintragen, Gesamtzahl abfragen.
//  - Admin (mit Passwort): alle Besuche lesen, Stationen anlegen/ändern.
//  - Einzelne Besuche kann ohne Passwort niemand lesen.
// =====================================================================

const ADMIN_PASSWORT = "HIER-EIN-EIGENES-PASSWORT";   // mindestens 8 Zeichen, bitte ändern!

const BLATT_STATIONEN = "Stationen";
const BLATT_BESUCHE = "Besuche";
const UUID_MUSTER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;


// ---------------------------------------------------------------------
// Einmalig ausführen: legt die Blätter mit Überschriften an
// ---------------------------------------------------------------------
function einrichten() {
  const tabelle = SpreadsheetApp.getActiveSpreadsheet();

  let stationen = tabelle.getSheetByName(BLATT_STATIONEN) || tabelle.insertSheet(BLATT_STATIONEN);
  if (stationen.getLastRow() === 0) {
    stationen.appendRow(["id", "name", "text", "aktiv", "erstellt"]);
    stationen.appendRow([1, "Testskulptur", "Hier steht später der Infotext zur Skulptur.", true, new Date()]);
    stationen.setFrozenRows(1);
  }

  let besuche = tabelle.getSheetByName(BLATT_BESUCHE) || tabelle.insertSheet(BLATT_BESUCHE);
  if (besuche.getLastRow() === 0) {
    besuche.appendRow(["id", "station_id", "zeit", "besucher_id", "sprache"]);
    besuche.setFrozenRows(1);
  }

  // Leeres Standardblatt entfernen
  const standard = tabelle.getSheetByName("Tabellenblatt1") || tabelle.getSheetByName("Sheet1");
  if (standard && standard.getLastRow() === 0 && tabelle.getSheets().length > 2) tabelle.deleteSheet(standard);

  Logger.log("Fertig. Jetzt 'Bereitstellen' -> 'Neue Bereitstellung' -> 'Web-App'.");
}


// ---------------------------------------------------------------------
// GET: öffentliche Abfragen
//   ?aktion=stationen       -> Liste der aktiven Stationen (id, name)
//   ?aktion=station&id=3    -> eine Station mit Text
//   ?aktion=anzahl          -> Gesamtzahl der Scans als reine Zahl (für den ESP32)
// ---------------------------------------------------------------------
function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.aktion === "stationen") {
      return json(stationenLesen().filter((s) => s.aktiv).map((s) => ({ id: s.id, name: s.name })));
    }
    if (p.aktion === "station") {
      const s = stationenLesen().find((x) => x.aktiv && x.id === Number(p.id));
      return json(s ? { id: s.id, name: s.name, text: s.text } : null);
    }
    if (p.aktion === "anzahl") {
      const anzahl = Math.max(0, blatt(BLATT_BESUCHE).getLastRow() - 1);
      return ContentService.createTextOutput(String(anzahl));
    }
    return json({ fehler: "Unbekannte Aktion" });
  } catch (fehler) {
    return json({ fehler: String(fehler.message || fehler) });
  }
}


// ---------------------------------------------------------------------
// POST: Besuch eintragen und Admin-Funktionen
//   {aktion:"besuch", station_id, besucher_id, sprache}
//   {aktion:"anmelden", passwort}
//   {aktion:"daten", passwort}                      -> alle Stationen und Besuche
//   {aktion:"station_speichern", passwort, id, name, text}   (id 0 = neu)
//   {aktion:"station_aktiv", passwort, id, aktiv}
// ---------------------------------------------------------------------
function doPost(e) {
  let d;
  try {
    d = JSON.parse(e.postData.contents);
  } catch (x) {
    return json({ fehler: "Ungültige Anfrage" });
  }
  try {
    switch (d.aktion) {
      case "besuch":
        return json(besuchEintragen(d));
      case "anmelden":
        pruefePasswort(d);
        return json({ ok: true });
      case "daten":
        pruefePasswort(d);
        return json({ stationen: stationenLesen(), besuche: besucheLesen() });
      case "station_speichern":
        pruefePasswort(d);
        return json(stationSpeichern(d));
      case "station_aktiv":
        pruefePasswort(d);
        return json(stationAktivSetzen(d));
    }
    return json({ fehler: "Unbekannte Aktion" });
  } catch (fehler) {
    return json({ fehler: String(fehler.message || fehler) });
  }
}


// ---------------------------------------------------------------------
// Besuche
// ---------------------------------------------------------------------
function besuchEintragen(d) {
  const stationId = Number(d.station_id);
  if (!stationenLesen().some((s) => s.aktiv && s.id === stationId)) throw new Error("Station unbekannt");

  // Nur erlaubte Werte speichern. Die Zeit setzt immer der Server.
  const besucher = typeof d.besucher_id === "string" && UUID_MUSTER.test(d.besucher_id) ? d.besucher_id : "";
  const sprache = typeof d.sprache === "string" && /^[a-z]{2}$/.test(d.sprache) ? d.sprache : "--";

  const sperre = LockService.getScriptLock();   // verhindert doppelte Nummern bei gleichzeitigen Scans
  sperre.waitLock(10000);
  try {
    const b = blatt(BLATT_BESUCHE);
    const id = b.getLastRow();                  // Zeile 1 = Überschrift -> erste Nummer ist 1
    b.appendRow([id, stationId, new Date(), besucher, sprache]);
  } finally {
    sperre.releaseLock();
  }
  return { ok: true };
}

// Kompakt als Listen: [id, station_id, zeit in ms, besucher_id oder null, sprache]
function besucheLesen() {
  const b = blatt(BLATT_BESUCHE);
  if (b.getLastRow() < 2) return [];
  return b.getRange(2, 1, b.getLastRow() - 1, 5).getValues()
    .filter((z) => z[0] !== "")
    .map((z) => [
      Number(z[0]),
      Number(z[1]),
      z[2] instanceof Date ? z[2].getTime() : Date.parse(z[2]),
      z[3] ? String(z[3]) : null,
      z[4] ? String(z[4]) : "--",
    ]);
}


// ---------------------------------------------------------------------
// Stationen
// ---------------------------------------------------------------------
function stationenLesen() {
  const b = blatt(BLATT_STATIONEN);
  if (b.getLastRow() < 2) return [];
  return b.getRange(2, 1, b.getLastRow() - 1, 4).getValues()
    .filter((z) => z[0] !== "")
    .map((z) => ({
      id: Number(z[0]),
      name: String(z[1]),
      text: String(z[2]),
      aktiv: z[3] === true || ["TRUE", "WAHR", "JA"].includes(String(z[3]).toUpperCase()),
    }));
}

function stationSpeichern(d) {
  const name = String(d.name || "").trim().slice(0, 80);
  const text = String(d.text || "").trim().slice(0, 3000);
  if (!name) throw new Error("Bitte einen Namen eingeben.");

  const sperre = LockService.getScriptLock();
  sperre.waitLock(10000);
  try {
    const b = blatt(BLATT_STATIONEN);
    const werte = b.getDataRange().getValues();
    const id = Number(d.id) || 0;
    if (id) {
      const zeile = werte.findIndex((z, i) => i > 0 && Number(z[0]) === id);
      if (zeile < 1) throw new Error("Station nicht gefunden.");
      b.getRange(zeile + 1, 2, 1, 2).setValues([[zelle(name), zelle(text)]]);
      return { id };
    }
    const neueId = werte.slice(1).reduce((m, z) => Math.max(m, Number(z[0]) || 0), 0) + 1;
    b.appendRow([neueId, zelle(name), zelle(text), true, new Date()]);
    return { id: neueId };
  } finally {
    sperre.releaseLock();
  }
}

function stationAktivSetzen(d) {
  const b = blatt(BLATT_STATIONEN);
  const werte = b.getDataRange().getValues();
  const zeile = werte.findIndex((z, i) => i > 0 && Number(z[0]) === Number(d.id));
  if (zeile < 1) throw new Error("Station nicht gefunden.");
  b.getRange(zeile + 1, 4).setValue(Boolean(d.aktiv));
  return { ok: true };
}


// ---------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------
function pruefePasswort(d) {
  if (ADMIN_PASSWORT === "HIER-EIN-EIGENES-PASSWORT" || ADMIN_PASSWORT.length < 8) {
    throw new Error("Bitte zuerst in Code.gs ein eigenes Admin-Passwort (mind. 8 Zeichen) setzen und neu bereitstellen.");
  }
  if (d.passwort !== ADMIN_PASSWORT) {
    Utilities.sleep(1500);   // bremst das Ausprobieren von Passwörtern
    throw new Error("Passwort falsch.");
  }
}

function blatt(name) {
  const b = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!b) throw new Error("Blatt '" + name + "' fehlt. Bitte einmal die Funktion 'einrichten' ausführen.");
  return b;
}

// Verhindert, dass Text wie "=SUMME(...)" als Formel ausgeführt wird
function zelle(text) {
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function json(daten) {
  return ContentService.createTextOutput(JSON.stringify(daten)).setMimeType(ContentService.MimeType.JSON);
}
