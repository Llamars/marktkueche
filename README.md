# Marktküche

Rezeptvorschläge aus den aktuellen Angeboten deiner Supermärkte – mit Wochenplan, Einkaufswagen zum Abhaken,
Kochmodus und Nährwerten pro Person (in % des persönlichen Tagesbedarfs).

## Starten

Die App läuft komplett im Browser – ohne Konto und ohne Server. Alle Daten (Plan, Einkaufsliste, Favoriten,
Angebote, Einstellungen) liegen nur auf dem jeweiligen Gerät.

Voraussetzung zum Entwickeln: Node.js ≥ 22.13.

```bash
npm install
npm run dev             # öffnet http://localhost:5173
```

Für den Betrieb wird nur gebaut und der Ordner `dist/` auf einen beliebigen Webspace für statische Seiten gelegt
(z. B. Netlify, Cloudflare Pages, GitHub Pages). Dort liegen keine Daten, nur die App selbst.

```bash
npm run build
```

Enthalten: 171 Grundrezepte (77 Gerichte inkl. Frühstück, viele als Familie mit austauschbarer Hauptzutat) mit Fotos,
Vorschläge nach Angeboten, Wochenplan, Einkaufswagen, Kochmodus, Nährwerte, Favoriten, Müsli-Baukasten und selbst
eingetragene Angebote. Beim ersten Start gibt es erfundene Beispielangebote zum Ausprobieren.

## Online über GitHub (kostenlos)

Die App liegt auf **GitHub Pages**, der Workflow `.github/workflows/seite.yml` veröffentlicht sie bei jeder Änderung neu.
**Jeden Sonntag um 3 Uhr MEZ** (02:00 UTC, mit Nachlauf um 6 Uhr) ruft er vorher die Angebote ab (`scripts/angebote-abrufen.ts`):

- **Aldi Süd:** offizieller Wochenprospekt (PDF, 40–50 MB). Er wird in Teile zerlegt und von der KI ausgelesen –
  standardmäßig mit **Gemini im kostenlosen Tarif** (Google darf Anfragen im Gratis-Tarif zur Verbesserung nutzen).
- **Alnatura:** Angebotsseite, ohne KI.
- **REWE, Lidl, Netto, Penny:** Prospekt-PDFs von discounto.de (robots.txt erlaubt `/Prospekte/`; höchstens ein Abruf
  pro Woche und Markt, mit Pausen). discounto zeigt die bundesweiten Ausgaben – regionale Abweichungen sind möglich.
- **EDEKA** (regional, Südwest) gibt es dort nicht; kaufDA sperrt automatische Abrufe. Dafür in der App
  **Prospekt-Foto** nutzen (die KI liest abfotografierte Seiten aus).

Die Angebote liegen **verschlüsselt** in `public/daten/angebote.json` (AES-256-GCM). Lesbar sind sie nur mit dem
**Familien-Schlüssel**, den man einmal in der App einträgt (Profil → Familien-Schlüssel) oder per Einladungslink bekommt.

Einrichten (einmalig, im Projektordner):

1. Kostenlosen Gemini-Schlüssel erstellen: https://aistudio.google.com/apikey
2. `gh secret set GEMINI_API_KEY` und den Schlüssel einfügen.
3. Familien-Schlüssel erzeugen und hinterlegen: `openssl rand -hex 12` ausgeben lassen, dann `gh secret set DATA_KEY`
   und den Wert einfügen. Denselben Wert in der App eintragen.
4. Abruf sofort testen: `gh workflow run seite.yml` – oder einfach bis Sonntag warten.

Optional statt Gemini: `ANTHROPIC_API_KEY` oder `OPENAI_API_KEY` als Secret und die Variable `AI_PROVIDER`
(`anthropic` bzw. `openai`) setzen, Modell über `AI_MODEL`.

## KI in der App (optional)

Unter **Profil → KI** lässt sich ein eigener Schlüssel eintragen (Gemini kostenlos, Claude oder OpenAI). Er bleibt auf
dem Gerät und wird direkt an den gewählten Anbieter geschickt. Damit gehen: **Rezept per Link importieren** (Chefkoch,
Blogs, Instagram – bei angemeldeten Beiträgen den Text einfügen), **Prospekt-Fotos auslesen** und **neue Ideen** aus den
Angeboten. Unbekannte Zutaten importierter Rezepte werden als eigene Zutat ohne Nährwerte angelegt.

## Teilen

- **Rezept teilen** (Teilen-Knopf auf der Rezeptseite) und **Einkaufsliste teilen** (Einkaufswagen → Teilen → Link zum
  Übernehmen) erzeugen einen Link. Die Daten stecken komprimiert im Link hinter dem `#` und gehen an keinen Server.
- Wer den Link öffnet, sieht eine Vorschau und entscheidet: Rezept ansehen oder einplanen, die Gerichte in den eigenen
  Wochenplan übernehmen oder nur die Artikel in die eigene Einkaufsliste.
- Öffnet sich der Link im Browser statt in der installierten App, unter **Profil → Geteilten Link übernehmen** einfügen.
- **Als Text** schickt die Liste zum Lesen an jemanden ohne die App.

## Daten & Sicherung

Unter **Profil → Daten & Sicherung** lässt sich alles als Datei sichern und wieder laden (auch zum Umziehen auf ein neues
Handy). Auf dem iPhone die App über „Teilen → Zum Home-Bildschirm“ ablegen; sonst kann Safari die Daten nach längerer
Nichtnutzung löschen. Ein kleiner Offline-Speicher (`public/sw.js`) sorgt dafür, dass die App auch ohne Netz startet.

