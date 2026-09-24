import json,random
from pathlib import Path
import pyarrow as pa
rng=random.Random(193);cases=[]
def emit(id,raw,compressed=None):
 if compressed is None:compressed=pa.compress(raw,codec='snappy',asbytes=True)
 assert pa.decompress(compressed,decompressed_size=len(raw),codec='snappy',asbytes=True)==raw
 cases.append({'id':id,'input':compressed.hex(),'output':raw.hex()})
for n in [0,1,4,60,61,255,256,4096,65536]:
 for mode in ['random','repeat']:
  raw=bytes(rng.randrange(256) for _ in range(n)) if mode=='random' else (b'abcabcxyz'*((n+8)//9))[:n];emit(str(n)+'-'+mode,raw)
for mode,tag in [('copy1',bytes([1,1])),('copy2',bytes([14,1,0])),('copy4',bytes([15,1,0,0,0]))]:emit(mode,b'aaaaa',bytes([5,0,97])+tag)
for width in [1,2,3,4]:emit('literal-length-'+str(width),b'x'*64,bytes([64,(59+width)<<2])+bytes([63])+bytes(width-1)+b'x'*64)
base=Path('fixtures/parquet/bodies');base.mkdir(parents=True,exist_ok=True);(base/'snappy-vectors.json').write_text(json.dumps({'runtime':'PyArrow '+pa.__version__,'cases':cases},indent=2)+'\n');print({'vectors':len(cases)})
