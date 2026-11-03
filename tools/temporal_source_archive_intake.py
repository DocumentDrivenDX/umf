# SPDX-License-Identifier: MIT OR Apache-2.0
"""Closed unqualified source-archive transport intake. Never extracts/builds/imports UMF."""
from pathlib import Path
import argparse,hashlib,json,os,platform,re,subprocess,urllib.request,urllib.error
REPO='DocumentDrivenDX/umf'
SOURCE='e3f38ef6f05ae636d2837f9d69f8d6805222664b'
TREE='a21368a92df488882ef9771e4a1d92205267ddd3'
TAG='qualification-materials/umf-0.10.8/e3f38ef6f05a/source-archive-e42c9efba0f6'
BODY='UNQUALIFIED TRANSPORT ONLY. Complete immutable source-S Git archive for ONE pre-tag source-only correspondence check. No native qualification, product release/tag or rebuild. Never publish this draft.'
ARCHIVE='umf-v0.10.8-source.tar.gz'
MANIFEST='source-archive-materials.json'
FILES={ARCHIVE:(1677409904,'e42c9efba0f652e65021e9d2cf67b32a82d1452b3f8fa1c8c918d16eb14f60ac'),MANIFEST:(962,'dcacf566ec72ffbd8779b34ccc69928c490545c8e96fa3264631f0471af84931')}
CONTROL_FILES=['scripts/verify_core_release_source_archive.py','tools/temporal_source_archive_intake.py','.github/workflows/sagas.yml']
def insist(v,m):
 if not v:raise ValueError(m)
def digest(p):
 h=hashlib.sha256()
 with p.open('rb')as f:
  while b:=f.read(1024*1024):h.update(b)
 return h.hexdigest()
