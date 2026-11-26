// =====================================================================
// diagramme.js – einfache Diagramme ohne Zusatzbibliothek
// ---------------------------------------------------------------------
// Alle Texte werden über textContent gesetzt (kein HTML aus Daten).
// =====================================================================

const Diagramm = (() => {
  const SVG = "http://www.w3.org/2000/svg";

  function zahl(n) { return Number(n).toLocaleString("de-DE"); }

  function el(tag, klasse, text) {
    const e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function svgEl(tag, attribute, text) {
    const e = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attribute || {})) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // Blauton je nach Anteil (0..1)
  function farbe(anteil) {
    if (anteil <= 0) return { hg: "#f0f3f7", text: "#9aa5b1" };
    const a = 0.12 + 0.88 * anteil;
    return { hg: "rgba(29, 78, 137, " + a.toFixed(3) + ")", text: a > 0.5 ? "#fff" : "#1f2933" };
  }

  // ---------- Waagerechte Balken: [[Name, Wert], ...] ----------
  function balkenListe(ziel, eintraege, max) {
    ziel.innerHTML = "";
    if (!eintraege.length) { ziel.appendChild(el("div", "leer", "noch keine Daten")); return; }
    const hoechster = max || Math.max(1, ...eintraege.map((e) => e[1]));
    for (const [name, wert, zusatz] of eintraege) {
      const zeile = el("div", "zeile");
      zeile.appendChild(el("div", "", name));
      const balken = el("div", "balken");
      const fuellung = el("div");
      fuellung.style.width = (wert / hoechster * 100).toFixed(1) + "%";
      balken.appendChild(fuellung);
      zeile.appendChild(balken);
      zeile.appendChild(el("div", "zahl", zusatz !== undefined ? zusatz : zahl(wert)));
      ziel.appendChild(zeile);
    }
  }

  // ---------- Säulen pro Tag, gestapelt: [{tag:"2027-06-10", mit, ohne}] ----------
  function saeulenProTag(ziel, tage) {
    ziel.innerHTML = "";
    if (!tage.length) { ziel.appendChild(el("div", "leer", "noch keine Daten")); return; }

    const breite = 900, hoehe = 240, links = 36, unten = 26, oben = 8;
    const innenB = breite - links - 8, innenH = hoehe - unten - oben;
    const max = Math.max(1, ...tage.map((t) => t.mit + t.ohne));
    const schritt = innenB / tage.length;
    const saeule = Math.max(2, schritt * 0.75);

    const svg = svgEl("svg", { viewBox: "0 0 " + breite + " " + hoehe, class: "diagramm", role: "img",
                               "aria-label": "Scans pro Tag" });

    // Hilfslinien
    for (let i = 0; i <= 4; i++) {
      const wert = Math.round(max * i / 4);
      const y = oben + innenH - innenH * i / 4;
      svg.appendChild(svgEl("line", { x1: links, x2: breite - 8, y1: y, y2: y, stroke: "#e3e7ec" }));
      svg.appendChild(svgEl("text", { x: links - 6, y: y + 4, "text-anchor": "end" }, zahl(wert)));
    }

    // Beschriftung höchstens ~12 Tage
    const jedes = Math.ceil(tage.length / 12);

    tage.forEach((t, i) => {
      const x = links + i * schritt + (schritt - saeule) / 2;
      const hOhne = innenH * t.ohne / max;
      const hMit = innenH * t.mit / max;
      const g = svgEl("g");
      g.appendChild(svgEl("title", {}, formatTag(t.tag) + ": " + zahl(t.mit + t.ohne) + " Scans ("
        + zahl(t.mit) + " mit Cookie, " + zahl(t.ohne) + " ohne)"));
      g.appendChild(svgEl("rect", { x, y: oben + innenH - hMit, width: saeule, height: hMit, fill: "#1d4e89", rx: 1 }));
      g.appendChild(svgEl("rect", { x, y: oben + innenH - hMit - hOhne, width: saeule, height: hOhne, fill: "#8fb0d6", rx: 1 }));
      svg.appendChild(g);
      if (i % jedes === 0) {
        svg.appendChild(svgEl("text", { x: x + saeule / 2, y: hoehe - 8, "text-anchor": "middle" }, formatTag(t.tag, true)));
      }
    });

    ziel.appendChild(svg);
    const legende = el("div", "legende");
    const a = el("span", "", "mit Cookie-Zustimmung"); a.style.setProperty("--farbe", "#1d4e89");
    const b = el("span", "", "ohne"); b.style.setProperty("--farbe", "#8fb0d6");
    legende.append(a, b);
    ziel.appendChild(legende);
  }

  // ---------- Säulen nach Stunde: 24 Werte ----------
  function saeulenProStunde(ziel, werte) {
    ziel.innerHTML = "";
    const breite = 480, hoehe = 200, links = 32, unten = 22, oben = 8;
    const innenB = breite - links - 6, innenH = hoehe - unten - oben;
    const max = Math.max(1, ...werte);
    const schritt = innenB / 24;
    const svg = svgEl("svg", { viewBox: "0 0 " + breite + " " + hoehe, class: "diagramm", role: "img",
                               "aria-label": "Scans nach Uhrzeit" });
    for (let i = 0; i <= 4; i++) {
      const y = oben + innenH - innenH * i / 4;
      svg.appendChild(svgEl("line", { x1: links, x2: breite - 6, y1: y, y2: y, stroke: "#e3e7ec" }));
      svg.appendChild(svgEl("text", { x: links - 5, y: y + 4, "text-anchor": "end" }, zahl(Math.round(max * i / 4))));
    }
    werte.forEach((w, h) => {
      const x = links + h * schritt + schritt * 0.12;
      const hoehenwert = innenH * w / max;
      const g = svgEl("g");
      g.appendChild(svgEl("title", {}, h + "–" + (h + 1) + " Uhr: " + zahl(w) + " Scans"));
      g.appendChild(svgEl("rect", { x, y: oben + innenH - hoehenwert, width: schritt * 0.76, height: hoehenwert, fill: "#1d4e89", rx: 1 }));
      svg.appendChild(g);
      if (h % 3 === 0) svg.appendChild(svgEl("text", { x: x + schritt * 0.38, y: hoehe - 6, "text-anchor": "middle" }, h));
    });
    ziel.appendChild(svg);
  }

  // ---------- Wärmekarte Wochentag × Stunde: matrix[7][24] ----------
  function waermekarte(ziel, matrix) {
    ziel.innerHTML = "";
    const tage = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
    const max = Math.max(1, ...matrix.flat());
    const tabelle = el("table");
    const kopf = el("tr");
    kopf.appendChild(el("th"));
    for (let h = 0; h < 24; h++) kopf.appendChild(el("th", "", h % 3 === 0 ? String(h) : ""));
    tabelle.appendChild(kopf);
    matrix.forEach((zeile, t) => {
      const tr = el("tr");
      tr.appendChild(el("th", "", tage[t]));
      zeile.forEach((w, h) => {
        const f = farbe(w / max);
        const td = el("td");
        td.style.background = f.hg;
        td.title = tage[t] + " " + h + "–" + (h + 1) + " Uhr: " + zahl(w) + " Scans";
        tr.appendChild(td);
      });
      tabelle.appendChild(tr);
    });
    ziel.appendChild(tabelle);
  }

  // ---------- Übergangsmatrix: von Station (Zeile) zu Station (Spalte) ----------
  // stationen: [{id, name}], anzahl[vonId][zuId], minuten[vonId][zuId] (Median)
  function uebergaenge(ziel, stationen, anzahl, minuten) {
    ziel.innerHTML = "";
    if (!stationen.length) { ziel.appendChild(el("div", "leer", "noch keine Daten")); return; }
    let max = 1;
    for (const a of stationen) for (const b of stationen) max = Math.max(max, (anzahl[a.id] || {})[b.id] || 0);

    const tabelle = el("table");
    const kopf = el("tr");
    kopf.appendChild(el("th", "", "von ↓  zu →"));
    for (const s of stationen) {
      const th = el("th", "", String(s.id));
      th.title = s.name;
      kopf.appendChild(th);
    }
    tabelle.appendChild(kopf);

    for (const von of stationen) {
      const tr = el("tr");
      const th = el("th", "", von.id + " " + kuerzen(von.name, 22));
      th.style.textAlign = "left";
      th.title = von.name;
      tr.appendChild(th);
      for (const zu of stationen) {
        const w = (anzahl[von.id] || {})[zu.id] || 0;
        const m = (minuten[von.id] || {})[zu.id];
        const f = farbe(w / max);
        const td = el("td", "", w ? String(w) : "");
        td.style.background = von.id === zu.id ? "#fff" : f.hg;
        td.style.color = f.text;
        td.style.minWidth = "34px";
        td.title = von.name + " → " + zu.name + ": " + zahl(w) + "×" + (m !== undefined ? ", Median " + m + " Min." : "");
        tr.appendChild(td);
      }
      tabelle.appendChild(tr);
    }
    ziel.appendChild(tabelle);
  }

  // ---------- Hilfen ----------
  function kuerzen(text, laenge) {
    return text.length > laenge ? text.slice(0, laenge - 1) + "…" : text;
  }

  function formatTag(tag, kurz) {
    const [j, m, d] = tag.split("-");
    return kurz ? d + "." + m + "." : d + "." + m + "." + j;
  }

  return { balkenListe, saeulenProTag, saeulenProStunde, waermekarte, uebergaenge, zahl, el, kuerzen, formatTag };
})();
