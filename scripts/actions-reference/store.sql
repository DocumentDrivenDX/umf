-- TD-056 lossless qualification store. Bounded digest indexes never establish exact identity.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE FUNCTION action_identity_lookup(value text) RETURNS bytea LANGUAGE SQL IMMUTABLE STRICT
 AS $$ SELECT public.digest(value,'sha256') $$;
CREATE TABLE action_registry (singleton boolean PRIMARY KEY CHECK(singleton));
INSERT INTO action_registry VALUES (true);
CREATE TABLE action_store (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 identity text COLLATE "C" NOT NULL,
 lookup bytea GENERATED ALWAYS AS (action_identity_lookup(identity)) STORED,
 tenant text NOT NULL,
 epoch text NOT NULL,
 invocation_fenced boolean NOT NULL DEFAULT false,
 restore_fenced boolean NOT NULL DEFAULT false,
 business_sequence bigint NOT NULL DEFAULT 0 CHECK (business_sequence >= 0),
 policy_version bigint NOT NULL DEFAULT 0 CHECK (policy_version >= 0)
);
CREATE INDEX action_store_lookup ON action_store(lookup);
-- This trigger changes no business content. It serializes exact uniqueness and immutable identity.
CREATE FUNCTION action_exact_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE duplicate boolean;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'unqualified isolation' USING ERRCODE='0A000'; END IF;
 IF TG_OP='UPDATE' AND NEW.identity IS DISTINCT FROM OLD.identity THEN
  RAISE EXCEPTION 'immutable native identity' USING ERRCODE='23514';
 END IF;
 IF TG_TABLE_NAME='action_store' THEN
  IF TG_OP='UPDATE' THEN
   IF OLD.restore_fenced AND (NOT NEW.restore_fenced OR NOT NEW.invocation_fenced) THEN RAISE EXCEPTION 'irreversible uncertain restore fence' USING ERRCODE='23514'; END IF;
   IF NEW.restore_fenced AND NOT NEW.invocation_fenced THEN RAISE EXCEPTION 'restore requires invocation fence' USING ERRCODE='23514'; END IF;
   IF NEW.tenant IS DISTINCT FROM OLD.tenant THEN RAISE EXCEPTION 'immutable native tenant scope' USING ERRCODE='23514'; END IF;
   RETURN NEW;
  END IF;
  PERFORM 1 FROM action_registry WHERE singleton FOR UPDATE;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE lookup=action_identity_lookup($1) AND identity=$1 AND id<>$2)',TG_TABLE_NAME)
   INTO duplicate USING NEW.identity,NEW.id;
 ELSE
  IF TG_OP='UPDATE' AND NEW.store IS DISTINCT FROM OLD.store THEN RAISE EXCEPTION 'immutable native store scope' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM action_store WHERE id=NEW.store FOR UPDATE;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE store=$1 AND lookup=action_identity_lookup($2) AND identity=$2 AND id<>$3)',TG_TABLE_NAME)
   INTO duplicate USING NEW.store,NEW.identity,NEW.id;
 END IF;
 IF duplicate THEN RAISE EXCEPTION 'duplicate exact native identity' USING ERRCODE='23505'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER action_store_identity BEFORE INSERT OR UPDATE ON action_store
 FOR EACH ROW EXECUTE FUNCTION action_exact_identity_guard();
