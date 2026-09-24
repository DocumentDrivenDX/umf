CREATE TABLE events (at timestamptz NOT NULL, payload jsonb) PARTITION BY RANGE (at);
CREATE TABLE events_2026 PARTITION OF events FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY visible_events ON events FOR SELECT USING (payload->>'tenant' = current_user);
CREATE VIEW recent_events AS SELECT at, payload FROM events WHERE at > now() - interval '1 day';
CREATE FUNCTION echo_text(value text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT value $$;
GRANT SELECT ON events TO PUBLIC;
