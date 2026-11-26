// =====================================================================
// admin.js – Auswertung für das Projektteam
// ---------------------------------------------------------------------
// Anmeldung über Supabase (E-Mail + Passwort). Nur wer in der Tabelle
// "admins" steht, darf die Besuche lesen (siehe supabase/schema.sql).
//
// Mit admin.html?demo=1 läuft alles mit erfundenen Daten, ohne Anmeldung.
// =====================================================================

(() => {
  const $ = (id) => document.getElementById(id);
  const { el, zahl, kuerzen } = Diagramm;
  const cfg = KZ.cfg;

  const demo = new URLSearchParams(location.search).get("demo") === "1";
  const db = (!demo && KZ.konfiguriert && window.supabase)
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey)
    : null;

  const PAUSE_MS = (cfg.routenPauseMinuten || 30) * 60000;  // gleiche Station kurz hintereinander = 1 Besuch
  const TOUR_PAUSE_MS = 6 * 3600000;                         // länger als 6 h dazwischen = neuer Rundgang

  let stationen = [];   // {id, name, text, aktiv}
  let besuche = [];     // {id, station_id, t, besucher_id, sprache, tag, stunde, wtag}
  let bearbeiteId = 0;
  let gewaehlterBesucher = null;


  // ===================================================================
  // Zeit in Münster (Europe/Berlin), unabhängig vom Gerät
  // ===================================================================

  const zerleger = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hourCycle: "h23", weekday: "short",
  });
  const WOCHENTAGE = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  function zerlege(ms) {
    const t = {};
    for (const teil of zerleger.formatToParts(new Date(ms))) t[teil.type] = teil.value;
    return { tag: t.year + "-" + t.month + "-" + t.day, stunde: parseInt(t.hour, 10), wtag: WOCHENTAGE.indexOf(t.weekday) };
  }

  function uhrzeit(ms, mitDatum) {
    return new Date(ms).toLocaleString("de-DE", Object.assign(
      { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" },
      mitDatum ? { day: "2-digit", month: "2-digit", year: "numeric" } : {}));
  }

  function heute() { return zerlege(Date.now()).tag; }

  // "2027-06-10" + n Tage
  function tagPlus(tag, n) {
    const d = new Date(tag + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function median(liste) {
    if (!liste.length) return undefined;
    const s = [...liste].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function prozent(teil, ganz) {
    return ganz ? Math.round(teil / ganz * 100) + " %" : "–";
  }


  // ===================================================================
  // Anmelden, Daten laden
  // ===================================================================

  function zeigeLogin(text, fehler) {
    $("login").classList.remove("versteckt");
    $("app").classList.add("versteckt");
    $("l-meldung").textContent = text || "";
    $("l-meldung").className = "meldung " + (fehler ? "fehler" : "");
  }

  function zeigeApp() {
    $("login").classList.add("versteckt");
    $("app").classList.remove("versteckt");
    zeichneAlles();
  }

  async function start() {
    if (demo) {
      $("demo-hinweis").classList.remove("versteckt");
      $("kopfinfo").textContent = "Demo-Modus";
      erzeugeDemoDaten();
      zeigeApp();
      return;
    }
    if (!KZ.konfiguriert) { zeigeLogin("In config.js fehlen die Supabase-Zugangsdaten.", true); return; }
    if (!db) { zeigeLogin("Supabase-Bibliothek konnte nicht geladen werden. Internetverbindung prüfen.", true); return; }

    const { data } = await db.auth.getSession();
    if (data.session) await nachAnmeldung(data.session);
    else zeigeLogin();
  }

  async function anmelden() {
    $("l-meldung").textContent = "Melde an …";
    $("l-meldung").className = "meldung";
    const { data, error } = await db.auth.signInWithPassword({
      email: $("l-mail").value.trim(), password: $("l-pass").value,
    });
    if (error) { zeigeLogin("Anmeldung fehlgeschlagen: E-Mail oder Passwort falsch.", true); return; }
    await nachAnmeldung(data.session);
  }

  async function nachAnmeldung(session) {
    $("kopfinfo").textContent = "angemeldet als " + session.user.email;
    $("abmelden").classList.remove("versteckt");

    const { data: istAdmin, error } = await db.rpc("ist_admin");
    if (error || !istAdmin) {
      zeigeLogin("Dieses Konto ist nicht als Admin eingetragen (Tabelle „admins“ in Supabase).", true);
      return;
    }
    try {
      await ladeDaten();
      zeigeApp();
    } catch (e) {
      zeigeLogin("Daten konnten nicht geladen werden: " + e.message, true);
    }
  }

  async function ladeDaten() {
    $("f-info").textContent = "lade …";
    const st = await db.from("stationen").select("id,name,text,aktiv").order("id");
    if (st.error) throw st.error;
    stationen = st.data;

    // Besuche in Paketen zu 1000 holen (mehr gibt Supabase pro Anfrage nicht heraus)
    const alle = [];
    for (let von = 0; ; von += 1000) {
      const { data, error } = await db.from("besuche")
        .select("id,station_id,zeit,besucher_id,sprache").order("id").range(von, von + 999);
      if (error) throw error;
      alle.push(...data);
      if (data.length < 1000) break;
    }
    besuche = alle.map((b) => aufbereiten(b.id, b.station_id, Date.parse(b.zeit), b.besucher_id, b.sprache));
  }

  function aufbereiten(id, stationId, t, besucherId, sprache) {
    return Object.assign({ id, station_id: stationId, t, besucher_id: besucherId, sprache }, zerlege(t));
  }


  // ===================================================================
  // Filter und Hilfen
  // ===================================================================

  function gefiltert() {
    const von = $("von").value, bis = $("bis").value;
    return besuche.filter((b) => (!von || b.tag >= von) && (!bis || b.tag <= bis));
  }

  function stationsName(id) {
    const s = stationen.find((x) => x.id === id);
    return s ? s.name : "Station " + id;
  }

  // Stationen, die aktiv sind oder in den Daten vorkommen
  function relevanteStationen(liste) {
    const ids = new Set(liste.map((b) => b.station_id));
    return stationen.filter((s) => s.aktiv || ids.has(s.id));
  }

  // Pro Besucher (mit Cookie) die Schritte in zeitlicher Reihenfolge.
  // Gleiche Station kurz hintereinander zählt nur einmal.
  function berechneRundgaenge(liste) {
    const proBesucher = new Map();
    for (const b of liste) {
      if (!b.besucher_id) continue;
      if (!proBesucher.has(b.besucher_id)) proBesucher.set(b.besucher_id, []);
      proBesucher.get(b.besucher_id).push(b);
    }
    const rundgaenge = [];
    for (const [id, eigene] of proBesucher) {
      eigene.sort((a, b) => a.t - b.t);
      const schritte = [];
      for (const b of eigene) {
        const letzter = schritte[schritte.length - 1];
        if (letzter && letzter.station_id === b.station_id && b.t - letzter.t < PAUSE_MS) continue;
        schritte.push(b);
      }
      rundgaenge.push({
        id, schritte,
        tage: new Set(eigene.map((b) => b.tag)).size,
        stationen: new Set(schritte.map((s) => s.station_id)).size,
        zuletzt: eigene[eigene.length - 1].t,
      });
    }
    return rundgaenge;
  }


  // ===================================================================
  // Zeichnen
  // ===================================================================

  function zeichneAlles() {
    const liste = gefiltert();
    const rundgaenge = berechneRundgaenge(liste);
    $("f-info").textContent = zahl(liste.length) + " von " + zahl(besuche.length) + " Scans im Zeitraum";
    zeichneUebersicht(liste, rundgaenge);
    zeichneZeitverlauf(liste);
    zeichneRouten(liste, rundgaenge);
    zeichneEinzelne(rundgaenge);
    zeichneStationen();
    zeichneQrCodes();
  }

  function kachel(ziel, wert, name, titel) {
    const k = el("div", "karte kachel");
    k.appendChild(el("div", "wert", wert));
    k.appendChild(el("div", "name", name));
    if (titel) k.title = titel;
    ziel.appendChild(k);
  }

  // ---------- Übersicht ----------
  function zeichneUebersicht(liste, rundgaenge) {
    const k = $("kacheln");
    k.innerHTML = "";
    const mitId = liste.filter((b) => b.besucher_id).length;
    const qMin = cfg.scanquoteMinProzent || 8, qMax = cfg.scanquoteMaxProzent || 12;

    kachel(k, zahl(liste.length), "Scans im Zeitraum");
    kachel(k, zahl(liste.filter((b) => b.tag === heute()).length), "Scans heute");
    kachel(k, zahl(rundgaenge.length), "Besucher mit Cookie", "verschiedene pseudonyme Kennungen");
    kachel(k, prozent(mitId, liste.length), "Zustimmung zum Cookie", "Anteil der Scans mit Kennung");
    kachel(k, zahl(Math.round(liste.length * 100 / qMax)) + "–" + zahl(Math.round(liste.length * 100 / qMin)),
      "hochgerechnete Besucher");

    const proStation = new Map();
    for (const b of liste) proStation.set(b.station_id, (proStation.get(b.station_id) || 0) + 1);
    Diagramm.balkenListe($("ue-stationen"),
      relevanteStationen(liste).map((s) => [s.id + " · " + s.name, proStation.get(s.id) || 0])
        .sort((a, b) => b[1] - a[1]));

    const proSprache = new Map();
    for (const b of liste) proSprache.set(b.sprache, (proSprache.get(b.sprache) || 0) + 1);
    Diagramm.balkenListe($("ue-sprachen"),
      [...proSprache].map(([c, n]) => [c === "--" ? "unbekannt" : c, n]).sort((a, b) => b[1] - a[1]));

    $("ue-hochrechnung").textContent = "Hochrechnung: Besucher = Scans ÷ Scanquote, mit einer Scanquote zwischen "
      + qMin + " % und " + qMax + " % (in config.js einstellbar, später aus der Strichliste).";
  }

  // ---------- Zeitverlauf ----------
  function zeichneZeitverlauf(liste) {
    // Scans pro Tag, auch Tage ohne Scans
    const proTag = new Map();
    for (const b of liste) {
      const e = proTag.get(b.tag) || { mit: 0, ohne: 0 };
      if (b.besucher_id) e.mit++; else e.ohne++;
      proTag.set(b.tag, e);
    }
    const tage = [];
    if (liste.length) {
      const sortiert = [...proTag.keys()].sort();
      let tag = $("von").value || sortiert[0];
      const ende = $("bis").value || sortiert[sortiert.length - 1];
      for (let i = 0; tag <= ende && i < 400; i++, tag = tagPlus(tag, 1)) {
        const e = proTag.get(tag) || { mit: 0, ohne: 0 };
        tage.push({ tag, mit: e.mit, ohne: e.ohne });
      }
    }
    Diagramm.saeulenProTag($("z-tage"), tage);

    const matrix = Array.from({ length: 7 }, () => new Array(24).fill(0));
    const stunden = new Array(24).fill(0);
    for (const b of liste) { matrix[b.wtag][b.stunde]++; stunden[b.stunde]++; }
    Diagramm.waermekarte($("z-waerme"), matrix);
    Diagramm.saeulenProStunde($("z-stunden"), stunden);
  }

  // ---------- Routen ----------
  function zeichneRouten(liste, rundgaenge) {
    const k = $("r-kacheln");
    k.innerHTML = "";

    // Übergänge von Station zu Station (nur innerhalb eines Rundgangs)
    const anzahl = {}, dauern = {};
    const gesamtdauern = [];
    let uebergaengeGesamt = 0;
    for (const r of rundgaenge) {
      let tourStart = r.schritte[0].t;
      for (let i = 1; i < r.schritte.length; i++) {
        const a = r.schritte[i - 1], b = r.schritte[i];
        if (b.t - a.t > TOUR_PAUSE_MS) {                 // neuer Tag/neuer Rundgang
          if (a.t > tourStart) gesamtdauern.push((a.t - tourStart) / 60000);
          tourStart = b.t;
          continue;
        }
        anzahl[a.station_id] = anzahl[a.station_id] || {};
        dauern[a.station_id] = dauern[a.station_id] || {};
        anzahl[a.station_id][b.station_id] = (anzahl[a.station_id][b.station_id] || 0) + 1;
        (dauern[a.station_id][b.station_id] = dauern[a.station_id][b.station_id] || []).push((b.t - a.t) / 60000);
        uebergaengeGesamt++;
      }
      const letzter = r.schritte[r.schritte.length - 1].t;
      if (letzter > tourStart) gesamtdauern.push((letzter - tourStart) / 60000);
    }
    const minuten = {};
    for (const von in dauern) {
      minuten[von] = {};
      for (const zu in dauern[von]) minuten[von][zu] = Math.round(median(dauern[von][zu]));
    }

    const mitMehreren = rundgaenge.filter((r) => r.stationen >= 2).length;
    kachel(k, zahl(rundgaenge.length), "Besucher mit Rundgang");
    kachel(k, rundgaenge.length ? (rundgaenge.reduce((s, r) => s + r.stationen, 0) / rundgaenge.length).toFixed(1).replace(".", ",") : "–",
      "Ø Stationen pro Besucher");
    kachel(k, prozent(mitMehreren, rundgaenge.length), "sehen 2+ Stationen");
    const md = median(gesamtdauern);
    kachel(k, md !== undefined ? Math.round(md) + " Min." : "–", "Dauer eines Rundgangs (Median)",
      "von der ersten bis zur letzten Station, nur Rundgänge mit 2+ Stationen");
    kachel(k, zahl(rundgaenge.filter((r) => r.tage >= 2).length), "Wiederkehrer", "an mindestens 2 Tagen da");

    // Häufigste Rundgänge (komplette Reihenfolge)
    const folgen = new Map();
    for (const r of rundgaenge) {
      const schluessel = r.schritte.map((s) => s.station_id).join(" → ");
      folgen.set(schluessel, (folgen.get(schluessel) || 0) + 1);
    }
    const top = [...folgen].sort((a, b) => b[1] - a[1]).slice(0, 12);
    const topZiel = $("r-top");
    Diagramm.balkenListe(topZiel, top.map(([folge, n]) => [folge, n]));
    // Namen als Tooltip
    [...topZiel.querySelectorAll(".zeile")].forEach((zeile, i) => {
      zeile.title = top[i][0].split(" → ").map((id) => stationsName(Number(id))).join(" → ");
    });
    if (top.length) {
      topZiel.appendChild(el("p", "klein", "Zahlen = Stationsnummern. Mit der Maus über eine Zeile fahren zeigt die Namen."));
    }

    Diagramm.uebergaenge($("r-matrix"), relevanteStationen(liste), anzahl, minuten);

    // Einstieg und Ausstieg
    const start = new Map(), ende = new Map();
    for (const r of rundgaenge) {
      const a = r.schritte[0].station_id, z = r.schritte[r.schritte.length - 1].station_id;
      start.set(a, (start.get(a) || 0) + 1);
      ende.set(z, (ende.get(z) || 0) + 1);
    }
    const alsListe = (m) => [...m].map(([id, n]) => [id + " · " + stationsName(id), n]).sort((a, b) => b[1] - a[1]);
    Diagramm.balkenListe($("r-start"), alsListe(start));
    Diagramm.balkenListe($("r-ende"), alsListe(ende));

    // Verteilung: wie viele verschiedene Stationen
    const verteilung = new Map();
    for (const r of rundgaenge) verteilung.set(r.stationen, (verteilung.get(r.stationen) || 0) + 1);
    Diagramm.balkenListe($("r-anzahl"),
      [...verteilung].sort((a, b) => a[0] - b[0]).map(([n, anz]) => [n + (n === 1 ? " Station" : " Stationen"), anz]));
  }

  // ---------- Einzelne Rundgänge ----------
  function zeichneEinzelne(rundgaenge) {
    const tbody = $("e-liste");
    tbody.innerHTML = "";
    const sortiert = [...rundgaenge].sort((a, b) => b.zuletzt - a.zuletzt).slice(0, 300);
    if (!sortiert.length) {
      const tr = el("tr");
      const td = el("td", "leer", "Keine Besucher mit Cookie im Zeitraum.");
      td.colSpan = 3;
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
    for (const r of sortiert) {
      const tr = el("tr");
      tr.style.cursor = "pointer";
      if (r.id === gewaehlterBesucher) tr.style.background = "var(--blau-hell)";
      tr.appendChild(el("td", "", "#" + r.id.slice(0, 6)));
      tr.appendChild(el("td", "", r.schritte.map((s) => s.station_id).join(" → ")));
      tr.appendChild(el("td", "nur-breit klein", uhrzeit(r.zuletzt, true)));
      tr.onclick = () => { gewaehlterBesucher = r.id; zeichneEinzelne(rundgaenge); };
      tbody.appendChild(tr);
    }

    const r = rundgaenge.find((x) => x.id === gewaehlterBesucher);
    const leiste = $("e-zeitleiste");
    leiste.innerHTML = "";
    if (!r) {
      $("e-titel").textContent = "Rundgang";
      $("e-unter").textContent = "Links einen Besucher auswählen.";
      return;
    }
    $("e-titel").textContent = "Rundgang von #" + r.id.slice(0, 6);
    $("e-unter").textContent = r.schritte.length + " Besuche an " + r.stationen + " Stationen, an "
      + r.tage + (r.tage === 1 ? " Tag" : " Tagen");
    r.schritte.forEach((s, i) => {
      const li = el("li");
      if (i > 0) {
        const vorher = r.schritte[i - 1];
        const min = Math.round((s.t - vorher.t) / 60000);
        li.appendChild(el("div", "abstand", s.tag !== vorher.tag ? "an einem anderen Tag"
          : min < 60 ? "+" + min + " Min." : "+" + Math.floor(min / 60) + " h " + (min % 60) + " Min."));
      }
      li.appendChild(el("div", "", s.station_id + " · " + stationsName(s.station_id)));
      li.appendChild(el("div", "wann", uhrzeit(s.t, true) + " Uhr"));
      leiste.appendChild(li);
    });
  }

  // ---------- Stationen verwalten ----------
  function zeichneStationen() {
    const tbody = $("s-liste");
    tbody.innerHTML = "";
    const proStation = new Map();
    for (const b of besuche) proStation.set(b.station_id, (proStation.get(b.station_id) || 0) + 1);

    for (const s of stationen) {
      const tr = el("tr");
      tr.appendChild(el("td", "", String(s.id)));
      tr.appendChild(el("td", "", s.name));
      const status = el("td", "nur-breit");
      status.appendChild(el("span", s.aktiv ? "etikett" : "etikett grau", s.aktiv ? "aktiv" : "archiviert"));
      tr.appendChild(status);
      tr.appendChild(el("td", "zahl nur-breit", zahl(proStation.get(s.id) || 0)));

      const td = el("td");
      const aktionen = el("div", "aktionen");
      const ansehen = el("a", "knopf leise klein-knopf", "Ansehen");
      ansehen.href = KZ.stationsUrl(s.id, false);
      ansehen.target = "_blank";
      const aendern = el("button", "knopf leise klein-knopf", "Ändern");
      aendern.onclick = () => oeffneFormular(s);
      const umschalten = el("button", s.aktiv ? "knopf gefahr klein-knopf" : "knopf leise klein-knopf",
        s.aktiv ? "Archivieren" : "Aktivieren");
      umschalten.onclick = () => schalteAktiv(s);
      aktionen.append(ansehen, aendern, umschalten);
      td.appendChild(aktionen);
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  }

  function stationsMeldung(text, art) {
    $("s-meldung").textContent = text;
    $("s-meldung").className = "meldung " + (art || "");
  }

  function oeffneFormular(station) {
    bearbeiteId = station ? station.id : 0;
    $("s-titel").textContent = station ? "Station " + station.id + " ändern" : "Neue Station";
    $("s-name").value = station ? station.name : "";
    $("s-text").value = station ? station.text : "";
    $("s-formular").classList.remove("versteckt");
    $("s-name").focus();
  }

  async function speichereStation() {
    const name = $("s-name").value.trim();
    const text = $("s-text").value.trim();
    if (!name) { stationsMeldung("Bitte einen Namen eingeben.", "fehler"); return; }

    if (demo) {
      if (bearbeiteId) Object.assign(stationen.find((s) => s.id === bearbeiteId), { name, text });
      else stationen.push({ id: Math.max(0, ...stationen.map((s) => s.id)) + 1, name, text, aktiv: true });
    } else {
      const antwort = bearbeiteId
        ? await db.from("stationen").update({ name, text }).eq("id", bearbeiteId)
        : await db.from("stationen").insert({ name, text });
      if (antwort.error) { stationsMeldung("Speichern fehlgeschlagen: " + antwort.error.message, "fehler"); return; }
      await ladeDaten();
    }
    $("s-formular").classList.add("versteckt");
    stationsMeldung(bearbeiteId ? "Station gespeichert." : "Station angelegt.", "ok");
    zeichneAlles();
  }

  // Stationen werden nicht gelöscht, sondern archiviert: Ihre Besuche bleiben in der Auswertung.
  async function schalteAktiv(s) {
    if (s.aktiv && !confirm("Station „" + s.name + "“ archivieren? Ihr QR-Code zählt dann nicht mehr, die bisherigen Besuche bleiben erhalten.")) return;
    if (demo) {
      s.aktiv = !s.aktiv;
    } else {
      const { error } = await db.from("stationen").update({ aktiv: !s.aktiv }).eq("id", s.id);
      if (error) { stationsMeldung("Fehler: " + error.message, "fehler"); return; }
      await ladeDaten();
    }
    stationsMeldung(s.aktiv ? "Station ist aktiv." : "Station archiviert.", "ok");
    zeichneAlles();
  }

  // ---------- QR-Codes ----------
  function qrSvg(text) {
    const qr = qrcode(0, "M");   // Größe automatisch, 15 % Fehlerkorrektur
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
  }

  function zeichneQrCodes() {
    const raster = $("q-raster");
    raster.innerHTML = "";
    if (typeof qrcode !== "function") {
      raster.appendChild(el("p", "leer", "QR-Bibliothek konnte nicht geladen werden (Internetverbindung?)."));
      return;
    }
    for (const s of stationen.filter((x) => x.aktiv)) {
      const url = KZ.stationsUrl(s.id, true);
      const karte = el("div", "karte");
      karte.appendChild(el("h3", "", s.id + " · " + s.name));
      const bild = el("div", "qr");
      bild.innerHTML = qrSvg(url);   // SVG aus der QR-Bibliothek, enthält nur unsere URL
      karte.appendChild(bild);
      karte.appendChild(el("div", "klein url", url));
      const druck = el("a", "knopf klein-knopf", "Schild drucken");
      druck.href = "druck.html?s=" + s.id + (demo ? "&demo=1&name=" + encodeURIComponent(s.name) : "");
      druck.target = "_blank";
      druck.style.marginTop = "10px";
      karte.appendChild(druck);
      raster.appendChild(karte);
    }
  }

  // ---------- CSV-Export ----------
  function csvExport() {
    const zeilen = [["id", "station_id", "station", "zeit_berlin", "besucher_id", "sprache"]];
    for (const b of gefiltert()) {
      zeilen.push([b.id, b.station_id, stationsName(b.station_id), uhrzeit(b.t, true), b.besucher_id || "", b.sprache]);
    }
    const text = zeilen.map((z) => z.map((w) => '"' + String(w).replace(/"/g, '""') + '"').join(";")).join("\r\n");
    const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });   // ﻿: Excel erkennt Umlaute
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "kunst-zaehlt-besuche-" + heute() + ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }


  // ===================================================================
  // Demo-Daten (erfunden, nur zum Ausprobieren)
  // ===================================================================

  function erzeugeDemoDaten() {
    // fester Startwert: bei jedem Laden dieselben "Zufallszahlen"
    let saat = 20270610;
    const zufall = () => {
      saat |= 0; saat = (saat + 0x6d2b79f5) | 0;
      let t = Math.imul(saat ^ (saat >>> 15), 1 | saat);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const waehle = (gewichte) => {
      let r = zufall() * gewichte.reduce((a, b) => a + b, 0);
      for (let i = 0; i < gewichte.length; i++) { r -= gewichte[i]; if (r < 0) return i; }
      return gewichte.length - 1;
    };
    const demoId = () => "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(zufall() * 16).toString(16));

    stationen = [
      { id: 1, name: "Skulptur am Aasee", text: "Demo-Text.", aktiv: true },
      { id: 2, name: "Werk im Schlossgarten", text: "Demo-Text.", aktiv: true },
      { id: 3, name: "Installation am Dom", text: "Demo-Text.", aktiv: true },
      { id: 4, name: "Skulptur an der Promenade", text: "Demo-Text.", aktiv: true },
      { id: 5, name: "Arbeit am Hafen", text: "Demo-Text.", aktiv: true },
      { id: 6, name: "Werk am Prinzipalmarkt", text: "Demo-Text.", aktiv: true },
    ];
    const sprachen = ["de", "en", "nl", "fr", "--"];
    const sprachGewicht = [70, 12, 10, 4, 4];

    besuche = [];
    let nr = 1;
    const wiederkehrer = [];
    const startTag = tagPlus(heute(), -20);

    for (let d = 0; d <= 20; d++) {
      const tag = tagPlus(startTag, d);
      const wtag = new Date(tag + "T12:00:00Z").getUTCDay();   // 0 = Sonntag
      const anzahl = 25 + (wtag === 0 || wtag === 6 ? 30 : 0) + Math.floor(zufall() * 15);

      for (let v = 0; v < anzahl; v++) {
        const zustimmung = zufall() < 0.62;
        let kennung = zustimmung ? demoId() : null;
        if (zustimmung && wiederkehrer.length && zufall() < 0.08) kennung = wiederkehrer[Math.floor(zufall() * wiederkehrer.length)];
        else if (zustimmung && zufall() < 0.1) wiederkehrer.push(kennung);
        const sprache = sprachen[waehle(sprachGewicht)];

        // Startzeit: 10–19 Uhr, nachmittags mehr
        const stunde = 10 + waehle([3, 5, 6, 7, 9, 10, 9, 7, 4]);
        let t = Date.parse(tag + "T" + String(stunde - 2).padStart(2, "0") + ":00:00Z") + Math.floor(zufall() * 3600000);

        // Rundgang: meist zur Nachbarstation weiter
        let station = 1 + waehle([30, 18, 14, 12, 14, 12]);
        const besucht = new Set();
        const laenge = 1 + waehle([30, 28, 20, 12, 7, 3]);
        for (let s = 0; s < laenge; s++) {
          besucht.add(station);
          besuche.push(aufbereiten(nr++, station, t, kennung, sprache));
          if (!zustimmung && zufall() < 0.6) break;   // ohne Cookie sieht man die Route ohnehin nicht
          t += (8 + Math.floor(zufall() * 30)) * 60000;
          const nachbar = station < 6 ? station + 1 : 1;
          if (zufall() < 0.6 && !besucht.has(nachbar)) station = nachbar;
          else {
            const frei = [1, 2, 3, 4, 5, 6].filter((x) => !besucht.has(x));
            if (!frei.length) break;
            station = frei[Math.floor(zufall() * frei.length)];
          }
        }
      }
    }
    besuche.sort((a, b) => a.t - b.t);
  }


  // ===================================================================
  // Bedienung
  // ===================================================================

  document.querySelectorAll("#reiter button").forEach((knopf) => {
    knopf.onclick = () => {
      document.querySelectorAll("#reiter button").forEach((b) => b.classList.toggle("aktiv", b === knopf));
      document.querySelectorAll("[data-bereich]").forEach((b) =>
        b.classList.toggle("versteckt", b.dataset.bereich !== knopf.dataset.reiter));
      // Zeitraum-Filter ist bei Stationen und QR-Codes unnötig
      $("filter").classList.toggle("versteckt", ["stationen", "qr"].includes(knopf.dataset.reiter));
    };
  });

  $("von").onchange = zeichneAlles;
  $("bis").onchange = zeichneAlles;
  $("f-alles").onclick = () => { $("von").value = ""; $("bis").value = ""; zeichneAlles(); };
  $("f-neu").onclick = async () => {
    if (!demo) {
      try { await ladeDaten(); } catch (e) { $("f-info").textContent = "Fehler: " + e.message; return; }
    }
    zeichneAlles();
  };
  $("f-csv").onclick = csvExport;

  $("l-los").onclick = anmelden;
  $("l-pass").addEventListener("keydown", (e) => { if (e.key === "Enter") anmelden(); });
  $("abmelden").onclick = async () => {
    if (db) await db.auth.signOut();
    location.href = "admin.html";
  };

  $("s-neu").onclick = () => oeffneFormular(null);
  $("s-abbrechen").onclick = () => $("s-formular").classList.add("versteckt");
  $("s-speichern").onclick = speichereStation;

  start();
})();
