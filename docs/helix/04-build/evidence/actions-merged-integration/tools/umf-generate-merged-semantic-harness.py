from pathlib import Path
import sys,json,hashlib,re
R=Path(sys.argv[1]).resolve();D=R/'.cache/actions-merged-semantics';D.mkdir(parents=True,exist_ok=True)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
facet=R/'tests/core-ideals/facets-conformance.test.ts';text=facet.read_text();start=text.index(' const coverage =');end=text.index('\n}, 1800000);',start);facet_body=text[start:end]
key=R/'scripts/core-ideals/key-conformance.ts';text=key.read_text();start=text.index(' const usefulSystems=');end=text.index('\n return {scope:',start);key_body=text[start:end]
imports="""import {test,expect} from 'bun:test';
import assert from 'node:assert/strict';
import {facetSystems} from '/work/scripts/core-ideals/facets-evidence';
import {verifyFacetRoundTrips} from '/work/scripts/core-ideals/facets-roundtrips';
import {keySystems} from '/work/scripts/core-ideals/key-evidence';
import {verifyKeyAuthoredRoundTrips,verifyKeyIdentityConflicts} from '/work/scripts/core-ideals/key-roundtrips';
import {verifyKeyNativeRoundTrips} from '/work/scripts/core-ideals/key-native-roundtrips';
import {verifyRelationshipBindingRoundTrips} from '/work/scripts/core-ideals/relationship-conformance';
import {relationshipTests} from '/work/scripts/core-ideals/relationship-gate-inputs';
"""
harness=imports+"test('merged facet behavioral assertions; admission remains baseline scoped',async()=>{\n"+facet_body+"\n},1800000);\n"+"test('merged Key recoveries and identity conflicts; admission remains baseline scoped',async()=>{\n const authored=await verifyKeyAuthoredRoundTrips();\n const conflicts=await verifyKeyIdentityConflicts();\n const native=await verifyKeyNativeRoundTrips();\n"+key_body+"\n expect(Object.keys(native)).toHaveLength(5);\n},120000);\n"+"test('merged relationship binding replay launches the complete nine-file suite',async()=>{\n const result=await verifyRelationshipBindingRoundTrips();\n expect(relationshipTests).toHaveLength(9);expect(result.command).toEqual(['bun','test',...relationshipTests]);expect(result.failed).toBe(0);expect(result.passed).toBeGreaterThan(0);\n console.log(JSON.stringify({mergedRelationshipBindingReplay:result}));\n},300000);\n"
path=D/'behavior.test.ts';path.write_text(harness)
selection=[('tests/core-ideals/field-conformance.test.ts','all five binding contracts enforce policy and recover ideal/native representations'),('tests/core-ideals/field-conformance.test.ts','group names and opaque scalar-like metadata do not assert records; legacy collisions remain recoverable'),('tests/core-ideals/nullability-conformance.test.ts','five Nullability bindings preserve ideals, native payloads and explicit loss policy'),('tests/core-ideals/cardinality-conformance.test.ts','five Cardinality bindings preserve ideals, native refinements and qualified strict/report outcomes'),('tests/core-ideals/relationship-conformance.test.ts','authored shape corpus preserves unknown content, keyed association and migration rollback')]
allocation={'scope':'All 17 original strict admission tests remain inherited baseline executions; eight fresh merged semantic checks discharge behavior without manufacturing current native evidence admission. Results and exact merged source must be bound separately.','originalSelectedTests':[{'path':p,'testName':name,'fileSha256':sha(R/p)} for p,name in selection],'harnessPath':str(path.relative_to(R)),'harnessSha256':sha(path),'extractedAssertions':[{'source':str(p.relative_to(R)),'sourceSha256':sha(p),'exactBodySha256':hashlib.sha256(body.encode()).hexdigest()} for p,body in [(facet,facet_body),(key,key_body)]],'relationshipHelperSha256':sha(R/'scripts/core-ideals/relationship-conformance.ts'),'commands':[['bun','test',p,'--test-name-pattern','^'+name+'$'] for p,name in selection]+[['bun','test','/work/'+str(path.relative_to(R))]]}
original=[]
for source in sorted((R/'tests/core-ideals').glob('*.test.ts')):
 if not source.name.endswith(('conformance.test.ts','evidence.test.ts')):continue
 relative=str(source.relative_to(R));names=re.findall(r"^test\('([^']+)'",source.read_text(),re.M)
 for name in names:
  destination='fresh selected original test' if (relative,name) in selection else 'baseline only: evidence/admission assertions'
  if source.name=='facets-conformance.test.ts':destination='fresh facet harness behavioral assertions; admission baseline only'
  if source.name=='key-conformance.test.ts':destination='fresh Key harness behavioral assertions; admission baseline only'
  if name=='ideal admission and qualified five-system delivery require current executable proofs':destination='fresh relationship binding replay; admission flags baseline only'
  original.append({'path':relative,'testName':name,'fileSha256':sha(source),'baselineDestination':'unchanged 5be strict admission command and retained raw gate log','freshDestination':destination})
assert len(original)==17 and len({(v['path'],v['testName']) for v in original})==17
allocation['allOriginal17']=original
allocation['freshExecutionRequirements']={'filteredCommands':{'selectedPassesPerCommand':1,'selectedFailures':0,'selectedSkips':0,'otherOriginalTests':'Explicitly unselected by exact-name filter; their baseline results remain inherited and are not fresh failures or passes.'},'harness':{'passes':3,'failures':0,'skips':0},'distinctCounting':'Eight fresh semantic tests reported separately from disjoint behavior regression; nested relationship replay is duplicate execution, not extra unique tests.'}
(D/'allocation.json').write_text(json.dumps(allocation,indent=2)+'\n');print(json.dumps({'generated':str(path),'selectedOriginalTests':5,'explicitHarnessTests':3}))
