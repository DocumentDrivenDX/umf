"""Independent current-source availability regression; no native/security admission."""
import argparse,copy,hashlib,json,pathlib,platform,subprocess,sys,time
parser=argparse.ArgumentParser();parser.add_argument('--binary',required=True);parser.add_argument('--sha256',required=True);parser.add_argument('--output',required=True);args=parser.parse_args()
root=pathlib.Path(__file__).resolve().parents[2];source=root/'tests/security/protection/current-query-source.json';raw=source.read_bytes();fixture=json.loads(raw);binary=pathlib.Path(args.binary)
def sha(data):return hashlib.sha256(data).hexdigest()
assert sha(binary.read_bytes())==args.sha256
rows=[]
for name,sql,optional,expected in [
 ('required-predicate',"SELECT r.token FROM Resource r WHERE r.token='opaque-token'",None,'passed'),
 ('absent-projection','SELECT r.token FROM Resource r','token','refused'),
 ('absent-predicate',"SELECT r.resourceId FROM Resource r WHERE r.token='opaque-token'",'token','refused'),
 ('absent-hidden-order','SELECT r.resourceId FROM Resource r ORDER BY r.token','token','refused'),
 ('absent-self-join','SELECT r.resourceId FROM Resource r JOIN Resource s ON r.token=s.token','token','refused'),
 ('absent-group','SELECT r.token FROM Resource r GROUP BY r.token','token','refused'),
 ('absent-sum','SELECT SUM(r.salary) AS total FROM Resource r','salary','refused'),
 ('absent-join-right-only','SELECT r.resourceId FROM Resource r JOIN Resource s ON r.resourceId=s.token','token','refused'),
 ('absent-predicate-right-only','SELECT r.resourceId FROM Resource r WHERE r.resourceId=r.token','token','refused'),
 ('absent-second-order','SELECT r.resourceId FROM Resource r ORDER BY r.resourceId,r.token','token','refused'),
 ('absent-second-output','SELECT r.resourceId,r.token FROM Resource r','token','refused'),
 ('field-free-count','SELECT COUNT(*) FROM Resource r','token','passed')]:
 document=copy.deepcopy(fixture['closure']['documents'][0]['document']);revision=fixture['closure']['pins'][0]['revision']
 if optional:
  next(e for e in document['modules'][0]['elements'] if e['id']==optional)['nullability']='absent-allowed';revision='explicit-absence-probe-r1'
 encoded=json.dumps(document,ensure_ascii=False,separators=(',',':'),allow_nan=False)
 request=dict(interfaceVersion='weft-application-lineage/0.1-candidate',modules=[dict(documentJson=encoded,pin=dict(documentId=document['id'],revision=revision,umfVersion=document['umf'],sha256=sha(encoded.encode())),selectedModuleIds=['m'])],sql=sql,parameters={},opaqueSources=[])
 request_text=json.dumps(request,ensure_ascii=False,separators=(',',':'),allow_nan=False);start=time.monotonic();p=subprocess.run([str(binary)],input=request_text,text=True,capture_output=True,timeout=60);report=json.loads(p.stdout) if p.returncode==0 else None
 status='passed' if p.returncode==0 and p.stderr=='' else 'refused' if p.returncode!=0 and p.stdout=='' and p.stderr.startswith('WFT-APPLICATION-LINEAGE-AVAILABILITY:') and len(p.stderr.encode())<=8192 else 'invalid'
 valid=status==expected
 if status=='passed':
  valid=valid and report['authority'] is False and report['securityReady'] is False and report['sourceRequestJson']==request_text and report['sourceRequestSha256']==sha(request_text.encode()) and len(report['scans'])==1
  if name=='field-free-count':valid=valid and report['uses']==[] and json.loads(report['applicationPlanJson'])['source']['record']['element']=='Resource'
 rows.append(dict(id=name,expected=expected,observed=status,passed=valid,elapsedSeconds=time.monotonic()-start,request=request,exitCode=p.returncode,stdout=p.stdout,stderr=p.stderr))
assert source.read_bytes()==raw and sha(binary.read_bytes())==args.sha256
output=dict(runnerSha256=sha(pathlib.Path(__file__).read_bytes()),status='passed' if all(r['passed']for r in rows)else'failed',binarySha256=args.sha256,fixtureSha256=sha(raw),python=dict(version=platform.python_version(),executable=sys.executable),observations=rows,scope='Actual source-only Weft lineage availability regression. Selected absent-allowed values must refuse instead of being reported as nonnull; field-free COUNT retains original scan and invents no Field requirement. No native execution, current authority or backend acceptance.')
pathlib.Path(args.output).write_text(json.dumps(output,indent=2,ensure_ascii=False)+'\n');print(json.dumps(dict(status=output['status'],passed=sum(r['passed']for r in rows),total=len(rows))));sys.exit(0 if output['status']=='passed'else 1)
