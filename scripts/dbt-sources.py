import urllib.request,hashlib,json
from pathlib import Path
commit='d63e174a73312504393e8e1c21c0ef560d474860';base=Path('native/dbt/sources');base.mkdir(parents=True,exist_ok=True);files=[]
for path,name in [('dbt/manifest/v12.json','manifest-v12.json'),('dbt/run-results/v6.json','run-results-v6.json'),('dbt/catalog/v1.json','catalog-v1.json'),('dbt/sources/v3.json','sources-v3.json'),('LICENSE','LICENSE')]:
 url=f'https://raw.githubusercontent.com/dbt-labs/schemas.getdbt.com/{commit}/{path}';data=urllib.request.urlopen(url).read();(base/name).write_bytes(data);files.append({'path':str(base/name),'url':url,'sha256':hashlib.sha256(data).hexdigest()})
(base/'manifest.json').write_text(json.dumps({'repository':'dbt-labs/schemas.getdbt.com','commit':commit,'files':files},indent=2)+'\n')
