-- Private physical-source candidate on an already admitted original operation.
-- Not registered ontology authority, installation, accepted lineage or publication.
CREATE FUNCTION truss.runtime_pending_association_reference(reference json)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF reference IS NULL OR json_typeof(reference)<>'object'
  OR (SELECT count(*) FROM json_object_keys(reference))<>3
  OR EXISTS(SELECT 1 FROM json_each(reference) e WHERE e.key NOT IN ('documentId','moduleId','elementId')
   OR json_typeof(e.value)<>'string' OR octet_length(e.value #>> '{}') NOT BETWEEN 1 AND 4096) THEN
  RAISE EXCEPTION 'qualified original association reference required' USING ERRCODE='22023';
 END IF;
 RETURN reference::jsonb;
END;
$$;
REVOKE ALL ON FUNCTION truss.runtime_pending_association_reference(json) FROM PUBLIC;

CREATE FUNCTION truss.runtime_pending_association_type(revision int,reference jsonb)
RETURNS int LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result int;
BEGIN
 IF reference IS NULL OR jsonb_typeof(reference)<>'object'
  OR NOT reference ?& ARRAY['documentId','moduleId','elementId']
  OR (SELECT count(*) FROM jsonb_object_keys(reference))<>3
  OR EXISTS(SELECT 1 FROM jsonb_each(reference) e WHERE jsonb_typeof(e.value)<>'string'
   OR octet_length(e.value #>> '{}') NOT BETWEEN 1 AND 4096) THEN
  RAISE EXCEPTION 'qualified original association reference required' USING ERRCODE='22023';
 END IF;
 SELECT t.type_id INTO STRICT result FROM truss.type_def t
  WHERE t.document_id COLLATE "C"=(reference->>'documentId') COLLATE "C"
   AND t.module COLLATE "C"=(reference->>'moduleId') COLLATE "C"
   AND t.element COLLATE "C"=(reference->>'elementId') COLLATE "C"
   AND t.kind='record' AND NOT t.provisional AND t.retired_rev IS NULL AND t.since_rev=revision;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION truss.runtime_pending_association_type(int,jsonb) FROM PUBLIC;

CREATE FUNCTION truss.runtime_pending_association_fields(revision int,owner_id int,refs jsonb)
RETURNS int[] LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result int[]:=ARRAY[]::int[]; reference jsonb; property_id int; owner_document text;
BEGIN
 IF refs IS NULL OR jsonb_typeof(refs)<>'array' OR jsonb_array_length(refs) NOT BETWEEN 1 AND 256 THEN
  RAISE EXCEPTION 'bounded ordered association fields required' USING ERRCODE='22023';
 END IF;
 SELECT t.document_id INTO STRICT owner_document FROM truss.type_def t WHERE t.type_id=owner_id AND t.since_rev=revision;
 FOR reference IN SELECT value FROM jsonb_array_elements(refs) LOOP
  IF jsonb_typeof(reference)<>'object' OR NOT reference ?& ARRAY['documentId','moduleId','elementId']
   OR (SELECT count(*) FROM jsonb_object_keys(reference))<>3
   OR EXISTS(SELECT 1 FROM jsonb_each(reference) e WHERE jsonb_typeof(e.value)<>'string'
    OR octet_length(e.value #>> '{}') NOT BETWEEN 1 AND 4096)
   OR reference->>'documentId' IS DISTINCT FROM owner_document THEN
   RAISE EXCEPTION 'owned original association field reference required' USING ERRCODE='22023';
  END IF;
  SELECT p.prop_id INTO STRICT property_id FROM truss.prop_def p WHERE p.type_id=owner_id
   AND p.declaration_module COLLATE "C"=(reference->>'moduleId') COLLATE "C"
   AND p.element COLLATE "C"=(reference->>'elementId') COLLATE "C"
   AND p.since_rev=revision AND p.retired_rev IS NULL
   AND p.scalar_type='string' AND p.nullability='required' AND p.cardinality='one';
  IF property_id=ANY(result) THEN RAISE EXCEPTION 'duplicate association field required refusal' USING ERRCODE='22023'; END IF;
  result:=array_append(result,property_id);
 END LOOP;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION truss.runtime_pending_association_fields(int,int,jsonb) FROM PUBLIC;

CREATE FUNCTION truss.runtime_resolve_pending_association_candidate(original_revision int,original_binding bytea)
RETURNS TABLE(mapping_pointer text,definition jsonb,source_type int,target_type int,mapping_bytes bytea)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
DECLARE binding jsonb; ontology json; entity_item json; association_item json; original_ref jsonb; seen_entity_refs jsonb[]:=ARRAY[]::jsonb[]; seen_association_refs jsonb[]:=ARRAY[]::jsonb[];
 ontology_bytes bytea; mapping jsonb; original_association json; endpoint json; role jsonb;
 original_entity json; owner truss.type_def%ROWTYPE; source_id int; target_id int;
 target_key_id text; role_owner int; fields int[]; target_fields int[]; endpoint_fields int[];
 own_key int[]; seen int[]:=ARRAY[]::int[];
 index int:=0; ontology_start int:=1; pointer text; fragment bytea; fragments bytea[]:=ARRAY[]::bytea[];
 roles_seen text[]; role_name text; original_name text;
BEGIN
 SELECT array_agg(b.mapping_bytes ORDER BY b.mapping_index) INTO fragments
  FROM truss.runtime_extract_original_association_mapping_batch(original_binding) b;
 binding:=convert_from(original_binding,'UTF8')::jsonb;
 IF binding->>'profile' IS DISTINCT FROM 'truss-binary-association-candidate/0.2.0'
  OR NOT binding ?& ARRAY['profile','coreSha256','ontologySha256','modelRevision','ontologyRevision','mappings','ontologyArtifact']
  OR (SELECT count(*) FROM jsonb_object_keys(binding))<>7
  OR EXISTS(SELECT 1 FROM jsonb_each(binding) e WHERE e.key NOT IN ('mappings','ontologyArtifact') AND (jsonb_typeof(e.value)<>'string' OR octet_length(e.value #>> '{}') NOT BETWEEN 1 AND 4096))
  OR jsonb_typeof(binding->'mappings') IS DISTINCT FROM 'array'
  OR jsonb_array_length(binding->'mappings') NOT BETWEEN 1 AND 4096 THEN
  RAISE EXCEPTION 'original binary association candidate profile required' USING ERRCODE='0A000';
 END IF;
 -- Every original slice was validated together before interpretation/writes.
 IF jsonb_typeof(binding->'ontologyArtifact') IS DISTINCT FROM 'object'
  OR NOT (binding->'ontologyArtifact') ?& ARRAY['identity','bytesBase64','sha256']
  OR (SELECT count(*) FROM jsonb_object_keys(binding->'ontologyArtifact'))<>3
  OR EXISTS(SELECT 1 FROM jsonb_each(binding->'ontologyArtifact') e WHERE jsonb_typeof(e.value)<>'string')
  OR jsonb_typeof(binding->'ontologyArtifact'->'identity') IS DISTINCT FROM 'string'
  OR octet_length(binding->'ontologyArtifact'->>'identity') NOT BETWEEN 1 AND 4096 THEN
  RAISE EXCEPTION 'original ontology artifact required' USING ERRCODE='22023';
 END IF;
 ontology_bytes:=decode(binding->'ontologyArtifact'->>'bytesBase64','base64');
 IF ontology_bytes IS NULL OR octet_length(ontology_bytes) NOT BETWEEN 1 AND 1048576
  OR replace(encode(ontology_bytes,'base64'),chr(10),'') IS DISTINCT FROM binding->'ontologyArtifact'->>'bytesBase64'
  OR encode(sha256(ontology_bytes),'hex') IS DISTINCT FROM binding->'ontologyArtifact'->>'sha256'
  OR encode(sha256(ontology_bytes),'hex') IS DISTINCT FROM binding->>'ontologySha256' THEN
  RAISE EXCEPTION 'original ontology artifact correspondence required' USING ERRCODE='55000';
 END IF;
 WHILE ontology_start<=octet_length(ontology_bytes) LOOP
  EXIT WHEN chr(get_byte(ontology_bytes,ontology_start-1)) NOT IN (' ',chr(9),chr(10),chr(13));
  ontology_start:=ontology_start+1;
 END LOOP;
 IF ontology_start>octet_length(ontology_bytes) THEN RAISE EXCEPTION 'unique original ontology JSON required' USING ERRCODE='22023'; END IF;
 PERFORM truss.runtime_original_json_value_end(ontology_bytes,ontology_start);
 IF NOT (convert_from(ontology_bytes,'UTF8') IS JSON OBJECT) THEN
  RAISE EXCEPTION 'original ontology JSON object required' USING ERRCODE='22023';
 END IF;
 IF NOT (convert_from(ontology_bytes,'UTF8') IS JSON OBJECT WITH UNIQUE KEYS) THEN
  -- PostgreSQL16.15 also refuses escaped NUL values under WITH UNIQUE KEYS.
  -- Refuse this native parser subset; never call such valid source invalid or
  -- discard it. General admission must consume a registered original owner basis.
  RAISE EXCEPTION 'native ontology unique-key parser profile unavailable' USING ERRCODE='0A000';
 END IF;
 ontology:=convert_from(ontology_bytes,'UTF8')::json;
 IF json_typeof(ontology->'documentId') IS DISTINCT FROM 'string' OR json_typeof(ontology->'revision') IS DISTINCT FROM 'string'
  OR ontology->>'version' IS DISTINCT FROM '0.1.0'
  OR ontology->>'revision' IS DISTINCT FROM binding->>'ontologyRevision'
  OR json_typeof(ontology->'associations') IS DISTINCT FROM 'array'
  OR json_array_length(ontology->'associations') IS DISTINCT FROM jsonb_array_length(binding->'mappings')
  OR (ontology->'documents')::jsonb IS DISTINCT FROM jsonb_build_array(jsonb_build_object('documentId',ontology->>'documentId','revision',binding->>'modelRevision'))
  OR NOT EXISTS(SELECT 1 FROM truss.schema_doc d WHERE d.rev=original_revision AND d.doc_id=ontology->>'documentId'
   AND d.doc_revision=binding->>'modelRevision' AND d.content_sha256=binding->>'coreSha256') THEN
  RAISE EXCEPTION 'original ontology model correspondence required' USING ERRCODE='55000';
 END IF;
 IF json_typeof(ontology->'entities') IS DISTINCT FROM 'array' OR json_array_length(ontology->'entities') NOT BETWEEN 1 AND 4096 THEN
  RAISE EXCEPTION 'complete original entity inventory required' USING ERRCODE='55000';
 END IF;
 FOR entity_item IN SELECT value FROM json_array_elements(ontology->'entities') LOOP
  original_ref:=truss.runtime_pending_association_reference(entity_item->'type');
  IF original_ref=ANY(seen_entity_refs) THEN RAISE EXCEPTION 'duplicate original entity identity' USING ERRCODE='55000'; END IF;
  seen_entity_refs:=array_append(seen_entity_refs,original_ref);
 END LOOP;
 FOR association_item IN SELECT value FROM json_array_elements(ontology->'associations') LOOP
  original_ref:=truss.runtime_pending_association_reference(association_item->'type');
  IF original_ref=ANY(seen_association_refs) THEN RAISE EXCEPTION 'duplicate original association identity' USING ERRCODE='55000'; END IF;
  seen_association_refs:=array_append(seen_association_refs,original_ref);
 END LOOP;
 index:=0;
 FOR mapping IN SELECT value FROM jsonb_array_elements(binding->'mappings') LOOP
  pointer:='/mappings/'||index::text;fragment:=fragments[index+1];index:=index+1;
  IF jsonb_typeof(mapping)<>'object' OR NOT mapping ?& ARRAY['association','instanceKeyId','sourceRole','targetRole','roles','storage']
   OR (SELECT count(*) FROM jsonb_object_keys(mapping))<>6
   OR jsonb_typeof(mapping->'roles') IS DISTINCT FROM 'array' OR jsonb_array_length(mapping->'roles')<>2
   OR mapping->'storage' IS DISTINCT FROM '{"sourceMin":"0","sourceMax":"*","targetMin":"0","targetMax":"*","directed":true,"lifecycle":"independent","composition":false,"inverse":null}'::jsonb
   OR jsonb_typeof(mapping->'instanceKeyId') IS DISTINCT FROM 'string' OR octet_length(mapping->>'instanceKeyId') NOT BETWEEN 1 AND 4096
   OR octet_length(mapping->>'sourceRole') NOT BETWEEN 1 AND 4096 OR octet_length(mapping->>'targetRole') NOT BETWEEN 1 AND 4096
   OR jsonb_typeof(mapping->'sourceRole') IS DISTINCT FROM 'string' OR jsonb_typeof(mapping->'targetRole') IS DISTINCT FROM 'string'
   OR mapping->>'sourceRole'=mapping->>'targetRole' THEN
   RAISE EXCEPTION 'original binary association mapping subset required' USING ERRCODE='0A000';
  END IF;
  IF mapping->'association'->>'documentId' IS DISTINCT FROM ontology->>'documentId' THEN
   RAISE EXCEPTION 'single original association model required' USING ERRCODE='55000';
  END IF;
  SELECT t.* INTO STRICT owner FROM truss.type_def t WHERE t.type_id=truss.runtime_pending_association_type(original_revision,mapping->'association');
  IF owner.type_id=ANY(seen) THEN
   RAISE EXCEPTION 'duplicate original association identity' USING ERRCODE='55000';
  END IF;
  seen:=array_append(seen,owner.type_id);
  SELECT a.value INTO STRICT original_association FROM json_array_elements(ontology->'associations') a WHERE truss.runtime_pending_association_reference(a.value->'type')=mapping->'association';
  IF json_typeof(original_association->'keyId') IS DISTINCT FROM 'string' OR original_association->>'keyId' IS DISTINCT FROM mapping->>'instanceKeyId'
   OR json_typeof(original_association->'endpoints') IS DISTINCT FROM 'array'
   OR json_array_length(original_association->'endpoints')<>2 THEN
   RAISE EXCEPTION 'original association declaration correspondence required' USING ERRCODE='55000';
  END IF;
  SELECT k.prop_ids INTO STRICT own_key FROM truss.key_def k WHERE k.type_id=owner.type_id AND k.key_id=mapping->>'instanceKeyId' AND k.retired_rev IS NULL AND k.since_rev=original_revision;
  source_id:=NULL;target_id:=NULL;target_key_id:=NULL;roles_seen:=ARRAY[]::text[];endpoint_fields:=ARRAY[]::int[];
  FOR role IN SELECT value FROM jsonb_array_elements(mapping->'roles') LOOP
   IF jsonb_typeof(role)<>'object' OR NOT role ?& ARRAY['role','associationFields','target','targetKeyId','targetFields']
    OR (SELECT count(*) FROM jsonb_object_keys(role))<>5 OR jsonb_typeof(role->'role') IS DISTINCT FROM 'string'
    OR jsonb_typeof(role->'targetKeyId') IS DISTINCT FROM 'string' OR octet_length(role->>'targetKeyId') NOT BETWEEN 1 AND 4096
    OR octet_length(role->>'role') NOT BETWEEN 1 AND 4096 OR role->>'role'=ANY(roles_seen) THEN
    RAISE EXCEPTION 'original association role coverage required' USING ERRCODE='55000';
   END IF;
   role_name:=role->>'role';roles_seen:=array_append(roles_seen,role_name);
   SELECT e.value INTO STRICT endpoint FROM json_array_elements(original_association->'endpoints') e WHERE json_typeof(e.value->'role')='string' AND octet_length(e.value->>'role') BETWEEN 1 AND 4096 AND e.value->>'role'=role_name;
   IF (endpoint->'fields')::jsonb IS DISTINCT FROM role->'associationFields' OR (endpoint->'target')::jsonb IS DISTINCT FROM role->'target' THEN
    RAISE EXCEPTION 'original association endpoint correspondence required' USING ERRCODE='55000';
   END IF;
   IF role->'target'->>'documentId' IS DISTINCT FROM ontology->>'documentId' THEN
    RAISE EXCEPTION 'single original association model required' USING ERRCODE='55000';
   END IF;
   role_owner:=truss.runtime_pending_association_type(original_revision,role->'target');
   SELECT e.value INTO STRICT original_entity FROM json_array_elements(ontology->'entities') e WHERE truss.runtime_pending_association_reference(e.value->'type')=role->'target';
   IF json_typeof(original_entity->'keyId') IS DISTINCT FROM 'string' OR original_entity->>'keyId' IS DISTINCT FROM role->>'targetKeyId' THEN
    RAISE EXCEPTION 'original association target key correspondence required' USING ERRCODE='55000';
   END IF;
   fields:=truss.runtime_pending_association_fields(original_revision,owner.type_id,role->'associationFields');
   target_fields:=truss.runtime_pending_association_fields(original_revision,role_owner,role->'targetFields');
   IF cardinality(fields)<>cardinality(target_fields) OR NOT EXISTS(SELECT 1 FROM truss.key_def k
    WHERE k.type_id=role_owner AND k.key_id=role->>'targetKeyId' AND k.since_rev=original_revision AND k.retired_rev IS NULL AND k.prop_ids=target_fields) THEN
    RAISE EXCEPTION 'original ordered endpoint key correspondence required' USING ERRCODE='55000';
   END IF;
   endpoint_fields:=endpoint_fields||fields;
   IF role_name=mapping->>'sourceRole' THEN source_id:=role_owner;
   ELSIF role_name=mapping->>'targetRole' THEN target_id:=role_owner;target_key_id:=role->>'targetKeyId';
   ELSE RAISE EXCEPTION 'original association orientation coverage required' USING ERRCODE='55000'; END IF;
  END LOOP;
  IF source_id IS NULL OR target_id IS NULL OR NOT own_key<@endpoint_fields THEN
   RAISE EXCEPTION 'lossless original association instance identity required' USING ERRCODE='0A000';
  END IF;
  SELECT e.value->>'name' INTO STRICT original_name FROM truss.schema_doc d
   CROSS JOIN LATERAL jsonb_array_elements(d.document::jsonb->'modules') m
   CROSS JOIN LATERAL jsonb_array_elements(m.value->'elements') e
   WHERE d.rev=original_revision AND d.doc_id=owner.document_id AND m.value->>'id'=owner.module AND e.value->>'id'=owner.element;
  RETURN QUERY SELECT pointer,jsonb_build_object('document_id',owner.document_id,'module',owner.module,'rel_id',owner.element,'name',original_name,
   'source_min',0,'source_max',NULL,'target_min',0,'target_max',NULL,'lifecycle','independent','directed',true,
   'target_key',target_key_id,'composition',false,'assoc_type_id',owner.type_id,'inverse',NULL,'since_rev',original_revision,'doc_ord',owner.doc_ord),source_id,target_id,fragment;
 END LOOP;
EXCEPTION WHEN no_data_found OR too_many_rows THEN
 RAISE EXCEPTION 'unique original association dependency required' USING ERRCODE='55000';
END;
$$;
REVOKE ALL ON FUNCTION truss.runtime_resolve_pending_association_candidate(int,bytea) FROM PUBLIC;

CREATE FUNCTION truss.runtime_stage_pending_association_candidate(original_revision int)
RETURNS TABLE(mapping_pointer text,relationship_id text)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
DECLARE observed record; op truss.row_home_operation%ROWTYPE; item record; owner truss.rel_def%ROWTYPE;
 high_water bigint; assigned bigint; index int:=0;
BEGIN
 SELECT * INTO STRICT observed FROM truss.runtime_collect_original_catalog_binding(original_revision);
 SELECT o.* INTO STRICT op FROM truss.row_home_operation o
  WHERE o.original_writer_xid=pg_current_xact_id_if_assigned() AND o.phase='admitted' AND o.operation_kind='catalog-acceptance' FOR UPDATE;
 SELECT greatest(coalesce(max(r.rel_type_id)::bigint,0),0) INTO high_water FROM truss.rel_def r;
 FOR item IN SELECT * FROM truss.runtime_resolve_pending_association_candidate(original_revision,decode(observed.binding_hex,'hex')) LOOP
  owner:=jsonb_populate_record(NULL::truss.rel_def,item.definition);
  IF EXISTS(SELECT 1 FROM truss.rel_def r WHERE r.document_id=owner.document_id AND r.module=owner.module AND r.rel_id=owner.rel_id) THEN
   RAISE EXCEPTION 'duplicate original association identity' USING ERRCODE='55000';
  END IF;
  index:=index+1;assigned:=high_water+index;
  IF assigned>2147483647 THEN RAISE EXCEPTION 'pending association identity capacity exhausted' USING ERRCODE='54000'; END IF;
  INSERT INTO truss.rel_def(document_id,rel_type_id,module,rel_id,name,source_min,source_max,target_min,target_max,lifecycle,directed,target_key,composition,assoc_type_id,inverse,since_rev,doc_ord,definition_source_kind,pending_writer_xid,pending_operation_ordinal,pending_binding_revision,pending_mapping_pointer,pending_mapping_bytes)
  VALUES(owner.document_id,assigned::int,owner.module,owner.rel_id,owner.name,owner.source_min,owner.source_max,owner.target_min,owner.target_max,owner.lifecycle,owner.directed,owner.target_key,owner.composition,owner.assoc_type_id,owner.inverse,owner.since_rev,owner.doc_ord,'operation_binding',op.original_writer_xid,op.operation_ordinal,original_revision,item.mapping_pointer,item.mapping_bytes);
  INSERT INTO truss.rel_endpoint(rel_type_id,source_type,target_type) VALUES(assigned::int,item.source_type,item.target_type);
  RETURN QUERY SELECT item.mapping_pointer,assigned::text;
 END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION truss.runtime_stage_pending_association_candidate(int) FROM PUBLIC;

-- Post-stage original source custody only. Does not certify semantic effects or publication.
CREATE FUNCTION truss.runtime_collect_pending_association_source_candidate(original_revision int)
RETURNS TABLE(mapping_pointer text,relationship_id text,mapping_sha256 text,effect_generation text)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
DECLARE op truss.row_home_operation%ROWTYPE; archived truss.catalog_binding_archive%ROWTYPE;
 input jsonb; binding jsonb; artifact jsonb; item record; retained truss.rel_def%ROWTYPE;
 expected_count int:=0; pointer text; documents jsonb;
BEGIN
 SELECT o.* INTO STRICT op FROM truss.row_home_operation o WHERE
  o.original_writer_xid=pg_current_xact_id_if_assigned() AND o.phase<>'application_finalized' FOR UPDATE;
 IF op.operation_kind<>'catalog-acceptance' OR op.phase<>'admitted' OR original_revision IS NULL OR original_revision<=0 THEN
  RAISE EXCEPTION 'pending source candidate admission required' USING ERRCODE='55000';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_locks l WHERE l.pid=pg_backend_pid() AND l.granted
  AND l.relation='truss.schema_head'::regclass AND l.mode IN ('ExclusiveLock','AccessExclusiveLock'))
  OR NOT EXISTS(SELECT 1 FROM truss.schema_head h WHERE h.id=1 AND h.rev<original_revision)
  OR NOT EXISTS(SELECT 1 FROM truss.schema_rev r WHERE r.rev=original_revision) THEN
  RAISE EXCEPTION 'pending source candidate unpublished exclusion required' USING ERRCODE='55000';
 END IF;
 SELECT a.* INTO STRICT archived FROM truss.catalog_binding_archive a WHERE a.revision=original_revision;
 input:=convert_from(op.original_input_bytes,'UTF8')::jsonb;binding:=input->'binding';artifact:=binding->'artifact';
 IF input->>'interfaceVersion' IS DISTINCT FROM 'truss-acceptance-input/0.1.0'
  OR binding->>'state' IS DISTINCT FROM 'present'
  OR archived.original_writer_xid IS DISTINCT FROM op.original_writer_xid
  OR archived.original_input_bytes IS DISTINCT FROM op.original_input_bytes
  OR archived.vocabulary IS DISTINCT FROM binding->'vocabulary'
  OR archived.artifact_identity_utf8 IS DISTINCT FROM convert_to(artifact->>'identity','UTF8')
  OR encode(archived.binding_sha256,'hex') IS DISTINCT FROM artifact->>'sha256'
  OR archived.binding_sha256 IS DISTINCT FROM sha256(archived.original_binding_bytes)
  OR archived.original_binding_bytes IS DISTINCT FROM decode(artifact->>'bytesBase64','base64') THEN
  RAISE EXCEPTION 'pending source candidate original archive correspondence required' USING ERRCODE='55000';
 END IF;
 -- Recheck original document custody without applying the authored-only relationship inventory.
 SELECT jsonb_agg(jsonb_build_object('documentId',d.doc_id,'revision',d.doc_revision,'umfVersion',d.umf_version,'originalText',d.document,'validation',d.validation) ORDER BY d.ord)
 INTO documents FROM truss.schema_doc d WHERE d.rev=original_revision;
 PERFORM truss.runtime_require_catalog_document_carrier(documents);
 PERFORM * FROM truss.runtime_collect_report_documents(original_revision);
 FOR item IN SELECT * FROM truss.runtime_extract_original_association_mapping_batch(archived.original_binding_bytes) LOOP
  expected_count:=expected_count+1;pointer:='/mappings/'||item.mapping_index::text;
  SELECT r.* INTO STRICT retained FROM truss.rel_def r WHERE r.definition_source_kind='operation_binding'
   AND r.pending_binding_revision=original_revision AND r.pending_mapping_pointer COLLATE "C"=pointer COLLATE "C";
  IF retained.pending_writer_xid IS DISTINCT FROM op.original_writer_xid
   OR retained.pending_operation_ordinal IS DISTINCT FROM op.operation_ordinal
   OR retained.pending_mapping_bytes IS DISTINCT FROM item.mapping_bytes
   OR retained.since_rev IS DISTINCT FROM original_revision OR retained.retired_rev IS NOT NULL THEN
   RAISE EXCEPTION 'pending source candidate exact tuple correspondence required' USING ERRCODE='55000';
  END IF;
  RETURN QUERY SELECT pointer,retained.rel_type_id::text,encode(sha256(item.mapping_bytes),'hex'),op.effect_generation::text;
 END LOOP;
 IF expected_count=0 OR (SELECT count(*) FROM truss.rel_def r WHERE r.definition_source_kind='operation_binding'
  AND (r.pending_binding_revision=original_revision OR r.pending_writer_xid=op.original_writer_xid))<>expected_count THEN
  RAISE EXCEPTION 'pending source candidate complete source cohort required' USING ERRCODE='55000';
 END IF;
EXCEPTION WHEN no_data_found OR too_many_rows THEN
 RAISE EXCEPTION 'pending source candidate unique source correspondence required' USING ERRCODE='55000';
END;
$$;
REVOKE ALL ON FUNCTION truss.runtime_collect_pending_association_source_candidate(int) FROM PUBLIC;

-- Qualified private new-effect verification, not registered admission/report/readiness.
CREATE FUNCTION truss.runtime_collect_pending_association_effect_candidate(original_revision int)
RETURNS TABLE(family text,identity jsonb)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
DECLARE item record; retained truss.rel_def%ROWTYPE; expected truss.rel_def%ROWTYPE;
 original_binding bytea; inventory jsonb; excluded text[]:=ARRAY['rel_type_id','definition_source_kind','pending_writer_xid','pending_operation_ordinal','pending_binding_revision','pending_mapping_pointer','pending_mapping_bytes'];
BEGIN
 -- Both complete original source custody and original core dependency parity
 -- precede deriving/checking the physical association metadata.
 PERFORM * FROM truss.runtime_collect_pending_association_source_candidate(original_revision);
 PERFORM * FROM truss.runtime_collect_core_catalog_inventory_candidate(original_revision,true);
 SELECT a.original_binding_bytes INTO STRICT original_binding FROM truss.catalog_binding_archive a WHERE a.revision=original_revision;
 FOR item IN SELECT * FROM truss.runtime_resolve_pending_association_candidate(original_revision,original_binding) LOOP
  SELECT r.* INTO STRICT retained FROM truss.rel_def r WHERE r.definition_source_kind='operation_binding'
   AND r.pending_binding_revision=original_revision AND r.pending_mapping_pointer COLLATE "C"=item.mapping_pointer COLLATE "C";
  expected:=jsonb_populate_record(NULL::truss.rel_def,item.definition);
  IF (to_jsonb(retained)-excluded) IS DISTINCT FROM (to_jsonb(expected)-excluded)
   OR EXISTS(SELECT 1 FROM truss.relationship_lineage l WHERE l.rel_type_id=retained.rel_type_id) THEN
   RAISE EXCEPTION 'pending association exact physical definition correspondence required' USING ERRCODE='55000';
  END IF;
  IF (SELECT count(*) FROM truss.rel_endpoint e WHERE e.rel_type_id=retained.rel_type_id)<>1
   OR NOT EXISTS(SELECT 1 FROM truss.rel_endpoint e WHERE e.rel_type_id=retained.rel_type_id
    AND e.source_type=item.source_type AND e.target_type=item.target_type) THEN
   RAISE EXCEPTION 'pending association exact physical endpoint correspondence required' USING ERRCODE='55000';
  END IF;

 END LOOP;
 SELECT coalesce(jsonb_agg(jsonb_build_object('family',q.family,'identity',q.identity) ORDER BY q.family COLLATE "C",q.identity::text COLLATE "C"),'[]'::jsonb)
 INTO inventory FROM (
  SELECT 'type'::text AS family,jsonb_build_array(t.type_id::text,t.document_id,t.module,t.element) AS identity FROM truss.type_def t WHERE t.since_rev=original_revision
  UNION ALL SELECT 'property',jsonb_build_array(p.prop_id::text,p.type_id::text,p.declaration_module,p.element) FROM truss.prop_def p WHERE p.since_rev=original_revision
  UNION ALL SELECT 'key',jsonb_build_array(k.type_id::text,k.key_id,k.key_num::text) FROM truss.key_def k WHERE k.since_rev=original_revision
  UNION ALL SELECT 'relationship',jsonb_build_array(r.rel_type_id::text,r.document_id,r.module,r.rel_id) FROM truss.rel_def r WHERE r.since_rev=original_revision
  UNION ALL SELECT 'endpoint',jsonb_build_array(e.rel_type_id::text,e.source_type::text,e.target_type::text) FROM truss.rel_endpoint e JOIN truss.rel_def r ON r.rel_type_id=e.rel_type_id WHERE r.since_rev=original_revision
 ) q;
 IF jsonb_array_length(inventory)>16384 OR octet_length(inventory::text)>1048576 THEN
  RAISE EXCEPTION 'pending association combined inventory component capacity exceeded' USING ERRCODE='54000';
 END IF;
 RETURN QUERY SELECT value->>'family',value->'identity' FROM jsonb_array_elements(inventory);
END;
$$;
REVOKE ALL ON FUNCTION truss.runtime_collect_pending_association_effect_candidate(int) FROM PUBLIC;

-- Private value-bearing image of the verified five-family new metadata cohort.
-- Not a complete report, accepted binding authority, or durable readiness token.
CREATE FUNCTION truss.runtime_collect_pending_association_value_candidate(original_revision int)
RETURNS TABLE(family text,identity jsonb,physical_value jsonb)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,pg_temp SET bytea_output='hex' AS $$
DECLARE verified jsonb; image jsonb; initial_generation bigint; final_generation bigint;
BEGIN
 SELECT o.effect_generation INTO STRICT initial_generation FROM truss.row_home_operation o
  WHERE o.original_writer_xid=pg_current_xact_id_if_assigned() AND o.phase='admitted';
 SELECT coalesce(jsonb_agg(jsonb_build_object('family',v.family,'identity',v.identity)
  ORDER BY v.family COLLATE "C",v.identity::text COLLATE "C"),'[]'::jsonb) INTO verified
  FROM truss.runtime_collect_pending_association_effect_candidate(original_revision) v;
 SELECT coalesce(jsonb_agg(jsonb_build_object('family',q.family,'identity',q.identity,'physicalValue',q.physical_value)
  ORDER BY q.family COLLATE "C",q.identity::text COLLATE "C"),'[]'::jsonb) INTO image FROM (
  SELECT 'type'::text AS family,jsonb_build_array(t.type_id::text,t.document_id,t.module,t.element) AS identity,to_jsonb(t) AS physical_value FROM truss.type_def t WHERE t.since_rev=original_revision
  UNION ALL SELECT 'property',jsonb_build_array(p.prop_id::text,p.type_id::text,p.declaration_module,p.element),to_jsonb(p) FROM truss.prop_def p WHERE p.since_rev=original_revision
  UNION ALL SELECT 'key',jsonb_build_array(k.type_id::text,k.key_id,k.key_num::text),to_jsonb(k) FROM truss.key_def k WHERE k.since_rev=original_revision
  UNION ALL SELECT 'relationship',jsonb_build_array(r.rel_type_id::text,r.document_id,r.module,r.rel_id),jsonb_build_object('definition',to_jsonb(r),'lineage',(SELECT to_jsonb(l) FROM truss.relationship_lineage l WHERE l.rel_type_id=r.rel_type_id)) FROM truss.rel_def r WHERE r.since_rev=original_revision
  UNION ALL SELECT 'endpoint',jsonb_build_array(e.rel_type_id::text,e.source_type::text,e.target_type::text),to_jsonb(e) FROM truss.rel_endpoint e JOIN truss.rel_def r USING(rel_type_id) WHERE r.since_rev=original_revision
 ) q;
 IF jsonb_array_length(image)>16384 OR octet_length(image::text)>1048576 THEN
  RAISE EXCEPTION 'pending association physical value component capacity exceeded' USING ERRCODE='54000';
 END IF;
 IF (SELECT coalesce(jsonb_agg(v.value-'physicalValue' ORDER BY v.value->>'family' COLLATE "C",(v.value->'identity')::text COLLATE "C"),'[]'::jsonb) FROM jsonb_array_elements(image) v) IS DISTINCT FROM verified THEN
  RAISE EXCEPTION 'pending association physical value identity correspondence required' USING ERRCODE='55000';
 END IF;
 SELECT o.effect_generation INTO STRICT final_generation FROM truss.row_home_operation o
  WHERE o.original_writer_xid=pg_current_xact_id_if_assigned() AND o.phase='admitted';
 IF final_generation IS DISTINCT FROM initial_generation THEN
  RAISE EXCEPTION 'pending association physical value generation changed' USING ERRCODE='55000';
 END IF;
 RETURN QUERY SELECT v.value->>'family',v.value->'identity',v.value->'physicalValue' FROM jsonb_array_elements(image) v ORDER BY v.value->>'family' COLLATE "C",(v.value->'identity')::text COLLATE "C";
EXCEPTION WHEN no_data_found OR too_many_rows THEN
 RAISE EXCEPTION 'pending association physical value operation correspondence required' USING ERRCODE='55000';
END;
$$;
REVOKE ALL ON FUNCTION truss.runtime_collect_pending_association_value_candidate(int) FROM PUBLIC;

-- Private report preparation basis: complete selected source/value correspondence.
-- Caller-carried bytes are comparison data, never accepted report/readiness authority.
CREATE FUNCTION truss.runtime_collect_pending_association_report_basis_candidate(original_revision int)
RETURNS bytea
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,pg_temp SET bytea_output='hex' AS $$
DECLARE op truss.row_home_operation%ROWTYPE; final_op truss.row_home_operation%ROWTYPE; image jsonb; final_image jsonb;
 documents jsonb; final_documents jsonb; original_binding bytea; final_binding bytea; body bytea;
BEGIN
 SELECT o.* INTO STRICT op FROM truss.row_home_operation o
  WHERE o.original_writer_xid=pg_current_xact_id_if_assigned() AND o.phase='admitted';
 SELECT coalesce(jsonb_agg(jsonb_build_object('family',v.family,'identity',v.identity,'physicalValue',v.physical_value)
  ORDER BY v.family COLLATE "C",v.identity::text COLLATE "C"),'[]'::jsonb) INTO image
 FROM truss.runtime_collect_pending_association_value_candidate(original_revision) v;
 SELECT a.original_binding_bytes INTO STRICT original_binding FROM truss.catalog_binding_archive a WHERE a.revision=original_revision;
 SELECT jsonb_agg(to_jsonb(d) ORDER BY d.ord) INTO documents FROM truss.schema_doc d WHERE d.rev=original_revision;
 -- Revalidate complete selected source/metadata and compare the exact captured
 -- inputs; generation alone cannot exclude equal-generation source substitution.
 SELECT coalesce(jsonb_agg(jsonb_build_object('family',v.family,'identity',v.identity,'physicalValue',v.physical_value)
  ORDER BY v.family COLLATE "C",v.identity::text COLLATE "C"),'[]'::jsonb) INTO final_image
 FROM truss.runtime_collect_pending_association_value_candidate(original_revision) v;
 SELECT o.* INTO STRICT final_op FROM truss.row_home_operation o
  WHERE o.original_writer_xid=pg_current_xact_id_if_assigned() AND o.phase='admitted';
 SELECT a.original_binding_bytes INTO STRICT final_binding FROM truss.catalog_binding_archive a WHERE a.revision=original_revision;
 SELECT jsonb_agg(to_jsonb(d) ORDER BY d.ord) INTO final_documents FROM truss.schema_doc d WHERE d.rev=original_revision;
 IF final_op.effect_generation IS DISTINCT FROM op.effect_generation THEN
  RAISE EXCEPTION 'pending association report basis generation changed' USING ERRCODE='55000';
 END IF;
 IF to_jsonb(final_op) IS DISTINCT FROM to_jsonb(op) THEN
  RAISE EXCEPTION 'pending association report basis original operation changed' USING ERRCODE='55000';
 END IF;
 IF final_binding IS DISTINCT FROM original_binding OR final_documents IS DISTINCT FROM documents OR final_image IS DISTINCT FROM image THEN
  RAISE EXCEPTION 'pending association report basis captured source/value changed' USING ERRCODE='55000';
 END IF;
 body:=convert_to(jsonb_build_object('profile','truss-pending-association-report-basis-candidate/0.1.0',
  'writerXid',op.original_writer_xid::text,'operationOrdinal',op.operation_ordinal::text,
  'effectGeneration',final_op.effect_generation::text,'revision',original_revision::text,
  'originalInputHex',encode(op.original_input_bytes,'hex'),'originalBindingHex',encode(original_binding,'hex'),
  'documents',documents,'metadataImage',image,'acceptedReportQualified',false)::text,'UTF8');
 IF octet_length(body)>8388608 THEN
  RAISE EXCEPTION 'pending association report basis component capacity exceeded' USING ERRCODE='54000';
 END IF;
 RETURN body;
EXCEPTION WHEN no_data_found OR too_many_rows THEN
 RAISE EXCEPTION 'pending association report basis original operation required' USING ERRCODE='55000';
END;
$$;
REVOKE ALL ON FUNCTION truss.runtime_collect_pending_association_report_basis_candidate(int) FROM PUBLIC;

CREATE FUNCTION truss.runtime_require_pending_association_report_basis_candidate(original_revision int,original_basis bytea)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF original_basis IS NULL OR octet_length(original_basis) NOT BETWEEN 1 AND 8388608 THEN
  RAISE EXCEPTION 'bounded original pending association report basis required' USING ERRCODE='22023';
 END IF;
 IF original_basis IS DISTINCT FROM truss.runtime_collect_pending_association_report_basis_candidate(original_revision) THEN
  RAISE EXCEPTION 'current original pending association report basis correspondence required' USING ERRCODE='55000';
 END IF;
END;
$$;
REVOKE ALL ON FUNCTION truss.runtime_require_pending_association_report_basis_candidate(int,bytea) FROM PUBLIC;
