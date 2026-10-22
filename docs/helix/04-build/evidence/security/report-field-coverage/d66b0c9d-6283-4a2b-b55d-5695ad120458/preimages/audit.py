"""Static report-field dependency audit; never native or semantic admission."""
import argparse, hashlib, json, pathlib, re, uuid
p=argparse.ArgumentParser();p.add_argument('--truss',default='/private/tmp/truss-security-main-integration');args=p.parse_args()
root=pathlib.Path(args.truss); umf=pathlib.Path(__file__).resolve().parents[2]
paths={name:root/name for name in ['docs/helix/02-design/contracts/acceptance-report-v0.1.schema.json','packages/umf-bun/src/catalog-report-correspondence.ts','packages/umf-bun/src/catalog-report-preparation.ts','packages/umf-bun/src/catalog-umf-report-basis.ts','packages/umf-bun/src/canonical-report-handoff.ts','packages/postgresql/native/catalog-new-inventory.sql']}
sources={name:path.read_bytes() for name,path in paths.items()}; texts={name:b.decode() for name,b in sources.items()}
schema=json.loads(sources['docs/helix/02-design/contracts/acceptance-report-v0.1.schema.json']); required=schema['required']; assert len(required)==len(set(required))==17
correspondence=texts['packages/umf-bun/src/catalog-report-correspondence.ts']
block=re.search(r'const expected=\{(.*?)\};',correspondence,re.S); assert block
fields=re.findall(r'(?:^|,)\s*(\w+)\s*:',block.group(1)); assert len(fields)==len(set(fields))==10
assert set(fields)=={'rev','acceptedInput','documents','counts','provisional','diagnostics','documentInterpretations','losses','transformRegistrations','extensions'}
assert "report.reportProfile,registration.profile" in correspondence and "report.originalExecution,candidate.candidate" in correspondence
codec=texts['packages/umf-bun/src/canonical-report-handoff.ts']; schema_hash=hashlib.sha256(sources['docs/helix/02-design/contracts/acceptance-report-v0.1.schema.json']).hexdigest(); assert schema_hash in codec
assert "'acceptance-report-v0.1.schema.json'" in codec
assert schema['properties']['interfaceVersion']['const']=='truss-acceptance-report/0.1.0'
coverage={field:('producer_correspondence_component' if field in fields else 'wire_literal_only' if field=='interfaceVersion' else 'registered_bytes_only' if field=='reportProfile' else 'execution_candidate_only' if field=='originalExecution' else 'missing_semantic_producer') for field in required}
missing=[field for field,state in coverage.items() if state=='missing_semantic_producer']; assert set(missing)=={'umf','rebinds','assertions','pending_indexes'}
assert 'Complete transform execution and report producer required' in texts['packages/umf-bun/src/catalog-report-preparation.ts']
assert 'Original registered support artifact required' in texts['packages/umf-bun/src/catalog-umf-report-basis.ts']
assert "scope:'original_umf_and_support_byte_basis_only'" in texts['packages/umf-bun/src/catalog-umf-report-basis.ts']
assert 'registered binding effect inventory required' in texts['packages/postgresql/native/catalog-new-inventory.sql']
out=umf/'docs/helix/04-build/evidence/security/report-field-coverage'/str(uuid.uuid4());out.mkdir(parents=True)
pre=out/'preimages';pre.mkdir()
for name,b in sources.items():
 target=pre/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b)
self_bytes=pathlib.Path(__file__).read_bytes();(pre/'audit.py').write_bytes(self_bytes)
receipt={'status':'pass','scope':'static_existing_report_field_dependency_audit_only','requiredFields':required,'fieldCoverage':coverage,'missingSemanticProducers':missing,'fullReportQualified':False,'presentBindingReportPreparationQualified':False,'acceptancePromoted':False,'sourceSha256':{str(paths[name]):hashlib.sha256(b).hexdigest() for name,b in sources.items()},'auditSha256':hashlib.sha256(self_bytes).hexdigest(),'limitations':['Literal source inspection, not control-flow or runtime proof.','Ten existing producer comparisons do not qualify present binding, transforms or complete enforcement.','Registered artifact bytes do not establish interpretation semantics.','Interface version is already enforced by pinned wire schema, not a missing semantic producer.']}
(out/'coverage.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'receipt':str(out/'coverage.json'),'missing':missing}))
