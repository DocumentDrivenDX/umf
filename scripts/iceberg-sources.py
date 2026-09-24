import json,hashlib,urllib.request
from pathlib import Path
base=Path('native/iceberg/sources');base.mkdir(parents=True,exist_ok=True);commit='6976e020b894f6a6777704df2b8c4458cb291ae9';files=[]
for path in ['format/spec.md','LICENSE','NOTICE']:
 url=f'https://raw.githubusercontent.com/apache/iceberg/{commit}/{path}';data=urllib.request.urlopen(url).read();name=Path(path).name;(base/name).write_bytes(data);files.append({'path':name,'source':url,'sha256':hashlib.sha256(data).hexdigest()})
(base/'manifest.json').write_text(json.dumps({'system':'Apache Iceberg','version':'1.11.0','commit':commit,'files':files},indent=2)+'\n')
