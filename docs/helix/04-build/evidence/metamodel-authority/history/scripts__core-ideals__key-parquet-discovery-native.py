"""Pinned Parquet collection-identity counterexamples and original byte fixtures."""
import json,hashlib
from pathlib import Path
import pyarrow as pa
import pyarrow.parquet as pq
assert pa.__version__=='21.0.0'
root=Path('fixtures/parquet/keys');root.mkdir(parents=True,exist_ok=True)
manifest_path=Path('native/parquet/sources/manifest.json');manifest=json.loads(manifest_path.read_text())
assert manifest['commit']=='219e3f12a62f9476e830c21e26d030d231f7c017'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
for f in manifest['files']:assert sha(manifest_path.parent/f['local'])==f['sha256']
metadata={b'primary_key':b'["id"]',b'unique_constraints':b'[["code"]]',b'future.bytes':b'\x00opaque',b'future.integer':b'9007199254740993'}
def pair(nullable=False):return pa.schema([pa.field('id',pa.int64(),nullable=nullable,metadata={b'PARQUET:field_id':b'17',b'future.field':b'identity?'}),pa.field('code',pa.string(),nullable=False,metadata={b'PARQUET:field_id':b'23'})],metadata=metadata)
values=[{'id':2,'code':'a'},{'id':2,'code':'a'},{'id':2,'code':'b'},{'id':1,'code':'a'}]
cases=[('required-embedded',pair(),values,True,False),('required-no-arrow',pair(),values,False,False),('sorting-not-enforced',pair(),values,True,True),('nullable',pair(True),[{'id':None,'code':'a'},{'id':None,'code':'a'}],True,False),('repeated-list',pa.schema([pa.field('ids',pa.list_(pa.field('item',pa.int64(),nullable=False)),nullable=False)],metadata=metadata),[{'ids':[1,1]},{'ids':[1,1]},{'ids':[]}],True,False),('float-narrowing',pa.schema([pa.field('v',pa.float32(),nullable=False)],metadata=metadata),[{'v':1.0000000000000002},{'v':1.0}],True,False),('integer-input-truncation',pa.schema([pa.field('v',pa.int64(),nullable=False)],metadata=metadata),[{'v':1.5},{'v':1}],True,False)]
cases.append(('binary-metadata',pair().with_metadata({**metadata,b'future.bytes':b'\x00\xff'}),values,True,False))
rows=[];paths=[__file__,str(manifest_path)]+[str(manifest_path.parent/f['local']) for f in manifest['files']]
for name,schema,data,embedded,sorting in cases:
    table=pa.Table.from_pylist(data,schema=schema);path=root/(name+'.parquet')
    pq.write_table(table,path,version='2.6',compression='snappy',use_dictionary=True,store_schema=embedded,row_group_size=2,sorting_columns=[pq.SortingColumn(0)] if sorting else None)
    native=pq.ParquetFile(path);decoded=native.read(use_threads=False).to_pylist()
    expected=[{'v':1.0},{'v':1.0}] if name=='float-narrowing' else [{'v':1},{'v':1}] if name=='integer-input-truncation' else data
    assert decoded==expected,(name,decoded)
    kv=native.metadata.metadata or {};assert (b'ARROW:schema' in kv)==embedded
    if embedded:
        for k,v in schema.metadata.items():assert kv[k]==v
    if name.startswith('required') or sorting:
        assert decoded[0]==decoded[1];assert decoded[0]['id']==decoded[2]['id'];assert decoded[0]['code']==decoded[3]['code']
        assert native.schema.column(0).max_definition_level==0
    if sorting:
        assert decoded[0]['id']>decoded[-1]['id'];assert native.metadata.row_group(0).sorting_columns[0].column_index==0
    columns=[{'path':native.schema.column(i).path,'physical':native.schema.column(i).physical_type,'definitionLevel':native.schema.column(i).max_definition_level,'repetitionLevel':native.schema.column(i).max_repetition_level} for i in range(len(native.schema))]
    if name=='repeated-list':assert columns[0]['repetitionLevel']==1
    rows.append({'id':name,'path':str(path),'storeSchema':embedded,'expectedSchema':'blocked' if name=='binary-metadata' else 'checked','rows':decoded,'rowGroups':native.metadata.num_row_groups,'columns':columns,'metadataHex':{k.hex():v.hex() for k,v in kv.items()},'sortingDeclared':sorting,'bytes':path.stat().st_size})
    paths.append(str(path))
# A requiredness refusal is a positive control, not a uniqueness claim.
invalid=pa.Table.from_pylist([{'id':None,'code':'a'}],schema=pair())
try:pq.write_table(invalid,pa.BufferOutputStream())
except (pa.ArrowException,ValueError) as error:control={'refused':True,'error':type(error).__name__,'message':str(error)}
else:raise AssertionError('Required null unexpectedly encoded')
proof={'scope':'PyArrow 21.0.0 native collection-identity discovery; no UMF Key classification, authored projection or binding acceptance','runtime':'PyArrow 21.0.0','formatCommit':manifest['commit'],'references':['https://github.com/apache/parquet-format/blob/'+manifest['commit']+'/src/main/thrift/parquet.thrift'],'cases':rows,'requiredNullControl':control,'sha256':{p:sha(p) for p in paths}}
Path('fixtures/validation/key-parquet-discovery-native.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps({'files':len(rows),'rows':sum(len(r['rows']) for r in rows),'requiredNullRefused':True}))
