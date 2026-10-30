CREATE TABLE IF NOT EXISTS saga_gateway_lock(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),ticket text);
INSERT INTO saga_gateway_lock(singleton) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS saga_provider_ticket(
 ticket text PRIMARY KEY, tenant text NOT NULL, intent_digest text NOT NULL,
 subject text NOT NULL, store_name text NOT NULL, epoch text NOT NULL,
 intent text NOT NULL, state text NOT NULL CHECK(state IN ('open','closed')),
 final_disposition text, registered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 closed_at timestamptz
);
CREATE TABLE IF NOT EXISTS saga_provider_attempt(
 ticket text NOT NULL REFERENCES saga_provider_ticket(ticket), attempt integer NOT NULL,
 state text NOT NULL CHECK(state IN ('admitted','committed','rejected','conflict','refused','rolled-back')),
 result text, admitted_at timestamptz NOT NULL DEFAULT clock_timestamp(), settled_at timestamptz,
 PRIMARY KEY(ticket,attempt)
);
CREATE TABLE IF NOT EXISTS saga_submission_tombstone(
 tenant text NOT NULL, owner text NOT NULL, submit_key text NOT NULL,
 intent_digest text NOT NULL, expires_at timestamptz NOT NULL,
 PRIMARY KEY(tenant,owner,submit_key)
);
