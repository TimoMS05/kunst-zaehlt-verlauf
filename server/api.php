<?php
// =====================================================================
// Kunst zählt – Schnittstelle zur MySQL-Datenbank (für IONOS-Webhosting)
// ---------------------------------------------------------------------
// Diese Datei kommt zusammen mit "konfiguration.php" und ".htaccess"
// in einen Ordner auf dem IONOS-Webspace, z. B. /kunst-zaehlt/.
// Die Tabellen legt das Skript beim ersten Admin-Login selbst an.
//
// GET (öffentlich):
//   api.php?aktion=stationen       -> aktive Stationen [{id, name}]
//   api.php?aktion=station&id=3    -> eine Station {id, name, text} oder null
//   api.php?aktion=anzahl          -> Gesamtzahl der Scans als reine Zahl (ESP32)
//
// POST (JSON im Text):
//   {aktion:"besuch", station_id, besucher_id, sprache}             (öffentlich)
//   {aktion:"anmelden", passwort}                                   (Admin)
//   {aktion:"daten", passwort}            -> alle Stationen und Besuche
//   {aktion:"station_speichern", passwort, id, name, text}  (id 0 = neu)
//   {aktion:"station_aktiv", passwort, id, aktiv}
//
// Fehler kommen als {"fehler": "..."} zurück.
// =====================================================================

declare(strict_types=1);

$konfig = require __DIR__ . '/konfiguration.php';

