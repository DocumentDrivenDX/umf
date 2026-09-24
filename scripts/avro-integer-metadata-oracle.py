"""Native parsing observations; integer classification remains an exact-token decision."""
import json,hashlib,warnings
from decimal import Decimal
from pathlib import Path
import avro,avro.schema,fastavro
assert avro.__version__=='1.12.0' and fastavro.__version__=='1.12.2'
p=Path('fixtures/avro/integer-metadata.json');fixture=json.loads(p.read_text())
def observe(text,engine):
    with warnings.catch_warnings(record=True) as seen:
        warnings.simplefilter('always')
        try:
            if engine=='apache':
                parsed=avro.schema.parse(text)
                detail={'class':type(parsed.fields[0].type).__name__,'logicalType':getattr(parsed.fields[0].type,'logical_type',None)}
            else:
                parsed=fastavro.parse_schema(json.loads(text));detail={'type':parsed['fields'][0]['type']}
            outcome={'accepted':True,'detail':detail}
        except Exception as error:outcome={'accepted':False,'exception':type(error).__name__,'message':str(error)}
        outcome['warnings']=[str(w.message) for w in seen];return outcome
results=[]
for case in fixture['cases']:
    exact=json.loads(case['source'],parse_float=Decimal,parse_int=Decimal)['fields'][0]['type'][case['key']]
    interpretable=exact==exact.to_integral_value() and abs(exact)<=9007199254740991 and not(exact.is_zero() and exact.is_signed())
    assert interpretable==(case['expected'][0]=='decimal')
    for engine in ['apache','fastavro']:
        original=observe(case['source'],engine)
        for output in case['exports']:assert observe(output['native'],engine)==original
        results.append({'key':case['key'],'token':str(exact),'engine':engine,'outcome':original,'recoveries':2})
Path('fixtures/avro/integer-metadata-oracle.json').write_text(json.dumps({'avro':avro.__version__,'fastavro':fastavro.__version__,'inputSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'observations':results,'scope':'Native parser acceptance/warnings preserved through 60 recovered schemas. Native JSON parsers may themselves round numbers; their acceptance does not prove exact decimal meaning or justify core promotion.'},indent=2)+'\n')
print({'observations':len(results),'recoveries':len(results)*2})
