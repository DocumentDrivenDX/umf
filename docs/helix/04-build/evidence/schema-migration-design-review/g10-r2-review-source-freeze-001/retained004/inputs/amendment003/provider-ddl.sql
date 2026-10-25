-- PROPOSED, NOT EXECUTED. Fresh inventory-originals-store0.2 ONLY.
-- originals is the one library-quoted originally reserved schema, never caller SQL.
-- Amendment002: 20 fixed tables; singleton native admission, not a fake lineage.
CREATE TABLE originals.provider_admission (
 singleton pg_catalog.bool PRIMARY KEY CHECK (singleton),
 issued_count pg_catalog.int8 NOT NULL CHECK (issued_count BETWEEN 0 AND 1000000),
 max_issued_instances pg_catalog.int8 NOT NULL CHECK (max_issued_instances=1000000),
 revision pg_catalog.int8 NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
 record pg_catalog.jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(record)='object' AND pg_catalog.octet_length(record::pg_catalog.text)<=2097152),
 record_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (record_digest ~ '^[a-f0-9]{64}$'),
 CHECK (issued_count<=max_issued_instances)
) USING heap;

CREATE TABLE originals.row_tables (
 table_token pg_catalog.uuid PRIMARY KEY,
 installation_id pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (installation_id <> ''),
 business_table_oid pg_catalog.oid NOT NULL,
 business_schema_oid pg_catalog.oid NOT NULL,
 table_binding pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
 issued_count pg_catalog.int8 NOT NULL CHECK (issued_count BETWEEN 0 AND 1000000),
 carrier_state pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (carrier_state IN ('active','retired')),
 record pg_catalog.jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(record)='object'),
 record_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (record_digest ~ '^[a-f0-9]{64}$')
) USING heap;
CREATE UNIQUE INDEX row_tables_active_business_oid ON originals.row_tables(business_table_oid) WHERE carrier_state='active';

CREATE TABLE originals."archives" (
 "archive_id" pg_catalog.uuid PRIMARY KEY,
 "table_token" pg_catalog.uuid NOT NULL REFERENCES originals."row_tables"("table_token") ON UPDATE RESTRICT ON DELETE RESTRICT,
 "state" pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK ("state" IN ('capturing','complete')),
 "values_relation_oid" pg_catalog.oid NOT NULL UNIQUE,
 "row_count" pg_catalog.int8 NOT NULL CHECK ("row_count" BETWEEN 0 AND 1000000),
 "logical_bytes" pg_catalog.int8 NOT NULL CHECK ("logical_bytes" BETWEEN 0 AND 1073741824),
 "record" pg_catalog.jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof("record") = 'object'),
 "record_digest" pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK ("record_digest" ~ '^[a-f0-9]{64}$')
) USING heap;

CREATE TABLE originals."issued_instances" (
 "table_token" pg_catalog.uuid NOT NULL REFERENCES originals."row_tables"("table_token") ON UPDATE RESTRICT ON DELETE RESTRICT,
 "instance_id" pg_catalog.uuid NOT NULL,
 PRIMARY KEY ("table_token", "instance_id")
) USING heap;

CREATE TABLE originals.archive_lifecycle (
 archive_id pg_catalog.uuid PRIMARY KEY REFERENCES originals.archives(archive_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 state pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (state IN ('captured','retired','restore-pending','restored','purge-pending','purged','abandoned')),
 revision pg_catalog.int8 NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
 policy_revision pg_catalog.int8 NOT NULL CHECK (policy_revision BETWEEN 1 AND 9007199254740991),
 hold_revision pg_catalog.int8 NOT NULL CHECK (hold_revision BETWEEN 1 AND 9007199254740991),
 active_request_id pg_catalog.uuid,
 record pg_catalog.jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(record) = 'object'),
 record_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (record_digest ~ '^[a-f0-9]{64}$')
) USING heap;