CREATE TABLE action_membership (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 store bigint NOT NULL REFERENCES action_store(id),
 identity text COLLATE "C" NOT NULL,
 lookup bytea GENERATED ALWAYS AS (action_identity_lookup(identity)) STORED,
 UNIQUE (store,id),
 principal text COLLATE "C" NOT NULL,
 role text COLLATE "C" NOT NULL
);
CREATE INDEX action_membership_lookup ON action_membership(store,lookup);
CREATE TRIGGER action_membership_identity BEFORE INSERT OR UPDATE ON action_membership FOR EACH ROW EXECUTE FUNCTION action_exact_identity_guard();
CREATE TABLE action_revision (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 store bigint NOT NULL REFERENCES action_store(id),
 identity text COLLATE "C" NOT NULL,
 lookup bytea GENERATED ALWAYS AS (action_identity_lookup(identity)) STORED,
 UNIQUE (store,id),
 lifecycle text NOT NULL CHECK (lifecycle IN ('active','retired','unavailable')),
 source text NOT NULL,
 deployment text
);
CREATE INDEX action_revision_lookup ON action_revision(store,lookup);
CREATE TRIGGER action_revision_identity BEFORE INSERT OR UPDATE ON action_revision FOR EACH ROW EXECUTE FUNCTION action_exact_identity_guard();
CREATE TABLE action_entity (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 store bigint NOT NULL REFERENCES action_store(id),
 identity text COLLATE "C" NOT NULL,
 lookup bytea GENERATED ALWAYS AS (action_identity_lookup(identity)) STORED,
 UNIQUE (store,id),
 record text COLLATE "C" NOT NULL,
 primary_key text COLLATE "C" NOT NULL,
 fields text NOT NULL,
 version text NOT NULL
);
CREATE INDEX action_entity_lookup ON action_entity(store,lookup);
CREATE TRIGGER action_entity_identity BEFORE INSERT OR UPDATE ON action_entity FOR EACH ROW EXECUTE FUNCTION action_exact_identity_guard();
CREATE TABLE action_key_alias (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 store bigint NOT NULL REFERENCES action_store(id),
 identity text COLLATE "C" NOT NULL,
 lookup bytea GENERATED ALWAYS AS (action_identity_lookup(identity)) STORED,
 UNIQUE (store,id),
 entity bigint NOT NULL,
 FOREIGN KEY (store,entity) REFERENCES action_entity(store,id)
);
CREATE INDEX action_key_alias_lookup ON action_key_alias(store,lookup);
CREATE TRIGGER action_key_alias_identity BEFORE INSERT OR UPDATE ON action_key_alias FOR EACH ROW EXECUTE FUNCTION action_exact_identity_guard();
CREATE TABLE action_link (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 store bigint NOT NULL REFERENCES action_store(id),
 identity text COLLATE "C" NOT NULL,
 lookup bytea GENERATED ALWAYS AS (action_identity_lookup(identity)) STORED,
 UNIQUE (store,id),
 relationship text COLLATE "C" NOT NULL,
 source_entity bigint NOT NULL,
 target_entity bigint NOT NULL,
 FOREIGN KEY (store,source_entity) REFERENCES action_entity(store,id),
 FOREIGN KEY (store,target_entity) REFERENCES action_entity(store,id)
);
CREATE INDEX action_link_lookup ON action_link(store,lookup);
CREATE TRIGGER action_link_identity BEFORE INSERT OR UPDATE ON action_link FOR EACH ROW EXECUTE FUNCTION action_exact_identity_guard();
CREATE TABLE action_outcome (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 store bigint NOT NULL REFERENCES action_store(id),
 identity text COLLATE "C" NOT NULL,
 lookup bytea GENERATED ALWAYS AS (action_identity_lookup(identity)) STORED,
 UNIQUE (store,id),
 revision bigint NOT NULL,
 fingerprint text NOT NULL,
 original_intent text NOT NULL,
 result text NOT NULL,
 tombstone boolean NOT NULL DEFAULT false,
 FOREIGN KEY (store,revision) REFERENCES action_revision(store,id)
);
CREATE INDEX action_outcome_lookup ON action_outcome(store,lookup);
CREATE TRIGGER action_outcome_identity BEFORE INSERT OR UPDATE ON action_outcome FOR EACH ROW EXECUTE FUNCTION action_exact_identity_guard();
CREATE TABLE action_audit (
 expired boolean NOT NULL DEFAULT false,
 expires_at timestamptz NOT NULL DEFAULT (clock_timestamp()+interval '30 days'),
 header text NOT NULL,
 family text COLLATE "C" NOT NULL,
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 store bigint NOT NULL REFERENCES action_store(id),
 identity text COLLATE "C" NOT NULL,
 lookup bytea GENERATED ALWAYS AS (action_identity_lookup(identity)) STORED,
 UNIQUE (store,id),
 revision bigint NOT NULL,
 actor text NOT NULL,
 deployment text,
 policy_version bigint NOT NULL,
 decision text NOT NULL CHECK (decision IN ('committed','rejected','conflict')),
 correlation text,
 details text NOT NULL,
 FOREIGN KEY (store,revision) REFERENCES action_revision(store,id)
);
CREATE INDEX action_audit_lookup ON action_audit(store,lookup);
CREATE TRIGGER action_audit_identity BEFORE INSERT OR UPDATE ON action_audit FOR EACH ROW EXECUTE FUNCTION action_exact_identity_guard();
CREATE TABLE action_outbox (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 store bigint NOT NULL REFERENCES action_store(id),
 identity text COLLATE "C" NOT NULL,
 lookup bytea GENERATED ALWAYS AS (action_identity_lookup(identity)) STORED,
 UNIQUE (store,id),
 epoch text COLLATE "C" NOT NULL,
 sequence bigint NOT NULL CHECK (sequence > 0),
 facts text NOT NULL
);
CREATE INDEX action_outbox_lookup ON action_outbox(store,lookup);
CREATE TRIGGER action_outbox_identity BEFORE INSERT OR UPDATE ON action_outbox FOR EACH ROW EXECUTE FUNCTION action_exact_identity_guard();
CREATE TABLE action_projection (
 profile text NOT NULL DEFAULT '{"id":"umf.actions.native-graph","version":"1"}',
 baseline bigint NOT NULL DEFAULT 0 CHECK (baseline >= 0),
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 store bigint NOT NULL REFERENCES action_store(id),
 identity text COLLATE "C" NOT NULL,
 lookup bytea GENERATED ALWAYS AS (action_identity_lookup(identity)) STORED,
 UNIQUE (store,id),
 epoch text COLLATE "C" NOT NULL,
 prefix bigint NOT NULL DEFAULT 0 CHECK (prefix >= 0),
 content text NOT NULL DEFAULT '{"entities":[],"links":[]}'
);
CREATE INDEX action_projection_lookup ON action_projection(store,lookup);
CREATE TRIGGER action_projection_identity BEFORE INSERT OR UPDATE ON action_projection FOR EACH ROW EXECUTE FUNCTION action_exact_identity_guard();
CREATE TABLE action_projection_event (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 store bigint NOT NULL REFERENCES action_store(id),
 identity text COLLATE "C" NOT NULL,
 lookup bytea GENERATED ALWAYS AS (action_identity_lookup(identity)) STORED,
 UNIQUE (store,id),
 projection bigint NOT NULL,
 epoch text COLLATE "C" NOT NULL,
 sequence bigint NOT NULL CHECK (sequence > 0),
 facts text NOT NULL,
 FOREIGN KEY (store,projection) REFERENCES action_projection(store,id)
);
CREATE INDEX action_projection_event_lookup ON action_projection_event(store,lookup);
CREATE TRIGGER action_projection_event_identity BEFORE INSERT OR UPDATE ON action_projection_event FOR EACH ROW EXECUTE FUNCTION action_exact_identity_guard();
CREATE FUNCTION action_revision_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.source IS DISTINCT FROM OLD.source THEN RAISE EXCEPTION 'immutable revision source' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER action_revision_source BEFORE UPDATE ON action_revision FOR EACH ROW EXECUTE FUNCTION action_revision_source_guard();
CREATE FUNCTION action_outcome_retention_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable retained outcome' USING ERRCODE='23514'; END IF;
 IF NEW.revision IS DISTINCT FROM OLD.revision OR NEW.fingerprint IS DISTINCT FROM OLD.fingerprint
 OR NEW.original_intent IS DISTINCT FROM OLD.original_intent OR NEW.result IS DISTINCT FROM OLD.result
 OR (OLD.tombstone AND NOT NEW.tombstone) THEN
  RAISE EXCEPTION 'immutable retained outcome' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER action_outcome_retention BEFORE UPDATE OR DELETE ON action_outcome FOR EACH ROW EXECUTE FUNCTION action_outcome_retention_guard();
