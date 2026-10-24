-- UNADOPTED successor design, NEVER executed in this task.
-- Fresh umf.native-row-originals-inventory-store/0.1 ONLY, not ALTER on old stores.
-- Other archives/issued_instances/archive_lifecycle/values definitions remain
-- exactly their pinned adopted G05 .2 + G04 .2 capacity + finite native closure.
CREATE TABLE originals.row_tables (
 table_token pg_catalog.uuid PRIMARY KEY,
 installation_id pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (installation_id <> ''),
 business_table_oid pg_catalog.oid NOT NULL,
 business_schema_oid pg_catalog.oid NOT NULL,
 table_binding pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
 issued_count pg_catalog.int8 NOT NULL CHECK (issued_count BETWEEN 0 AND 1000000),
 carrier_state pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (carrier_state IN ('active','retired')),
 record pg_catalog.jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(record) = 'object'),
 record_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (record_digest ~ '^[a-f0-9]{64}$')
) USING heap;
CREATE UNIQUE INDEX row_tables_active_business_oid
 ON originals.row_tables(business_table_oid) WHERE carrier_state='active';
CREATE TABLE originals.carrier_retirements (
 table_token pg_catalog.uuid PRIMARY KEY REFERENCES originals.row_tables(table_token) ON UPDATE RESTRICT ON DELETE RESTRICT,
 request_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL UNIQUE CHECK (request_digest ~ '^[a-f0-9]{64}$'),
 original_business_oid pg_catalog.oid NOT NULL,
 plan_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (plan_digest ~ '^[a-f0-9]{64}$'),
 record pg_catalog.jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(record)='object' AND pg_catalog.octet_length(record::pg_catalog.text)<=2097152),
 record_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (record_digest ~ '^[a-f0-9]{64}$')
) USING heap;
-- Controller owner/effective ACL only, no user triggers/RLS/rules/partitions.
-- Exact declared FK RI and parent-bound TOAST objects ARE required, as governed.
-- Host canonical retirement receipt limit1MiB; native JSON text limit2MiB conjunctive.
