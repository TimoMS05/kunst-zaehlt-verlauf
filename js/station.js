// =====================================================================
// station.js – Infoseite einer Skulptur
// ---------------------------------------------------------------------
// Aufruf über den QR-Code:  station.html?s=3&qr=1
//  1. Station aus der Datenbank laden und anzeigen.
//  2. Nur bei "qr=1" wird ein Besuch gemeldet.
//  3. Ist noch keine Entscheidung zum Cookie gefallen, erscheint der
//     Einwilligungs-Hinweis. Gemeldet wird nach der Entscheidung:
//       - "Zustimmen": mit pseudonymer Besucher-Kennung (für den Verlauf)
//       - "Ablehnen":  ohne Kennung (nur Zählung)
//     Wer gar nichts anklickt, wird beim Verlassen ohne Kennung gezählt.
// =====================================================================

(async () => {
  const $ = (id) => document.getElementById(id);
  const parameter = new URLSearchParams(location.search);
  const stationId = parseInt(parameter.get("s"), 10);
  const vonQr = parameter.get("qr") === "1";

  // "qr=1" sofort aus der Adresse entfernen: Neuladen zählt nicht noch einmal
  if (vonQr) history.replaceState(null, "", location.pathname + "?s=" + stationId);

  // ---------- Station laden ----------
  let station = null;
  if (!KZ.konfiguriert) {
    $("name").textContent = "Noch nicht eingerichtet";
    $("text").textContent = "In config.js fehlt die Adresse von api.php (apiUrl).";
  } else if (!Number.isInteger(stationId)) {
    $("name").textContent = "Station nicht gefunden";
  } else {
    try {
      station = await KZ.lesen({ aktion: "station", id: stationId });
    } catch (e) {
      $("name").textContent = "Keine Verbindung";
      $("text").textContent = "Bitte später noch einmal versuchen.";
    }
    if (station) {
      document.title = station.name + " – Skulptur Projekte 2027";
      $("oben").textContent = "Skulptur Projekte 2027 · Station " + station.id;
      $("name").textContent = station.name;
      $("text").textContent = station.text;   // textContent: kein HTML möglich, sicher
    } else if ($("name").textContent === "Lade …") {
      $("name").textContent = "Station nicht gefunden";
    }
  }

  // ---------- Besuch melden (höchstens einmal pro Seitenaufruf) ----------
  let gemeldet = !(vonQr && station);

  function melden(keepalive) {
    if (gemeldet) return;
    gemeldet = true;
    KZ.besuchMelden(station.id, keepalive).catch(() => { /* offline: dann eben nicht */ });
  }

  function hinweisSchliessen() {
    $("einwilligung").classList.add("versteckt");
  }

  $("ew-ja").onclick = () => { KZ.willigeEin(); hinweisSchliessen(); melden(false); };
  $("ew-nein").onclick = () => { KZ.lehneAb(); hinweisSchliessen(); melden(false); };

  if (KZ.einwilligung() === null) {
    if (station) $("einwilligung").classList.remove("versteckt");
  } else {
    if (KZ.einwilligung() === "ja") KZ.willigeEin();   // Laufzeit des Cookies verlängern
    melden(false);
  }

  // Seite wird verlassen, ohne dass entschieden wurde -> nur zählen, ohne Kennung
  const beimVerlassen = () => melden(true);
  window.addEventListener("pagehide", beimVerlassen);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") beimVerlassen();
  });
})();
