# myfood – Einkaufszettel (Design)

Stand: 2026-10-18 · baut auf `2026-10-18-bestand-prototyp-design.md` auf

## Ziel

Ein gemeinsamer Einkaufszettel für den Haushalt, eng verbunden mit dem Bestand: Was knapp wird, landet mit einem Tipp auf dem Zettel; was gekauft wurde, wird beim Abschließen mit Menge und MHD in den Bestand gebucht. Abgeschlossene Einkäufe bleiben im Archiv und lassen sich in den aktuellen Zettel kopieren.

Erfolgskriterium: Ein kompletter Wocheneinkauf (Zettel füllen, im Laden zu zweit abhaken, zu Hause abschließen) funktioniert ohne Umweg über Scannen oder Hinzufügen, und der Bestand stimmt danach.

## Nicht im Umfang (später)

- Rezepte (nur vorbereitet: Quick-Add ruft später `add_to_list` je Zutat auf)
- Mehrere parallele Zettel, Sortierung nach Laden/Gang, Preise
- Teilen per Messenger, Löschen alter Zettel aus dem Archiv
- Einheiten (g/ml) – Mengen sind Stück/Packungen wie im Bestand

## Datenmodell

Neue SQL-Datei `supabase/2026-10-18-einkaufszettel.sql`, einmalig im Supabase SQL Editor auszuführen (die bestehende `schema.sql` bleibt unverändert). Gleiche Konventionen wie dort: `public.`-qualifiziert, RLS „authenticated darf alles, anon nichts“, explizite Grants, Funktionen mit `set search_path = ''`, beide Tabellen in `supabase_realtime`.

### `shopping_lists`

| Spalte | Typ | Regeln |
|---|---|---|
| `id` | uuid | PK |
| `created_at` | timestamptz | Standard `now()` |
| `finished_at` | timestamptz | `null` = offen |

Höchstens ein offener Zettel: eindeutiger Teilindex auf `(finished_at is null) where finished_at is null`.

### `shopping_items`

| Spalte | Typ | Regeln |
|---|---|---|
| `id` | uuid | PK |
| `list_id` | uuid | FK → `shopping_lists`, `on delete cascade` |
| `product_id` | uuid | optional, FK → `products`, `on delete set null` |
| `name` | text | Pflicht, nicht leer; bei Produkten Kopie des Produktnamens, sonst der Freitext |
| `quantity` | int | ≥ 1, Standard 1 |
| `checked` | boolean | Standard `false` |
| `created_at` | timestamptz | Standard `now()` |

Ein Produkt steht pro Zettel höchstens einmal: eindeutiger Teilindex auf `(list_id, product_id) where product_id is not null`. Freitext-Duplikate (gleicher Name, Groß-/Kleinschreibung egal) verhindern die Funktionen.

`name` bleibt bei gelöschten Produkten erhalten, der Eintrag wird damit zu Freitext und das Archiv bleibt lesbar.

### Datenbankfunktionen

- `open_list()` → uuid des offenen Zettels; legt ihn an, falls keiner existiert. Gleichzeitige Aufrufe erzeugen dank Teilindex nur einen Zettel.
- `add_to_list(p_product_id uuid, p_name text, p_quantity int default 1)` → die Zeile. Fügt in den offenen Zettel ein (legt ihn bei Bedarf an). Mit Produkt: steht es schon drauf, wird `quantity` erhöht. Ohne Produkt: steht ein Freitext mit gleichem Namen (ohne Groß-/Kleinschreibung, getrimmt) schon drauf, wird dessen `quantity` erhöht.
- `copy_list(p_from uuid)` → Anzahl übernommener Einträge. Übernimmt alle Einträge des alten Zettels unabgehakt in den offenen; was schon draufsteht (gleiches Produkt bzw. gleicher Freitext), wird übersprungen.
- `finish_list(p_list uuid, p_bookings jsonb)` → Anzahl gebuchter Einträge. `p_bookings` ist ein Array `[{ "item_id": uuid, "quantity": int, "best_before": "YYYY-MM-DD" | null }]` mit genau den Einträgen, die in den Bestand sollen. In einer Transaktion:
  1. Zettel sperren; ist er schon abgeschlossen, Fehler „Dieser Einkauf wurde schon abgeschlossen“.
  2. Je Buchung: Eintrag muss zu diesem Zettel gehören und abgehakt sein. Produkt bestimmen: `product_id` des Eintrags; bei Freitext ein vorhandenes Produkt mit gleichem Namen (ohne Groß-/Kleinschreibung), sonst neues Produkt mit diesem Namen in „Sonstiges“. Dann `add_stock(produkt, quantity, best_before)`.
  3. `finished_at = now()`, neuen offenen Zettel anlegen, nicht abgehakte Einträge auf den neuen Zettel verschieben. Das Archiv enthält damit genau das Gekaufte.

