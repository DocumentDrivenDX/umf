-- Generated from fabricated legal domain sources; review configuration before application.
CREATE TABLE "legal_demo"."clients" (
  "client_id" pg_catalog."int4" NOT NULL,
  "client_name" pg_catalog."text" COLLATE pg_catalog."C" NOT NULL,
  CONSTRAINT "umf_k_6d7f9e45a2abf651f2b4dc6eec6c8223" PRIMARY KEY ("client_id")
);
ALTER TABLE "legal_demo"."clients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "legal_demo"."clients" FORCE ROW LEVEL SECURITY;
CREATE TABLE "legal_demo"."timekeepers" (
  "timekeeper_id" pg_catalog."int4" NOT NULL,
  "timekeeper_name" pg_catalog."text" COLLATE pg_catalog."C" NOT NULL,
  "timekeeper_level" pg_catalog."text" COLLATE pg_catalog."C" NOT NULL,
  "billing_rate" pg_catalog."numeric"(10,2) NOT NULL,
  CONSTRAINT "umf_k_2fc221ae5773e7cb5654db97ab8c4606" PRIMARY KEY ("timekeeper_id"),
  CONSTRAINT "umf_d_075795fa5319b8ae591c2ed31f74cfc7" CHECK ("billing_rate" NOT IN ('NaN'::pg_catalog.numeric, 'Infinity'::pg_catalog.numeric, '-Infinity'::pg_catalog.numeric))
);
ALTER TABLE "legal_demo"."timekeepers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "legal_demo"."timekeepers" FORCE ROW LEVEL SECURITY;
CREATE TABLE "legal_demo"."matters" (
  "matter_id" pg_catalog."int4" NOT NULL,
  "client_id" pg_catalog."int4" NOT NULL,
  "matter_number" pg_catalog."text" COLLATE pg_catalog."C" NOT NULL,
  "matter_title" pg_catalog."text" COLLATE pg_catalog."C" NOT NULL,
  "practice_area" pg_catalog."text" COLLATE pg_catalog."C" NOT NULL,
  "open_date" pg_catalog."date" NOT NULL,
  "close_date" pg_catalog."date",
  "jurisdiction" pg_catalog."text" COLLATE pg_catalog."C" NOT NULL,
  "court" pg_catalog."text" COLLATE pg_catalog."C" NOT NULL,
  CONSTRAINT "umf_k_4fd93e7fa34fed37823182eb9d5cd174" PRIMARY KEY ("matter_id"),
  CONSTRAINT "umf_d_f9d924873abd87caa336e79dd3bd1b33" CHECK ("open_date" >= '0001-01-01'::pg_catalog.date AND "open_date" <= '9999-12-31'::pg_catalog.date),
  CONSTRAINT "umf_d_44e579157ca33821a853608f1bc0f327" CHECK ("close_date" >= '0001-01-01'::pg_catalog.date AND "close_date" <= '9999-12-31'::pg_catalog.date)
);
ALTER TABLE "legal_demo"."matters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "legal_demo"."matters" FORCE ROW LEVEL SECURITY;
CREATE TABLE "legal_demo"."matter_teams" (
  "matter_team_id" pg_catalog."int4" NOT NULL,
  "matter_id" pg_catalog."int4" NOT NULL,
  "timekeeper_id" pg_catalog."int4" NOT NULL,
  "database_role" pg_catalog."text" COLLATE pg_catalog."C" NOT NULL,
  CONSTRAINT "umf_k_b4702e666d52b66dc7d637aad8e22861" PRIMARY KEY ("matter_team_id"),
  CONSTRAINT "umf_k_3537084debb60256317080882fa0d624" UNIQUE ("matter_id", "timekeeper_id")
);
ALTER TABLE "legal_demo"."matter_teams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "legal_demo"."matter_teams" FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "legal_demo"."clients" FROM PUBLIC;
CREATE POLICY "umf_person_select" ON "legal_demo"."clients" AS PERMISSIVE FOR SELECT TO "legal_person" USING (TRUE);
GRANT SELECT ON TABLE "legal_demo"."clients" TO "legal_person";
CREATE POLICY "umf_person_insert" ON "legal_demo"."clients" AS PERMISSIVE FOR INSERT TO "legal_person" WITH CHECK (FALSE);
CREATE POLICY "umf_person_update" ON "legal_demo"."clients" AS PERMISSIVE FOR UPDATE TO "legal_person" USING (FALSE) WITH CHECK (FALSE);
CREATE POLICY "umf_person_delete" ON "legal_demo"."clients" AS PERMISSIVE FOR DELETE TO "legal_person" USING (FALSE);
CREATE POLICY "umf_batch_select" ON "legal_demo"."clients" AS PERMISSIVE FOR SELECT TO "legal_batch" USING (FALSE);
CREATE POLICY "umf_batch_insert" ON "legal_demo"."clients" AS PERMISSIVE FOR INSERT TO "legal_batch" WITH CHECK (FALSE);
CREATE POLICY "umf_batch_update" ON "legal_demo"."clients" AS PERMISSIVE FOR UPDATE TO "legal_batch" USING (FALSE) WITH CHECK (FALSE);
CREATE POLICY "umf_batch_delete" ON "legal_demo"."clients" AS PERMISSIVE FOR DELETE TO "legal_batch" USING (FALSE);
REVOKE ALL PRIVILEGES ON TABLE "legal_demo"."timekeepers" FROM PUBLIC;
CREATE POLICY "umf_person_select" ON "legal_demo"."timekeepers" AS PERMISSIVE FOR SELECT TO "legal_person" USING ((FALSE OR pg_catalog.pg_has_role(CURRENT_USER, E'legal_billing_admin', 'MEMBER')));
GRANT SELECT ON TABLE "legal_demo"."timekeepers" TO "legal_person";
CREATE POLICY "umf_person_insert" ON "legal_demo"."timekeepers" AS PERMISSIVE FOR INSERT TO "legal_person" WITH CHECK (FALSE);
CREATE POLICY "umf_person_update" ON "legal_demo"."timekeepers" AS PERMISSIVE FOR UPDATE TO "legal_person" USING (FALSE) WITH CHECK (FALSE);
CREATE POLICY "umf_person_delete" ON "legal_demo"."timekeepers" AS PERMISSIVE FOR DELETE TO "legal_person" USING (FALSE);
CREATE POLICY "umf_batch_select" ON "legal_demo"."timekeepers" AS PERMISSIVE FOR SELECT TO "legal_batch" USING (FALSE);
CREATE POLICY "umf_batch_insert" ON "legal_demo"."timekeepers" AS PERMISSIVE FOR INSERT TO "legal_batch" WITH CHECK (FALSE);
CREATE POLICY "umf_batch_update" ON "legal_demo"."timekeepers" AS PERMISSIVE FOR UPDATE TO "legal_batch" USING (FALSE) WITH CHECK (FALSE);
CREATE POLICY "umf_batch_delete" ON "legal_demo"."timekeepers" AS PERMISSIVE FOR DELETE TO "legal_batch" USING (FALSE);
REVOKE ALL PRIVILEGES ON TABLE "legal_demo"."matters" FROM PUBLIC;
CREATE POLICY "umf_person_select" ON "legal_demo"."matters" AS PERMISSIVE FOR SELECT TO "legal_person" USING (((EXISTS (SELECT 1 FROM "legal_demo"."matter_teams" AS "umf_j_1" WHERE "legal_demo"."matters"."matter_id" = "umf_j_1"."matter_id" AND ("umf_j_1"."database_role" COLLATE pg_catalog."C" = CURRENT_USER::pg_catalog.text COLLATE pg_catalog."C")))));
GRANT SELECT ON TABLE "legal_demo"."matters" TO "legal_person";
CREATE POLICY "umf_person_insert" ON "legal_demo"."matters" AS PERMISSIVE FOR INSERT TO "legal_person" WITH CHECK (((EXISTS (SELECT 1 FROM "legal_demo"."matter_teams" AS "umf_j_1" WHERE "legal_demo"."matters"."matter_id" = "umf_j_1"."matter_id" AND ("umf_j_1"."database_role" COLLATE pg_catalog."C" = CURRENT_USER::pg_catalog.text COLLATE pg_catalog."C")))));
GRANT INSERT ON TABLE "legal_demo"."matters" TO "legal_person";
CREATE POLICY "umf_person_update" ON "legal_demo"."matters" AS PERMISSIVE FOR UPDATE TO "legal_person" USING (((EXISTS (SELECT 1 FROM "legal_demo"."matter_teams" AS "umf_j_1" WHERE "legal_demo"."matters"."matter_id" = "umf_j_1"."matter_id" AND ("umf_j_1"."database_role" COLLATE pg_catalog."C" = CURRENT_USER::pg_catalog.text COLLATE pg_catalog."C"))))) WITH CHECK (((EXISTS (SELECT 1 FROM "legal_demo"."matter_teams" AS "umf_j_1" WHERE "legal_demo"."matters"."matter_id" = "umf_j_1"."matter_id" AND ("umf_j_1"."database_role" COLLATE pg_catalog."C" = CURRENT_USER::pg_catalog.text COLLATE pg_catalog."C")))));
GRANT UPDATE ("client_id", "matter_number", "matter_title", "practice_area", "open_date", "close_date", "jurisdiction", "court") ON TABLE "legal_demo"."matters" TO "legal_person";
CREATE POLICY "umf_person_delete" ON "legal_demo"."matters" AS PERMISSIVE FOR DELETE TO "legal_person" USING (((EXISTS (SELECT 1 FROM "legal_demo"."matter_teams" AS "umf_j_1" WHERE "legal_demo"."matters"."matter_id" = "umf_j_1"."matter_id" AND ("umf_j_1"."database_role" COLLATE pg_catalog."C" = CURRENT_USER::pg_catalog.text COLLATE pg_catalog."C")))));
GRANT DELETE ON TABLE "legal_demo"."matters" TO "legal_person";
CREATE POLICY "umf_batch_select" ON "legal_demo"."matters" AS PERMISSIVE FOR SELECT TO "legal_batch" USING (TRUE);
GRANT SELECT ON TABLE "legal_demo"."matters" TO "legal_batch";
CREATE POLICY "umf_batch_insert" ON "legal_demo"."matters" AS PERMISSIVE FOR INSERT TO "legal_batch" WITH CHECK (TRUE);
GRANT INSERT ON TABLE "legal_demo"."matters" TO "legal_batch";
CREATE POLICY "umf_batch_update" ON "legal_demo"."matters" AS PERMISSIVE FOR UPDATE TO "legal_batch" USING (FALSE) WITH CHECK (FALSE);
CREATE POLICY "umf_batch_delete" ON "legal_demo"."matters" AS PERMISSIVE FOR DELETE TO "legal_batch" USING (FALSE);
ALTER TABLE "legal_demo"."matter_teams" ADD CONSTRAINT "matter_teams_fk_0" FOREIGN KEY ("matter_id") REFERENCES "legal_demo"."matters" ("matter_id") ON UPDATE NO ACTION ON DELETE RESTRICT NOT DEFERRABLE;
ALTER TABLE "legal_demo"."matter_teams" ADD CONSTRAINT "matter_teams_fk_1" FOREIGN KEY ("timekeeper_id") REFERENCES "legal_demo"."timekeepers" ("timekeeper_id") ON UPDATE NO ACTION ON DELETE RESTRICT NOT DEFERRABLE;
REVOKE ALL PRIVILEGES ON TABLE "legal_demo"."matter_teams" FROM PUBLIC;
CREATE POLICY "umf_person_select" ON "legal_demo"."matter_teams" AS PERMISSIVE FOR SELECT TO "legal_person" USING (("database_role" COLLATE pg_catalog."C" = CURRENT_USER::pg_catalog.text COLLATE pg_catalog."C"));
GRANT SELECT ON TABLE "legal_demo"."matter_teams" TO "legal_person";
CREATE POLICY "umf_person_insert" ON "legal_demo"."matter_teams" AS PERMISSIVE FOR INSERT TO "legal_person" WITH CHECK (FALSE);
CREATE POLICY "umf_person_update" ON "legal_demo"."matter_teams" AS PERMISSIVE FOR UPDATE TO "legal_person" USING (FALSE) WITH CHECK (FALSE);
CREATE POLICY "umf_person_delete" ON "legal_demo"."matter_teams" AS PERMISSIVE FOR DELETE TO "legal_person" USING (FALSE);
CREATE POLICY "umf_batch_select" ON "legal_demo"."matter_teams" AS PERMISSIVE FOR SELECT TO "legal_batch" USING (TRUE);
GRANT SELECT ON TABLE "legal_demo"."matter_teams" TO "legal_batch";
CREATE POLICY "umf_batch_insert" ON "legal_demo"."matter_teams" AS PERMISSIVE FOR INSERT TO "legal_batch" WITH CHECK (FALSE);
CREATE POLICY "umf_batch_update" ON "legal_demo"."matter_teams" AS PERMISSIVE FOR UPDATE TO "legal_batch" USING (FALSE) WITH CHECK (FALSE);
CREATE POLICY "umf_batch_delete" ON "legal_demo"."matter_teams" AS PERMISSIVE FOR DELETE TO "legal_batch" USING (FALSE);
COMMENT ON TABLE "legal_demo"."clients" IS E'Fabricated demonstration only; no real firm records.';
COMMENT ON COLUMN "legal_demo"."clients"."client_id" IS E'Fabricated client id';
COMMENT ON COLUMN "legal_demo"."clients"."client_name" IS E'Fabricated client name';
COMMENT ON TABLE "legal_demo"."timekeepers" IS E'Fabricated demonstration only; no real firm records.';
COMMENT ON COLUMN "legal_demo"."timekeepers"."timekeeper_id" IS E'Fabricated timekeeper id';
COMMENT ON COLUMN "legal_demo"."timekeepers"."timekeeper_name" IS E'Fabricated timekeeper name';
COMMENT ON COLUMN "legal_demo"."timekeepers"."timekeeper_level" IS E'Fabricated timekeeper level';
COMMENT ON COLUMN "legal_demo"."timekeepers"."billing_rate" IS E'Fabricated billing rate';
COMMENT ON TABLE "legal_demo"."matters" IS E'Fabricated demonstration only; no real firm records.';
COMMENT ON COLUMN "legal_demo"."matters"."matter_id" IS E'Fabricated matter id';
COMMENT ON COLUMN "legal_demo"."matters"."client_id" IS E'Fabricated client id';
COMMENT ON COLUMN "legal_demo"."matters"."matter_number" IS E'Fabricated matter number';
COMMENT ON COLUMN "legal_demo"."matters"."matter_title" IS E'Fabricated matter title';
COMMENT ON COLUMN "legal_demo"."matters"."practice_area" IS E'Fabricated practice area';
COMMENT ON COLUMN "legal_demo"."matters"."open_date" IS E'Fabricated open date';
COMMENT ON COLUMN "legal_demo"."matters"."close_date" IS E'Fabricated close date';
COMMENT ON COLUMN "legal_demo"."matters"."jurisdiction" IS E'Fabricated jurisdiction';
COMMENT ON COLUMN "legal_demo"."matters"."court" IS E'Fabricated court';
COMMENT ON TABLE "legal_demo"."matter_teams" IS E'Fabricated demonstration only; no real firm records.';
COMMENT ON COLUMN "legal_demo"."matter_teams"."matter_team_id" IS E'Fabricated matter team id';
COMMENT ON COLUMN "legal_demo"."matter_teams"."matter_id" IS E'Fabricated matter id';
COMMENT ON COLUMN "legal_demo"."matter_teams"."timekeeper_id" IS E'Fabricated timekeeper id';
COMMENT ON COLUMN "legal_demo"."matter_teams"."database_role" IS E'Synthetic database role assigned by the host; never a plugin-supplied identity claim.';
GRANT USAGE ON SCHEMA "legal_demo" TO "legal_person", "legal_batch";
