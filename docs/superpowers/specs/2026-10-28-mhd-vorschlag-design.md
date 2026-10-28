# myfood – MHD-Vorschlag (Design)

Stand: 2026-10-28 · baut auf `2026-10-18-bestand-prototyp-design.md` und `2026-10-18-einkaufszettel-design.md` auf

## Ziel

Das MHD-Feld ist beim Eintragen eines bekannten Produkts mit einem geschätzten Datum vorbelegt. Die Schätzung lernt aus den MHDs, die der Haushalt früher von Hand eingetragen hat. So bleibt die Pflege der MHDs leicht, und die Daten werden trotzdem nicht schlechter.

Erfolgskriterium: Ab dem zweiten Kauf eines Produkts steht im MHD-Feld ein Datum, das meist passt oder nur kurz korrigiert werden muss.

## Nicht im Umfang (später)

- Produktionsdatum oder MHD aus dem Barcode. EAN-13 enthält kein Datum, und Open Food Facts liefert keins. Mit 2D-Codes (GS1 „Sunrise 2027“, AI 17) käme das MHD direkt aus dem Code, dann ist keine Schätzung mehr nötig.
- Median, Verlauf oder Gewichtung neuerer Werte (nur wenn der Mittelwert im Alltag sichtbar danebenliegt)
- Lernen aus nachträglichen MHD-Änderungen im Bearbeiten-Dialog

## Regel

- **Abstand** = MHD − Tag des Eintragens, in ganzen Tagen. Der Tag des Eintragens wird in der Zeitzone Europe/Berlin bestimmt.
- **Vorschlag** = heute + `floor(Summe / Anzahl)` Tage, sobald es mindestens einen Wert gibt. Durch das Abrunden liegt der Vorschlag eher zu früh als zu spät.
- **Gezählt** wird ein eingetragenes MHD nur, wenn alle drei Bedingungen gelten:
  - es ist gesetzt,
  - der Abstand liegt zwischen 0 und 1825 Tagen (5 Jahre). Damit fallen Tippfehler wie 2062 und schon abgelaufene Daten heraus.
  - der Abstand weicht vom aktuellen Vorschlag ab. Ein übernommener Vorschlag ist keine neue Messung und würde den Mittelwert sonst durch das Abrunden langsam nach unten ziehen.

## Datenmodell

Neue SQL-Datei `supabase/2026-10-28-mhd-vorschlag.sql`, einmalig im Supabase SQL Editor auszuführen. Es gelten dieselben Konventionen wie bisher.

`products` bekommt zwei Spalten:

| Spalte | Typ | Regeln |
|---|---|---|
| `mhd_days_sum` | int | ≥ 0, Standard 0 |
| `mhd_days_count` | int | ≥ 0, Standard 0 |

Am Produkt gespeichert statt aus `stock` berechnet, weil `consume()` aufgebrauchte Zeilen löscht und der Abstand damit verloren ginge.

**`add_stock`** wird mit gleicher Signatur ersetzt (`create or replace`, jetzt plpgsql). Nach dem Einbuchen werden Summe und Anzahl des Produkts nach der Regel oben erhöht, atomar in derselben Transaktion. Damit lernen beide Wege, ohne dass sich API oder Client-Aufrufe ändern: „Hinzufügen“ bzw. „Scannen“ und „Einkauf abschließen“ (`finish_list` ruft `add_stock` auf). Rückgängig (`restoreStock`) und der Bearbeiten-Dialog gehen nicht über `add_stock` und lernen deshalb nicht.

**Startwerte:** Die Migration berechnet sie einmal aus dem aktuellen Bestand: je `stock`-Zeile mit MHD der Abstand `best_before − created_at` (Berlin), mit demselben Bereichsfilter.

## Oberfläche

### Hinzufügen / nach dem Scan

- Ist das Produkt bekannt und das MHD-Feld noch nicht angefasst, zeigt es den Vorschlag. Darunter steht der Hinweis „Vorschlag aus n Einträgen, bitte prüfen“.
- Ändert der Nutzer das Feld, gilt seine Eingabe, auch ein leeres Feld (dann ohne MHD). Wechselt das Produkt, solange das Feld unberührt ist, wechselt der Vorschlag mit.
- Nach dem Speichern wird das Feld wieder unberührt.

### Einkauf abschließen

- Je Zeile mit Produkt ist das MHD mit dem Vorschlag vorbelegt. Freitext-Zeilen bleiben leer.
- Der Hinweistext oben lautet dann: „Was in den Bestand soll, mit Menge und optional MHD. MHDs sind aus früheren Einkäufen vorbelegt, bitte prüfen.“

## Logik im Client

Reine Funktion in `src/inventory.ts`:

`suggestBestBefore(product, today) → string` liefert `''` ohne Werte, sonst `addDays(today, floor(sum / count))`.

`initialFinishRows(items, products, today)` belegt `bestBefore` mit dieser Funktion vor.

## Fehlerfälle

| Fall | Verhalten |
|---|---|
| Produkt ohne bisherige Werte | Feld leer wie bisher |
| Tippfehler beim MHD (z. B. 2062) | wird eingebucht, aber nicht gelernt |
| Vorschlag ungeprüft übernommen | wird nicht gelernt |
| Migration noch nicht ausgeführt | Spalten fehlen im Client und gelten als 0, also kein Vorschlag. Einbuchen funktioniert weiter mit dem alten `add_stock`. |
| Eintragen kurz vor Mitternacht | Abstand wird in Berliner Zeit gerechnet, nicht in UTC |

## Tests

- **Vitest:** `suggestBestBefore` (keine Werte, Abrunden, Monats- und Jahreswechsel) und die Vorbelegung in `initialFinishRows`.
- **Code-Review** von `add_stock` und Startwert-Berechnung.
- **Manuell am iPhone:** Produkt zweimal mit MHD eintragen, beim dritten Mal Vorschlag prüfen; Vorschlag beim Einkauf-Abschließen.

## Einrichtung

`supabase/2026-10-28-mhd-vorschlag.sql` einmal im Supabase SQL Editor ausführen. Die README bekommt dazu einen Schritt.

## Aufwand

Etwa ein halber Personentag.
