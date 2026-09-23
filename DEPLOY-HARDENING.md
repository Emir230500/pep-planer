# Bereitstellung der ersten Sicherheitskorrekturen

Diese Änderung ist zur Prüfung vorbereitet. Nicht ohne die folgenden Konfigurationschecks auf den laufenden Dienst übernehmen.

## Vor dem Deploy

1. Bestätigten Render-Arbeitsbereich und richtigen Dienst wählen. Aktuelle Start-/Buildbefehle und Ausgangscommit festhalten.
2. `ADMIN_PASSWORD` und `SESSION_SECRET` müssen sicher konfiguriert sein. Ohne Admin-Passwort antwortet die Admin-Anmeldung mit 503; es gibt kein Ersatzpasswort mehr.
3. Den veröffentlichten VAPID-Schlüssel auf Nutzung prüfen und gegebenenfalls ein neues Schlüsselpaar in `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` hinterlegen. Alte Git-Historie enthält den bisherigen Schlüssel weiter; alleiniger Codeaustausch ist keine Rotation. Neue Push-Anmeldung auf den Geräten einplanen. Keine Geheimnisse in Kommentare oder Protokolle kopieren.
4. Dasselbe sichere `CRON_SECRET` in Render und in den GitHub-Actions-Secrets hinterlegen. Beide Workflows senden den Wert als Header per POST. Ohne passende Werte schlagen Jobs absichtlich fehl.
5. Aktuellen Neon-Verbrauch über einen funktionierenden Anbieterzugang prüfen. Der Prüfzugang war am 23.09.2026 nicht autorisiert. Keine Aussage zur verbleibenden Quote ist damit möglich.
6. `npm ci` und `npm test` verwenden. Für die aktualisierte SheetJS-Version ist deren offizielles CDN erforderlich; auch die Browser-Seite verweist auf 0.20.3.

## Verhalten nach dem Deploy

- Bestehende Sitzungen werden ungültig. Nutzer melden sich einmal erneut an. Auch nach jedem Serverneustart ist eine Neuanmeldung erforderlich. Dadurch braucht der Widerruf keine Datenbanktabelle und kann nach einem Neustart nicht verloren gehen. Für zukünftigen Mehrinstanzbetrieb ist eine andere gemeinsame Sitzungsverwaltung erforderlich.
- PIN-Änderung und Kontosperrung werden bei geschützten Anfragen geprüft. Diese Prüfung verwendet den bestehenden app_store-Cache und führt keine neue Abfrage pro Anfrage ein, solange dieser gültig ist. Änderungen außerhalb des laufenden Prozesses können wegen des vorhandenen Caches verzögert sichtbar sein.
- Anmeldeversuche sind pro Konto und Socket-Adresse begrenzt. Proxy-IP-Konfiguration auf Render prüfen; ohne vertrauenswürdige Proxykonfiguration teilen Nutzer unter Umständen den Adressenzähler. Keine beliebigen Forwarding-Header vertrauen.
- Bytegleiche Anhänge werden anhand eines Inhalts-Hashes erkannt. Je neu verarbeitetem Anhang bleibt ein kurzer Marker in der bereits vorhandenen Tabelle; es werden keine Rohdateien gespeichert.
- Bereits vorhandene Viertelstunden-Tagesmengen werden nicht erneut addiert. Widersprüchliche Überschneidungen werden zurückgehalten und im Backplan als Prüfhinweis angezeigt. Neue Artikel/Tage werden weiter verarbeitet. Eine automatische Korrektur alter Zahlen ist bewusst nicht enthalten; bestätigte Korrekturen müssen über ein gesondertes geprüftes Verfahren erfolgen.
- Höchstens 20 kompakte Importwarnungen verbleiben im vorhandenen Modell. Vorhandene Daten werden weder gelöscht noch rückwirkend pauschal neu berechnet.
- Mailimport-Transaktionen verwenden einen reservierten Datenbankclient. Mailimporte laufen innerhalb eines Prozesses nacheinander.

## Nachkontrolle

Healthcheck, Anmeldung, Logout, PIN-Wechsel, zwei geschützte Datenabfragen und einen autorisierten Job prüfen. Ein HTTP-200-Skipped-Ergebnis beweist keinen Import. Bei eingehendem Bericht Datenstand, Warnungen und Artikelwerte kontrollieren. Tatsächliche Push-Neuanmeldung prüfen, wenn Schlüssel rotiert wurden.

Rollback: Ausgangscommit dokumentieren und dessen Code gezielt wieder bereitstellen, falls erforderlich. Veröffentlichte Schlüssel nicht wieder aktivieren. Es gibt keine Datenbankschema-Migration zurückzunehmen. Bereits gespeicherte Hashmarker werden von älterem Code nicht als seine alten Nachrichtenmarker erkannt; deshalb automatischen Mailimport während eines Rollbacks kontrollieren, damit alte additive Logik Berichte nicht erneut zählt.

## Verbleibende Arbeiten

Produktionsquote, Anbietervereinbarungen, vollständige Backups, TLS-Zertifikatsprüfung, mehrkundenfähige Architektur, gemeinsame Cache-/Sitzungsverwaltung, sichere historische Korrekturen, Entfernung einmaliger Reparaturjobs und vollständige rechtliche Verkaufsfreigabe bleiben gesonderte Aufgaben. Dieser erste Patch ist keine pauschale Sicherheitsfreigabe der gesamten App.
