-- UNADOPTED DESIGN ARTIFACT. Never execute as part of this planning task.
-- Substitute only library-quoted original app_schema and owner_role identifiers.
-- PostgreSQL18.6 UTF8; no author-supplied names, defaults, callbacks or extra objects.
-- Baseline history/head/outcomes/approvals use the exact separately pinned e37cd7e
-- constructors; this file defines the complete additional inventory metadata.

CREATE TABLE app_schema.umf_lifecycle_inventory_progress (
  singleton pg_catalog.bool NOT NULL,
  migration_id pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
  plan_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
  file_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
  mode pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
  expected_head pg_catalog.text COLLATE pg_catalog."C",
  bootstrap_id pg_catalog.uuid,
  setup_receipt_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
  phase_index pg_catalog.int4 NOT NULL,
  phase_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
  prefix_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
  state pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
  record_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
  record pg_catalog.jsonb NOT NULL,
  CONSTRAINT umf_inventory_progress_pkey PRIMARY KEY (singleton),
  CONSTRAINT umf_inventory_progress_id_key UNIQUE (migration_id),
  CONSTRAINT umf_inventory_progress_singleton CHECK (singleton IS TRUE),
  CONSTRAINT umf_inventory_progress_id CHECK (pg_catalog.octet_length(migration_id) BETWEEN 1 AND 256),
  CONSTRAINT umf_inventory_progress_digests CHECK (
    plan_digest ~ '^[a-f0-9]{64}$' AND file_digest ~ '^[a-f0-9]{64}$' AND
    setup_receipt_digest ~ '^[a-f0-9]{64}$' AND phase_digest ~ '^[a-f0-9]{64}$' AND
    prefix_digest ~ '^[a-f0-9]{64}$' AND record_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT umf_inventory_progress_origin CHECK (
    (mode = 'initial' AND expected_head IS NULL AND bootstrap_id IS NOT NULL) OR
    (mode = 'installed' AND expected_head IS NOT NULL AND
     expected_head ~ '^[a-f0-9]{64}$' AND bootstrap_id IS NULL)),
  CONSTRAINT umf_inventory_progress_phase CHECK (phase_index BETWEEN 1 AND 1023),
  CONSTRAINT umf_inventory_progress_state CHECK (state IN ('intent','complete','approval-denied')),
  CONSTRAINT umf_inventory_progress_denial CHECK (
    state <> 'approval-denied' OR (mode = 'initial' AND phase_index = 1)),
  CONSTRAINT umf_inventory_progress_record CHECK (
    pg_catalog.jsonb_typeof(record) = 'object' AND
    pg_catalog.octet_length(record::pg_catalog.text) BETWEEN 2 AND 16777216)
) USING heap;
ALTER TABLE app_schema.umf_lifecycle_inventory_progress OWNER TO owner_role;
REVOKE ALL PRIVILEGES ON TABLE app_schema.umf_lifecycle_inventory_progress FROM PUBLIC;

CREATE TABLE app_schema.umf_lifecycle_inventory_publications (
  generation pg_catalog.int8 NOT NULL,
  migration_id pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
  head_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
  plan_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
  source_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
  bundle_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
  setup_receipt_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
  record_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
  record pg_catalog.jsonb NOT NULL,
  CONSTRAINT umf_inventory_publications_pkey PRIMARY KEY (generation),
  CONSTRAINT umf_inventory_publications_id_key UNIQUE (migration_id),
  CONSTRAINT umf_inventory_publications_head_key UNIQUE (head_digest),
  CONSTRAINT umf_inventory_publications_plan_key UNIQUE (plan_digest),
  CONSTRAINT umf_inventory_publications_generation CHECK (generation BETWEEN 1 AND 128),
  CONSTRAINT umf_inventory_publications_id CHECK (pg_catalog.octet_length(migration_id) BETWEEN 1 AND 256),
  CONSTRAINT umf_inventory_publications_digests CHECK (
    head_digest ~ '^[a-f0-9]{64}$' AND plan_digest ~ '^[a-f0-9]{64}$' AND
    source_digest ~ '^[a-f0-9]{64}$' AND bundle_digest ~ '^[a-f0-9]{64}$' AND
    setup_receipt_digest ~ '^[a-f0-9]{64}$' AND record_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT umf_inventory_publications_record CHECK (
    pg_catalog.jsonb_typeof(record) = 'object' AND
    pg_catalog.octet_length(record::pg_catalog.text) BETWEEN 2 AND 16777216)
) USING heap;
ALTER TABLE app_schema.umf_lifecycle_inventory_publications OWNER TO owner_role;
REVOKE ALL PRIVILEGES ON TABLE app_schema.umf_lifecycle_inventory_publications FROM PUBLIC;

-- No sequences, identity/generated columns, defaults, FKs, additional indexes,
-- triggers, policies, RLS, rules, partitions, inheritance or replica-identity index.
-- Every PK/UNIQUE creates exactly its same-named unique btree constraint index.
-- No ordinary/member/PUBLIC table, column, sequence or schema CREATE grants.
-- Full ACL/default-ACL equality and native object birth are separately REQUIRED.
