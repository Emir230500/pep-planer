# Kostenlos online stellen

Die App ist fuer Render vorbereitet. Render bietet laut aktueller Preisseite einen kostenlosen Web-Service-Typ fuer Node.js an. Der kostenlose Plan ist gut zum Starten und Testen.

Wichtig: Kostenloses Hosting hat Grenzen. Dauerhafter Dateispeicher kann je nach Hoster nicht garantiert oder kostenpflichtig sein. Die App speichert aktuell in:

```text
data/db.json
```

Fuer echten Dauereinsatz sollte spaeter eine richtige Datenbank angebunden werden.

## Variante A: Render kostenlos

1. Auf https://render.com registrieren oder anmelden.
2. Neues Projekt/Web Service erstellen.
3. Diesen App-Ordner ueber GitHub hochladen oder als Repository verbinden.
4. Bei Render als Service auswaehlen:

```text
Runtime: Node
Build Command: npm install
Start Command: npm start
Plan: Free
```

5. Umgebungsvariablen setzen:

```text
ADMIN_PASSWORD=dein-sicheres-admin-passwort
SESSION_SECRET=ein-langer-zufaelliger-text
```

6. Deploy starten.
7. Render gibt dir danach einen HTTPS-Link, z. B.:

```text
https://arbeitsplan-app.onrender.com
```

8. Diesen Link am Handy testen.
9. Plan im Admin hochladen und veroeffentlichen.
10. Mitarbeiter bekommen nur den normalen Startseiten-Link.

## Was ich nicht ohne dich machen kann

Ich kann den Dienst nicht alleine online freischalten, weil dafuer dein Render/GitHub-Account gebraucht wird.

Ich kann aber vorbereiten:

- App-Dateien
- Render-Konfiguration
- Startbefehl
- Sicherheitsvariablen
- Anleitung

## Empfehlung fuer echte Nutzung

Fuer den Anfang reicht Render Free zum Testen. Wenn der Plan wirklich dauerhaft jede Woche fuer alle Mitarbeiter erreichbar sein soll, nimm spaeter einen kleinen bezahlten Server oder eine Datenbank, damit gespeicherte Plaene nicht verloren gehen.
