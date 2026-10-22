"""Native identity observation only; no credential/grant or backend authority is issued."""
import hashlib
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import uuid
from urllib.parse import urlsplit

OUTPUT=Path(__file__).resolve().parents[2]/'docs/helix/04-build/evidence/security/databricks-actors.json'
SCOPE='Original native authentication observations only; SQL grants, ordinary-role eligibility, target namespace and backend security are not qualified'
CODES=frozenset(['CLI_TIMEOUT','CLI_UNAVAILABLE','CLI_COMMAND_FAILED','CLI_OUTPUT_LIMIT','INVALID_PROFILE_NAMES','INVALID_CONFIGURED_CONTEXT','INVALID_CLI_VERSION','INVALID_PROFILE_METADATA','MISSING_OR_AMBIGUOUS_PROFILE_CONTEXT','INVALID_NATIVE_ACTOR'])
class ObservationError(Exception):
    pass

def invoke_cli(args):
    try:
        result=subprocess.run(['databricks',*args],capture_output=True,text=True,timeout=30)
    except subprocess.TimeoutExpired:
        raise ObservationError('CLI_TIMEOUT') from None
    except OSError:
        raise ObservationError('CLI_UNAVAILABLE') from None
    if result.returncode:
        raise ObservationError('CLI_COMMAND_FAILED')
    if len(result.stdout)>4_000_000:
        raise ObservationError('CLI_OUTPUT_LIMIT')
    return result.stdout

def write_receipt(path,receipt,*,expected_attempt=None):
    """Sidecar flock serializes claim/publication; only the current pending attempt may finish.

    The stable sidecar is never unlinked: deleting it could split lock ownership
    across different inodes. OS process termination releases its held lock.
    """
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    with path.with_name('.'+path.name+'.lock').open('a') as lock:
        fcntl.flock(lock.fileno(),fcntl.LOCK_EX)
        if expected_attempt is not None:
            try:
                if path.stat().st_size>4_000_000:return False
                current=json.loads(path.read_text())
                if not isinstance(current,dict) or current.get('attemptId')!=expected_attempt or current.get('status')!='observation-pending':return False
            except (OSError,ValueError):return False
        temporary=None
        try:
            with tempfile.NamedTemporaryFile(mode='w',encoding='utf8',dir=path.parent,prefix=path.name+'.',suffix='.tmp',delete=False) as output:
                temporary=Path(output.name);output.write(json.dumps(receipt,indent=2)+'\n');output.flush();os.fsync(output.fileno())
            os.replace(temporary,path)
            return True
        finally:
            if temporary is not None and temporary.exists():temporary.unlink()

