import json, pathlib, hashlib
import pyarrow, pyarrow.parquet as pq
assert pyarrow.__version__ == '21.0.0'
corpus=json.loads(pathlib.Path('fixtures/validation/field-parquet-corpus.json').read_text())
results=[]
record_count=0
record_type_count=0
blocked_records=0
for ri,row in enumerate(corpus['rows']):
    original=pathlib.Path(row['path']).read_bytes()
    native=pq.ParquetFile(row['path']).schema
    selected=[f for f in row['fields'] if f['result']['status']=='classified']
    assert len(selected)==len(native)
    for ci,f in enumerate(selected):
        col=native.column(ci)
        assert col.name==f['name']
        assert col.path=='.'.join(f['path'])
        assert col.max_definition_level==f['definitionLevel']
        assert col.max_repetition_level==f['repetitionLevel']
        restored=pathlib.Path(f'.cache/parquet-field/{ri}-{f["index"]}.parquet')
        assert restored.read_bytes()==original
        assert pq.ParquetFile(restored).schema.equals(native)
    arrow=pq.ParquetFile(row['path']).schema_arrow
    structs=[]
    def walk_type(t):
        if pyarrow.types.is_struct(t):
            structs.append([f.name for f in t])
            for f in t: walk_type(f.type)
        elif pyarrow.types.is_list(t) or pyarrow.types.is_large_list(t): walk_type(t.value_type)
        elif pyarrow.types.is_map(t):
            walk_type(t.key_type)
            walk_type(t.item_type)
    for field in arrow: walk_type(field.type)
    expected_structs=list(structs)
    for entry in row['records']:
        result=entry['result']
        if result['status']=='blocked':
            blocked_records+=1
            continue
        names=[m['nativeFragment']['name'] for m in result['mappings'] if m['kind']=='field']
        if entry['request']['index']==0: assert names==arrow.names
        else:
            assert names in expected_structs, (row['path'],names,expected_structs)
            expected_structs.remove(names)
        restored=pathlib.Path(f'.cache/parquet-field/record-{ri}-{entry["request"]["index"]}.parquet')
        assert restored.read_bytes()==original
        assert pq.ParquetFile(restored).schema.equals(native)
        record_count+=1
    type_structs=list(structs)
    for entry in row['recordTypes']:
        result=entry['result']
        if result['status']=='blocked': continue
        record=result['target']['modules'][-1]['elements'][0]
        fields_module=next(m for m in result['target']['modules'] if m['id']=='parquet.fields')
        slot=next(e for e in fields_module['elements'] if e['id']=='schema:'+str(entry['request']['index']))
        assert slot['kind']=='field' and slot['references'][-1]=={'role':'record-type','module':'records','element':'type'}
        names=[next(e['name'] for e in fields_module['elements'] if e['id']==ref['element']) for ref in record['references']]
        assert names in type_structs
        type_structs.remove(names)
        restored=pathlib.Path(f'.cache/parquet-field/type-{ri}-{entry["request"]["index"]}.parquet')
        assert restored.read_bytes()==original
        assert pq.ParquetFile(restored).schema.equals(native)
        record_type_count+=1
    assert not type_structs
    assert not expected_structs, (row['path'],expected_structs)
    results.append({'path':row['path'],'fields':len(selected),'sha256':hashlib.sha256(original).hexdigest()})
out={'runtime':'PyArrow '+pyarrow.__version__,'recordTypes':record_type_count,'records':record_count,'blockedRecords':blocked_records,'files':len(results),'fields':sum(r['fields'] for r in results),'results':results,'scope':'Physical leaf roles/levels, Arrow root and nested struct member names, and byte recovery; no value-domain or cardinality equivalence'}
pathlib.Path('fixtures/validation/field-parquet-native.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'files':out['files'],'fields':out['fields'],'recordTypes':record_type_count,'records':record_count,'blockedRecords':blocked_records}))
