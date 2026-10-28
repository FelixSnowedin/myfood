# myfood

Prototyp: gemeinsamer Lebensmittelbestand für einen Haushalt. Web-App (Vite + React), Daten in Supabase, gehostet auf GitHub Pages.
Design: `docs/superpowers/specs/2026-10-18-bestand-prototyp-design.md` · Offene Punkte: `docs/offene-punkte.md`

## Einmalige Einrichtung

1. Supabase-Projekt anlegen (Region EU, z. B. Frankfurt).
2. *SQL Editor*: Inhalt von `supabase/schema.sql` einfügen und ausführen.
   Für den Einkaufszettel danach zusätzlich `supabase/2026-10-18-einkaufszettel.sql` ausführen,
   für die MHD-Vorschläge `supabase/2026-10-28-mhd-vorschlag.sql`,
   für die Rezepte `supabase/2026-10-28-rezepte.sql` (nach den beiden davor).
3. *Authentication → Sign In / Providers*: **„Allow new users to sign up“ ausschalten.** Sonst kann sich jeder registrieren und alle Daten lesen und ändern.
4. *Authentication → Users → Add user*: ein Konto pro Haushaltsmitglied, „Auto Confirm User“ anhaken.
5. *Project Settings → API Keys*: Projekt-URL und publishable (anon) key als `VITE_SUPABASE_URL=…` und `VITE_SUPABASE_KEY=…` in `.env.local` eintragen (nicht eingecheckt). Niemals den secret/service_role key verwenden.
6. GitHub: Das Repo muss öffentlich sein (oder GitHub Pro). *Settings → Secrets and variables → Actions*: `VITE_SUPABASE_URL` und `VITE_SUPABASE_KEY` anlegen. *Settings → Pages → Source*: „GitHub Actions“.

## Entwickeln

```bash
npm install
npm run dev   # http://localhost:5173
npm test
```

Jeder Push auf `main` testet, baut und veröffentlicht die App unter https://felixsnowedin.github.io/myfood/.
Die Kamera braucht HTTPS: am Handy über diese Seite testen, am Rechner geht `localhost`.
