// =====================================================================
// config.js – Einstellungen der Website
// ---------------------------------------------------------------------
// apiUrl: Die Web-App-URL aus Google Apps Script
//   (Bereitstellen -> Bereitstellungen verwalten -> "Web-App"-URL,
//    endet auf "/exec"). Siehe README.
// =====================================================================

window.KZ_CONFIG = {
  apiUrl: "",             // z. B. "https://script.google.com/macros/s/AKfy.../exec"

  cookieTage: 30,         // so lange bleibt die Besucher-Kennung im Handy gespeichert
  routenPauseMinuten: 30, // gleiche Station innerhalb dieser Zeit = derselbe Besuch

  scanquoteMinProzent: 8, // Spanne der Scanquote für die Hochrechnung
  scanquoteMaxProzent: 12,
};
