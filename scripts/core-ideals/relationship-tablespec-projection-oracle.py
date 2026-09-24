"""Independent native structural checks for emitted metadata, not join execution."""
import hashlib, importlib.metadata, json, runpy
from pathlib import Path
import jsonschema
from pydantic import ValidationError
PIN='647e8e566ad78b864282ec65c0b0b2237aa63084'
manifest_path=Path('native/tablespec/sources.json');manifest=json.loads(manifest_path.read_text());assert manifest['commit']==PIN
paths=[Path(__file__),manifest_path,Path('scripts/core-ideals/relationship-tablespec-oracle.ts'),Path('scripts/core-ideals/relationship-tablespec-projection-cases.ts'),Path('src/core-ideals/relationship-tablespec-projection.ts'),Path('spec/core/relationship-tablespec-projection.schema.json'),Path('fixtures/validation/relationship-tablespec-projected-schemas.json')]
for entry in manifest['files']:
 p=Path(entry['path']);assert hashlib.sha256(p.read_bytes()).hexdigest()==entry['sha256'];paths.append(p)
root=Path('native/tablespec/sources/src/tablespec')
UMF=runpy.run_path(str(root/'models/umf.py'))['UMF']
validator=jsonschema.Draft202012Validator(json.loads((root/'schemas/umf.schema.json').read_text()))
# Pin the registry actually consulted by the native model, including generated browser mapping.
runpy.run_path('scripts/core-ideals/relationship-tablespec-domain-oracle.py')
for name in ['sources.json','domain_types.py','domain_types.yaml','domain-base-types.json']:
 paths.append(Path('native/tablespec/relationship-runtime')/name)
paths.append(Path('scripts/core-ideals/relationship-tablespec-domain-oracle.py'))
rows=json.loads(paths[6].read_text());results=[]
for row in rows:
 native=json.loads(row['native']);original=json.loads(row['original']);target=json.loads(row['target']);rel=row['relationship'];pairs=row['columns']
 validator.validate(native);model=UMF.model_validate(native);UMF.model_validate(target)
 emitted=model.relationships.outgoing[-1]
 assert emitted.target_table==target['table_name']
 assert emitted.source_column==pairs[0]['sourceColumn'] and emitted.target_column==pairs[0]['targetColumn']
 assert (emitted.join_conditions or [])==[{'source_column':p['sourceColumn'],'target_column':p['targetColumn']} for p in pairs[1:]]
 def bound(m):return str(m['min']) if m['min']==m['max'] else str(m['min'])+'..'+str(m['max'])
 assert emitted.cardinality.source_multiplicity==bound(rel['sourceMultiplicity'])
 assert emitted.cardinality.target_multiplicity==bound(rel['targetMultiplicity'])
 assert emitted.cardinality.composite_key==(len(pairs)>1)
 assert emitted.cardinality.mandatory==(rel['targetMultiplicity']['min']>0)
 assert emitted.source_expression is None and emitted.target_expression is None and emitted.lookup_join is None and emitted.join_type is None
 assert all(p['sourceColumn'] in {c['name'] for c in native['columns']} and p['targetColumn'] in {c['name'] for c in target['columns']} for p in pairs)
 # Projection may append one outgoing carrier; unrelated native metadata is unchanged.
 before=original.get('relationships') or {};after=native['relationships'];assert after['outgoing'][:-1]==before.get('outgoing',[])
 assert {k:v for k,v in after.items() if k!='outgoing'}=={k:v for k,v in before.items() if k!='outgoing'}
 assert {k:v for k,v in native.items() if k!='relationships'}=={k:v for k,v in original.items() if k!='relationships'}
 results.append({'case':row['name'],'runtimeAccepted':True,'checkedSchemaAccepted':True,'columnPairs':len(pairs),'metadataPreserved':True})
assert len(results)==65
refusal_path=Path('fixtures/validation/relationship-tablespec-native-refusals.json');paths.append(refusal_path)
refusals=[]
for row in json.loads(refusal_path.read_text()):
 native=json.loads(row['native']);validator.validate(native)
 try: UMF.model_validate(native)
 except ValidationError: refused=True
 else: refused=False
 assert refused, row['name']
 refusals.append({'case':row['name'],'checkedSchemaAccepted':True,'runtimeAccepted':False})
assert len(refusals)==15
proof={'nativeVersion':PIN,'scope':'Outgoing relationship metadata and explicit column pairs accepted by pinned native model/schema; no referential enforcement or join execution established','bindingAccepted':False,'nativeEquivalence':False,'versions':{p:importlib.metadata.version(p) for p in ['pydantic','jsonschema']},'rows':results,'refusals':refusals,'sha256':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(set(paths))}}
Path('fixtures/validation/relationship-tablespec-projection-native.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({'emitted':len(results),'nativeAccepted':len(results),'bindingAccepted':False}))