## Screens

Tab-Leiste: **Bestand · Einkauf · Scannen · Hinzufügen**.

### Einkaufszettel

- **Eingabe oben:** Textfeld mit Vorschlägen aus vorhandenen Produkten (`datalist`) und **+**. Exakter Treffer (ohne Groß-/Kleinschreibung) auf ein Produkt → Produkt-Eintrag, sonst Freitext. Menge 1.
- **„Wird knapp“** (nur wenn nicht leer): Produkte mit `min_stock > 0` und Bestand < Mindestbestand, die nicht auf dem offenen Zettel stehen. Je Produkt „+ Name (n)“ mit n = Mindestbestand − Bestand; dazu „Alle übernehmen“.
- **Offene Einträge**, gruppiert nach Kategorie des Produkts in der festen Kategorienreihenfolge, Freitext unter „Sonstiges“, innerhalb nach Name. Zeile: großes Abhak-Feld (ganze linke Fläche), Name, „n×“, Knöpfe **−** / **+**. „−“ bei Menge 1 entfernt den Eintrag, Meldung mit **Rückgängig**.
- **„Im Wagen (n)“:** abgehakte Einträge unten, durchgestrichen, nach Name. Antippen hebt das Abhaken auf.
- **Fest unten:** „Einkauf abschließen“, aktiv ab einem abgehakten Eintrag.
- Unten im Inhalt: Link **„Frühere Einkäufe“**.

### Einkauf abschließen (Bottom Sheet wie Bearbeiten-Dialog)

- Alle abgehakten Einträge. Je Zeile: Schalter „in Bestand“ (Produkt: an, Freitext: aus), Menge (vorbelegt, ≥ 1), MHD (optional, natives Datumsfeld).
- Fester Footer: Abbrechen · **Buchen & abschließen**. Danach Meldung „Einkauf abgeschlossen, n gebucht“.
- Fehler: Sheet bleibt offen, Eingaben bleiben erhalten, Meldung im Footer.

### Frühere Einkäufe

- Liste der abgeschlossenen Zettel, neueste zuerst: Datum, Anzahl Einträge.
- Antippen: Einträge des Zettels (nur lesen) und **„Auf aktuellen Zettel kopieren“** → Meldung „n übernommen“ bzw. „Alles stand schon drauf“.

### Mobil

16-px-Felder, `minmax(0, 1fr)`-Spalten, Tippflächen ≥ 44 px, Sheet-Muster mit `dvh`-Höhe und festem Footer wie beim Bearbeiten-Dialog. iOS-Verhalten wird am iPhone abgenommen.

## Live-Sync

Ein Hook lädt den offenen Zettel samt Einträgen und abonniert Änderungen an `shopping_lists` und `shopping_items` (wie `useInventory`: bei jeder Änderung neu laden, nur der neueste Ladevorgang schreibt, Nachladen nach Reconnect). Das Archiv wird beim Öffnen geladen.

## Fehlerfälle

| Fall | Verhalten |
|---|---|
| Zwei Geräte legen gleichzeitig den ersten Zettel an | Teilindex: nur ein offener Zettel |
| Gleichzeitiges Hinzufügen desselben Produkts | Menge wird addiert, kein Duplikat |
| Zwei Personen schließen gleichzeitig ab | Zweiter Versuch: „Dieser Einkauf wurde schon abgeschlossen“, nichts doppelt gebucht |
| Abschließen schlägt fehl | Alles oder nichts gebucht; Sheet bleibt offen mit Eingaben |
| Produkt eines Eintrags wird gelöscht | Eintrag bleibt als Freitext mit Namen |
| Kopieren, alles steht schon drauf | Meldung „Alles stand schon drauf“ |
| Eintrag versehentlich entfernt | Rückgängig in der Meldung |

## Tests

- **Vitest** für reine Logik in `src/shopping.ts`: „Wird knapp“-Vorschläge (fehlende Menge, ohne Produkte auf dem Zettel), Gruppieren/Sortieren des Zettels, Aufbau von `p_bookings` aus den Sheet-Eingaben, Erkennen von Produkt vs. Freitext bei der Eingabe.
- **Code-Review** der SQL-Funktionen (nicht automatisiert ausführbar).
- **Manuell am iPhone:** zwei Geräte haken gleichzeitig ab, Abschließen mit MHD, Archiv kopieren, Bedienung von Zettel und Sheet.

## Einrichtung

`supabase/2026-10-18-einkaufszettel.sql` einmal im Supabase SQL Editor ausführen. Die README bekommt dazu einen Schritt.

## Aufwand

Etwa 3–5 Personentage.