def save(p,d):p.write_text(json.dumps(d,indent=2)+'\n')
def api(path,token):
 req=urllib.request.Request('https://api.github.com/repos/'+REPO+'/'+path,headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json'})
 with urllib.request.urlopen(req,timeout=60)as r:return json.load(r)
def validate_release(r,tag,carrier_id):
 insist(type(carrier_id)is int and carrier_id>0 and type(r.get('id'))is int and r.get('id')==carrier_id,'Carrier ID differs')
 insist(r.get('draft')is True and r.get('prerelease')is True and r.get('published_at')is None
        and r.get('tag_name')==r.get('name')==TAG and r.get('target_commitish')==SOURCE and r.get('body')==BODY,'Not exact unpublished source-only carrier')
 insist(tag.get('ref')=='refs/tags/'+TAG and tag.get('object',{}).get('type')=='commit' and tag['object'].get('sha')==SOURCE,'Material tag moved')
 rows=r.get('assets',[]);assets={a['name']:a for a in rows}
 insist(len(rows)==len(assets)==len(FILES) and set(assets)==set(FILES),'Source carrier asset roster differs')
 ids=[]
 for n,(size,sha)in FILES.items():
  a=assets[n];insist(type(a.get('id'))is int and a['id']>0 and a.get('state')=='uploaded'
                    and type(a.get('size'))is int and a.get('size')==size and a.get('digest')=='sha256:'+sha,'Source carrier asset ID/size/digest differs');ids.append(a['id'])
 insist(len(set(ids))==2,'Duplicate source carrier asset IDs')
 return assets

def validate_manifest(raw):
 insist(len(raw)==FILES[MANIFEST][0] and hashlib.sha256(raw).hexdigest()==FILES[MANIFEST][1],'Material manifest bytes differ')
 m=json.loads(raw)
 insist(set(m)=={'profile','unqualifiedTransportOnly','sourceCommit','sourceTree','archive','gitObjectRoster','producerPolicy','scope'}
        and m['profile']=='umf.source-archive-transport/1' and m['unqualifiedTransportOnly']is True
        and m['sourceCommit']==SOURCE and m['sourceTree']==TREE,'Material manifest identity differs')
 insist(m['archive']=={'filename':ARCHIVE,'bytes':FILES[ARCHIVE][0],'sha256':FILES[ARCHIVE][1]},'Material archive differs')
 insist(m['gitObjectRoster']=={'count':70549,'sha256':'6c46d53fd58f10ee7107f93f045521f40320fb9094a8b62214d54dbbb1a30481'},'Source roster differs')
 insist(m['producerPolicy']=={'tarUmask':'0002','regular':'0664','executable':'0775','directory':'0775','symlink':'0777','typeAndSpecialBits':'Exact Git archive classes; special permission bits refused'},'Closed producer mode policy differs')
 return m

def download(path,asset,token):
 class NoRedirect(urllib.request.HTTPRedirectHandler):
  def redirect_request(self,*a,**k):return None
 req=urllib.request.Request(f"https://api.github.com/repos/{REPO}/releases/assets/{asset['id']}",headers={'Authorization':'Bearer '+token,'Accept':'application/octet-stream'})
 try:response=urllib.request.build_opener(NoRedirect).open(req,timeout=60)
 except urllib.error.HTTPError as e:
  if e.code!=302:raise
  location=e.headers['Location'];insist(location.startswith('https://'),'Non-TLS redirect')
  response=urllib.request.urlopen(location,timeout=120) # Separate request: never forward GitHub token.
 insist(response.status==200,'Incomplete material download')
 h=hashlib.sha256();total=0
 with response,path.open('xb')as out:
  while b:=response.read(1024*1024):
   total+=len(b);insist(total<=asset['size'],'Material exceeds exact size');out.write(b);h.update(b)
 insist(total==asset['size'] and 'sha256:'+h.hexdigest()==asset['digest'],'Downloaded material bytes differ')

def controller(root):
 g=lambda *a:subprocess.check_output(['git','-C',str(root),*a])
 q=g('rev-parse','HEAD').decode().strip()
 insist(q==os.environ['GITHUB_WORKFLOW_SHA'] and not g('status','--porcelain').strip(),'Controller ref/status differs')
 hashes={}
 for n in CONTROL_FILES:
  p=root/n;insist(p.is_file()and not p.is_symlink()and p.read_bytes()==g('show','HEAD:'+n),'Controller file differs from frozen Git object')
  hashes[n]=digest(p)
 insist(g('rev-parse',SOURCE+'^{tree}').decode().strip()==TREE,'Source Git tree differs')
 return {'controller':q,'controllerTree':g('rev-parse','HEAD^{tree}').decode().strip(),'controlFiles':hashes,'sourceS':SOURCE,'sourceTree':TREE,'run':os.environ['GITHUB_RUN_ID'],'attempt':os.environ['GITHUB_RUN_ATTEMPT'],'workflowRef':os.environ['GITHUB_WORKFLOW_REF'],'python':platform.python_version(),'platform':platform.platform(),'scope':'Controller/material provenance, not source correspondence acceptance'}

def intake(root,out,carrier_id):
 insist(re.fullmatch('[1-9][0-9]*',carrier_id)is not None,'Unsafe carrier ID')
 insist((platform.system(),platform.machine())==('Linux','x86_64') and platform.python_version()=='3.13.17','Unselected source-only host')
 identity=controller(root);out.mkdir(parents=True,exist_ok=False);save(out/'controller.json',identity)
 token=os.environ['GH_TOKEN'];r=api('releases/'+carrier_id,token);tag=api('git/ref/tags/'+TAG,token);assets=validate_release(r,tag,int(carrier_id))
 save(out/'carrier-release.json',r);save(out/'carrier-tag.json',tag)
 download(out/MANIFEST,assets[MANIFEST],token);validate_manifest((out/MANIFEST).read_bytes());download(out/ARCHIVE,assets[ARCHIVE],token)
 save(out/'intake.json',{'sourceS':SOURCE,'sourceTree':TREE,'carrierID':r['id'],'carrierTag':TAG,'draft':True,'assetIDs':{n:a['id']for n,a in assets.items()},'archiveSHA256':FILES[ARCHIVE][1],'manifestSHA256':FILES[MANIFEST][1],'controller':identity,'scope':'Authenticated retained input only. Full correspondence still requires verifier success.'})

def capture(root,out):
 out.mkdir(parents=True,exist_ok=True)
 rows=[]
 # The original pinned 1.67GB archive is retained locally and in the owned carrier until proof retention.
 # Do not upload another archive copy or repeatedly hash it for observational capture.
 for p in sorted(out.rglob('*')):
  if p.is_file()and p.name not in {ARCHIVE,'capture.json'}:rows.append({'path':str(p.relative_to(out)),'bytes':p.stat().st_size,'sha256':digest(p)})
 save(out/'capture.json',{'sourceS':SOURCE,'files':rows,'originalArchiveExcludedFromProofUpload':ARCHIVE,'scope':'Read-only partial proof capture, not new acceptance'})

if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('operation',choices=['intake','capture']);p.add_argument('--root',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--carrier-id');a=p.parse_args()
 if a.operation=='intake':
  if not a.carrier_id:p.error('intake requires exact carrier ID')
  intake(a.root,a.output,a.carrier_id)
 else:capture(a.root,a.output)
