# Supabase einrichten (für den Live-Standort-Link)

Das dauert etwa 10 Minuten und kostet nichts (Gratis-Tarif). Du brauchst keine Programmierkenntnisse.

## 1. Account und Projekt anlegen
1. Auf **https://supabase.com** gehen → **Start your project** → mit GitHub anmelden (am einfachsten) oder mit E-Mail registrieren.
2. Eine Organisation anlegen, wenn danach gefragt wird (Name z. B. „Gethomesafe“, Tarif **Free**).
3. **New project**:
   - **Name:** `gethomesafe`
   - **Database Password:** auf „Generate a password“ tippen und das Passwort in deinem Passwort-Manager speichern. Du brauchst es für die App nicht, schick es niemandem.
   - **Region:** **Central EU (Frankfurt)** – wichtig für den Datenschutz.
   - Auf **Create new project** tippen und 1–2 Minuten warten.

## 2. Die Tabelle anlegen (einmalig)
1. Links im Menü **SQL Editor** öffnen → **New query**.
2. Den ganzen Inhalt der Datei [`supabase/live.sql`](live.sql) hineinkopieren (auf GitHub die Datei öffnen → Knopf „Copy raw file“).
3. Auf **Run** tippen. Unten muss „Success. No rows returned“ stehen.
   Wenn Supabase vor „destructive operations“ warnt: Das kommt vom `revoke` (Zugriff sperren) und ist gewollt, also bestätigen.

## 3. Adresse und öffentlichen Schlüssel als GitHub-Secrets eintragen
1. In Supabase oben auf **Connect** tippen (oder links **Project Settings → API Keys**).
2. Dort findest du:
   - die **Project URL**, die so aussieht: `https://abcdefgh.supabase.co`
   - den **Publishable key**, beginnt mit `sb_publishable_…`. Bei älteren Projekten heißt er **anon public** und beginnt mit `eyJ…`.
   - ⚠️ **Nicht** den „secret“- bzw. „service_role“-Schlüssel nehmen. Der darf nirgends hin.
3. Auf GitHub im Repository: **Settings → Secrets and variables → Actions → New repository secret**, zwei Secrets:
   - Name `SUPABASE_URL`, Wert: die Project URL
   - Name `SUPABASE_ANON_KEY`, Wert: der Publishable-/anon-Schlüssel
4. Danach **Actions → „App veröffentlichen“ → Run workflow** (oder einfach den nächsten Push abwarten).

Die Werte bitte nicht in den Chat kopieren. Der öffentliche Schlüssel ist zwar dafür gedacht, in der App zu stehen: Er erlaubt nur die drei Funktionen aus `live.sql` und kein Lesen der Tabelle. Trotzdem gehört er wie der Mapillary-Token in die Secrets.

## 4. Testen
In der App: Begleitung starten → aufklappen → **Live-Standort-Link → Link erstellen** → den Link an dich selbst oder ein zweites Gerät schicken und öffnen.
Danach die Begleitung mit der PIN beenden. Der Link zeigt dann „Der Link ist beendet“.

## Gut zu wissen
- **Pausieren:** Supabase pausiert Gratis-Projekte, wenn sie etwa eine Woche nicht genutzt werden. Dann im Dashboard auf **Restore project** tippen. Für den echten Betrieb später auf einen bezahlten Tarif wechseln (ab ca. 25 $/Monat) oder einen eigenen Server nehmen.
- **Datenschutz-Vertrag (AVV/DPA):** Supabase bietet einen Auftragsverarbeitungsvertrag an (Dashboard → Organization → Legal Documents). Für einen öffentlichen Start unterschreiben.
- **Was Supabase sieht:** nur verschlüsselten Text, eine zufällige Link-ID und die Uhrzeit der letzten Aktualisierung. Den Schlüssel zum Entschlüsseln gibt es nur im Link (nach dem `#`). Einträge werden beim Beenden gelöscht, spätestens 60 Minuten nach der letzten Aktualisierung.
