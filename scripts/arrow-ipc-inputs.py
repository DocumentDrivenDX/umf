"""Authored IPC fixtures with actual arrays; independently verify native re-emission."""
import hashlib,json,sys
from pathlib import Path
import pyarrow as pa
base=Path('fixtures/arrow/ipc-inputs');base.mkdir(parents=True,exist_ok=True)
if '--verify' in sys.argv:
    results=json.loads((base/'native-results.json').read_text())
    checked=[]
    for result in results:
        if result['status']!='rewritten':continue
        source=base/result['file'];raw=source.read_bytes()
        opener=pa.ipc.open_file if result['format']=='file' else pa.ipc.open_stream
        original=opener(raw).read_all()
        rewritten=pa.ipc.open_stream((base/(result['file']+'.js.arrow')).read_bytes()).read_all()
        assert original.schema.equals(rewritten.schema,check_metadata=True),result['file']
        assert original.equals(rewritten,check_metadata=True),result['file']
        checked.append(result['file'])
    (base/'independent-results.json').write_text(json.dumps({'oracle':'pyarrow '+pa.__version__,'equalTables':checked},indent=2)+'\n')
    print({'equalTables':len(checked)});sys.exit()
arrays={
 'int64':pa.array([-(2**63),None,2**63-1],type=pa.int64()),
 'dictionary':pa.DictionaryArray.from_arrays(pa.array([0,None,1],type=pa.int16()),pa.array(['café','second'])),
 'list':pa.array([['a',None],None,[]],type=pa.list_(pa.string())),
 'struct':pa.array([{'x':1,'label':'a'},None,{'x':None,'label':'b'}],type=pa.struct([('x',pa.int32()),('label',pa.string())])),
 'map':pa.array([[('a',1),('b',None)],None,[]],type=pa.map_(pa.string(),pa.int32())),
 'union':pa.UnionArray.from_dense(pa.array([3,7,3],type=pa.int8()),pa.array([0,0,1],type=pa.int32()),[pa.array([1,None]),pa.array(['a'])],field_names=['number','text'],type_codes=[3,7]),
 'listview':pa.array([[1,None],None,[]],type=pa.list_view(pa.int32())),
 'largelistview':pa.array([[1,None],None,[]],type=pa.large_list_view(pa.int32())),
 'runendencoded':pa.RunEndEncodedArray.from_arrays(pa.array([2,3],type=pa.int16()),pa.array(['a',None])),
}
manifest=[]
for name,array in arrays.items():
    schema=pa.schema([pa.field('value',array.type,metadata={b'field-note':b'preserve'})],metadata={b'schema-note':'café'.encode()})
    batch=pa.RecordBatch.from_arrays([array],schema=schema)
    for format in ['stream','file']:
        sink=pa.BufferOutputStream();factory=pa.ipc.new_file if format=='file' else pa.ipc.new_stream
        with factory(sink,schema) as writer:
            writer.write_batch(batch);writer.write_batch(batch)
        raw=sink.getvalue().to_pybytes();file=name+'.'+format+'.arrow';(base/file).write_bytes(raw)
        opener=pa.ipc.open_file if format=='file' else pa.ipc.open_stream
        restored=opener(raw).read_all()
        assert restored.num_rows==6 and restored.equals(pa.Table.from_batches([batch,batch]))
        manifest.append({'name':name,'format':format,'file':file,'rows':6,'batches':2,'sha256':hashlib.sha256(raw).hexdigest()})
(base/'manifest.json').write_text(json.dumps({'producer':'pyarrow '+pa.__version__,'origin':'authored synthetic arrays, not upstream conformance corpus','cases':manifest},indent=2)+'\n')
print({'fixtures':len(manifest)})