def profile_names(profiles):
    return (isinstance(profiles,list) and 2<=len(profiles)<=8 and all(isinstance(p,str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,127}',p) for p in profiles) and len(set(profiles))==len(profiles))

def selected_context(context):
    host=context.get('host')
    if not isinstance(host,str) or len(host)>1024 or not host.isascii() or any(ord(c)<33 or ord(c)==127 for c in host):raise ObservationError('INVALID_CONFIGURED_CONTEXT')
    parsed=urlsplit(host)
    if parsed.port is not None and not 1<=parsed.port<=65535:raise ObservationError('INVALID_CONFIGURED_CONTEXT')
    if parsed.scheme!='https' or not parsed.hostname or parsed.username is not None or parsed.password is not None or parsed.query or parsed.fragment or parsed.path not in ['', '/']:
        raise ObservationError('INVALID_CONFIGURED_CONTEXT')
    if any(not re.fullmatch(r'[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?',label) for label in parsed.hostname.split('.')):raise ObservationError('INVALID_CONFIGURED_CONTEXT')
    result={'host':host}
    for key,output in [('account_id','accountId'),('workspace_id','workspaceId')]:
        value=context.get(key)
        if value is not None and (not isinstance(value,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}',value)):raise ObservationError('INVALID_CONFIGURED_CONTEXT')
        result[output]=value
    return result

def observe(receipt,profiles,invoke):
    stage={'name':'configuration'}
    try:
        if not profile_names(profiles):raise ObservationError('INVALID_PROFILE_NAMES')
        stage={'name':'cli-version'};version=invoke(['--version']).strip()
        if not re.fullmatch(r'Databricks CLI v[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?',version):raise ObservationError('INVALID_CLI_VERSION')
        receipt['versions']={'databricksCli':version}
        stage={'name':'configured-contexts'};metadata=json.loads(invoke(['auth','profiles','--output','json']))
        if not isinstance(metadata,dict) or not isinstance(metadata.get('profiles'),list) or len(metadata['profiles'])>1024:raise ObservationError('INVALID_PROFILE_METADATA')
        for profile in profiles:
            stage={'name':'profile-context','profile':profile};matches=[r for r in metadata['profiles'] if isinstance(r,dict) and r.get('name')==profile]
            if len(matches)!=1:raise ObservationError('MISSING_OR_AMBIGUOUS_PROFILE_CONTEXT')
            context=selected_context(matches[0]);stage={'name':'current-user','profile':profile}
            actor=json.loads(invoke(['current-user','me','--profile',profile,'--output','json']))
            if not isinstance(actor,dict) or not isinstance(actor.get('id'),str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}',actor['id']) or actor.get('active') is not True:raise ObservationError('INVALID_NATIVE_ACTOR')
            receipt['observations'].append({'profile':profile,'qualifiedActor':{**context,'actorId':actor['id']},'active':True})
        installer=receipt['observations'][0]['qualifiedActor'];context=lambda actor:{key:actor[key] for key in ['host','accountId','workspaceId']}
        matching=all(context(row['qualifiedActor'])==context(installer) for row in receipt['observations'])
        actors={row['qualifiedActor']['actorId'] for row in receipt['observations'][1:] if row['qualifiedActor']['actorId']!=installer['actorId'] and context(row['qualifiedActor'])==context(installer)}
        receipt.update(status='identities-available' if matching and len(actors)>=2 else 'not-qualified',distinctNonInstallerActors=len(actors),matchingConfiguredContext=matching)
    except KeyboardInterrupt:
        receipt.update(status='observation-failed',errors=[{**stage,'code':'OBSERVATION_INTERRUPTED'}])
    except Exception as error:
        code=str(error) if isinstance(error,ObservationError) and str(error) in CODES else 'INVALID_JSON' if isinstance(error,json.JSONDecodeError) else 'OBSERVATION_UNAVAILABLE'
        # Exception arguments, CLI output and raw authentication diagnostics are never retained.
        receipt.update(status='observation-failed',errors=[{**stage,'code':code}])
    return receipt

def main(argv=None,*,invoke=invoke_cli,output=OUTPUT):
    profiles=list(sys.argv[1:] if argv is None else argv) or ['aidev-cus','scope-test']
    source=Path(__file__);before=hashlib.sha256(source.read_bytes()).hexdigest()
    receipt={'status':'observation-pending','attemptId':str(uuid.uuid4()),'authority':False,'complete':False,'versions':{},
             'command':['python3','tools/security/databricks-actors.py',*(profiles if profile_names(profiles) else [])],
             'sourceDigests':{'tools/security/databricks-actors.py':before},'observations':[],
             'distinctNonInstallerActors':None,'requiredDistinctNonInstallerActors':2,'matchingConfiguredContext':None,
             'contextQualification':'Host/account/workspace context comes from CLI configuration; independent server/SQL context verification is still required',
             'scope':SCOPE}
    write_receipt(output,receipt)
    observe(receipt,profiles,invoke)
    after=hashlib.sha256(source.read_bytes()).hexdigest();receipt['finalSourceDigests']={'tools/security/databricks-actors.py':after};receipt['sourcesUnchanged']=before==after
    if before!=after:receipt.update(status='observation-failed',distinctNonInstallerActors=None,matchingConfiguredContext=None,errors=[{'name':'source-custody','code':'SOURCE_CHANGED'}])
    if not write_receipt(output,receipt,expected_attempt=receipt['attemptId']):
        receipt.update(status='observation-superseded',distinctNonInstallerActors=None,matchingConfiguredContext=None,errors=[{'name':'receipt-custody','code':'ATTEMPT_NOT_CURRENT_PENDING'}])
    print(json.dumps({'status':receipt['status'],'attemptId':receipt['attemptId'],'distinctNonInstallerActors':receipt['distinctNonInstallerActors'],'scope':receipt['scope']}))
    return 0 if receipt['status']=='identities-available' else 1 if receipt['status']=='not-qualified' else 2

if __name__=='__main__':
    raise SystemExit(main())
