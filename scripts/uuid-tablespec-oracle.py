"""Pinned captured TableSpec model and schema oracle; not Spark execution."""
import json,runpy,hashlib,sys
from pathlib import Path
import pydantic
source=Path('native/tablespec/sources/src/tablespec/models/umf.py')
model=runpy.run_path(str(source))['UMF']
cases=json.loads(Path('fixtures/validation/uuid/native-artifacts.json').read_text())['cases']
observations=[]
for row in cases:
 if row['system']!='tablespec':continue
 if 'candidate' not in row['report']:
  observations.append({'kind':row['kind'],'status':'explicitly-blocked','candidate':False});continue
 text=row['report']['candidate']['text'];value=model.model_validate(json.loads(text));restored=model.model_validate_json(value.model_dump_json())
 assert restored==value
 field=value.model_dump(mode='json')['columns'][0]
 assert field['data_type']=='VARCHAR' and field['length']==36
 observations.append({'kind':row['kind'],'status':'native-model-accepted','column':field,'equalityEnforcement':'unqualified','valueGrammar':'not-enforced'})
result={'scope':'Captured TableSpec native model validation of explicit canonical-string schema; no Spark, general runtime, equality or UUID enforcement claim','pydantic':pydantic.__version__,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'observations':observations}
Path('fixtures/validation/uuid/tablespec.json').write_text(json.dumps(result,indent=2)+'\n');print({'observations':len(observations),'sourceSha256':result['sourceSha256']})
