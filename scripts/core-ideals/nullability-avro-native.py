"""Independent native availability observations; no UMF classification is inferred here."""
import hashlib,io,json,re,warnings
from pathlib import Path
import avro,avro.schema,avro.io,fastavro
assert avro.__version__=='1.12.0'
assert fastavro.__version__=='1.12.2'
fixture='fixtures/avro/nullability-cases.json'
rows=json.loads(Path(fixture).read_text())['cases']
empty={'type':'record','name':'Example','namespace':'availability','fields':[]}

def observe(codec,text,datum,reader=None,strict=False):
    warnings_seen=[]
    try:
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter('always')
            out=io.BytesIO()
            if codec=='apache':
                writer=avro.schema.parse(text)
                rs=avro.schema.parse(reader) if reader else writer
                avro.io.DatumWriter(writer).write(datum,avro.io.BinaryEncoder(out))
                raw=out.getvalue()
                back=avro.io.DatumReader(writer,rs).read(avro.io.BinaryDecoder(io.BytesIO(raw)))
            else:
                writer=fastavro.parse_schema(json.loads(text))
                rs=fastavro.parse_schema(json.loads(reader)) if reader else None
                fastavro.schemaless_writer(out,writer,datum,strict=strict)
                raw=out.getvalue()
                back=fastavro.schemaless_reader(io.BytesIO(raw),writer,rs)
            warnings_seen=[str(w.message) for w in caught]
        return {'status':'accepted','value':back,'hex':raw.hex(),'warnings':warnings_seen}
    except Exception as e:
        return {'status':'rejected','error':type(e).__name__,'message':re.sub(r'0x[0-9a-fA-F]+', '<object-address>', str(e))}

checks=[]
for row in rows:
    for codec in ['apache','fastavro']:
        for operation,datum in [('present',row['present']),('null',{'value':None}),('omitted',{})]:
            result=observe(codec,row['schema'],datum)
            checks.append({'id':row['id'],'codec':codec,'operation':operation,**result})
        checks.append({'id':row['id'],'codec':codec,'operation':'reader-missing-field',**observe(codec,json.dumps(empty),{},row['schema'])})
    checks.append({'id':row['id'],'codec':'fastavro','operation':'strict-omitted',**observe('fastavro',row['schema'],{},strict=True)})
output={'versions':{'apache':avro.__version__,'fastavro':fastavro.__version__},'checks':checks,'scope':'Pinned Python binary datum writers/readers; API omission behavior is not schema-level optionality','fingerprints':{p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in [fixture,__file__]}}
# Explicit behavioral expectations, independent of UMF's future classifier.
nullable={'null-first','null-last','null-first-default-null','null-last-default-null','null-first-default-int','null-last-default-int','null-only','multiple-values','nullable-array','nullable-map','optional-parent'}
defaults={'integer-default':7,'null-first-default-null':None,'null-last-default-null':None,'null-first-default-int':7,'null-last-default-int':7}
for c in checks:
    id,codec,op=c['id'],c['codec'],c['operation']
    row=next(r for r in rows if r['id']==id)
    expected=None
    if op=='present':accepted=True;expected=row['present']
    elif op=='null':accepted=id in nullable;expected={'value':None}
    elif op=='omitted':
        accepted=id in nullable or (codec=='fastavro' and id in defaults)
        expected={'value':defaults[id] if codec=='fastavro' and id in defaults else None}
    elif op=='strict-omitted':accepted=False
    else:
        accepted=id in defaults and not (codec=='apache' and id in {'null-last-default-null','null-first-default-int'})
        if accepted:expected={'value':defaults[id]}
    assert (c['status']=='accepted')==accepted,c
    if accepted:assert c['value']==expected,(c,expected)
    else:
        error=('InvalidDefaultException' if id in defaults else 'SchemaResolutionException') if codec=='apache' and op=='reader-missing-field' else 'SchemaResolutionError' if op=='reader-missing-field' else 'AvroTypeException' if codec=='apache' else 'ValueError' if op in {'omitted','strict-omitted'} else 'TypeError' if id in {'integer','integer-default','unknown-logical','array-null-items','map-null-values','required-parent','recursive'} else 'ValueError'
        assert c['error']==error,(c,error)
    if op=='null' and accepted:
        if id=='null-only':assert c['hex']=='',c
        else:assert c['hex']==('02' if id in {'null-last','null-last-default-null','null-last-default-int','multiple-values'} else '00'),c
# The full native tree and numeric tokens must survive scoped Nullability classification and recovery.
recovered=json.loads(Path('fixtures/validation/nullability-avro-recovered.json').read_text())
recovery_checks=0
for r in recovered['rows']:
    original=next(row for row in rows if row['id']==r['id'])
    assert r['schema']==original['schema']
    assert r['scope']=='underlying-field-value' and r['carrier']=='avro-null'
    for c in (c for c in checks if c['id']==r['id'] and c['operation']=='null'):
        assert r['nullability']==('absent-allowed' if c['status']=='accepted' else 'required'),(r,c)
    for c in (c for c in checks if c['id']==r['id']):
        op=c['operation'];datum=original['present'] if op=='present' else {'value':None} if op=='null' else {}
        actual=observe(c['codec'],json.dumps(empty) if op=='reader-missing-field' else r['schema'],datum,r['schema'] if op=='reader-missing-field' else None,op=='strict-omitted')
        assert actual=={k:v for k,v in c.items() if k not in {'id','codec','operation'}},(r,c,actual)
        recovery_checks+=1
# Reader/writer union order is independent: preserve branch indices, resolve by type.
union_checks=[]
for codec in ['apache','fastavro']:
    for writer_id,reader_id in [('null-first','null-last'),('null-last','null-first')]:
        w=next(r['schema'] for r in rows if r['id']==writer_id);r=next(r['schema'] for r in rows if r['id']==reader_id)
        for value in [None,7]:
            o=observe(codec,w,{'value':value},r);assert o['status']=='accepted' and o['value']=={'value':value}
            union_checks.append({'codec':codec,'writer':writer_id,'reader':reader_id,**o})
# Preserve the existing permanent floating-point counterexample.
float_checks=[]
for codec in ['apache','fastavro']:
    schema=json.dumps({'type':'record','name':'FloatExample','fields':[{'name':'value','type':'float'}]})
    o=observe(codec,schema,{'value':1.0000000000000002});assert o['status']=='accepted' and o['value']['value']==1.0
    float_checks.append({'codec':codec,'input':1.0000000000000002,**o})
output.update({'recoveredNativeChecks':recovery_checks,'unionResolution':union_checks,'floatNarrowing':float_checks,'limitations':['These probes validate underlying native carrier behavior and retained classification sources; authored projection and full binding acceptance remain unfinished.','Apache and fastavro differ in writer omission/default and reader union-default handling.','Unknown logical annotations are native refinements; accepted underlying values do not establish their meaning.','No writer API behavior is generalized to all Avro implementations or interpreted as portable member omission.']})
output['fingerprints'].update({p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in ['scripts/core-ideals/nullability-avro-oracle.ts','fixtures/validation/nullability-avro-recovered.json']})
Path('fixtures/validation/nullability-avro-native.json').write_text(json.dumps(output,indent=2)+'\n')
print(json.dumps({'schemas':len(rows),'nativeChecks':len(checks),'recoveredNativeChecks':recovery_checks,'unionResolution':len(union_checks),'floatNarrowing':len(float_checks)}))