CREATE TABLE originals.carrier_retirements (
 table_token pg_catalog.uuid PRIMARY KEY REFERENCES originals.row_tables(table_token) ON UPDATE RESTRICT ON DELETE RESTRICT,
 request_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL UNIQUE CHECK (request_digest ~ '^[a-f0-9]{64}$'),
 original_business_oid pg_catalog.oid NOT NULL,
 plan_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (plan_digest ~ '^[a-f0-9]{64}$'),
 record pg_catalog.jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(record)='object' AND pg_catalog.octet_length(record::pg_catalog.text)<=2097152),
 record_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (record_digest ~ '^[a-f0-9]{64}$')
) USING heap;
CREATE TABLE originals.lineages (
 lineage_id pg_catalog.uuid PRIMARY KEY,
 installation_id pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (installation_id<>''),
 table_binding pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
 state pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (state IN ('active','retired')),
 active_table_token pg_catalog.uuid,
 generation_count pg_catalog.int8 NOT NULL CHECK (generation_count BETWEEN 1 AND 4096),
 issued_count pg_catalog.int8 NOT NULL CHECK (issued_count BETWEEN 0 AND 1000000),
 max_issued_instances pg_catalog.int8 NOT NULL CHECK (max_issued_instances BETWEEN 1 AND 1000000),
 revision pg_catalog.int8 NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
 record pg_catalog.jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(record)='object'),
 record_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (record_digest ~ '^[a-f0-9]{64}$'),
 UNIQUE(installation_id,table_binding),
 CHECK (issued_count<=max_issued_instances),
 CHECK ((state='active')=(active_table_token IS NOT NULL))
) USING heap;
CREATE TABLE originals.carrier_generations (
 table_token pg_catalog.uuid PRIMARY KEY REFERENCES originals.row_tables(table_token) ON UPDATE RESTRICT ON DELETE RESTRICT,
 lineage_id pg_catalog.uuid NOT NULL REFERENCES originals.lineages(lineage_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 generation pg_catalog.int8 NOT NULL CHECK (generation BETWEEN 1 AND 4096),
 physical_generation pg_catalog.uuid NOT NULL UNIQUE,
 parent_table_token pg_catalog.uuid REFERENCES originals.carrier_generations(table_token) ON UPDATE RESTRICT ON DELETE RESTRICT,
 parent_archive_id pg_catalog.uuid,
 state pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (state IN ('active','retired')),
 record pg_catalog.jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(record)='object'),
 record_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (record_digest ~ '^[a-f0-9]{64}$'),
 UNIQUE(lineage_id,generation),
 CHECK ((generation=1)=(parent_table_token IS NULL)),
 CHECK ((generation=1)=(parent_archive_id IS NULL))
) USING heap;
ALTER TABLE originals.lineages ADD CONSTRAINT lineages_active_carrier_fk FOREIGN KEY(active_table_token) REFERENCES originals.carrier_generations(table_token) ON UPDATE RESTRICT ON DELETE RESTRICT;
CREATE TABLE originals.lineage_issued_instances (
 lineage_id pg_catalog.uuid NOT NULL REFERENCES originals.lineages(lineage_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 instance_id pg_catalog.uuid NOT NULL,
 first_table_token pg_catalog.uuid NOT NULL REFERENCES originals.row_tables(table_token) ON UPDATE RESTRICT ON DELETE RESTRICT,
 PRIMARY KEY(lineage_id,instance_id)
) USING heap;
CREATE TABLE originals.whole_archives (
 archive_id pg_catalog.uuid PRIMARY KEY,
 lineage_id pg_catalog.uuid NOT NULL REFERENCES originals.lineages(lineage_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 table_token pg_catalog.uuid NOT NULL REFERENCES originals.carrier_generations(table_token) ON UPDATE RESTRICT ON DELETE RESTRICT,
 values_relation_oid pg_catalog.oid NOT NULL UNIQUE,
 row_count pg_catalog.int8 NOT NULL CHECK (row_count BETWEEN 0 AND 10000),
 value_stream_bytes pg_catalog.int8 NOT NULL CHECK (value_stream_bytes BETWEEN 0 AND 8388608),
 record pg_catalog.jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(record)='object'),
 record_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (record_digest ~ '^[a-f0-9]{64}$')
) USING heap;
ALTER TABLE originals.carrier_generations ADD CONSTRAINT carrier_generations_parent_archive_fk FOREIGN KEY(parent_archive_id) REFERENCES originals.whole_archives(archive_id) ON UPDATE RESTRICT ON DELETE RESTRICT;
CREATE TABLE originals.whole_archive_columns (
 archive_id pg_catalog.uuid NOT NULL REFERENCES originals.whole_archives(archive_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 field_order pg_catalog.int4 NOT NULL CHECK (field_order BETWEEN 1 AND 1598),
 field_module pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
 field_element pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
 source_attnum pg_catalog.int2 NOT NULL CHECK (source_attnum>0),
 values_attnum pg_catalog.int2 NOT NULL CHECK (values_attnum>2),
 type_oid pg_catalog.oid NOT NULL,
 type_mod pg_catalog.int4 NOT NULL,
 collation_oid pg_catalog.oid NOT NULL,
 record pg_catalog.jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(record)='object'),
 record_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (record_digest ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(archive_id,field_order), UNIQUE(archive_id,field_module,field_element), UNIQUE(archive_id,source_attnum), UNIQUE(archive_id,values_attnum)
) USING heap;
CREATE TABLE originals.whole_archive_materials (
 archive_id pg_catalog.uuid NOT NULL REFERENCES originals.whole_archives(archive_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 kind pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (kind IN ('source','configuration','bundle','plan','source-meaning','native-catalog','field-dependencies')),
 bytes pg_catalog.bytea NOT NULL CHECK (pg_catalog.octet_length(bytes)<=25165824),
 bytes_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (bytes_digest ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(archive_id,kind)
) USING heap;
CREATE TABLE originals.whole_archive_proofs (
 archive_id pg_catalog.uuid PRIMARY KEY REFERENCES originals.whole_archives(archive_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 record pg_catalog.jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(record)='object'),
 record_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (record_digest ~ '^[a-f0-9]{64}$')
) USING heap;
CREATE TABLE originals.whole_lifecycle (
 archive_id pg_catalog.uuid PRIMARY KEY REFERENCES originals.whole_archives(archive_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 state pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (state IN ('captured','retired','restore-pending','restored','purge-pending','purged','abandoned')),
 revision pg_catalog.int8 NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
 policy_revision pg_catalog.int8 NOT NULL CHECK (policy_revision BETWEEN 1 AND 9007199254740991),
 hold_revision pg_catalog.int8 NOT NULL CHECK (hold_revision BETWEEN 1 AND 9007199254740991),
 active_request_id pg_catalog.uuid,
 record pg_catalog.jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(record)='object'),
 record_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (record_digest ~ '^[a-f0-9]{64}$')
) USING heap;
CREATE TABLE originals.whole_dependencies (
 archive_id pg_catalog.uuid NOT NULL REFERENCES originals.whole_archives(archive_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 dependency_id pg_catalog.uuid NOT NULL,
 state pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (state IN ('required','satisfied')),
 record pg_catalog.jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(record)='object'),
 record_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (record_digest ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(archive_id,dependency_id)
) USING heap;
CREATE TABLE originals.whole_requests (
 request_id pg_catalog.uuid PRIMARY KEY,
 effect_key pg_catalog.text COLLATE pg_catalog."C" NOT NULL UNIQUE,
 archive_id pg_catalog.uuid NOT NULL,
 kind pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (kind IN ('retire','restore','purge','hold-add','hold-remove','policy-update','dependency-satisfy','publication-anchor')),
 state pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (state IN ('reserved','unknown','confirmed','aborted')),
 record pg_catalog.jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(record)='object'),
 record_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (record_digest ~ '^[a-f0-9]{64}$')
) USING heap;
CREATE TABLE originals.whole_outcomes (
 outcome_id pg_catalog.uuid PRIMARY KEY,
 request_id pg_catalog.uuid NOT NULL UNIQUE REFERENCES originals.whole_requests(request_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 archive_id pg_catalog.uuid NOT NULL,
 status pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (status IN ('confirmed','aborted')),
 record pg_catalog.jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(record)='object'),
 record_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (record_digest ~ '^[a-f0-9]{64}$')
) USING heap;
CREATE TABLE originals.whole_events (
 archive_id pg_catalog.uuid NOT NULL,
 event_sequence pg_catalog.int8 NOT NULL CHECK (event_sequence BETWEEN 1 AND 4096),
 request_id pg_catalog.uuid NOT NULL REFERENCES originals.whole_requests(request_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 record pg_catalog.jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(record)='object'),
 record_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (record_digest ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(archive_id,event_sequence)
) USING heap;
CREATE TABLE originals.whole_restore_permits (
 request_id pg_catalog.uuid PRIMARY KEY REFERENCES originals.whole_requests(request_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 archive_id pg_catalog.uuid NOT NULL REFERENCES originals.whole_archives(archive_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 table_token pg_catalog.uuid NOT NULL UNIQUE REFERENCES originals.carrier_generations(table_token) ON UPDATE RESTRICT ON DELETE RESTRICT,
 backend_pid pg_catalog.int4 NOT NULL CHECK (backend_pid>0),
 transaction_id pg_catalog.xid8 NOT NULL,
 record pg_catalog.jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(record)='object'),
 record_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (record_digest ~ '^[a-f0-9]{64}$')
) USING heap;
-- All fixed tables are original-controller-owned permanent heap tables. No
-- PUBLIC/businessOwner/ordinary/schema grants or column ACL; exact default owner
-- ACL only, no RLS/user triggers/rules/inheritance/partitions/custom defaults.
-- Only declared constraints/indexes and fully parent-bound automatic row/array/
-- TOAST/RI objects are admitted. Full native birth/census required, not a prefix.
-- Canonical closed records<=1MiB each and native jsonb text<=2MiB each are
-- independently enforced BEFORE effect/COMMIT; materials use their explicit cap.
-- restore_permits has ZERO rows in every committed observable state.
CREATE TABLE originals.whole_restore_members (
 request_id pg_catalog.uuid NOT NULL REFERENCES originals.whole_restore_permits(request_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 instance_id pg_catalog.uuid NOT NULL,
 captured_revision pg_catalog.int8 NOT NULL CHECK (captured_revision>0),
 PRIMARY KEY(request_id,instance_id)
) USING heap;
-- whole_restore_members also has ZERO rows in every committed observable state.
