# Exact successor identity guard and restore-permit renderer

Proposed fixed new-provider-only renderer, not executed. Retain original G04 identity_function_sql inputs/quoting/native trigger flags/owner/ACL/settings and old functions byte-for-byte for old stores. New function is admitted ONLY through the exact new profile, real original registered supervisor/active core request/reservation and native birth. A data dictionary/template/string is not a renderer capability.

At construction validate full source/native record; Q quotes trusted identifier as provider-and-codec.md; U is one canonical original UUID literal with explicit pg_catalog.uuid cast; O is decimal positive original OID; S is NUL-free original native name SQL literal with apostrophes doubled. Inputs to rendering are EXACT `{providerSchema,functionName,tableToken,lineageId,tableOid,tableSchema,tableName,idColumn,revisionColumn}` derived by original native creator AFTER birth; no caller-supplied SQL/native type/function name. Table metadata/trigger names remain original `__umf_row_id_<token32>`, `__umf_row_rev_<token32>`, `__umf_row_key_<token32>`, `__umf_row_positive_<token32>`, `__umf_row_guard_<token32>`, with original collision refusal and actual unique/positive constraints. Function/trigger exact names/native shape are born receipts, not prefix admission.

Fixed rendered body below. Q(P),Q(F),Q(ID),Q(REV),U(TOKEN),U(LINEAGE),O(TABLE),S(SCHEMA),S(TABLE) are the ONLY substitutions and are library-rendered trusted inputs above. No bracket/native SQL callbacks. It is owned by controller, has exactly controller-only EXECUTE, SECURITY DEFINER fixed search_path; actual maintenance/session/facade guards outside the function remain mandatory. Ordinary subjects cannot create a permit, write either ledger, SET a permit GUC, or reach private schema.

