# SPDX-License-Identifier: MIT OR Apache-2.0
"""Independent native nested schemas/values; JSON-safe tokens are driver inputs."""
import io,json,uuid,tempfile,hashlib,sys,copy
from pathlib import Path
import avro,avro.schema,avro.io,fastavro,pyarrow as pa,pyarrow.parquet as pq
assert (avro.__version__,fastavro.__version__,pa.__version__)==('1.12.0','1.12.2','21.0.0')
source=Path('fixtures/validation/uuid/composition-artifacts.json');cases=json.loads(source.read_text())['cases'];observations=[]
def nonnull(s):return next(x for x in s if x!='null') if isinstance(s,list) else s
def avro_convert(v,s,back=False):
 if v is None:return None
 s=nonnull(s)
 if isinstance(s,str):return str(v) if back and s=='long' else int(v) if s=='long' else v
 t=s['type']
 if t=='record':return {f['name']:avro_convert(v[f['name']],f['type'],back) for f in s['fields']}
 if t=='array':return [avro_convert(x,s['items'],back) for x in v]
 if t=='map':return {k:avro_convert(x,s['values'],back) for k,x in v.items()}
 if t=='string' and s.get('logicalType')=='uuid':return str(v)
 if t=='fixed':return str(uuid.UUID(bytes=v)) if back and s.get('logicalType')=='uuid' else v.hex() if back else uuid.UUID(v).bytes if s.get('logicalType')=='uuid' else bytes.fromhex(v)
 return v

def arrow_field(c):
 if c.get('logicalType')=='LIST':typ=pa.list_(arrow_field(c['item']))
 elif c.get('logicalType')=='MAP':typ=pa.map_(pa.string(),arrow_field(c['value']))
 elif 'children'in c:typ=pa.struct([arrow_field(x) for x in c['children']])
 elif c.get('physicalType')=='INT64':typ=pa.int64() if c['isSigned'] else pa.uint64()
 elif c.get('logicalType')=='UUID':typ=pa.uuid()
 elif c.get('physicalType')=='FIXED_LEN_BYTE_ARRAY':typ=pa.binary(c['length'])
 else:typ=pa.string()
 return pa.field(c['name'],typ,nullable=c['nullable'])
def parquet_convert(v,c,back=False):
 if v is None:return None
 if c.get('logicalType')=='LIST':return [parquet_convert(x,c['item'],back) for x in v]
 if c.get('logicalType')=='MAP':return {k:parquet_convert(x,c['value'],back) for k,x in (v if back and isinstance(v,list) else v.items())}
 if 'children'in c:return {x['name']:parquet_convert(v[x['name']],x,back) for x in c['children']}
 if c.get('physicalType')=='INT64':return str(v) if back else int(v)
 if c.get('logicalType')=='UUID':return str(v) if back else uuid.UUID(v).bytes
 if c.get('physicalType')=='FIXED_LEN_BYTE_ARRAY':return v.hex() if back else bytes.fromhex(v)
 return v
for case in cases:
 if case['system'] not in ('avro','parquet'):continue
 schemas=json.loads(case['report']['candidate']['text'])['records'];records=[];archive=Path('fixtures/validation/uuid/composition-files')/case['stage'];archive.mkdir(parents=True,exist_ok=True)
 for i,(schema,pop) in enumerate(zip(schemas,case['records'])):
  rows=pop['rows'];engines=[]
  if case['system']=='avro':
   (archive/(str(i)+'.avsc')).write_text(json.dumps(schema)+'\n');apache=avro.schema.parse(json.dumps(schema));fast=fastavro.parse_schema(schema)
   for engine in ('apache','fastavro'):
    out=[]
    for row in rows:
     native=avro_convert(row,schema);stream=io.BytesIO()
     if engine=='apache':avro.io.DatumWriter(apache).write(native,avro.io.BinaryEncoder(stream));stream.seek(0);returned=avro.io.DatumReader(apache).read(avro.io.BinaryDecoder(stream))
     else:fastavro.schemaless_writer(stream,fast,native);stream.seek(0);returned=fastavro.schemaless_reader(stream,fast)
     token=avro_convert(returned,schema,True);assert token==row,(case['stage'],token,row);out.append(token)
    invalid=[]
    if pop['record']['element']=='child':
     bad=copy.deepcopy(rows[0]);bad['count']='not-an-integer';stream=io.BytesIO();native=avro_convert(bad,schema)
     if engine=='apache':avro.io.DatumWriter(apache).write(native,avro.io.BinaryEncoder(stream));stream.seek(0);value=avro.io.DatumReader(apache).read(avro.io.BinaryDecoder(stream))
     else:fastavro.schemaless_writer(stream,fast,native);stream.seek(0);value=fastavro.schemaless_reader(stream,fast)
     invalid.append(avro_convert(value,schema,True))
    engines.append({'engine':engine,'rows':out,'invalidRows':invalid})
  else:
   fields=schema['columns'];native_schema=pa.schema([arrow_field(f) for f in fields]);native=[{f['name']:parquet_convert(row[f['name']],f) for f in fields} for row in rows]
   with tempfile.TemporaryDirectory(prefix='umf-composition-') as temp:
    path=Path(temp)/'values.parquet';pq.write_table(pa.Table.from_pylist(native,schema=native_schema),path);stored=pq.read_table(path);(archive/(str(i)+'.parquet')).write_bytes(path.read_bytes())
    out=[{f['name']:parquet_convert(row[f['name']],f,True) for f in fields} for row in stored.to_pylist()];assert out==rows,(out,rows)
    invalid=[]
    if pop['record']['element']=='child':
     bad=copy.deepcopy(native[0]);bad['count']='not-an-integer';bad_path=Path(temp)/'invalid.parquet';pq.write_table(pa.Table.from_pylist([bad],schema=native_schema),bad_path)
     invalid=[{f['name']:parquet_convert(row[f['name']],f,True) for f in fields} for row in pq.read_table(bad_path).to_pylist()]
    engines.append({'engine':'pyarrow','rows':out,'invalidRows':invalid})
  # Independent bit arithmetic and field-specific scalar expectations.
  for result in engines:
   for row in result['rows']:
    if pop['record']['element']=='child':
     assert row['count']=='-9223372036854775808' and row['price']=='1234567890123456.7890' and row['label']=="雪 O'Brien" and row['blob']=='00ff80'
     pair=row['id_hi__pair'];assert ((int(pair['id_hi'])%(2**64))*(2**64)+int(pair['id_lo'])%(2**64))==2**128-1
     if case['stage']!='mixed':
      pair=row['itemMap']['values'][1];assert (int(pair['hi'])%(2**64))*(2**64)+int(pair['lo'])%(2**64)==int('00112233445566778899aabbccddeeff',16)
      assert row['itemMap']['values'][1]==row['itemMap']['values'][2] and row['itemMap']['missing'] is None and row['itemMap']['empty']==[]
  records.append({'record':pop['record'],'engines':engines})
 observations.append({'system':case['system'],'stage':case['stage'],'records':records,'independentScalarAndNestedUuidChecks':True})
Path('fixtures/validation/uuid/composition-files.json').write_text(json.dumps({'versions':{'avro':avro.__version__,'fastavro':fastavro.__version__,'pyarrow':pa.__version__},'inputSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'observations':observations},indent=2)+'\n')
print({'cases':len(observations)})
