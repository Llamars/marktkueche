# Marktküche auf einem eigenen Server (Hetzner Cloud)

> **Nur für die Server-Variante.** Die normale Marktküche läuft komplett auf dem Gerät und braucht keinen Server –
> dafür reicht ein kostenloser Webspace für statische Seiten (siehe README). Diese Anleitung ist für später, falls
> gemeinsame Haushalte mit Live-Abgleich, automatischer Angebotsabruf oder KI-Funktionen gewünscht sind.

Ergebnis: Die App läuft unter `https://deine-domain.de`, mit HTTPS-Zertifikat, Konten nur auf Einladung und
täglicher Sicherung. Dein Mac muss dafür nicht laufen.

**Aufbau:** Zwei Docker-Container auf einem kleinen Linux-Server.

- **app:** Marktküche selbst. Alle Daten liegen im Ordner `data/` auf dem Server.
- **caddy:** Webserver davor. Holt und erneuert das HTTPS-Zertifikat automatisch (Let's Encrypt).

| Datei | Zweck |
|---|---|
| `Dockerfile` | baut den App-Container |
| `compose.yaml` | startet App und Caddy zusammen |
| `Caddyfile` | HTTPS und Weiterleitung an die App |
| `.env.production.example` | Vorlage für die Einstellungen (wird zu `.env`) |

## Was du brauchst

- Ein Konto bei Hetzner (hetzner.com → Cloud). Die Anmeldung und Bezahlung machst du selbst.
- Eine **Domain** oder Subdomain, z. B. `marktkueche.deinname.de`. Eine Subdomain einer vorhandenen Domain reicht.
- Einen **SSH-Schlüssel** auf dem Mac. Prüfen, ob schon einer existiert:

```bash
ls ~/.ssh/id_ed25519.pub
```

Falls nicht, einen anlegen:

```bash
ssh-keygen -t ed25519
```

**Kosten:** wenige Euro im Monat für den kleinsten Server, die Hetzner-Sicherungen kosten derzeit 20 % des Serverpreises
extra, dazu die Domain. Aktuelle Preise stehen auf hetzner.com/cloud.

## 1. Server anlegen

In der Hetzner Cloud Console: Projekt anlegen → **Server hinzufügen**.

1. **Standort:** Falkenstein oder Nürnberg (Deutschland).
2. **Image:** unter „Apps“ **Docker CE**. Alternativ Ubuntu 24.04, dann Docker in Schritt 3 installieren.
3. **Typ:** die kleinste Shared-vCPU-Variante; 2 vCPU und 2–4 GB RAM reichen. x86 und Arm funktionieren beide.
4. **SSH-Schlüssel:** den Inhalt von `~/.ssh/id_ed25519.pub` einfügen. Dann gibt es kein Root-Passwort per E-Mail.
5. **Backups:** anhaken (tägliche Kopie des ganzen Servers, 7 Stück).
6. **Firewall:** neue Firewall mit eingehend TCP 22, 80, 443 und UDP 443 erlauben.
7. Erstellen und die **IPv4-Adresse** notieren (im Folgenden `SERVER-IP`).

## 2. Domain auf den Server zeigen lassen

Beim Anbieter deiner Domain einen **A-Eintrag** anlegen: `marktkueche.deinname.de` → `SERVER-IP`. Optional zusätzlich
einen AAAA-Eintrag mit der IPv6-Adresse. Nach einigen Minuten prüfen:

```bash
dig +short marktkueche.deinname.de
```

Es muss die Server-IP erscheinen, sonst bekommt Caddy kein Zertifikat.

## 3. Server vorbereiten

Vom Mac aus anmelden:

```bash
ssh root@SERVER-IP
```

Auf dem Server Updates einspielen:

```bash
apt update && apt upgrade -y
```

Prüfen, ob Docker da ist (beim Image „Docker CE“ schon installiert):

```bash
docker compose version
```

Nur falls Docker fehlt (Ubuntu-Image), mit dem offiziellen Skript installieren:

```bash
curl -fsSL https://get.docker.com | sh
```

## 4. App hochladen (vom Mac)

Im Terminal **auf dem Mac** (nicht auf dem Server). Kopiert den Code ohne `node_modules`, Build und deine lokalen Daten:

```bash
rsync -av --exclude node_modules --exclude dist --exclude server/storage --exclude .env --exclude .claude "/Users/ts/Projekte/Recipe to go/" root@SERVER-IP:/opt/marktkueche/
```

### Optional: deine bisherigen Daten mitnehmen

Damit dein Konto, Haushalt, Favoriten und Plan erhalten bleiben: zuerst den lokalen Server beenden (`Ctrl + C` im
Terminal mit `npm run dev`), dann den Datenordner kopieren:

```bash
rsync -av "/Users/ts/Projekte/Recipe to go/server/storage/" root@SERVER-IP:/opt/marktkueche/data/
```

Erfundene Beispielangebote werden auf dem Server beim Start automatisch entfernt (`DEMO_OFFERS=false`).

## 5. Einstellungen

Wieder auf dem Server (`ssh root@SERVER-IP`):

```bash
cd /opt/marktkueche && cp .env.production.example .env
```

```bash
nano .env
```

- `DOMAIN`: deine Domain, z. B. `marktkueche.deinname.de`.
- `REGISTRATION=invite`: neue Konten nur mit Einladungscode eines Haushalts. Das allererste Konto auf einem leeren
  Server geht ohne Code – lege es gleich nach dem Start selbst an.
- `SIGNUP_CODE`: optional. Damit können z. B. Freunde einen *eigenen* Haushalt anlegen. Einen zufälligen Code erzeugt:

```bash
openssl rand -hex 8 | tr a-f A-F
```

- `ANTHROPIC_API_KEY`: optional. Alle KI-Funktionen laufen dann auf deine Rechnung.

Speichern mit `Ctrl + O`, `Enter`, beenden mit `Ctrl + X`.

## 6. Starten

Der App-Container läuft nicht als root und braucht deshalb Schreibrechte auf `data/`:

```bash
mkdir -p data && chown -R 1000:1000 data
```

```bash
docker compose up -d --build
```

Der erste Build dauert ein paar Minuten. Status und Logs:

```bash
docker compose ps
```

```bash
docker compose logs -f app
```

Erwartet: `Marktküche-Server läuft … Registrierung: nur mit Einladung`. Dann `https://deine-domain` im Browser öffnen.

**Leute einladen:** In der App unter **Profil → Haushalt** den Einladungslink teilen. Wer den Link öffnet, kann ein Konto
anlegen und landet direkt in deinem Haushalt.

## 7. Updates einspielen

Nach Änderungen am Code: Schritt 4 (rsync, ohne „Daten mitnehmen“!) wiederholen, dann auf dem Server:

```bash
cd /opt/marktkueche && docker compose up -d --build
```

Die Daten in `data/` bleiben dabei erhalten.

## 8. Sicherungen

Drei Ebenen, von schnell bis sicher:

1. **Täglich in der App:** eine konsistente Kopie der Datenbank plus Angebotsdateien in `data/backups/` (Ordnername =
   Datum und Uhrzeit in UTC). Die letzten 14 bleiben (`BACKUP_KEEP`). Sofort eine Sicherung anlegen:

```bash
docker compose exec app npm run backup
```

2. **Hetzner-Backups:** tägliche Kopie des ganzen Servers (Schritt 1.5). Wiederherstellen in der Cloud Console.
3. **Kopie außerhalb des Servers:** gelegentlich vom Mac aus herunterladen:

```bash
rsync -av root@SERVER-IP:/opt/marktkueche/data/backups/ ~/Backups/marktkueche/
```

### Wiederherstellen

Auf dem Server, `STAND` durch einen Ordnernamen aus `data/backups` ersetzen:

```bash
cd /opt/marktkueche && docker compose stop app
```

```bash
cp data/backups/STAND/marktkueche.db data/ && cp data/backups/STAND/*.json data/ && rm -f data/marktkueche.db-wal data/marktkueche.db-shm
```

```bash
chown -R 1000:1000 data && docker compose start app
```

## Fehlersuche

- **Kein HTTPS / Zertifikatsfehler:** Zeigt die Domain auf die Server-IP (Schritt 2)? Sind Port 80 und 443 in der
  Firewall offen? `docker compose logs caddy` zeigt den Grund.
- **„502 Bad Gateway“:** Die App läuft nicht. `docker compose logs app` ansehen.
- **„Permission denied“ in den App-Logs:** `chown -R 1000:1000 data` vergessen.
- **Build bricht ab:** Den Docker-Build habe ich nicht lokal getestet, weil auf dem Mac kein Docker installiert ist.
  Getestet ist der Produktionsmodus mit Node (Registrierung, Sicherung, Health-Check, sauberes Beenden). Bei
  einem Fehler die letzten Zeilen von `docker compose up --build` mitschicken.

## Bevor die App öffentlich wird

Für Familie und Freunde reicht das oben. Wird die App für Fremde angeboten (z. B. mit offenem `SIGNUP_CODE` im Netz):

- **Impressum** und **Datenschutzerklärung** (Konten speichern E-Mail-Adressen; Hetzner als Auftragsverarbeiter,
  dort einen AV-Vertrag abschließen).
- Angebote nur aus offiziellen oder lizenzierten Quellen (siehe README).
- KI-Kosten begrenzen (Schlüssel weglassen oder als Premium-Funktion).
