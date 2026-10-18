# myfood – Prototyp Lebensmittelbestand (Design)

Stand: 2026-10-18

## Ziel

Ein schneller, funktionierender Web-Prototyp, mit dem **ein Haushalt** (mehrere Personen, je eigenes Handy) seinen **Lebensmittelbestand** gemeinsam pflegt. Kernfunktion ist die Bestandsaufnahme: schnell eintragen, **noch schneller austragen**, übersichtlich sehen, was da ist, was bald abläuft und was fehlt.

Erfolgskriterium: Der Haushalt nutzt die App zwei Wochen lang im Alltag, und der angezeigte Bestand stimmt im Wesentlichen mit dem Kühlschrank überein.

## Nicht im Umfang (später)

- MHD aus Barcode (GS1-2D-Codes) oder per Texterkennung – MHD wird von Hand eingetragen
- Rezepte, Einkaufszettel (inkl. Historie und Kopieren)
- Gespeicherte eigene Dashboard-Ansichten (Specs folgen)
- Mehrere Haushalte, Selbstregistrierung, Veröffentlichung
- Lagerort, Einheiten (g/ml), Offline-Modus, Push-Erinnerungen, Installation als App (PWA-Manifest)

## Architektur

- **Frontend:** Vite + React + TypeScript, einfaches CSS. Keine UI- oder Router-Bibliothek; die drei Tabs sind ein React-State.
- **Backend:** Supabase (Postgres, Auth, Realtime). Kein eigener Server.
- **Hosting:** GitHub Pages, Deployment per GitHub Action. Supabase-URL und öffentlicher (anon) Schlüssel kommen als Build-Variablen aus GitHub-Secrets; lokal aus `.env.local` (nicht eingecheckt).
- **Barcode:** browsereigene `BarcodeDetector`-API, wo vorhanden; sonst das Paket `barcode-detector` (zxing-wasm) als Ersatz (nötig für iOS Safari). Kamera über `getUserMedia`.
- **Produktdaten:** Open Food Facts API v2, eine Abfrage pro unbekanntem Barcode, nur Felder für Name und Kategorie-Tags.

## Datenmodell

### `products`

| Spalte | Typ | Regeln |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | Pflicht |
| `barcode` | text | optional, eindeutig |
| `category` | text | Pflicht, Wert aus der festen Kategorieliste, Standard `Sonstiges` |
| `min_stock` | int | ≥ 0, Standard 0 |
| `created_at` | timestamptz | Standard `now()` |

Ein Produkt bleibt bestehen, auch wenn kein Bestand mehr da ist.

### `stock`

| Spalte | Typ | Regeln |
|---|---|---|
| `id` | uuid | PK |
| `product_id` | uuid | FK → `products`, `on delete cascade` |
| `quantity` | int | ≥ 1 |
| `best_before` | date | optional |
| `fill_level` | text | `voll` \| `angebrochen` \| `fast_leer`, Standard `voll` |
| `planned_for` | text | optional, Freitext (z. B. „Lasagne Sonntag“) |
| `created_at` | timestamptz | Standard `now()` |

Eindeutig: (`product_id`, `best_before`) mit `NULLS NOT DISTINCT`. Gleiches Produkt mit gleichem MHD wird zusammengelegt (Menge erhöht), anderes MHD ergibt einen neuen Eintrag.

### Kategorien (fest im Code)

Milchprodukte, Obst & Gemüse, Fleisch & Fisch, Brot & Backwaren, Tiefkühl, Vorrat & Konserven, Getränke, Snacks & Süßes, Gewürze & Saucen, Sonstiges.

### Datenbankfunktionen

- `add_stock(product_id, quantity, best_before)`: Upsert auf (`product_id`, `best_before`); bei vorhandenem Eintrag wird `quantity` erhöht. Gibt die Zeile zurück.
- `consume(stock_id)`: verringert `quantity` um 1, setzt `fill_level` auf `voll`; bei 0 wird der Eintrag gelöscht. Atomar in einem Schritt. Gibt die neue Menge zurück (0 = gelöscht) und den Zustand vorher (für Rückgängig).
- `advance_fill(stock_id)`: `voll` → `angebrochen` → `fast_leer`; aus `fast_leer` heraus wie `consume`.

### Zugriff

- Supabase Auth mit E-Mail + Passwort. Selbstregistrierung ist abgeschaltet; Konten werden im Supabase-Dashboard angelegt.
- RLS auf beiden Tabellen: Rolle `authenticated` darf lesen und schreiben, `anon` nichts.
- Realtime ist für beide Tabellen aktiviert; das Dashboard abonniert Änderungen.

## Screens

Unten eine Tab-Leiste: **Bestand · Scannen · Hinzufügen**. Vor dem Login nur ein Login-Formular.

