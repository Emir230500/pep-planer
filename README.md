# Arbeitsplan-App

Eine einfache Web-App, damit ein Admin jede Woche einen PEP-Plan als PDF, CSV oder Excel hochladen kann. Mitarbeiter melden sich mit Name und PIN an und sehen nur ihre eigenen Schichten.

## Start

```powershell
npm start
```

Falls `npm start` auf deinem PC nicht direkt funktioniert, installiere Node.js ab Version 18. In Codex kann die App auch mit der mitgelieferten Node-Version gestartet werden:

```powershell
& "C:\Users\edemircan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server.js
```

Dann oeffnen:

```text
http://localhost:3000
```

Test im gleichen WLAN:

```text
http://172.30.14.60:3000
```

Dieser WLAN-Link funktioniert nur, wenn dein PC eingeschaltet ist, die App laeuft und das Netzwerk den Zugriff erlaubt. Fuer Mitarbeiter ausserhalb des WLANs muss die App online gehostet werden.

Admin-Seite:

```text
http://localhost:3000/admin.html
```

Standard-Admin-Passwort in der ersten Version:

```text
admin123
```

Besser mit eigenem Passwort starten:

```powershell
$env:ADMIN_PASSWORD="dein-sicheres-passwort"
npm start
```

## PEP-Plan hochladen

1. In PEP den Wochenplan als PDF drucken/speichern.
2. In der Admin-Seite Datei auswaehlen.
3. Die App versucht Name, Datum, Start, Ende, Abteilung und Pause aus dem PDF zu erkennen.
4. Die Vorschau pruefen.
5. Falls PEP andere Spaltennamen nutzt oder du CSV/Excel hochlaedst, die Zuordnung kurz anpassen:
   - Mitarbeiter
   - Datum
   - Start
   - Ende
   - Abteilung/Aufgabe
   - Pause
6. Plan speichern.
7. Import-Hinweise pruefen, besonders fehlende Pausen und mehrere Abteilungen an einem Tag.
8. Plan veroeffentlichen. Erst danach sehen Mitarbeiter diesen Plan.
9. Neue Mitarbeiter bekommen automatisch eine 4-stellige PIN.

PDF-Erkennung ist nicht so perfekt wie CSV, weil PEP den Druckplan als Layout speichert. Die Vorschau ist deshalb wichtig.

## Beispiel-Datei

Im Browser gibt es auf der Admin-Seite einen Link zu:

```text
http://localhost:3000/sample-pep.csv
```

Diese Datei zeigt das erwartete einfache Format:

```text
Mitarbeiter;Datum;Start;Ende;Abteilung;Pause
Demircan, Emirkan;30.06.2026;08:00;16:00;Next Kurse;00:30
Demircan, Emirkan;01.07.2026;02:00;03:00;Notdienst;00:00
```

## Datenschutz

- Mitarbeiter sehen nach dem Login nur den veroeffentlichten Plan und nur Schichten, die exakt ihrem Namen zugeordnet sind.
- PINs werden nicht im Klartext gespeichert, sondern gehasht.
- Der Admin sollte jedem Mitarbeiter nur seine eigene PIN geben.
- Online sollte die App immer mit HTTPS laufen.
- Das Admin-Passwort muss als Umgebungsvariable gesetzt werden.

## Online stellen

Die App braucht Node.js ab Version 18.

Siehe auch:

```text
ONLINE-STELLEN.md
KOSTENLOS-ONLINE.md
```

Bei einem Node-Hoster wie Render, Railway oder einem kleinen VPS:

```text
Start command: npm start
Environment:
ADMIN_PASSWORD=dein-sicheres-passwort
SESSION_SECRET=langer-zufaelliger-geheimer-text
```

Danach bekommen Mitarbeiter nur den normalen Link zur Startseite. Den Admin-Link und das Admin-Passwort nicht weitergeben.

Die Dateiablage liegt lokal in `data/db.json`. Fuer eine groessere Nutzung sollte spaeter eine richtige Datenbank angebunden werden.
