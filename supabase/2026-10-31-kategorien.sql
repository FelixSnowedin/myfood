-- Allgemeinere Kategorien für die Vorratskammer. Einmal im Supabase SQL Editor ausführen,
-- danach erst pushen (die alte App zeigt neue Kategorien sonst als Sonstiges).
-- Kategorien stehen nur als Text an products; neue Produkte bekommen sie aus dem Code.
begin;

update public.products set category = 'Öl & Essig' where name in (
  'Brat & Back Öl', 'Haselnussöl', 'Olio extravergine di oliva', 'Olivenöl aus Sizilien', 'Olivenöl Bio',
  'Olivenöl Cucina neutral', 'Olivenöl Extra Virgin', 'Olivenöl Extra Virgin Bio', 'Sonnenblumenöl',
  'Apfelessig', 'Condimento Italiano Bianco', 'Reisessig', 'Reisessig Kokumotsu', 'Sesamöl');

update public.products set category = 'Eingelegtes' where name in (
  'Artischockenherzen', 'Capperi al Sale Marino', 'Gari Sushi Ingwer',
  'Gegrillte Artischockenviertel in Sonnenblumenöl mit Kräutern', 'Getrocknete Tomaten', 'Grüne Manzanilla Oliven',
  'Kapern in salz eibgelegt', 'Kapern mit Meersalz', 'Oliven Mix mit kräutern', 'Grüne Chilischoten', 'Sardellen', 'Trüffel');

update public.products set category = 'Nudeln, Reis & Trockenware' where name in (
  'Linguine', 'Falafel Mix', 'vegane Burgermischung', 'Popcorn mais');

update public.products set category = 'Konserven' where name in (
  'Bohnen weiß eingelegt in Tomatensoße');

update public.products set category = 'Pastasaucen & Pesto' where name in (
  'Pesto - Pomodori Secchi', 'Pesto Basilico e Pistacchio', 'Pesto con Zucchine e Mandorle', 'Pesto mit Ricotta & Walnüssen',
  'Pesto Rustico - Pomodori Secchi', 'Pesto Zafferano', 'Sauce à Arrabiata di Peperoncini', 'Sugo ai funghi porcini',
  'Sugo alla Norcina', 'Sugo con funghi porcini e tartufo', 'Tartufata Trüffel', 'Vegane Bolognese');

update public.products set category = 'Aufstriche' where name in (
  'Bruschetta Brotaufstrich', 'Creme mit Parmigiano', 'Hummus', 'Olivenpaté', 'Pastete Getrocknete Tomaten',
  'Pate de Pimientos', 'Tahini', 'Edamame & Erbsen Bio-Streichcreme', 'Marmelade - Erdbeertraum mit Amaretto',
  'Tartare aux algues bretonnes');

update public.products set category = 'Gewürze & Kräuter' where name in (
  'BBQ Rub Veggie');

update public.products set category = 'Nüsse & Trockenobst' where name in (
  'Alesto SNACK MIX WITH PISTACHIOS ROASTED, SALTED &', 'Bio Cashew Kerne', 'Erdnüsse geröstet (ungesalzen)',
  'Getrocknete Papaya', 'Haselnusskerne geröstet', 'Macadamia', 'Mandeln naturbelassen', 'Mix de frutos secos',
  'Mixnuts Pikant', 'Nussmix', 'Nussmix mit getrockneten Oliven, geröstet & gewürzt', 'nussvoll Nuss &Traube',
  'Riesen-Sonnenblumenkerne mit Salz', 'Studentenfutter', 'Studentenfutter Rewe Bio', 'Walnusskerne');

-- Was übrig bleibt, wandert unter den neuen Namen (auch Produkte ohne Bestand).
update public.products set category = 'Konserven' where category = 'Vorrat & Konserven';
update public.products set category = 'Saucen & Würzpasten' where category = 'Gewürze & Saucen';

commit;

-- Kontrolle: Anzahl je Kategorie.
select category, count(*) from public.products group by category order by category;
