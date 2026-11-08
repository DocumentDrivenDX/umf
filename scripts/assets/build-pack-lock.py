#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Build a deterministic, additive pack lock from exact Git blobs; never downloads."""
import argparse, hashlib, json, posixpath, subprocess
from pathlib import Path
from urllib.parse import urlsplit
ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
DEFAULT_REVISION = '9e93fc583f809bd738409770d46c6dba8541a07a'
MEDIA = {'.pdf':'application/pdf', '.csv':'text/csv', '.json':'application/json',
 '.jsonl':'application/x-ndjson', '.ts':'text/plain', '.py':'text/plain',
 '.txt':'text/plain', '.md':'text/markdown', '.yaml':'application/yaml',
 '.yml':'application/yaml', '.html':'text/html', '.xml':'application/xml',
 '.zip':'application/zip', '.dcm':'application/dicom', '.parquet':'application/vnd.apache.parquet'}
def git(*args):return subprocess.check_output(['git','-C',str(ROOT),*args])
def build(revision):
 revision=git('rev-parse',revision+'^{commit}').decode().strip()
 entries=[]
 for raw in git('ls-tree','-rz','-l',revision,'--','spec/domain-packs/').split(b'\0'):
  if not raw:continue
  meta,path=raw.split(b'\t',1);mode,kind,oid,size=meta.decode().split()
  if kind!='blob' or mode not in ('100644','100755'):raise ValueError('Unsupported pack file')
  entries.append((path.decode(),mode,oid,int(size)))
 proc=subprocess.run(['git','-C',str(ROOT),'cat-file','--batch'],input=''.join(e[2]+'\n' for e in entries).encode(),stdout=subprocess.PIPE,check=True)
 data={};offset=0
 for path,mode,oid,size in entries:
  end=proc.stdout.index(b'\n',offset);assert proc.stdout[offset:end].decode().split()==[oid,'blob',str(size)]
  value=proc.stdout[end+1:end+1+size];assert len(value)==size
  assert hashlib.sha1(b'blob '+str(size).encode()+b'\0'+value).hexdigest()==oid
  data[path]=value;offset=end+2+size
 packs={p.split('/')[2]:json.loads(v) for p,v in data.items() if p.endswith('/pack.json')}
 assets=[];hosts=set();selections={};versions={}
 for path,mode,oid,size in sorted(entries):
  pack=path.split('/')[2];local='/'.join(path.split('/')[3:]);definition=packs.get(pack,{})
  sha=hashlib.sha256(data[path]).hexdigest();matched=[]
  for key,source in definition.get('sources',{}).items():
   if not isinstance(source,dict):continue
   ref=source.get('reference')
   if isinstance(ref,str) and ':' not in ref and posixpath.normpath(ref)==local:matched.append((key,source))
  source_id=pack+':'+(matched[0][0] if matched else local)
  provenance={'packId':pack,'packVersion':definition.get('version'),'gitBlobOid':oid,
              'sourceDeclarations':{key:value for key,value in matched}}
  asset={'id':pack+'/'+local,'path':path,'bytes':size,'sha256':sha,'mode':mode,
         'sourceId':source_id,'rights':'unknown','mediaType':MEDIA.get(Path(path).suffix.lower(),'application/octet-stream'),
         'provenance':provenance}
  if matched:
   license=matched[0][1].get('license',{});asset['license']=license
   if license.get('redistribution') in ('allowed','restricted','unknown'):asset['rights']=license['redistribution']
   # A transformed projection must never fetch the upstream original as if identical.
   for key,source in matched:
    pr=source.get('provenance',{});url=pr.get('upstream_url');checksum=source.get('checksum',{})
    if (isinstance(url,str) and urlsplit(url).scheme=='https' and not pr.get('transformations')
        and checksum.get('algorithm')=='sha256' and checksum.get('value')==sha):
     asset['url']=url;hosts.add(urlsplit(url).hostname.lower());break
  assets.append(asset);selections.setdefault(pack,{'assets':[]})['assets'].append(asset['id'])
  if definition:versions[pack]=definition.get('version')
 # Include composed pack families, checking the exact declared child identity/hash.
 direct={key:list(value['assets']) for key,value in selections.items()}
 def closure(pack,stack):
  if pack in stack:raise ValueError('Cyclic pack composition: '+pack)
  result=set(direct[pack])
  for component in packs.get(pack,{}).get('composition',{}).get('components',[]):
   child=component['id'];definition=packs.get(child)
   if not definition or definition.get('version')!=component['version']:raise ValueError('Pack component identity')
   expected=component.get('checksum',{})
   if expected.get('algorithm')!='sha256' or hashlib.sha256(data['spec/domain-packs/'+child+'/pack.json']).hexdigest()!=expected.get('value'):raise ValueError('Pack component checksum')
   result.update(closure(child,stack|{pack}))
  return sorted(result)
 for pack in selections:selections[pack]['assets']=closure(pack,set())
 published=OUT/'published-assets.json'
 if published.exists():
  publication=json.loads(published.read_text())
  if publication['baseline']!=revision:raise ValueError('Publication baseline mismatch')
  bypath={a['path']:a for a in assets}
  for item in publication['assets']:
   asset=bypath[item['path']]
   if asset['rights']!='allowed' or asset['sha256']!=item['sha256'] or asset['bytes']!=item['bytes']:raise ValueError('Publication identity/rights mismatch')
   asset.update(url=item['url'],transport='github-release',downloadMediaType=item['downloadMediaType'])
  hosts.update(['github.com','release-assets.githubusercontent.com'])
 return {'version':1,'kind':'domain-packs','id':'umf-domain-pack-assets','revision':revision,
         'allowedHosts':sorted(hosts),'packVersions':versions,'assets':assets,'selections':selections}
def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--revision',default=DEFAULT_REVISION);ap.add_argument('--check',action='store_true');args=ap.parse_args()
 raw=(json.dumps(build(args.revision),indent=2,ensure_ascii=False)+'\n').encode();sha=hashlib.sha256(raw).hexdigest()
 pin=('// SPDX-License-Identifier: MIT OR Apache-2.0\n// Exact checked-in pack asset lock; custom locks require an explicit trusted digest.\nexport const packLockSha256 = '+json.dumps(sha)+';\n').encode()
 for name,value in [('domain-packs.lock.json',raw),('pack-lock-pin.ts',pin)]:
  p=OUT/name
  if args.check:
   if p.read_bytes()!=value:raise ValueError('Stale '+name)
  else:p.write_bytes(value)
 print(json.dumps({'sha256':sha,'bytes':len(raw),'check':args.check}))
if __name__=='__main__':main()
