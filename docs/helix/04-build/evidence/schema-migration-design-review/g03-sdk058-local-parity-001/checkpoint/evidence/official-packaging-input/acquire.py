import pathlib,urllib.request,urllib.parse,json,hashlib,time,zipfile,io,csv,base64,stat,email.parser,signal
r=pathlib.Path('/private/tmp/g03-packaging250-tool-input-001');started=time.monotonic();cap=1024*1024
def timeout_handler(signum,frame):raise TimeoutError('absolute acquisition90-second budget exhausted')
signal.signal(signal.SIGALRM,timeout_handler);signal.alarm(90)
url='https://pypi.org/pypi/packaging/25.0/json';sha='29572ef2b1f17581046b3a2227d5c611fb25ec70ca1ba8554b24b0e69331a484';filename='packaging-25.0-py3-none-any.whl'
def get(url):
 with urllib.request.urlopen(url,timeout=30) as response:
  data=response.read(cap+1);assert len(data)<=cap;assert urllib.parse.urlparse(response.url).hostname in {'pypi.org','files.pythonhosted.org'};return data,response.url
meta,meta_final=get(url);v=json.loads(meta);assert v['info']['name']=='packaging' and v['info']['version']=='25.0' and not v['info']['requires_dist']
entry=next(x for x in v['urls'] if x['filename']==filename);assert entry['size']==66469 and entry['digests']['sha256']==sha and not entry['yanked'] and entry['packagetype']=='bdist_wheel'
raw,final=get(entry['url']);assert len(raw)==66469 and hashlib.sha256(raw).hexdigest()==sha
(r/'pypi-metadata.json').write_bytes(meta);(r/filename).write_bytes(raw);(r/'requirements.lock').write_text('packaging==25.0 --hash=sha256:'+sha+'\n')
rows=[]
with zipfile.ZipFile(io.BytesIO(raw)) as z:
 files=[x for x in z.infolist() if not x.is_dir()];assert len(files)<=128 and sum(x.file_size for x in files)<=8*1024*1024
 for x in files:
  p=pathlib.PurePosixPath(x.filename);mode=(x.external_attr>>16)&0xffff;assert not p.is_absolute() and '..' not in p.parts and '\\' not in x.filename and x.file_size<=1024*1024 and not stat.S_ISLNK(mode) and not x.filename.endswith(('.so','.dylib','.pyd','.exe'))
  b=z.read(x);rows.append({'path':x.filename,'sizeBytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
 names={x['path'] for x in rows};assert len(names)==len(rows)
 metan='packaging-25.0.dist-info/METADATA';recordn='packaging-25.0.dist-info/RECORD';wheel=z.read('packaging-25.0.dist-info/WHEEL').decode();m=email.parser.BytesParser().parsebytes(z.read(metan));assert m['Name']=='packaging' and m['Version']=='25.0' and not m.get_all('Requires-Dist') and m['Requires-Python']=='>=3.8';assert 'Root-Is-Purelib: true' in wheel and 'Tag: py3-none-any' in wheel
 records=list(csv.reader(io.StringIO(z.read(recordn).decode())));assert len(records)==len(rows);seen=set()
 for path,digest,size in records:
  assert path in names and path not in seen;seen.add(path);b=z.read(path)
  if path==recordn:assert digest==size==''
  else:assert digest=='sha256='+base64.urlsafe_b64encode(hashlib.sha256(b).digest()).rstrip(b'=').decode() and int(size)==len(b)
 licenses=sorted(p for p in names if 'LICENSE' in p);assert len(licenses)==3
rows.sort(key=lambda x:x['path']);audit={'profile':'umf.g03-packaging250-tool-wheel-static/1','status':'PASS_STATIC_ONLY','wheel':{'path':str(r/filename),'sizeBytes':len(raw),'sha256':sha},'requiresPython':m['Requires-Python'],'requiresDist':[],'purePythonTag':'py3-none-any','memberCount':len(rows),'expandedBytes':sum(x['sizeBytes'] for x in rows),'members':rows,'licenses':licenses,'recordAllMembersVerified':True,'scope':'Qualification-tool input only; no code execution/product dependency/public asset'}
(r/'static-audit.json').write_text(json.dumps(audit,sort_keys=True,indent=2)+'\n')
receipt={'profile':'umf.g03-packaging250-tool-input-acquisition/1','status':'PASS_EXACT_OFFICIAL_INPUT','metadataUrl':url,'metadataFinalUrl':meta_final,'metadataSha256':hashlib.sha256(meta).hexdigest(),'metadataBytes':len(meta),'wheelUrl':entry['url'],'wheelFinalUrl':final,'wheel':audit['wheel'],'staticAuditSha256':hashlib.sha256((r/'static-audit.json').read_bytes()).hexdigest(),'elapsedSeconds':round(time.monotonic()-started,3),'limits':{'downloadBytes':cap,'expandedSelectedDistributionBytes':8*1024*1024,'perMemberBytes':1024*1024,'childSeconds':60,'ownerSeconds':90}}
(r/'acquisition.json').write_text(json.dumps(receipt,sort_keys=True,indent=2)+'\n');print(json.dumps({'status':receipt['status'],'wheelSha256':sha,'members':len(rows),'expandedBytes':audit['expandedBytes'],'elapsedSeconds':receipt['elapsedSeconds']}))
