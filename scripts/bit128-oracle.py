"""Independent Python integer/struct/UUID golden corpus; no UMF imports."""
import json,random,struct,uuid
from pathlib import Path
rng=random.Random(1289562)
values=[0,2**128-1,2**127,2**64-1,2**64]+[1<<i for i in range(128)]+[rng.getrandbits(128) for _ in range(256)]
rows=[]
for n in values:
 b=n.to_bytes(16,'big');h,l=struct.unpack('>QQ',b);sh,sl=struct.unpack('>qq',b)
 rows.append(dict(hex=b.hex(),uuid=str(uuid.UUID(bytes=b)),unsigned={'high':str(h),'low':str(l)},signed={'high':str(sh),'low':str(sl)},integer=str(n),signedInteger=str(n if n<2**127 else n-2**128),uuidKey=(b'UMFK2'+bytes([1,7,16])+b).hex()))
path=Path('fixtures/validation/uuid/bit128-oracle.json')
path.write_text(json.dumps({'oracle':'Python integer/struct/uuid; seed1289562','cases':rows},indent=2)+'\n')
print(f'{len(rows)} independent vectors')