### Bestand (Dashboard)

- Oben **„Wird knapp“**: alle Produkte mit `min_stock > 0` und Summe der `quantity` < `min_stock` (auch Summe 0).
- Darunter die Bestandsliste. Standard: gruppiert nach Kategorie, innerhalb sortiert nach MHD aufsteigend (ohne MHD ans Ende).
- Bedienelemente: Suchfeld (Produktname), Kategorie-Filter, Sortierung (MHD / Name / zuletzt hinzugefügt), Gruppierung (Kategorie / keine). Zustand nur im Speicher.
- Zeile: Name, Menge, MHD, Füllstand-Symbol (antippbar), „Geplant für“ falls gesetzt, Button **−1**.
- Markierung: MHD in der Vergangenheit rot; MHD heute bis in 3 Tagen gelb.
- Tippen auf die Zeile öffnet das Bearbeiten-Formular: alle Felder von Bestandseintrag und Produkt (inkl. Mindestbestand), Löschen des Eintrags, Löschen des Produkts (entfernt auch dessen Bestand; mit Bestätigungsdialog).

### Scannen

Umschalter **Hinzufügen | Verbrauchen**, darunter das Kamerabild. Nach jedem Vorgang bleibt die Kamera aktiv. Derselbe Barcode wird für 2 Sekunden nicht erneut verarbeitet, um Doppel-Scans zu vermeiden.

- **Verbrauchen:** Barcode → Produkt → Bestandseintrag mit dem frühesten MHD (ohne MHD zuletzt) → `consume`. Meldung „<Name> −1 (noch n)“ mit **Rückgängig** (ca. 5 s).
- **Hinzufügen:** Barcode → Produkt in `products` vorhanden? Dann übernehmen. Sonst Open Food Facts abfragen und Name und Kategorie vorschlagen. Kurzformular: Name, Kategorie, Menge (Standard 1), MHD (`<input type="date">`), Speichern. Neues Produkt wird mit Barcode angelegt, dann `add_stock`.

### Hinzufügen (manuell)

Dasselbe Formular ohne Scan. Das Namensfeld schlägt vorhandene Produkte vor (Groß-/Kleinschreibung egal), damit keine Duplikate entstehen. Wird ein vorhandenes gewählt, wird kein neues Produkt angelegt.

## Austragen

| Weg | Wirkung |
|---|---|
| −1-Button | `consume`: Menge −1, Füllstand zurück auf `voll` |
| Füllstand antippen | `advance_fill`: voll → angebrochen → fast leer → nächstes Tippen = `consume` |
| Scan „Verbrauchen“ | `consume` beim Eintrag mit frühestem MHD |

Alle drei zeigen eine Meldung mit **Rückgängig**. Rückgängig stellt den vorherigen Zustand des Eintrags wieder her (Menge, Füllstand, MHD, „Geplant für“), auch wenn er gelöscht wurde.

## Open Food Facts → Kategorie

Eine kleine Stichwort-Tabelle bildet `categories_tags` (z. B. `en:dairies`, `en:frozen-foods`) auf die 10 Kategorien ab. Erster Treffer gewinnt, sonst `Sonstiges`. Name: `product_name_de`, sonst `product_name`, sonst leer.

## Fehlerfälle

| Fall | Verhalten |
|---|---|
| Kamera verweigert / nicht verfügbar | Hinweis + Knopf „Manuell eintragen“ |
| Barcode nicht bei Open Food Facts / Netzfehler | Formular mit leerem Namen; Barcode wird mitgespeichert, beim nächsten Scan ist das Produkt bekannt |
| Speichern schlägt fehl | Fehlermeldung, Formularinhalt bleibt erhalten |
| Verbrauchen-Scan, Produkt unbekannt oder nicht im Bestand | Meldung „Nicht im Bestand“, keine Änderung |
| Sitzung abgelaufen | zurück zum Login |

## Tests

- **Vitest** für reine Logik: Kategorie-Zuordnung, Auswertung der Open-Food-Facts-Antwort, Sortieren/Gruppieren/Filtern, „Wird knapp“-Berechnung, MHD-Markierung.
- **Manuell** auf iPhone (Safari) und Android (Chrome): Login, Scan Hinzufügen/Verbrauchen, Live-Sync zwischen zwei Geräten.

## Einmalige Einrichtung durch den Nutzer

1. Supabase-Projekt anlegen (Region EU, z. B. Frankfurt).
2. Selbstregistrierung abschalten, Konten für die Haushaltsmitglieder anlegen.
3. Projekt-URL und anon-Schlüssel lokal in `.env.local` und als GitHub-Secrets hinterlegen. Der `service_role`-Schlüssel wird nirgends im Frontend verwendet.

## Aufwand

Etwa 5–8 Personentage bis zum benutzbaren Prototyp.
