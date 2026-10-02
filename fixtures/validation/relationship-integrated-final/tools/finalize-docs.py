import json,re
from pathlib import Path
r=json.loads(Path('fixtures/validation/relationship-integrated-compatibility-refresh.json').read_text())
g=json.loads(Path('.cache/relationship-integrated-compatibility-refresh/regression-result.json').read_text())
i=json.loads(Path('fixtures/validation/relationship-integrated-regression-command.json').read_text())
s=json.loads(Path('fixtures/json-schema-audit.json').read_text());p=json.loads(Path('fixtures/extension-package-audit.json').read_text())
assert r['complete'] and g['exitCode']==0 and g['failures']==0
for file in ['docs/helix/README.md','docs/helix/03-test/test-plan.md']:
 assert '{{TESTS_PASSED}}' in Path(file).read_text(), 'Already finalized; explicitly restore the template before republishing counts: '+file
assert '### Integrated relationship and binding acceptance — umf-c2ef7c2c' not in Path('docs/helix/04-build/implementation-plan.md').read_text(), 'Final implementation evidence already exists'
values={'RELATIONSHIP_ADMISSION_STATUS':'Passed; qualified PostgreSQL and SQL Server mappings','RELATIONSHIP_DELIVERY_STATUS':'Passed, with explicit target-specific residuals/refusals','INTEGRATED_REFRESH_STATUS':'Passed','COMMANDS_PASSED':str(len(r['runs'])),'COMMANDS_TOTAL':str(len(r['commands'])),'TESTS_PASSED':str(g['tests']),'TEST_FILES':str(g['files']),'ASSERTIONS':str(g['assertions']),'FAILURES':str(g['failures']),'STATIC_CHECK_STATUS':'Passed','SCHEMA_COUNT':str(s['schemas']),'PACKAGE_COUNT':str(p['packages']),'RELATIONSHIP_GATE_EVIDENCE_RELATIVE_TO_README':'../../fixtures/validation/relationship-conformance.json','INTEGRATED_EVIDENCE_RELATIVE_TO_README':'../../fixtures/validation/relationship-integrated-acceptance-evidence.json','INTEGRATED_EVIDENCE_TITLE':'Final integrated acceptance','INTEGRATED_EVIDENCE_RELATIVE_TO_TEST_PLAN':'../../../fixtures/validation/relationship-integrated-acceptance-evidence.json','TESTED_REVISION':'0f20d2e4 plus the recorded final source fingerprints','RELATIONSHIP_GATE_EVIDENCE_TITLE':'Separate relationship admission and delivery','RELATIONSHIP_GATE_EVIDENCE_RELATIVE_TO_TEST_PLAN':'../../../fixtures/validation/relationship-conformance.json'}
for file in ['docs/helix/README.md','docs/helix/03-test/test-plan.md']:
 path=Path(file);text=path.read_text()
 text=re.sub(r'<!-- Replace all \{\{\.\.\.\}\} values.*?-->\n\n','',text,flags=re.S)
 text=re.sub(r'<!-- Fill only after.*?-->\n\n','',text,flags=re.S)
 for key,value in values.items():text=text.replace('{{'+key+'}}',value)
 text=text.replace('Integrated verification status — publication placeholders','Integrated verification status')
 text=text.replace('Final relationship/binding integration verification — publication placeholders','Final relationship/binding integration verification')
 text=text.replace('| Final Bun tests |','| Broad Bun regression (separate gates excluded) |')
 text=text.replace('Final results: Passed,','Broad regression results: Passed,')
 text=text.replace('Feature acceptance alone does not establish these combined results.',f'The linked final record also includes all {i["gateFiles"]} separately executed gate/evidence test files and reports unique combined totals; nested replay tests are not counted twice.')
 if file.endswith('test-plan.md'):
  text=text.replace('packages. No native-equivalence graduation is claimed.',f'packages. The final record additionally includes all {i["gateFiles"]} gate/evidence test files and exact combined totals without counting nested replays twice. No native-equivalence graduation is claimed.')
 text=text.replace('PostgreSQL17.4','PostgreSQL 17.4').replace('Server2022','Server 2022')
 assert '{{' not in text
 path.write_text(text)
path=Path('docs/helix/02-design/architecture.md');text=path.read_text()
text=text.replace('It does not assert a fresh repository-wide replay or relationship ideal admission.\nThe relationship admission/delivery gate and subsequent integrated verification\nare pending separate evidence in the [implementation plan](../04-build/implementation-plan.md).','The [integrated acceptance](../../../fixtures/validation/relationship-integrated-acceptance-evidence.json) records the fresh native/browser replay, repository regression and six separate concept gates. Relationship ideal admission and qualified five-system delivery pass independently; native equivalence remains unclaimed.')
text=text.replace('and individual bindings are delivered; their separate admission/all-five gate\nis not asserted by this inventory.','and individual bindings are delivered. The separate [relationship gate](../../../fixtures/validation/relationship-conformance.json) admits the authored ideal and qualified five-priority delivery with explicit residuals and refusals.')
text=text.replace('native-equivalence graduation or a fresh integrated repository gate.','native-equivalence graduation. Fresh combined verification is separately recorded in the integrated acceptance above.')
text=text.replace('implemented classification and useful lossy projection. The relationship gate\nand final integrated refresh are pending the dedicated execution evidence in\n[the implementation plan](../04-build/implementation-plan.md); prior feature\nacceptance records must not be represented as that fresh combined result.','implemented classification and useful lossy projection. The relationship gate and final integrated refresh are recorded separately in [the implementation plan](../04-build/implementation-plan.md). Earlier feature acceptance records retain their original scopes and counts; they are not relabeled as the fresh combined result.')
path.write_text(text)
path=Path('docs/helix/04-build/implementation-plan.md');text=path.read_text()
text+='\n\n### Integrated relationship and binding acceptance — umf-c2ef7c2c\n\n'
text+=f'The merged implementation passed all {len(r["runs"])} compatibility commands and the broad repository regression: {g["tests"]} tests across {g["files"]} files, {g["assertions"]} assertions and zero failures. All {i["gateFiles"]} separate gate/evidence test files and six conformance commands are recorded in the [final acceptance](../../../fixtures/validation/relationship-integrated-acceptance-evidence.json); its unique combined totals exclude repeated nested/focused suites. Typechecking, browser builds and the {s["schemas"]}-schema / {p["packages"]}-package audits passed.\n\n'
text+='Architecture, README and the test plan now distinguish the delivered browser library and extension/generator subsets from historical checkpoints. Explicit coverage tags and consumer tests verify binding-aware access decisions plus ordered index/predicate/unknown-content migration and edited rollback. The old facet drift ledger is retained as history; freshly replayed proofs need no current hash exceptions. Native versions, command logs, tested-source fingerprints, refusal boundaries and the resolved pre-fix relationship timeout are retained in the final record. No native-equivalence graduation or completion of unrelated product requirements is claimed.\n'
path.write_text(text)