## Optional: Server-Variante

Im Ordner `server/` liegt weiterhin die frühere Server-Variante mit Konten, gemeinsamen Haushalten, automatischem
Angebotsabruf und KI-Funktionen (`npm run dev:mit-server`, Betrieb mit Docker siehe [DEPLOY.md](DEPLOY.md)). Die
Geräte-Version nutzt sie nicht.

## Einkaufen bei einem Markt

Über die Leiste **„Einkaufen bei“** (auf „Entdecken“, im Wochenplan und im Einkaufswagen) wählst du einen oder mehrere Märkte aus.
Dann zählen nur deren Angebote: Vorschläge, automatischer Wochenplan, KI-Rezepte und die Einkaufsliste richten sich
danach, z. B. „nur No Frills“. Ein Tipp auf einen Markt wählt nur diesen; „Alle Märkte“ hebt die Auswahl auf.

## Frühstück & Müsli-Baukasten

Auf „Entdecken“ schaltet **Frühstück** auf Frühstücksrezepte (Müsli, Porridge, Joghurt-Bowl, Bircher, Granola,
Chia-Pudding …) und zeigt den **Müsli-Baukasten**: die aktuellen Angebote für Flocken, ungesalzene Nüsse, Samen und
Kerne, Obst, Trockenobst sowie Milch, Joghurt und Haferdrink. Einzelne Packungen lassen sich direkt in den Einkaufswagen
legen, wo sie beim passenden Markt stehen. Gesalzene oder überzogene Nüsse werden bei der Angebotszuordnung
ausgeschlossen. Frühstück lässt sich im Wochenplan als eigene Mahlzeit planen, auch für mehrere Tage auf einmal.

## Angebote

- **Geräte-Version:** Angebote trägst du unter **Angebote → Angebot eintragen** selbst ein (Produkt, Preis, Menge). Die
  App ordnet sie automatisch einer Zutat zu; danach richten sich Vorschläge, Preise und der Müsli-Baukasten.
- **Server-Variante:** zusätzlich automatischer Abruf aus offiziellen, frei zugänglichen Quellen (Alnatura, Aldi Süd)
  und Prospekt-Auslesen per KI. REWE, EDEKA, Lidl, Netto und Penny sperren automatische Abrufe technisch. Für eine
  öffentliche App wären lizenzierte Angebotsdaten (z. B. Offerista, Bonial, marktguru) der saubere Weg.

## Aufbau

| Ordner | Inhalt |
|---|---|
| `shared/data/ingredients.json` | Zutatenkatalog: BLS-Code, Einheiten, Richtpreise, Allergene, Suchbegriffe für Angebote |
| `shared/data/recipes.json` | Grundrezepte (4 Erwachsenenportionen) |
| `shared/data/recipes-familien.json` | Rezeptfamilien: ein Grundrezept, mehrere austauschbare Hauptzutaten (`variants`) |
| `shared/data/recipes-mehr.json` | Weitere Grundrezepte für häufige Angebotszutaten |
| `shared/data/recipes-fruehstueck.json` | Frühstücksrezepte mit Müsli-Zutaten; Gruppen des Müsli-Baukastens in `shared/breakfast.ts` |
| `shared/references.ts` | Referenzwerte (DGE/ÖGE, NASEM, EU-LMIV, Health Canada, WHO, EFSA, SACN) und Quellen |
| `shared/logic.ts` | Angebotszuordnung, Preise, Vorschläge, automatische Wochenplanung, Einkaufswagen |
| `shared/recipes.ts` | Rezepte ausrollen (Varianten) und Nährwerte berechnen |
| `shared/data/bls-subset.json` | Nährwerte der Katalog-Zutaten aus dem BLS (neu erzeugen mit `npm run data:bls`) |
| `src/local/` | Datenhaltung im Browser (localStorage) |
| `src/lib/share.ts` | Teilen per Link: Kodieren, Prüfen, Übernehmen |
| `shared/ai.ts`, `shared/aiTasks.ts` | KI-Anbindung (Gemini, Claude, OpenAI) und Aufgaben: Prospekt auslesen, Rezept importieren, Ideen |
| `shared/crypto.ts` | Verschlüsselung der abgerufenen Angebote |
| `scripts/angebote-abrufen.ts` | Wöchentlicher Abruf (GitHub Action) |
| `server/lib/quellen.ts` | Angebotsquellen (Aldi Süd, Alnatura, discounto.de) |
| `src/` | React-App (Vite, Tailwind) |
| `server/` | optionale Server-Variante: Konten und Haushalte, Live-Abgleich, automatische Angebotsquellen, Rezept-Import, KI |

## Daten & Lizenzen

- Nährwerte: Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0 – Deutsche Nährstoffdatenbank.
  DOI 10.25826/Data20251217-134202-0, Lizenz CC BY 4.0. Auszug in `server/data/bls_4_0_compact.json`.
- Fotos der Grundrezepte: Unsplash (Unsplash-Lizenz).
- Angebote: Die Beispielangebote sind fiktiv. Supermärkte bieten keine offizielle Angebots-Schnittstelle; echte Angebote
  kommen über die automatischen Quellen (siehe oben), per Prospekt-Upload oder manuell in die App.
- Richtpreise sind Schätzungen (Discounter-Niveau Deutschland, Herbst 2026); für Toronto und Zürich grob umgerechnet.