-- Executor-controlled discovery authority is independent of revision and caller metadata.
CREATE TABLE action_replay_policy (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 store bigint NOT NULL REFERENCES action_store(id),
 identity text COLLATE "C" NOT NULL,
 lookup bytea GENERATED ALWAYS AS (action_identity_lookup(identity)) STORED,
 UNIQUE(store,id),
 binding text NOT NULL,
 enabled boolean NOT NULL DEFAULT true
);
CREATE INDEX action_replay_policy_lookup ON action_replay_policy(store,lookup);
CREATE TRIGGER action_replay_policy_identity BEFORE INSERT OR UPDATE ON action_replay_policy FOR EACH ROW EXECUTE FUNCTION action_exact_identity_guard();
CREATE FUNCTION action_alias_target_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.entity IS DISTINCT FROM OLD.entity THEN RAISE EXCEPTION 'immutable native alias target' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER action_key_alias_target BEFORE UPDATE ON action_key_alias FOR EACH ROW EXECUTE FUNCTION action_alias_target_guard();

-- Operator-owned durable qualification catalog; request metadata cannot install code.
CREATE TABLE action_handler_deployment (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 store bigint NOT NULL REFERENCES action_store(id),
 identity text COLLATE "C" NOT NULL,
 lookup bytea GENERATED ALWAYS AS (action_identity_lookup(identity)) STORED,
 program text NOT NULL,
 active boolean NOT NULL DEFAULT true
);
CREATE INDEX action_handler_deployment_lookup ON action_handler_deployment(store,lookup);
CREATE TRIGGER action_handler_deployment_identity BEFORE INSERT OR UPDATE ON action_handler_deployment
 FOR EACH ROW EXECUTE FUNCTION action_exact_identity_guard();
