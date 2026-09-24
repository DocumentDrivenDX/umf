import json,math
from pathlib import Path
import pyarrow.parquet as pq
base=Path('fixtures/parquet/levels');report=json.loads((base/'results.json').read_text());results=[]
def hybrid(raw,width,count):
 pos=0;values=[];padding=[]
 while len(values)<count:
  h=0;shift=0
  while True:
   b=raw[pos];pos+=1;h+=(b&127)<<shift
   if b<128:break
   shift+=7
  if h&1:
   run=(h>>1)*8;n=run*width//8;packed=raw[pos:pos+n];pos+=n;decoded=[]
   for i in range(run):
    bit=i*width;start=bit//8;v=int.from_bytes(packed[start:start+(width+7)//8+1],'little');decoded.append((v>>(bit%8))&((1<<width)-1))
  else:
   run=h>>1;n=(width+7)//8;v=int.from_bytes(raw[pos:pos+n],'little');pos+=n;decoded=[v]*run
  remaining=count-len(values);values+=decoded[:remaining];padding+=decoded[remaining:]
 assert pos==len(raw);return values,padding
for c in report['results']:
 if c['status']!='decoded':continue
 native=pq.ParquetFile(c['path']);bodies=json.loads(Path('fixtures/parquet/bodies',c['id']+'.json').read_text());expected=[]
 for p in bodies:
  h=p['header']
  if h['type']=='2':continue
  v2=h.get('data_page_header_v2');data=v2 or h['data_page_header'];count=int(data['num_values']);body=bytes.fromhex(p['bodyHex']);pos=0;arrays=[];padding=[];column=native.schema.column(p['column'])
  for kind,maximum in [('repetition',column.max_repetition_level),('definition',column.max_definition_level)]:
   if not maximum:arrays.append([0]*count);padding.append([]);continue
   if v2:length=int(v2[kind+'_levels_byte_length'])
   else:length=int.from_bytes(body[pos:pos+4],'little');pos+=4
   a,pad=hybrid(body[pos:pos+length],maximum.bit_length(),count);pos+=length;arrays.append(a);padding.append(pad)
  expected.append({'rowGroup':p['rowGroup'],'column':p['column'],'offset':p['offset'],'repetition':arrays[0],'definition':arrays[1],'repetitionPadding':padding[0],'definitionPadding':padding[1],'valuesOffset':pos,'nonNullValues':sum(v==column.max_definition_level for v in arrays[1]),'rowStarts':arrays[0].count(0)})
 assert expected==json.loads((base/(c['id']+'.json')).read_text());results.append({'id':c['id'],'pages':len(expected),'levelPairs':sum(len(p['definition']) for p in expected)})
(base/'oracle-results.json').write_text(json.dumps({'runtime':'Independent Python run decoder + PyArrow 21.0.0 schema levels','files':len(results),'pages':sum(r['pages'] for r in results),'levelPairs':sum(r['levelPairs'] for r in results),'results':results},indent=2)+'\n');print({'files':len(results),'pages':sum(r['pages'] for r in results),'levelPairs':sum(r['levelPairs'] for r in results)})
