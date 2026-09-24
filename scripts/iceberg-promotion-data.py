"""Authored non-PII rows, independent PyArrow Parquet writer, pinned Iceberg field IDs."""
import hashlib,json,struct
from decimal import Decimal
from pathlib import Path
import pyarrow as pa
import pyarrow.parquet as pq
base=Path('fixtures/iceberg/table-promotion');out=base/'data';out.mkdir(exist_ok=True)
results=[]
for case in json.loads((base/'results.json').read_text())['results']:
 source=json.loads(Path(case['path']).read_text());type_name=source['schemas'][0]['fields'][0]['type']
 if type_name=='int':
  typ=pa.int32();values=[-2147483648,-257,-1,0,1,255,2147483647];expected=[str(x) for x in values]
 elif type_name=='float':
  typ=pa.float32();values=[-3.4028234663852886e38,-1.5,-0.0,0.0,0.1,1.5,3.4028234663852886e38,float("-inf"),float("inf"),float("nan")]
  # Expected widened double bits derive directly from source IEEE float32 bytes.
  values=[struct.unpack('!f',struct.pack('!f',x))[0] for x in values]
  expected=[struct.pack('!d',x).hex() for x in values]
 else:
  typ=pa.decimal128(9,2);values=[Decimal(x) for x in ['-9999999.99','-1.01','-0.01','0.00','0.01','1.01','9999999.99']];expected=[str(x) for x in values]
 fields=[pa.field('physical_x',typ,nullable=False,metadata={b'PARQUET:field_id':b'1'}),pa.field('physical_y',pa.int64(),nullable=False,metadata={b'PARQUET:field_id':b'2'}),pa.field('physical_z',pa.int64(),nullable=False,metadata={b'PARQUET:field_id':b'3'})]
 # Physical names intentionally differ: Iceberg must bind by field ID.
 y=list(range(len(values)));z=[-i for i in y]
 table=pa.Table.from_arrays([pa.array(values,type=typ),pa.array(y,type=pa.int64()),pa.array(z,type=pa.int64())],schema=pa.schema(fields))
 path=out/(case['id']+'.parquet');pq.write_table(table,path,compression='NONE',use_dictionary=False,row_group_size=3,store_schema=False)
 read=pq.read_table(path)
 if type_name=='float':
  assert [struct.pack('!d',v).hex() for v in read.column('physical_x').to_pylist()]==expected
  assert read.column('physical_y').to_pylist()==y and read.column('physical_z').to_pylist()==z
 else:assert read.equals(table,check_metadata=False)
 results.append({'id':case['id'],'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'sourceType':type_name,'expectedPromoted':expected,'encoding':'double-ieee754-hex' if type_name=='float' else 'decimal-text','expectedY':y,'expectedZ':z,'rows':len(values),'rowGroups':pq.ParquetFile(path).metadata.num_row_groups})
(out/'manifest.json').write_text(json.dumps({'writer':'PyArrow '+pa.__version__,'scope':'Authored required primitive widening data with field IDs; untouched y/z values; no table manifests or commits','cases':results},indent=2)+'\n')
print({'files':len(results),'rows':sum(c['rows'] for c in results)})