CREATE FUNCTION action_handler_deployment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'retained handler deployment cannot be deleted' USING ERRCODE='23514'; END IF;
 IF NEW.program IS DISTINCT FROM OLD.program OR (NOT OLD.active AND NEW.active) THEN
  RAISE EXCEPTION 'immutable or retired handler deployment' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER action_handler_deployment_retention BEFORE UPDATE OR DELETE ON action_handler_deployment
 FOR EACH ROW EXECUTE FUNCTION action_handler_deployment_guard();

-- Protected terminal evidence is append-only; retention maintenance requires a
-- separately qualified interface rather than arbitrary caller/handler mutation.
CREATE FUNCTION action_audit_immutable_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND NOT OLD.expired AND NEW.expired AND statement_timestamp()>=OLD.expires_at
 AND (to_jsonb(NEW)-'expired'-'lookup')=(to_jsonb(OLD)-'expired'-'lookup') THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'immutable protected terminal audit' USING ERRCODE='23514';
END $$;
CREATE TRIGGER action_audit_immutable BEFORE UPDATE OR DELETE ON action_audit
 FOR EACH ROW EXECUTE FUNCTION action_audit_immutable_guard();

-- Audit reader authority is independent of invocation and replay-discovery authority.
CREATE TABLE action_audit_policy (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 store bigint NOT NULL REFERENCES action_store(id),
 identity text COLLATE "C" NOT NULL,
 lookup bytea GENERATED ALWAYS AS (action_identity_lookup(identity)) STORED,
 binding text NOT NULL
);
CREATE INDEX action_audit_policy_lookup ON action_audit_policy(store,lookup);
CREATE TRIGGER action_audit_policy_identity BEFORE INSERT OR UPDATE ON action_audit_policy
 FOR EACH ROW EXECUTE FUNCTION action_exact_identity_guard();

