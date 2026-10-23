# SPDX-License-Identifier: MIT OR Apache-2.0
"""Read-only Apache Avro/fastavro parser observations over the frozen cases."""
import hashlib, json, os, warnings
from decimal import Decimal
from pathlib import Path
import avro, avro.schema, fastavro

base=Path(__file__).parent
capture=json.loads((base/'predecessor.json').read_text())
assert (avro.__version__,fastavro.__version__)==('1.12.0','1.12.2')

def observe(text,engine):
    with warnings.catch_warnings(record=True) as seen:
        warnings.simplefilter('always')
        try:
            if engine=='apache':
                parsed=avro.schema.parse(text)
                detail={'schemaClass':type(parsed).__name__,'typeName':getattr(parsed,'type',None)}
            else:
                parsed=fastavro.parse_schema(json.loads(text))
                detail={'type':parsed.get('type') if isinstance(parsed,dict) else type(parsed).__name__}
            result={'accepted':True,'detail':detail}
        except Exception as e:result={'accepted':False,'errorType':type(e).__name__,'message':str(e)}
        result['warnings']=sorted(set(str(w.message) for w in seen))
    return result

native=[]
for case in capture['cases']:
    text=case['source']
    for engine in ('apache','fastavro'):
        native.append({'label':case['label'],'engine':engine,'outcome':observe(text,engine)})

# Independently classify the exact precision/scale/size tokens with Decimal, not
# through JSON's binary floating point. This checks the asserted family gate only.
numeric=[c for c in capture['cases'] if c['label'].startswith('numeric-')]
decimalControls=[]
for case in numeric:
    doc=json.loads(case['source'],parse_float=Decimal,parse_int=Decimal)
    typ=doc['fields'][0]['type']
    key=case['label'].split('-')[2]
    value=typ[key]
    interpretable=value==value.to_integral_value() and abs(value)<=Decimal(9007199254740991) and not(value.is_zero() and value.is_signed())
    assert interpretable==(case['fixtureExpected'][0]=='decimal'), (case['label'],key,str(value),interpretable,case['fixtureExpected'])
    decimalControls.append({'label':case['label'],'key':key,'token':str(value),'integralSafeNonNegativeZero':interpretable})

dependencyFiles={}
for package in (Path(avro.__file__).parent,Path(fastavro.__file__).parent):
    for path in sorted(package.rglob('*')):
        if path.is_file():dependencyFiles[str(path.relative_to(package.parent))]=hashlib.sha256(path.read_bytes()).hexdigest()

report={'python':__import__('sys').version,'apacheAvro':avro.__version__,'fastavro':fastavro.__version__,
        'predecessorSha256':hashlib.sha256((base/'predecessor.json').read_bytes()).hexdigest(),
        'dependencyFileSha256':dependencyFiles,
        'dependencyClosureSha256':hashlib.sha256(json.dumps(dependencyFiles,separators=(',',':')).encode()).hexdigest(),
        'observations':native,'decimalControls':decimalControls,
        'scope':'Independent native schema parse acceptance/warnings for each frozen input; named dependencies are not implicitly merged for these standalone cases. Decimal controls use Python Decimal on exact source tokens and are not parser meaning claims.'}
out=base/'native-oracle.json';out.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'out':str(out),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'versions':{'python':report['python'],'avro':avro.__version__,'fastavro':fastavro.__version__},'observations':len(native),'accepted':sum(x['outcome']['accepted'] for x in native),'rejected':sum(not x['outcome']['accepted'] for x in native),'decimalControls':len(decimalControls)},indent=2))
