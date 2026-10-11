-- Actual release-policy selection from original configuration/archive correspondence.
-- Private coordinator component: no PA authorization, held-cut or readiness claim.
CREATE FUNCTION truss.runtime_select_catalog_report_release(
 expected_writer text,expected_ordinal text,expected_generation text,
 expected_configuration_profile_hex text)
RETURNS TABLE(policy_hex text,policy_sha256 text,configuration_generation text)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
DECLARE captured record; original_json json; configuration jsonb; choice json;
 context jsonb; archived bytea; archived_digest bytea; identity_digest bytea; matches bigint;
 configuration_profile bytea:=convert_to($configuration${
  "identity": "truss-catalog-report-configuration",
  "version": "0.1.0",
  "interfaceVersion": "truss-catalog-report-configuration-profile/0.1",
  "configurationInterfaceVersion": "truss-catalog-report-configuration/0.1",
  "fields": [
    "interfaceVersion",
    "catalogReportRelease"
  ],
  "selectionFields": [
    "artifactIdentity",
    "sha256"
  ],
  "artifactIdentity": "truss.catalog-report-release/0.1.0",
  "duplicateKeys": "refuse at both object levels",
  "selectionMeaning": "exact full release artifact bytes and SHA256 under original installation input archive role",
  "source": "original operation_configuration capsule with current epoch/configuration correspondence",
  "authority": "separate protected original capture-to-writer, installed source and current-authority protocol required",
  "implementationPins": "outer installation bundle"
}
$configuration$,'UTF8');
 release_bytes bytea:=convert_to($release${
  "identity": "truss-catalog-report-release",
  "version": "0.1.0",
  "artifactIdentity": "truss.catalog-report-release/0.1.0",
  "interfaceVersion": "truss-catalog-report-release-policy/0.1",
  "reportInterfaceVersion": "truss-acceptance-report/0.3.0-proposal",
  "configurationInterfaceVersion": "truss-catalog-report-configuration/0.1",
  "archiveRole": "input",
  "canonicalEncoding": "truss-canonical/0.1.0 numeric-free UTF8 unsigned-key ordering",
  "selection": {
    "catalog": "first positive revision, fresh definitions and graph",
    "sourceUmf": "0.7.0",
    "ingress": "native",
    "binding": "absent",
    "transforms": "empty",
    "storageHome": "json",
    "assertions": "complete original closed string-record inventory, none/unqualified"
  },
  "hostSourceFields": [
    "umf",
    "diagnostics",
    "documentInterpretations",
    "losses",
    "extensions",
    "transformRegistrations",
    "assertionEntries"
  ],
  "nativeReportFields": [
    "interfaceVersion",
    "reportProfile",
    "rev",
    "originalExecution",
    "acceptedInput",
    "documents",
    "counts",
    "provisional",
    "rebinds",
    "assertions",
    "pending_indexes",
    "lifecycleProfile",
    "reactivations"
  ],
  "capture": {
    "contextInterfaceVersion": "truss-native-operation-context/0.4",
    "actor": "original pre-elevation captured actingUser and role OID",
    "assertedOrigin": "original assertedOriginUtf8Hex, numeric-free exact tree",
    "requiredBoundary": "original authenticated capture-to-writer and current-authority protocol"
  },
  "originMapping": {
    "null": "null",
    "boolean": "boolean",
    "string": "string without interpretation",
    "array": "ordered sequence",
    "object": "map ordered by unsigned original UTF8 keys",
    "databaseRole": "separate original captured actor, never overwrite asserted labels"
  },
  "limits": {
    "candidateBytes": "1048576",
    "aggregateInputBytes": "4194304",
    "reportBytes": "4194304",
    "sourceTreeDepth": "128"
  },
  "requiredInstalledComposition": [
    "complete selected layout and dependency inventory",
    "original configuration capsule and held installed-source cut",
    "original driver issuer and bounded settlement/recovery",
    "shared selected resource profile",
    "report and revision feed original producer closure",
    "whole-transaction commit validation"
  ],
  "refusal": "missing, ambiguous, changed or unsupported original source refuses; no inferred empty inventories or automatic retry",
  "implementationPins": "outer installation bundle; policy never hashes its implementing body",
  "resources": [
    {
      "path": "packages/python/src/truss/_report_schemas/exact-value-v0.1.schema.json",
      "sha256": "0c804796bfbf68339c299f0c55d24db58fcfcc929bffe2d5ffaf4a2f27e24880"
    },
    {
      "path": "packages/python/src/truss/_report_schemas/history-record-v0.1.schema.json",
      "sha256": "c35c1258028cc4c8c95dcd16b561caed4f2a347c086f72ebfc7bfc4f2dfcf2fe"
    },
    {
      "path": "packages/python/src/truss/_report_schemas/history-event-v0.1.schema.json",
      "sha256": "e42f9b48642528cabbb646ccb758eb12b7f030029b712cf5d6f5174cbd90bfa6"
    },
    {
      "path": "packages/python/src/truss/_report_schemas/acceptance-input-v0.1.schema.json",
      "sha256": "0278cbbbde843091c005b688fd9c081a2fdff843b9adda006ba80fb87828d7cd"
    },
    {
      "path": "packages/python/src/truss/_report_schemas/acceptance-rejection-v0.1.schema.json",
      "sha256": "98262b8d99fe0f87f752140a418a4e4f8751c4d28986457302586fee622258cf"
    },
    {
      "path": "packages/python/src/truss/_report_schemas/enforcement-report-v0.1.schema.json",
      "sha256": "7af9c786a297583d6eb5489d85f33fb0a04b2c1d0b6551e6d107528cc15c4137"
    },
    {
      "path": "packages/python/src/truss/_report_schemas/direct-cursor-v0.1.schema.json",
      "sha256": "bff79ad2e5ccc1047b43bdbe6eeb51b597f098c881313fd980de01c1685b4942"
    },
    {
      "path": "packages/python/src/truss/_report_schemas/acceptance-report-v0.1.schema.json",
      "sha256": "ccdc9976de3c158fae0a14d6cc41685d5f5a289d67daeb86b5e998b4a611e902"
    },
    {
      "path": "packages/python/src/truss/_report_schemas/history-retain-payload-v0.1.proposal.schema.json",
      "sha256": "fc08e07a4b09636ac234737be9bb2cf3a9a3c26120baad612176574c17659605"
    },
    {
      "path": "packages/python/src/truss/_report_schemas/history-event-v0.2.proposal.schema.json",
      "sha256": "714923be0f86bd3508a097cabfee63a180e03b19651ebbfa38844bb3e637b425"
    },
    {
      "path": "packages/python/src/truss/_report_schemas/acceptance-report-v0.3.proposal.schema.json",
      "sha256": "c54196f8b4324aec768a33eeeab89bc2615a954af0e45559ed2038ccad7f14bf"
    },
    {
      "path": "packages/python/src/truss/_profiles/fresh-catalog-support.json",
      "sha256": "1226bb636125567d1e628f5250655a615d104c401ba639f1c6b6031ba346bcdd"
    },
    {
      "path": "packages/python/src/truss/_profiles/catalog-enforcement-projection.json",
      "sha256": "678e52ea00fa984b19162441a33b33ab3d822b58f8ae2c69195dc1d5d658c4b1"
    },
    {
      "path": "packages/python/src/truss/_profiles/fresh-catalog-lifecycle.json",
      "sha256": "b477ea156c92210be27b118e1ecbda90dc459795dcecea7b010252fd44cffada"
    },
    {
      "path": "packages/python/src/truss/_profiles/absent-binding-index-declarations.json",
      "sha256": "332591930fb0f8a370b24e9607ef1f126f1e53ada88cdfed193c848078b31d8d"
    },
    {
      "path": "docs/helix/02-design/contracts/asserted-origin-capture.proposal.md",
      "sha256": "dd047b5817322aa7dfd6b4e62218822c595ceaaad33c3bfbe8b75d8bc0b4d271"
    },
    {
      "path": "docs/helix/02-design/contracts/asserted-origin-map-v0.1.proposal.json",
      "sha256": "c3f2645d6af8465366b49332d62cf696ee58acebf826e4abd5aa9de33aa7497d"
    },
    {
      "path": "docs/helix/02-design/contracts/bindings/acceptance-input-decoder-resource-v0.1.candidate.json",
      "sha256": "79a9d77371cd2c1b6a06cee8f996c4d5f5a0d830c1dedad7002ea63e3f24157b"
    },
    {
      "path": "docs/helix/02-design/contracts/bindings/operation-arbitration-resource-v0.1.candidate.json",
      "sha256": "1468bf2b27153be99958b53d0244c09c36e22755d41819037f44531ac9060e36"
    },
    {
      "path": "docs/helix/02-design/contracts/bindings/feed-finalization-resource-v0.1.proposal.json",
      "sha256": "e560fb142e536b603d37b90b4dbaee5cb69c74bdbe9a2b58cb789df560965ebc"
    },
    {
      "path": "packages/python/src/truss/_profiles/catalog-report-configuration.json",
      "sha256": "441bff53c4cbc08ff9975f083d896b95a80ae6921d3a0bee244f3eb3502e99b9"
    }
  ],
  "resourceInterpretation": "Pinned specifications; complete installed implementation and shared accounting required before protected use"
}
$release$,'UTF8');
BEGIN
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
  OR current_setting('transaction_read_only') IS DISTINCT FROM 'off' THEN
  RAISE EXCEPTION 'fresh read committed read-write release selection required' USING ERRCODE='55000';
 END IF;
 IF expected_configuration_profile_hex IS DISTINCT FROM encode(configuration_profile,'hex') THEN
  RAISE EXCEPTION 'recognized configuration profile required' USING ERRCODE='0A000';
 END IF;
 SELECT * INTO STRICT captured FROM truss.runtime_collect_catalog_admission_configuration(
  expected_writer,expected_ordinal,expected_generation,expected_configuration_profile_hex);
 original_json:=convert_from(decode(captured.configuration_hex,'hex'),'UTF8')::json;
 IF json_typeof(original_json) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'selected catalog report configuration required' USING ERRCODE='0A000';
 END IF;
 IF (SELECT count(*) FROM json_each(original_json))<>2
  OR (SELECT count(DISTINCT key COLLATE pg_catalog."C") FROM json_each(original_json))<>2 THEN
  RAISE EXCEPTION 'closed unambiguous catalog report configuration required' USING ERRCODE='0A000';
 END IF;
 configuration:=original_json::jsonb;
 IF NOT configuration ?& ARRAY['interfaceVersion','catalogReportRelease']
  OR configuration->>'interfaceVersion' IS DISTINCT FROM 'truss-catalog-report-configuration/0.1' THEN
  RAISE EXCEPTION 'recognized catalog report configuration required' USING ERRCODE='0A000';
 END IF;
 choice:=original_json->'catalogReportRelease';
 IF json_typeof(choice) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'closed release artifact selection required' USING ERRCODE='0A000';
 END IF;
 IF (SELECT count(*) FROM json_each(choice))<>2
  OR (SELECT count(DISTINCT key COLLATE pg_catalog."C") FROM json_each(choice))<>2
  OR NOT choice::jsonb ?& ARRAY['artifactIdentity','sha256']
  OR json_typeof(choice->'artifactIdentity') IS DISTINCT FROM 'string'
  OR json_typeof(choice->'sha256') IS DISTINCT FROM 'string'
  OR choice->>'artifactIdentity' COLLATE pg_catalog."C" IS DISTINCT FROM 'truss.catalog-report-release/0.1.0'
  OR choice->>'sha256' COLLATE pg_catalog."C" IS DISTINCT FROM encode(sha256(release_bytes),'hex') THEN
  RAISE EXCEPTION 'exact selected catalog report release required' USING ERRCODE='0A000';
 END IF;
 context:=convert_from(decode(captured.context_hex,'hex'),'UTF8')::jsonb;
 -- Row locks cannot fence a new matching archive row. SHARE excludes all
 -- concurrent INSERT/UPDATE/DELETE/TRUNCATE and archive DDL through transaction
 -- end (or rollback across acquisition). Same-writer changes still require the
 -- original host lifecycle and protected dispatcher; this is not PA authority.
 -- Refuse conflicting writers immediately, including competing lock upgrades.
 LOCK TABLE truss.installation_archive IN SHARE MODE NOWAIT;
 SELECT count(*) INTO matches FROM truss.installation_archive a
 WHERE convert_to(a.installation_id,'UTF8')=convert_to(context->>'installationId','UTF8')
  AND a.artifact_role COLLATE pg_catalog."C"='input'
  AND convert_to(a.artifact_identity,'UTF8')=convert_to('truss.catalog-report-release/0.1.0','UTF8');
 IF matches<>1 THEN
  RAISE EXCEPTION 'unique original report release archive required' USING ERRCODE='55000';
 END IF;
 SELECT a.artifact_bytes,a.artifact_sha256,a.artifact_identity_sha256
 INTO STRICT archived,archived_digest,identity_digest FROM truss.installation_archive a
 WHERE convert_to(a.installation_id,'UTF8')=convert_to(context->>'installationId','UTF8')
  AND a.artifact_role COLLATE pg_catalog."C"='input'
  AND convert_to(a.artifact_identity,'UTF8')=convert_to('truss.catalog-report-release/0.1.0','UTF8')
 FOR SHARE NOWAIT;
 IF archived IS DISTINCT FROM release_bytes
  OR archived_digest IS DISTINCT FROM sha256(release_bytes)
  OR identity_digest IS DISTINCT FROM sha256(convert_to('truss.catalog-report-release/0.1.0','UTF8')) THEN
  RAISE EXCEPTION 'original complete report release bytes required' USING ERRCODE='55000';
 END IF;
 PERFORM truss.runtime_require_operation_configuration_current(
  expected_writer,expected_ordinal,expected_generation);
 IF (SELECT count(*) FROM truss.installation_archive a
  WHERE convert_to(a.installation_id,'UTF8')=convert_to(context->>'installationId','UTF8')
   AND a.artifact_role COLLATE pg_catalog."C"='input'
   AND convert_to(a.artifact_identity,'UTF8')=convert_to('truss.catalog-report-release/0.1.0','UTF8'))<>1
  OR NOT EXISTS(SELECT 1 FROM truss.installation_archive a
   WHERE convert_to(a.installation_id,'UTF8')=convert_to(context->>'installationId','UTF8')
    AND a.artifact_role COLLATE pg_catalog."C"='input'
    AND convert_to(a.artifact_identity,'UTF8')=convert_to('truss.catalog-report-release/0.1.0','UTF8')
    AND a.artifact_bytes=release_bytes AND a.artifact_sha256=sha256(release_bytes)
    AND a.artifact_identity_sha256=sha256(convert_to(a.artifact_identity,'UTF8'))) THEN
  RAISE EXCEPTION 'current unique release archive correspondence required' USING ERRCODE='55000';
 END IF;
 -- Recheck verifies the retained row under the native archive table cut.
 -- It does not confer authenticated capture, all-source or final-release authority.
 RETURN QUERY SELECT encode(archived,'hex'),encode(sha256(archived),'hex'),captured.configuration_generation;
END;
$$;
REVOKE ALL ON FUNCTION truss.runtime_select_catalog_report_release(text,text,text,text) FROM PUBLIC;
