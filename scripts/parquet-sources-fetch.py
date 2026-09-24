"""Re-fetch the already pinned Apache Parquet specification; never advances its revision."""
import hashlib,json,urllib.request
from pathlib import Path
base=Path('native/parquet/sources');manifest=json.loads((base/'manifest.json').read_text())
for f in manifest['files']:
 raw=urllib.request.urlopen('https://raw.githubusercontent.com/apache/parquet-format/'+manifest['commit']+'/'+f['path']).read();assert hashlib.sha256(raw).hexdigest()==f['sha256'];(base/f['local']).write_bytes(raw)
print({'commit':manifest['commit'],'files':len(manifest['files'])})