CREATE TABLE action_audit_retention (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 store bigint NOT NULL REFERENCES action_store(id),
 identity text COLLATE "C" NOT NULL,
 lookup bytea GENERATED ALWAYS AS (action_identity_lookup(identity)) STORED,
 seconds integer NOT NULL CHECK(seconds>=1 AND seconds<=31536000)
);
CREATE INDEX action_audit_retention_lookup ON action_audit_retention(store,lookup);
CREATE TRIGGER action_audit_retention_identity BEFORE INSERT OR UPDATE ON action_audit_retention
 FOR EACH ROW EXECUTE FUNCTION action_exact_identity_guard();

-- Installation-level observation journal: deliberately no business-store/revision FK.
CREATE TABLE action_attempt_retention (
 singleton boolean PRIMARY KEY CHECK (singleton),
 seconds integer NOT NULL CHECK (seconds BETWEEN 1 AND 31536000)
);
CREATE TABLE action_attempt (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 attempt uuid NOT NULL,
 phase text NOT NULL CHECK (phase IN ('started','observed')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 expired boolean NOT NULL DEFAULT false,
 header text NOT NULL,
 details text NOT NULL,
 UNIQUE (attempt,phase)
);
CREATE FUNCTION action_attempt_immutable_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND NOT OLD.expired AND NEW.expired AND statement_timestamp()>=OLD.expires_at
 AND (to_jsonb(NEW)-'expired')=(to_jsonb(OLD)-'expired') THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'immutable attempt observation' USING ERRCODE='23514';
END $$;
CREATE TRIGGER action_attempt_immutable BEFORE UPDATE OR DELETE ON action_attempt
 FOR EACH ROW EXECUTE FUNCTION action_attempt_immutable_guard();

-- Opaque versions require an exact, immutable ordering witness; hashes are not order keys.
CREATE TABLE action_receipt (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 store bigint NOT NULL REFERENCES action_store(id),
 identity text COLLATE "C" NOT NULL,
 lookup bytea GENERATED ALWAYS AS (action_identity_lookup(identity)) STORED,
 epoch text COLLATE "C" NOT NULL,
 version text COLLATE "C" NOT NULL,
 sequence bigint NOT NULL CHECK (sequence >= 0),
 UNIQUE (store,id)
);
CREATE INDEX action_receipt_lookup ON action_receipt(store,lookup);
CREATE TRIGGER action_receipt_identity BEFORE INSERT OR UPDATE ON action_receipt
 FOR EACH ROW EXECUTE FUNCTION action_exact_identity_guard();
CREATE FUNCTION action_commit_fact_immutable_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'immutable committed fact' USING ERRCODE='23514';
END $$;
CREATE TRIGGER action_receipt_immutable BEFORE UPDATE OR DELETE ON action_receipt
 FOR EACH ROW EXECUTE FUNCTION action_commit_fact_immutable_guard();
CREATE TRIGGER action_outbox_immutable BEFORE UPDATE OR DELETE ON action_outbox
 FOR EACH ROW EXECUTE FUNCTION action_commit_fact_immutable_guard();
CREATE TRIGGER action_projection_event_immutable BEFORE UPDATE OR DELETE ON action_projection_event
 FOR EACH ROW EXECUTE FUNCTION action_commit_fact_immutable_guard();

-- Local epoch history survives consumer restart; offline backups still require external operator history.
CREATE TABLE action_store_epoch (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 store bigint NOT NULL REFERENCES action_store(id),
 identity text COLLATE "C" NOT NULL,
 lookup bytea GENERATED ALWAYS AS (action_identity_lookup(identity)) STORED
);
CREATE INDEX action_store_epoch_lookup ON action_store_epoch(store,lookup);
CREATE TRIGGER action_store_epoch_identity BEFORE INSERT OR UPDATE ON action_store_epoch
 FOR EACH ROW EXECUTE FUNCTION action_exact_identity_guard();
CREATE TRIGGER action_store_epoch_immutable BEFORE UPDATE OR DELETE ON action_store_epoch
 FOR EACH ROW EXECUTE FUNCTION action_commit_fact_immutable_guard();
