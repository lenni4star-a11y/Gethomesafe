-- Gethomesafe: Live-Standort-Link
-- Einmal im Supabase-Dashboard ausführen: SQL Editor → „New query“ → diesen Text einfügen → „Run“.
--
-- Datenschutz:
--  * Der Standort wird schon im Handy verschlüsselt. Der Schlüssel steht nur im Link (nach dem #)
--    und kommt nie bei Supabase an. Supabase speichert nur unlesbaren Text.
--  * Ein Eintrag verfällt spätestens 60 Minuten nach der letzten Aktualisierung und wird beim
--    Beenden der Begleitung sofort gelöscht. Abgelaufene Einträge löscht jeder neue Aufruf.
--  * Niemand kann die Tabelle direkt lesen oder durchsuchen. Es gibt nur drei Funktionen:
--    live_put (schreiben, nur mit geheimem Schreib-Schlüssel), live_get (einen Eintrag per ID lesen),
--    live_end (löschen, nur mit Schreib-Schlüssel).

create table if not exists public.live_shares (
  id          text primary key check (char_length(id) between 20 and 64),
  token_hash  text not null,
  payload     text not null check (char_length(payload) <= 2000),
  updated_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

alter table public.live_shares enable row level security;
-- keine Policies: direkter Zugriff ist für alle gesperrt, nur die Funktionen unten dürfen zugreifen
revoke all on table public.live_shares from anon, authenticated;

create or replace function public.live_put(p_id text, p_token text, p_payload text, p_minutes int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  h text := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
begin
  delete from live_shares where expires_at < now();
  if p_minutes < 1 or p_minutes > 60 or char_length(p_payload) > 2000 or char_length(p_token) < 20 then
    return false;
  end if;
  -- Schutz gegen Missbrauch: höchstens 5000 gleichzeitige Links
  if (select count(*) from live_shares) >= 5000 and not exists (select 1 from live_shares where id = p_id) then
    return false;
  end if;
  insert into live_shares (id, token_hash, payload, updated_at, expires_at)
  values (p_id, h, p_payload, now(), now() + make_interval(mins => p_minutes))
  on conflict (id) do update
    set payload = excluded.payload, updated_at = now(), expires_at = excluded.expires_at
    where live_shares.token_hash = excluded.token_hash;
  return found;
end;
$$;

create or replace function public.live_get(p_id text)
returns table (payload text, updated_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select s.payload, s.updated_at from live_shares s where s.id = p_id and s.expires_at > now();
$$;

create or replace function public.live_end(p_id text, p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from live_shares where id = p_id and token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  return found;
end;
$$;

revoke all on function public.live_put(text, text, text, int) from public;
revoke all on function public.live_get(text) from public;
revoke all on function public.live_end(text, text) from public;
grant execute on function public.live_put(text, text, text, int) to anon;
grant execute on function public.live_get(text) to anon;
grant execute on function public.live_end(text, text) to anon;
