CREATE TABLE IF NOT EXISTS saga_instance (
  id text PRIMARY KEY,
  tenant text NOT NULL,
  owner text NOT NULL,
  submit_key text NOT NULL,
  intent text NOT NULL,
  intent_digest text NOT NULL,
  original_submit text NOT NULL,
  phase text NOT NULL,
  next_step integer NOT NULL DEFAULT 0,
  stop_cause text,
  intervention_required boolean NOT NULL DEFAULT false,
  outputs text,
  history_sequence bigint NOT NULL DEFAULT 0,
  lease_owner text,
  lease_fence bigint NOT NULL DEFAULT 0,
  lease_until timestamptz,
  elapsed_ms bigint NOT NULL DEFAULT 0,
  automatic_started_ms bigint NOT NULL DEFAULT 0,
  lookup_count integer NOT NULL DEFAULT 0,
  max_lookups integer NOT NULL DEFAULT 16,
  max_automatic_ms integer NOT NULL DEFAULT 900000,
  payload_erasure_allowed boolean NOT NULL DEFAULT false,
  retained_bytes bigint NOT NULL DEFAULT 0,
  max_retained_bytes bigint NOT NULL DEFAULT 16777216,
  expires_at timestamptz NOT NULL,
  UNIQUE (tenant, owner, submit_key)
);
CREATE TABLE IF NOT EXISTS saga_event (
  instance_id text NOT NULL REFERENCES saga_instance(id),
  sequence bigint NOT NULL,
  event text NOT NULL,
  PRIMARY KEY (instance_id, sequence)
);
CREATE TABLE IF NOT EXISTS saga_ticket (
  ticket text PRIMARY KEY,
  instance_id text NOT NULL REFERENCES saga_instance(id),
  ordinal integer NOT NULL,
  direction text NOT NULL CHECK (direction IN ('f','c')),
  provider text NOT NULL,
  action_revision text NOT NULL,
  binding_snapshot text NOT NULL,
  inputs text NOT NULL,
  original_result text,
  disposition text NOT NULL DEFAULT 'pending',
  lookup_count integer NOT NULL DEFAULT 0,
  UNIQUE (instance_id, ordinal, direction)
);
CREATE TABLE IF NOT EXISTS saga_control_original (
  instance_id text NOT NULL REFERENCES saga_instance(id),
  capability text NOT NULL,
  request_digest text NOT NULL,
  original_response text,
  disposition text NOT NULL DEFAULT 'pending',
  PRIMARY KEY (instance_id, capability)
);
CREATE TABLE IF NOT EXISTS saga_definition (
  tenant text NOT NULL,
  revision text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (tenant,revision)
);
CREATE TABLE IF NOT EXISTS saga_resolution_evidence (
  evidence_id text PRIMARY KEY,
  issuer text NOT NULL,
  tenant text NOT NULL,
  ticket text NOT NULL REFERENCES saga_ticket(ticket),
  observation text NOT NULL
);
CREATE TABLE IF NOT EXISTS saga_close_review (
  review_id text PRIMARY KEY,
  instance_id text NOT NULL REFERENCES saga_instance(id),
  tenant text NOT NULL,
  principal text NOT NULL,
  service text NOT NULL,
  history_sequence bigint NOT NULL,
  facts text NOT NULL,
  fact_digest text NOT NULL,
  provider_evidence text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS saga_control_capability (
  capability text PRIMARY KEY,
  operation text NOT NULL,
  tenant text NOT NULL,
  principal text NOT NULL,
  service text NOT NULL,
  instance_id text,
  request_digest text NOT NULL,
  request text NOT NULL,
  bound_ticket text,
  state text NOT NULL CHECK (state IN ('prepared','admitting','completed')),
  original_response text,
  retained_bytes integer NOT NULL,
  reserved_response_bytes integer NOT NULL
);
CREATE TABLE IF NOT EXISTS saga_history_cursor (
 cursor text PRIMARY KEY, tenant text NOT NULL, principal text NOT NULL, service text NOT NULL,
 instance_id text NOT NULL REFERENCES saga_instance(id), highwater bigint NOT NULL, position bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS saga_control_capability_scope ON saga_control_capability(tenant,principal,operation);


-- Reservations survive admission, recovery and host restart. The submission
-- identity remains stable before and after creation of the instance.
CREATE TABLE IF NOT EXISTS saga_control_budget (
 scope text PRIMARY KEY, attempts integer NOT NULL DEFAULT 0,
 retained_bytes bigint NOT NULL DEFAULT 0
);
