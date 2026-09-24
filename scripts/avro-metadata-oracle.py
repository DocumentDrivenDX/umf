import json,warnings
from pathlib import Path
import avro,avro.schema
assert avro.__version__=='1.12.0'
fixture=json.loads(Path('fixtures/avro/field-metadata.json').read_text())
with warnings.catch_warnings(record=True) as notices:
    warnings.simplefilter('always')
    original=avro.schema.parse(fixture['source'])
    rows=[]
    for output in fixture['exports']:
        recovered=avro.schema.parse(output['native'])
        assert original.to_json()==recovered.to_json()
        rows.append({'format':output['format'],'nativeSchemaAgrees':True})
    fields=[{'name':f.name,'carrier':f.type.type,'logicalType':getattr(f.type,'logical_type',None)} for f in original.fields]
Path('fixtures/avro/field-metadata-oracle.json').write_text(json.dumps({'avro':avro.__version__,'fields':fields,'cases':rows,'warnings':sorted(set(str(w.message) for w in notices)),'scope':'Native schema parsing and recovery; scalar family expectations are separately tested against the specification, not inferred from native acceptance.'},indent=2)+'\n')
print({'fields':len(fields),'recoveries':len(rows)})
