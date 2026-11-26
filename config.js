// =====================================================================
// config.js – Einstellungen der Website
// ---------------------------------------------------------------------
// Supabase-Daten findest du in Supabase unter
//   Project Settings → API → "Project URL" und "anon public" Key.
// Der anon-Key ist dafür gedacht, öffentlich in Websites zu stehen:
// Was er darf, regeln die Regeln in supabase/schema.sql.
// =====================================================================

window.KZ_CONFIG = {
  supabaseUrl: "",        // z. B. "https://abcdefghijkl.supabase.co"
  supabaseAnonKey: "",    // langer Schlüssel, beginnt mit "eyJ..."

  cookieTage: 30,         // so lange bleibt die Besucher-Kennung im Handy gespeichert
  routenPauseMinuten: 30, // gleiche Station innerhalb dieser Zeit = derselbe Besuch

  scanquoteMinProzent: 8, // Spanne der Scanquote für die Hochrechnung
  scanquoteMaxProzent: 12,
};