// ---------- Zugriff von der Website erlauben (CORS) ----------
// Nur die eingetragenen Adressen (z. B. GitHub Pages) dürfen Antworten lesen.
$herkunft = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($herkunft !== '' && in_array($herkunft, $konfig['erlaubte_herkunft'], true)) {
    header('Access-Control-Allow-Origin: ' . $herkunft);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
header('Cache-Control: no-store');

const UUID_MUSTER = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/';

// Fehler, deren Text der Nutzer sehen darf (z. B. "Passwort falsch.")
class KzFehler extends Exception {}


// ---------- Hauptteil ----------
try {
    $db = new PDO(
        'mysql:host=' . $konfig['db_host'] . ';dbname=' . $konfig['db_name'] . ';charset=utf8mb4',
        $konfig['db_benutzer'],
        $konfig['db_passwort'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false]
    );
    $db->exec("SET time_zone = '+00:00'");   // alle Zeiten in UTC

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $aktion = $_GET['aktion'] ?? '';
        if ($aktion === 'stationen') {
            $zeilen = $db->query('SELECT id, name FROM kz_stationen WHERE aktiv = 1 ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
            antworte(array_map(fn($z) => ['id' => (int)$z['id'], 'name' => $z['name']], $zeilen));
        }
        if ($aktion === 'station') {
            $abfrage = $db->prepare('SELECT id, name, text FROM kz_stationen WHERE aktiv = 1 AND id = ?');
            $abfrage->execute([(int)($_GET['id'] ?? 0)]);
            $z = $abfrage->fetch(PDO::FETCH_ASSOC);
            antworte($z ? ['id' => (int)$z['id'], 'name' => $z['name'], 'text' => $z['text']] : null);
        }
        if ($aktion === 'anzahl') {
            header('Content-Type: text/plain; charset=utf-8');
            echo (int)$db->query('SELECT COUNT(*) FROM kz_besuche')->fetchColumn();
            exit;
        }
        antworte(['fehler' => 'Unbekannte Aktion']);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $d = json_decode((string)file_get_contents('php://input'), true);
        if (!is_array($d)) antworte(['fehler' => 'Ungültige Anfrage']);

        switch ($d['aktion'] ?? '') {
            case 'besuch':
                antworte(besuchEintragen($db, $d));
            case 'anmelden':
                pruefePasswort($konfig, $d);
                tabellenAnlegen($db);
                antworte(['ok' => true]);
            case 'daten':
                pruefePasswort($konfig, $d);
                tabellenAnlegen($db);
                antworte(['stationen' => stationenLesen($db), 'besuche' => besucheLesen($db)]);
            case 'station_speichern':
                pruefePasswort($konfig, $d);
                antworte(stationSpeichern($db, $d));
            case 'station_aktiv':
                pruefePasswort($konfig, $d);
                $id = (int)($d['id'] ?? 0);
                pruefeStationVorhanden($db, $id);
                $abfrage = $db->prepare('UPDATE kz_stationen SET aktiv = ? WHERE id = ?');
                $abfrage->execute([!empty($d['aktiv']) ? 1 : 0, $id]);
                antworte(['ok' => true]);
        }
        antworte(['fehler' => 'Unbekannte Aktion']);
    }

    antworte(['fehler' => 'Nur GET und POST']);
} catch (Throwable $fehler) {
    // Technische Details nur ins Server-Log, nicht an Besucher
    error_log('kunst-zaehlt: ' . $fehler->getMessage());
    $meldung = $fehler instanceof KzFehler ? $fehler->getMessage() : 'Serverfehler (Details im Fehlerprotokoll)';
    if ($fehler instanceof PDOException && str_contains($fehler->getMessage(), "doesn't exist")) {
        $meldung = 'Tabellen fehlen noch: bitte einmal in admin.html anmelden.';
    }
    antworte(['fehler' => $meldung]);
}


// =====================================================================
// Funktionen
// =====================================================================

function antworte($daten): never
{
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($daten, JSON_UNESCAPED_UNICODE);
    exit;
}

function pruefePasswort(array $konfig, array $d): void
{
    $richtig = (string)$konfig['admin_passwort'];
    if (strlen($richtig) < 8 || $richtig === 'HIER-EIN-EIGENES-PASSWORT') {
        throw new KzFehler('Bitte in konfiguration.php ein eigenes Admin-Passwort (mind. 8 Zeichen) eintragen.');
    }
    if (!is_string($d['passwort'] ?? null) || !hash_equals($richtig, $d['passwort'])) {
        sleep(1);   // bremst das Ausprobieren von Passwörtern
        throw new KzFehler('Passwort falsch.');
    }
}

// Legt die Tabellen an, falls es sie noch nicht gibt (beim Admin-Login)
function tabellenAnlegen(PDO $db): void
{
    $db->exec("CREATE TABLE IF NOT EXISTS kz_stationen (
        id       INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name     VARCHAR(80)  NOT NULL,
        text     TEXT         NOT NULL,
        aktiv    TINYINT(1)   NOT NULL DEFAULT 1,
        erstellt TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $db->exec("CREATE TABLE IF NOT EXISTS kz_besuche (
        id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        station_id  INT UNSIGNED    NOT NULL,
        zeit        DATETIME        NOT NULL COMMENT 'UTC, vom Server gesetzt',
        besucher_id CHAR(36)        NULL     COMMENT 'nur mit Einwilligung (Cookie)',
        sprache     CHAR(2)         NOT NULL DEFAULT '--',
        INDEX besucher_zeit (besucher_id, zeit),
        INDEX zeit (zeit),
        CONSTRAINT besuch_station FOREIGN KEY (station_id) REFERENCES kz_stationen (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    if ((int)$db->query('SELECT COUNT(*) FROM kz_stationen')->fetchColumn() === 0) {
        $db->exec("INSERT INTO kz_stationen (name, text) VALUES ('Testskulptur', 'Hier steht später der Infotext zur Skulptur.')");
    }
}

function besuchEintragen(PDO $db, array $d): array
{
    $stationId = (int)($d['station_id'] ?? 0);
    $pruefen = $db->prepare('SELECT COUNT(*) FROM kz_stationen WHERE id = ? AND aktiv = 1');
    $pruefen->execute([$stationId]);
    if ((int)$pruefen->fetchColumn() === 0) throw new KzFehler('Station unbekannt');

    // Nur erlaubte Werte speichern. Die Zeit setzt immer der Server (UTC).
    $besucher = (is_string($d['besucher_id'] ?? null) && preg_match(UUID_MUSTER, $d['besucher_id'])) ? $d['besucher_id'] : null;
    $sprache = (is_string($d['sprache'] ?? null) && preg_match('/^[a-z]{2}$/', $d['sprache'])) ? $d['sprache'] : '--';

    $eintragen = $db->prepare('INSERT INTO kz_besuche (station_id, zeit, besucher_id, sprache) VALUES (?, UTC_TIMESTAMP(), ?, ?)');
    $eintragen->execute([$stationId, $besucher, $sprache]);
    return ['ok' => true];
}

function stationenLesen(PDO $db): array
{
    $zeilen = $db->query('SELECT id, name, text, aktiv FROM kz_stationen ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
    return array_map(fn($z) => [
        'id' => (int)$z['id'], 'name' => $z['name'], 'text' => $z['text'], 'aktiv' => (bool)$z['aktiv'],
    ], $zeilen);
}

// Kompakt als Listen: [id, station_id, zeit in ms, besucher_id oder null, sprache]
function besucheLesen(PDO $db): array
{
    // Die Verbindung steht auf UTC (siehe oben), daher rechnet UNIX_TIMESTAMP richtig
    $abfrage = $db->query('SELECT id, station_id, UNIX_TIMESTAMP(zeit) AS sek, besucher_id, sprache FROM kz_besuche ORDER BY id');
    $liste = [];
    while ($z = $abfrage->fetch(PDO::FETCH_NUM)) {
        $liste[] = [(int)$z[0], (int)$z[1], (int)$z[2] * 1000, $z[3], $z[4]];
    }
    return $liste;
}

function pruefeStationVorhanden(PDO $db, int $id): void
{
    $abfrage = $db->prepare('SELECT COUNT(*) FROM kz_stationen WHERE id = ?');
    $abfrage->execute([$id]);
    if ((int)$abfrage->fetchColumn() === 0) throw new KzFehler('Station nicht gefunden.');
}

function stationSpeichern(PDO $db, array $d): array
{
    $name = mb_substr(trim((string)($d['name'] ?? '')), 0, 80);
    $text = mb_substr(trim((string)($d['text'] ?? '')), 0, 3000);
    if ($name === '') throw new KzFehler('Bitte einen Namen eingeben.');

    $id = (int)($d['id'] ?? 0);
    if ($id > 0) {
        pruefeStationVorhanden($db, $id);
        $abfrage = $db->prepare('UPDATE kz_stationen SET name = ?, text = ? WHERE id = ?');
        $abfrage->execute([$name, $text, $id]);
        return ['id' => $id];
    }
    $abfrage = $db->prepare('INSERT INTO kz_stationen (name, text) VALUES (?, ?)');
    $abfrage->execute([$name, $text]);
    return ['id' => (int)$db->lastInsertId()];
}
