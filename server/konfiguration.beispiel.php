<?php
// =====================================================================
// Vorlage für die Zugangsdaten
// ---------------------------------------------------------------------
// Diese Datei als "konfiguration.php" speichern, ausfüllen und zusammen
// mit api.php und .htaccess auf den IONOS-Webspace hochladen.
// konfiguration.php steht in der .gitignore und landet nicht auf GitHub.
//
// Die Datenbank-Daten findest du bei IONOS unter
//   Hosting -> Datenbanken -> (deine MySQL-Datenbank) -> Details
// =====================================================================

return [
    // MySQL-Datenbank bei IONOS
    'db_host'     => 'db5000000000.hosting-data.io',   // "Hostname"
    'db_name'     => 'dbs00000000',                    // "Datenbankname"
    'db_benutzer' => 'dbu00000000',                    // "Benutzername"
    'db_passwort' => '',                               // Passwort der Datenbank

    // Passwort für admin.html (mind. 8 Zeichen, selbst ausdenken)
    'admin_passwort' => 'HIER-EIN-EIGENES-PASSWORT',

    // Von welchen Websites aus darf die Schnittstelle benutzt werden?
    // (nur Protokoll + Domain, ohne Pfad und ohne "/" am Ende)
    'erlaubte_herkunft' => [
        'https://timoms05.github.io',
    ],
];
