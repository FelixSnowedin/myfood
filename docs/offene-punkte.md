# Offene Punkte / Verbesserungsfähiges

## Rezepte

### Ähnlichkeitsregel für Rezeptnamen und „Geplant für“ ist grob
`similar()` in `src/recipes.ts` gilt als gleich bei: identisch (nach Bereinigung), einer enthält den anderen (ab 4 Zeichen) oder höchstens 1–2 Tippfehler.
„Einer enthält den anderen“ fasst zu viel zusammen: „Chili“ und „Chili sin carne“ gelten als dasselbe Rezept, die Duplikat-Prüfung blockiert dann das zweite.
Ideen: Wortweise vergleichen statt Teilstring, Schwellen anpassen, bei Ähnlichkeit nachfragen („Meinst du Chili con carne?“) statt hart zu blockieren.

### „Geplant für“ passt zu einem Rezept, aber mit anderen Zutaten
Ist ein „Geplant für“-Wert einem vorhandenen Rezept ähnlich, entsteht keine Rezept-Idee – auch wenn im Bestand Zutaten dafür geplant sind, die das Rezept nicht enthält.
Idee: vorschlagen, diese Zutaten im Rezept zu ergänzen.

### Beim Bauen aufgefallen
- Verbrauchen (Scanner, „Verbraucht“) nimmt die Packung mit dem frühesten MHD, auch wenn sie für ein Rezept vorgemerkt ist und freier Bestand da wäre.
- Ein Rezept umbenennen ändert bestehende Reservierungen und „Geplant für“-Einträge nicht, die behalten den alten Namen.
- „Geplant für“-Einträge, die einem Rezeptnamen nur ähneln (z. B. „pizza am Freitag“ bei Rezept „Pizza“), stehen nicht in der „Für“-Leiste und werden beim Ausplanen nicht frei.
- Weggeklickte Rezept-Ideen gelten nur auf dem Gerät, auf dem sie weggeklickt wurden.
