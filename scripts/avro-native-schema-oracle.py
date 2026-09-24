import json,warnings,hashlib
from pathlib import Path
import avro,avro.schema,fastavro
assert avro.__version__=='1.12.0' and fastavro.__version__=='1.12.2'
def observe(text,engine):
    with warnings.catch_warnings(record=True) as seen:
        warnings.simplefilter('always')
        try:
            if engine=='apache':avro.schema.parse(text)
            else:fastavro.parse_schema(json.loads(text))
            outcome={'accepted':True}
        except Exception as error:outcome={'accepted':False,'exception':type(error).__name__}
        outcome['warnings']=[str(w.message) for w in seen]
        return outcome
path=Path('fixtures/avro/native-schema.json');data=json.loads(path.read_text());observations=[]
for case in data['cases']:
    observations.append({'schema':case['value'],'syntaxExpected':case['expected'],'apache':observe(json.dumps(case['value']),'apache'),'fastavro':observe(json.dumps(case['value']),'fastavro')})
for recovery in data['recoveries']:
    for engine in ['apache','fastavro']:assert observe(recovery['source'],engine)==observe(recovery['native'],engine)
Path('fixtures/avro/native-schema-oracle.json').write_text(json.dumps({'inputSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'avro':avro.__version__,'fastavro':fastavro.__version__,'observations':observations,'recoveryComparisons':len(data['recoveries'])*2,'scope':'Structural syntax and native semantic acceptance differ intentionally; parser outcomes/warnings remain unchanged through native recovery.'},indent=2)+'\n')
print({'cases':len(observations),'recoveryComparisons':len(data['recoveries'])*2})
