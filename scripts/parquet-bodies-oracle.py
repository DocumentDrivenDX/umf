import json,zlib,hashlib
from pathlib import Path
import pyarrow as pa
import pyarrow.parquet as pq
base=Path('fixtures/parquet/bodies');report=json.loads((base/'results.json').read_text());results=[]
for c in report['results']:
 if c['status']!='decoded':continue
 source=Path(c['path']).read_bytes();metadata=pq.ParquetFile(c['path']).metadata;pages=json.loads((base/(c['id']+'.json')).read_text());total=0
 for p in pages:
  h=p['header'];raw=source[p['bodyOffset']:p['bodyOffset']+p['bodyBytes']];v2=h.get('data_page_header_v2');levels=int(v2['definition_levels_byte_length'])+int(v2['repetition_levels_byte_length']) if v2 else 0;codec=metadata.row_group(p['rowGroup']).column(p['column']).compression.lower();expected=int(h['uncompressed_page_size']);compressed=codec!='uncompressed' and (v2 is None or v2.get('is_compressed',True));decoded=raw[:levels]+pa.decompress(raw[levels:],decompressed_size=expected-levels,codec=codec,asbytes=True) if compressed else raw
  assert decoded.hex()==p['bodyHex'];assert len(decoded)==expected
  if 'crc' in h:assert zlib.crc32(raw)==int(h['crc'])&0xffffffff and p['checksum']=='verified'
  else:assert p['checksum']=='absent'
  total+=len(decoded)
 assert total==c['decodedBytes'];results.append({'id':c['id'],'pages':len(pages),'decodedBytes':total,'checksums':c['checksums']})
(base/'oracle-results.json').write_text(json.dumps({'runtime':'PyArrow '+pa.__version__+' / Python zlib CRC32','files':len(results),'pages':sum(r['pages'] for r in results),'decodedBytes':sum(r['decodedBytes'] for r in results),'checksums':sum(r['checksums'] for r in results),'results':results},indent=2)+'\n');print({'files':len(results),'pages':sum(r['pages'] for r in results),'checksums':sum(r['checksums'] for r in results)})
