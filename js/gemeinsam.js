// =====================================================================
// gemeinsam.js – Hilfsfunktionen für alle Seiten
// ---------------------------------------------------------------------
// - Cookies lesen, setzen, löschen
// - Einwilligung verwalten
// - Anfragen an die Google-Tabelle (Apps-Script-Web-App, nur mit fetch)
// =====================================================================

const KZ = (() => {
  const cfg = window.KZ_CONFIG || {};
  const konfiguriert = Boolean(cfg.apiUrl);

  // Cookies gelten nur für den Ordner dieser Website (z. B. /kunst-zaehlt/)
  const pfad = location.pathname.replace(/[^/]*$/, "") || "/";

  // ---------- Cookies ----------
  const COOKIE_EINWILLIGUNG = "kz_einwilligung";   // "ja" oder "nein"
  const COOKIE_ID = "kz_id";                       // pseudonyme Besucher-Kennung

  function cookieLesen(name) {
    const teil = document.cookie.split("; ").find((c) => c.startsWith(name + "="));
    return teil ? decodeURIComponent(teil.slice(name.length + 1)) : null;
  }

  function cookieSetzen(name, wert, tage) {
    let c = name + "=" + encodeURIComponent(wert) +
            "; Max-Age=" + Math.round(tage * 86400) +
            "; Path=" + pfad + "; SameSite=Lax";
    if (location.protocol === "https:") c += "; Secure";
    document.cookie = c;
  }

  function cookieLoeschen(name) {
    document.cookie = name + "=; Max-Age=0; Path=" + pfad + "; SameSite=Lax";
  }

  // Zufällige Kennung, z. B. "3f2b9c1e-...". Enthält nichts über die Person.
  function neueKennung() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }

  // ---------- Einwilligung ----------
  // null = noch nicht entschieden, "ja" oder "nein"
  function einwilligung() {
    const w = cookieLesen(COOKIE_EINWILLIGUNG);
    return w === "ja" || w === "nein" ? w : null;
  }

  function willigeEin() {
    cookieSetzen(COOKIE_EINWILLIGUNG, "ja", cfg.cookieTage || 30);
    const id = cookieLesen(COOKIE_ID) || neueKennung();
    cookieSetzen(COOKIE_ID, id, cfg.cookieTage || 30);   // Laufzeit bei jedem Besuch erneuern
  }

  function lehneAb() {
    cookieSetzen(COOKIE_EINWILLIGUNG, "nein", cfg.cookieTage || 30);
    cookieLoeschen(COOKIE_ID);
  }

  function widerrufen() {
    cookieLoeschen(COOKIE_EINWILLIGUNG);
    cookieLoeschen(COOKIE_ID);
  }

  // Kennung nur, wenn eingewilligt wurde
  function besucherId() {
    return einwilligung() === "ja" ? cookieLesen(COOKIE_ID) : null;
  }

  // ---------- Google-Tabelle (Apps-Script-Web-App) ----------
  // Fehler meldet das Script im Feld "fehler" der Antwort.
  function pruefeAntwort(daten) {
    if (daten && typeof daten === "object" && !Array.isArray(daten) && daten.fehler) throw new Error(daten.fehler);
    return daten;
  }

  // Öffentliche Abfrage, z. B. lesen({aktion: "station", id: 3})
  async function lesen(parameter) {
    const antwort = await fetch(cfg.apiUrl + "?" + new URLSearchParams(parameter));
    if (!antwort.ok) throw new Error("Server antwortet mit " + antwort.status);
    return pruefeAntwort(await antwort.json());
  }

  // Anfrage mit Daten (z. B. Admin-Funktionen). Als "text/plain" gesendet,
  // damit der Browser keine extra Vorab-Anfrage schickt, die Google nicht versteht.
  async function senden(daten) {
    const antwort = await fetch(cfg.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(daten),
    });
    if (!antwort.ok) throw new Error("Server antwortet mit " + antwort.status);
    return pruefeAntwort(await antwort.json());
  }

  // Trägt einen Besuch ein. keepalive = auch dann senden, wenn die Seite gerade geschlossen wird.
  // Die Antwort brauchen wir nicht ("no-cors").
  function besuchMelden(stationId, keepalive) {
    const sprache = (navigator.language || "").slice(0, 2).toLowerCase();
    return fetch(cfg.apiUrl, {
      method: "POST",
      mode: "no-cors",
      keepalive: Boolean(keepalive),
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        aktion: "besuch",
        station_id: stationId,
        besucher_id: besucherId(),
        sprache: /^[a-z]{2}$/.test(sprache) ? sprache : "--",
      }),
    });
  }

  // ---------- Text sicher in HTML einsetzen ----------
  function html(text) {
    return String(text).replace(/[&<>"']/g, (z) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[z]));
  }

  // Adresse einer Stationsseite (für QR-Codes)
  function stationsUrl(id, mitQr) {
    const basis = location.origin + pfad;
    return basis + "station.html?s=" + id + (mitQr ? "&qr=1" : "");
  }

  return { cfg, konfiguriert, einwilligung, willigeEin, lehneAb, widerrufen, besucherId,
           lesen, senden, besuchMelden, html, stationsUrl };
})();
