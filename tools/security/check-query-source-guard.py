"""Host buffering/failure controls; synthetic providers do not qualify native authority."""
import hashlib,json,uuid,zipfile
from pathlib import Path
paths=[Path(__file__),Path('tools/security/pg-inventory.py')]
frozen={str(p):p.read_bytes() for p in paths}
context={};exec(compile(frozen['tools/security/pg-inventory.py'].decode(),'tools/security/pg-inventory.py','exec'),context)
Guard=context['StableCutInventoryAdmission'];observations=[]
def check(name,expected,observed):
 observations.append({'id':name,'expected':expected,'observed':observed})
 if expected!=observed:raise AssertionError(observations[-1])
def run(name,pre,post,expected,calls_expected):
 trace=[];reads=iter([pre,post])
 def read():
  trace.append('inventory');value=next(reads)
  if isinstance(value,Exception):raise value
  return value
 def operation():trace.append('operation');return [['authorized-original']]
 result=Guard({'source':'original'}).read(read,operation)
 check(name,expected,result);check(name+':trace',calls_expected,trace)
admitted={'status':'admitted','rows':[['authorized-original']]};refused={'status':'refused','rows':[]}
run('stable-positive',{'source':'original'},{'source':'original'},admitted,['inventory','operation','inventory'])
run('changed-before',{'source':'changed'},{'source':'original'},refused,['inventory'])
for name,post in [('changed-after',{'source':'changed'}),('unknown-after',None),('failed-after',RuntimeError('collector lost custody')),('nonfinite-after',{'source':float('nan')})]:
 run(name,{'source':'original'},post,refused,['inventory','operation','inventory'])
# Constructor and result copies cannot be changed through the original mutable inputs.
expected={'source':'original'};guard=Guard(expected);expected['source']='changed';result_rows=[['authorized-original']]
result=guard.read(lambda:{'source':'original'},lambda:result_rows);result_rows[0][0]='caller changed original after capture'
check('snapshot-and-buffer-copy',admitted,result)
# An operation failure publishes no partial data and never needs a final read.
trace=[]
def read():trace.append('inventory');return {'source':'original'}
def failed_operation():trace.append('operation');raise RuntimeError('uncertain original response')
check('failed-operation',refused,Guard({'source':'original'}).read(read,failed_operation));check('failed-operation-trace',['inventory','operation'],trace)
check('lazy-operation',refused,Guard({'source':'original'}).read(lambda:{'source':'original'},lambda:iter([['partial']])))
# Negative control: endpoint equality does not observe an interior ABA.
state={'source':'original'};interior=[]
def aba_operation():
 state['source']='changed';interior.append(dict(state));state['source']='original'
 return [['result-under-unqualified-interior-source']]
check('uncoordinated-aba-counterexample',{'status':'admitted','rows':[['result-under-unqualified-interior-source']]},Guard({'source':'original'}).read(lambda:dict(state),aba_operation))
check('uncoordinated-aba-interior-witness',[{'source':'changed'}],interior)
pins={p:hashlib.sha256(b).hexdigest() for p,b in frozen.items()}
if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=h for p,h in pins.items()):raise RuntimeError('Executed source changed')
folder=Path('docs/helix/04-build/evidence/security/query-source-guard-host')/str(uuid.uuid4());folder.mkdir(parents=True)
(folder/'receipt.json').write_text(json.dumps({'status':'component-passed','sourceDigests':pins,'observations':observations,'scope':'Synthetic provider and result-buffer controls on the original host helper. Trusted provider/expected-source and held stable-cut coordination remain premises. Explicit ABA counterexample demonstrates pre/post equality alone is insufficient. No native authority, original driver, authenticated issuer, process crash/stream/revocation or backend qualification.'},indent=2)+'\n')
with zipfile.ZipFile(folder/'sources.zip','w',zipfile.ZIP_DEFLATED) as archive:
 for p,data in frozen.items():archive.writestr(p,data)
print(json.dumps({'status':'component-passed','observations':len(observations),'evidence':str(folder)}))
