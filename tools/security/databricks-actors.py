"""Observe native actor identities without credentials; aliases do not qualify distinct subjects."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

profiles=sys.argv[1:] or ['aidev-cus','scope-test']
if not 2<=len(profiles)<=8 or len(set(profiles))!=len(profiles) or any(not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,127}',p) for p in profiles):
 raise ValueError('Supply 2..8 distinct host-configured profile names')
def invoke(args):
 result=subprocess.run(['databricks',*args],capture_output=True,text=True,timeout=30)
 if result.returncode:raise RuntimeError('Native CLI observation failed; credentials and raw authentication diagnostics are not retained')
 return result.stdout
version=invoke(['--version']).strip()
metadata=json.loads(invoke(['auth','profiles','--output','json']))
observations=[]
for profile in profiles:
 context=next((row for row in metadata['profiles'] if row['name']==profile),None)
 if context is None:raise ValueError('Configured profile context missing')
 actor=json.loads(invoke(['current-user','me','--profile',profile,'--output','json']))
 if not isinstance(actor.get('id'),str) or not actor['id'] or actor.get('active') is not True:raise ValueError('No active native authenticated actor')
 qualified={'host':context['host'],'accountId':context.get('account_id'),'workspaceId':context.get('workspace_id'),'actorId':actor['id']}
 observations.append({'profile':profile,'qualifiedActor':qualified,'active':True})
installer=observations[0]['qualifiedActor']
context=lambda actor:{key:actor[key] for key in ['host','accountId','workspaceId']}
matching_context=all(context(row['qualifiedActor'])==context(installer) for row in observations)
ordinary=[row for row in observations[1:] if row['qualifiedActor']['actorId']!=installer['actorId'] and context(row['qualifiedActor'])==context(installer)]
keys={row['qualifiedActor']['actorId'] for row in ordinary}
ready=matching_context and len(keys)>=2
receipt={'status':'identities-available' if ready else 'not-qualified','versions':{'databricksCli':version},
 'command':['python3','tools/security/databricks-actors.py',*profiles],
 'sourceDigests':{'tools/security/databricks-actors.py':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},
 'observations':observations,'distinctNonInstallerActors':len(keys),
 'requiredDistinctNonInstallerActors':2,'matchingConfiguredContext':matching_context,
 'contextQualification':'Host/account/workspace context comes from CLI configuration; independent server/SQL context verification is still required',
 'scope':'Original native authentication observations only; SQL grants, ordinary-role eligibility, target namespace and backend security are not qualified'}
Path('docs/helix/04-build/evidence/security/databricks-actors.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'distinctNonInstallerActors':len(keys),'scope':receipt['scope']}))
raise SystemExit(0 if ready else 1)
