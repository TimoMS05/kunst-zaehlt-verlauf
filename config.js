// =====================================================================
// config.js – Einstellungen der Website
// ---------------------------------------------------------------------
// apiUrl: Adresse der Datei api.php auf eurem IONOS-Webspace (siehe README),
//   z. B. "https://eure-domain.de/kunst-zaehlt/api.php"
// =====================================================================

window.KZ_CONFIG = {
  apiUrl: "https://partytrailer-krefeld.de/kunst-zaehlt/api.php",   // Adresse von api.php (IONOS)

  cookieTage: 30,         // so lange bleibt die Besucher-Kennung im Handy gespeichert
  routenPauseMinuten: 30, // gleiche Station innerhalb dieser Zeit = derselbe Besuch

  scanquoteMinProzent: 8, // Spanne der Scanquote für die Hochrechnung
  scanquoteMaxProzent: 12,
};
