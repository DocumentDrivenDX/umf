"""Fresh original-owner typed binding refusal; no actual graph qualification."""
import copy,hashlib,json,subprocess
from pathlib import Path
root=Path('docs/helix/04-build/evidence/security')
source=root/'weft-original-use.json';foundation=json.loads(source.read_text())
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
if any(sha(p)!=h for p,h in foundation['sourceDigests'].items()):raise RuntimeError('Stale original owner foundation')
binary=Path('/private/tmp/umf-security-weft-bridge-target/debug/examples/security_mapping_handoff')
paths=[Path(__file__),source,binary,Path('tools/security/truss-original-preparation.ts'),Path('/Users/erik/Projects/truss/packages/postgresql/src/security-query-use.ts'),Path('/Users/erik/Projects/truss/packages/postgresql/src/security-source-completeness.ts'),Path('/Users/erik/Projects/truss/packages/postgresql/src/security-predicate.ts'),Path('/Users/erik/Projects/truss/packages/postgresql/src/security-graph-source.ts')]
pins={str(p):sha(p) for p in paths}
observations=[];artifacts=[]
for carrier,value in [('text','Resource'),('int4','3'),('int8','9007199254740993')]:
 artifact=copy.deepcopy(foundation['artifacts'][0]);request=artifact['request'];binding=json.loads(request['bindingJson'])
 resource=next(t for t in binding['types'] if t['type']['elementId']=='Resource')
 resource['discriminator']={'column':'record_type','carrier':carrier,'value':value}
 request['bindingJson']=json.dumps(binding,separators=(',',':'))
 profile=json.loads(request['queryProfileJson']);profile['binding']['sha256']=hashlib.sha256(request['bindingJson'].encode()).hexdigest()
 request['queryProfileJson']=json.dumps(profile,separators=(',',':'))
 owner=subprocess.run([str(binary)],input=json.dumps(request),capture_output=True,text=True,timeout=10)
 if owner.returncode or owner.stderr:raise RuntimeError('Original owner typed binding refused')
 artifact['handoff']=json.loads(owner.stdout)
 # This excluded test host deliberately selects each fresh typed profile.
 # The production-shaped original-use CLI keeps its fixed raw profile.
 script="""import {OriginalSecurityPreparation} from './tools/security/truss-original-preparation.ts';
 const packet=JSON.parse(await Bun.stdin.text());
 const foundation=await Bun.file('docs/helix/04-build/evidence/security/weft-original-use.json').json();
 const host=new OriginalSecurityPreparation('/private/tmp/umf-security-weft-bridge-target/debug/examples/security_mapping_handoff',foundation.sourceDigests,packet.hostProfileSha256);
 await host.prepare(JSON.stringify(packet.request));"""
 result=subprocess.run(['bun','-e',script],input=json.dumps({'request':request,'hostProfileSha256':artifact['handoff']['profile']['sha256']}),capture_output=True,text=True,timeout=10)
 refused=result.returncode!=0 and not result.stdout.strip() and 'TRUSS_SECURITY_QUERY_USE_UNSUPPORTED' in result.stderr
 if not refused:raise RuntimeError('Typed original carrier unexpectedly admitted')
 observations.append({'id':'typed-original-home-refusal-'+carrier,'expected':True,'observed':refused,'discriminatorValue':value})
 artifacts.append({'carrier':carrier,'artifact':artifact})
if any(sha(p)!=h for p,h in pins.items()):raise RuntimeError('Typed readiness sources changed')
receipt={'status':'qualified-refusal-observed','sourceDigests':pins,'observations':observations,'artifacts':artifacts,'scope':'Fresh original inspection-owner handoff and portable actual Truss consumer for three explicitly bound root discriminator carriers. Refusal is required by the current raw-query-home/0.2.0 subset; no native data or actual graph storage installation executed, no public compiler activation, no backend acceptance. Carrier typing, alias selection, typed completeness and resource-independent action admission require a new qualified physical binding before this refusal can be removed.'}
(root/'truss-query-typed-readiness.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'checks':len(observations)}))
