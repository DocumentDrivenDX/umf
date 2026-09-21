import json, pathlib, hashlib
import pyarrow, pyarrow.parquet as pq
assert pyarrow.__version__ == '21.0.0'
corpus=json.loads(pathlib.Path('fixtures/validation/field-parquet-corpus.json').read_text())
results=[]
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
    results.append({'path':row['path'],'fields':len(selected),'sha256':hashlib.sha256(original).hexdigest()})
out={'runtime':'PyArrow '+pyarrow.__version__,'files':len(results),'fields':sum(r['fields'] for r in results),'results':results,'scope':'Physical schema leaf roles, paths, definition/repetition levels and byte recovery; no value-domain or cardinality equivalence'}
pathlib.Path('fixtures/validation/field-parquet-native.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'files':out['files'],'fields':out['fields']}))