```sql
CREATE FUNCTION Q(P).Q(F)() RETURNS trigger
 LANGUAGE plpgsql VOLATILE CALLED ON NULL INPUT SECURITY DEFINER
 PARALLEL UNSAFE COST 100 SET search_path=pg_catalog AS $umf_lineage_identity$
DECLARE n pg_catalog.int8;
 rid pg_catalog.uuid;
 req pg_catalog.uuid;
 rev pg_catalog.int8;
BEGIN
 IF TG_RELID<>O(TABLE)::pg_catalog.oid OR TG_TABLE_SCHEMA<>S(SCHEMA)
    OR TG_TABLE_NAME<>S(TABLE) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='umf lineage target denied';
 END IF;
 PERFORM 1 FROM Q(P).lineages WHERE lineage_id=U(LINEAGE)
  AND state='active' AND active_table_token=U(TOKEN) FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='umf lineage inactive';
 END IF;
 PERFORM 1 FROM Q(P).row_tables r JOIN Q(P).carrier_generations g
  ON g.table_token=r.table_token WHERE r.table_token=U(TOKEN)
  AND r.business_table_oid=TG_RELID AND r.carrier_state='active'
  AND g.lineage_id=U(LINEAGE) AND g.state='active' FOR UPDATE OF r,g;
 IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='umf carrier inactive';
 END IF;
 IF TG_OP='INSERT' THEN
  SELECT p.request_id INTO req FROM Q(P).whole_restore_permits p
   JOIN Q(P).whole_requests r ON r.request_id=p.request_id
   WHERE p.table_token=U(TOKEN) AND p.backend_pid=pg_catalog.pg_backend_pid()
    AND p.transaction_id=pg_catalog.pg_current_xact_id()
    AND r.kind='restore' AND r.state='reserved';
  IF req IS NOT NULL THEN
   SELECT m.captured_revision INTO rev FROM Q(P).whole_restore_members m
    WHERE m.request_id=req AND m.instance_id=NEW.Q(ID);
   IF rev IS NULL OR NOT EXISTS(SELECT 1 FROM Q(P).lineage_issued_instances
       WHERE lineage_id=U(LINEAGE) AND instance_id=NEW.Q(ID)) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='umf restore population denied';
   END IF;
   NEW.Q(REV):=rev;
  ELSE
   rid:=pg_catalog.gen_random_uuid();
   UPDATE Q(P).lineages SET issued_count=issued_count OPERATOR(pg_catalog.+) 1,
    revision=revision OPERATOR(pg_catalog.+) 1
    WHERE lineage_id=U(LINEAGE) AND issued_count<max_issued_instances
      AND revision<9007199254740991;
   GET DIAGNOSTICS n=ROW_COUNT;
   IF n<>1 THEN
    RAISE EXCEPTION USING ERRCODE='54000',MESSAGE='umf lineage capacity exhausted';
   END IF;
   INSERT INTO Q(P).lineage_issued_instances(lineage_id,instance_id,first_table_token)
    VALUES(U(LINEAGE),rid,U(TOKEN));
   NEW.Q(ID):=rid;
   NEW.Q(REV):=1::pg_catalog.int8;
  END IF;
  UPDATE Q(P).row_tables SET issued_count=issued_count OPERATOR(pg_catalog.+) 1
   WHERE table_token=U(TOKEN)
    AND issued_count<(record->'original'->>'maxIssuedInstances')::pg_catalog.int8;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>1 THEN
   RAISE EXCEPTION USING ERRCODE='54000',MESSAGE='umf carrier capacity exhausted';
  END IF;
  INSERT INTO Q(P).issued_instances(table_token,instance_id)
   VALUES(U(TOKEN),NEW.Q(ID));
 ELSIF TG_OP='UPDATE' THEN
  IF NEW.Q(ID) IS DISTINCT FROM OLD.Q(ID) OR NEW.Q(REV) IS DISTINCT FROM OLD.Q(REV) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='umf row identity mutation denied';
  END IF;
  IF OLD.Q(REV)=9223372036854775807 THEN
   RAISE EXCEPTION USING ERRCODE='22003',MESSAGE='umf row revision exhausted';
  END IF;
  NEW.Q(ID):=OLD.Q(ID);
  NEW.Q(REV):=OLD.Q(REV) OPERATOR(pg_catalog.+) 1::pg_catalog.int8;
 ELSE
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='umf lineage event denied';
 END IF;
 RETURN NEW;
END;
$umf_lineage_identity$
```

Lineage issued_count/revision/state/active pointer/generation_count are solely typed native mutable columns, as provider-and-codec.md's immutable record and LineageObservation specify. There is no hidden native RFC8785/hash primitive. Ordinary new issuance updates native issued_count and revision in the guard atomically; lineage record/digest stay unchanged. row_tables native issued_count is separately checked against its per-carrier ledger; its original G04 record contains NO issuedCount key and is not enlarged by ordinary inserts. Restore attachment changes carrier native count, not lineage-issued count/revision. Native phase lineage activation/retirement/generation changes increment native revision under the same lock and preserve the immutable record. Every current observation verifies full original history/record/scalar correspondence; serialized observation is data, not a source of truth.

Restore permit record EXACT `{profile:"umf.whole-table-restore-permit/0.1",requestId,requestDigest,reservationDigest,archiveId,lineageId,tableToken,physicalGeneration,backendPid,transactionId,expectedCount,populationProofDigest,sourceValuesRelation,targetBusinessRelation}`. It is inserted ONLY by fixed native facade after actual private core pending request/effect/plan/lease/source/policy/registry validation, SAME private connection/TX. Members are native `(request_id,instance_id,captured_revision)` rows copied only from original protected whole values heap; privately verify set/revision equality before INSERT. No values in permit. Before effect outcome/COMMIT delete all original members then permit and verify ZERO global permit/member rows for committed inventory. Unknown COMMIT cannot leave reusable permit. An ordinary INSERT on the same original connection cannot execute author statements while permit exists; only exact prepared restore dispatch is permitted. Full native guard, session scope, exact function binding, after-complete metadata/proof and failure/cancellation tests are mandatory.
