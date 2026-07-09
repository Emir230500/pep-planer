# Dienstplan-App online stellen

Aktuell laeuft die App lokal auf deinem PC:

```text
http://localhost:3000
```

`localhost` funktioniert nur auf deinem eigenen Computer. Mitarbeiter koennen damit nicht vom Handy zugreifen.

## Schnelltest im gleichen WLAN

Wenn dein PC und das Handy im gleichen WLAN sind, kann die App testweise ueber die Netzwerkadresse deines PCs erreichbar sein:

```text
http://172.30.14.60:3000
```

Wichtig:

- Der PC muss eingeschaltet bleiben.
- Die App muss laufen.
- Windows-Firewall oder Firmennetzwerk koennen den Zugriff blockieren.
- Das ist keine gute Dauerloesung fuer Mitarbeiter ausserhalb des WLANs.

## Richtige Online-Loesung

Damit alle Mitarbeiter vom Handy aus zugreifen koennen, brauchst du einen oeffentlichen Webserver oder Node-Hoster.

Geeignete einfache Wege:

1. Node-Hoster wie Render oder Railway
2. Kleiner VPS, z. B. Hetzner
3. Firmenserver mit HTTPS

Der Hoster muss Node.js ab Version 18 unterstuetzen.

## Einstellungen beim Hoster

Startbefehl:

```text
npm start
```

Umgebungsvariablen:

```text
ADMIN_PASSWORD=ein-sicheres-admin-passwort
SESSION_SECRET=ein-langer-zufaelliger-geheimer-text
PORT=3000
```

Wenn der Hoster selbst einen Port vorgibt, wird dieser automatisch uebernommen.

## Datenschutz

- Mitarbeiter bekommen nur den normalen Link zur Startseite.
- Den Admin-Link `/admin.html` und das Admin-Passwort nicht weitergeben.
- Immer HTTPS verwenden.
- Jeder Mitarbeiter sieht nach Login nur den veroeffentlichten Plan und nur die eigenen Schichten.
- Die Datei `data/db.json` enthaelt Plaene und Mitarbeiter-PIN-Daten. Beim Hoster muss dieser Speicher dauerhaft gesichert sein.

## Empfehlung

Fuer den ersten echten Einsatz:

1. App bei einem Node-Hoster hochladen.
2. Sicheres Admin-Passwort setzen.
3. HTTPS-Link testen.
4. Einen Plan hochladen und veroeffentlichen.
5. Mit einem Mitarbeiter-Login am Handy testen.
6. Erst danach den Link an alle Mitarbeiter schicken.
