import json,struct,importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('level_reference','scripts/parquet-levels-oracle.py');ref=importlib.util.module_from_spec(spec);spec.loader.exec_module(ref)
import pyarrow.parquet as pq
base=Path('fixtures/parquet/physical');report=json.loads((base/'results.json').read_text());results=[]
def plain(raw,typ,count,length):
 out=[];at=0
 for i in range(count):
  if typ=='BOOLEAN':out.append({'type':typ,'value':bool(raw[i//8]&(1<<(i%8)))});at=(count+7)//8
  elif typ in ['INT32','INT64']:
   size=4 if typ=='INT32' else 8;out.append({'type':typ,'value':str(int.from_bytes(raw[at:at+size],'little',signed=True))});at+=size
  else:
   size={'FLOAT':4,'DOUBLE':8,'INT96':12,'FIXED_LEN_BYTE_ARRAY':length}.get(typ)
   if typ=='BYTE_ARRAY':size=int.from_bytes(raw[at:at+4],'little');at+=4
   out.append({'type':typ,'hex':raw[at:at+size].hex()});at+=size
 assert at==len(raw);return out
for c in report['results']:
 if c['status']!='decoded':continue
 native=pq.ParquetFile(c['path']);bodies=json.loads(Path('fixtures/parquet/bodies',c['id']+'.json').read_text());actual=json.loads((base/(c['id']+'.json')).read_text());dictionary={};total=0
 for p,a in zip(bodies,actual):
  h=p['header'];isdict=h['type']=='2';header=h['dictionary_page_header'] if isdict else h.get('data_page_header_v2',h.get('data_page_header'));count=int(header['num_values']) if isdict else a['levels']['nonNullValues'];raw=bytes.fromhex(p['bodyHex']);raw=raw if isdict else raw[a['levels']['valuesOffset']:];column=native.schema.column(p['column']);key=(p['rowGroup'],p['column'])
  if header['encoding']=='0' or isdict and header['encoding']=='2':expected=plain(raw,column.physical_type,count,column.length)
  else:
   ids,padding=ref.hybrid(raw[1:],raw[0],count) if raw else ([],[]);assert ids==a['dictionaryIndexes'] and padding==a['dictionaryPadding'];expected=[dictionary[key][i] for i in ids]
  assert expected==a['values'];total+=len(expected)
  if isdict:dictionary[key]=expected
 results.append({'id':c['id'],'pages':len(actual),'physicalValues':total})
(base/'oracle-results.json').write_text(json.dumps({'runtime':'Independent Python physical decoder; native PyArrow schemas and verified native-decompressed bodies','files':len(results),'pages':sum(r['pages'] for r in results),'physicalValues':sum(r['physicalValues'] for r in results),'results':results},indent=2)+'\n');print({'files':len(results),'physicalValues':sum(r['physicalValues'] for r in results)})
