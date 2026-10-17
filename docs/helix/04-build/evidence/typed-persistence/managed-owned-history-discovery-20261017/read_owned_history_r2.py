"""Exactly two approved owned historical GETs; no SQL/compute/resources."""
from __future__ import annotations
import hashlib,http.client,json,re,shutil,ssl,subprocess,time
from pathlib import Path
PLAN=Path(__file__).parent/'owned-history-read-plan-r2.json'
APPROVED='8ef8ebabc05ce9bc2df8abcfcff47c7d69077e1815716de1cb90b4055c242ca8'
OUT=Path('/private/tmp/managed-owned-history-native-20261017-r2')
def digest(b):return hashlib.sha256(b).hexdigest()
def main():
 raw=PLAN.read_bytes()
 if digest(raw)!=APPROVED:raise ValueError('approved plan hash required')
 plan=json.loads(raw)
 if len(plan['requests'])!=2 or plan['startCompute'] or plan['sqlStatements']!=0:raise ValueError('exact two readonly requests required')
 for request in plan['requests']:
  if digest(Path(request['sourceFile']).read_bytes())!=request['sourceSha256']:raise ValueError('original owned input changed')
 OUT.mkdir(exist_ok=False);(OUT/'approved-plan.json').write_bytes(raw)
 source_start=digest(Path(__file__).read_bytes());until=time.monotonic()+45;observations=[]
 provider=shutil.which('databricks')
 if not provider:raise ValueError('original provider missing')
 command=[provider,'auth','token','aidev-cus','--timeout','10s','--output','json']
 token_response=subprocess.run(command,capture_output=True,text=True,timeout=min(15,until-time.monotonic()),check=False)
 (OUT/'provider.json').write_text(json.dumps({'path':provider,'binarySha256':digest(Path(provider).read_bytes()),'command':command,'exitCode':token_response.returncode,'credentialStored':False})+'\n')
 if token_response.returncode:raise ValueError('original credential provider refused; native stderr not retained')
 token=json.loads(token_response.stdout)['access_token']
 if type(token) is not str or not token.isascii() or not 1<=len(token)<=16384 or any(not 33<=ord(c)<=126 for c in token):raise ValueError('token framing')
 for i,request in enumerate(plan['requests']):
  def remaining():
   value=until-time.monotonic()
   if value<=0:raise TimeoutError('whole45second deadline')
   return min(20,value)
  connection=http.client.HTTPSConnection(plan['host'],443,timeout=remaining(),context=ssl.create_default_context());parts=[];status=None;complete=False;certificate=None
  observation={'statementId':request['statementId'],'method':'GET','path':request['path'],'automaticRetries':0,'redirectsFollowed':0}
  try:
   connection.connect();sock=connection.sock;certificate=digest(sock.getpeercert(binary_form=True));sock.settimeout(remaining())
   connection.request('GET',request['path'],headers={'Authorization':'Bearer '+token,'Accept':'application/json'})
   sock.settimeout(remaining());response=connection.getresponse();status=response.status;size=0
   while True:
    sock.settimeout(remaining());chunk=response.read1(min(65536,1_048_577-size))
    if not chunk:break
    parts.append(chunk);size+=len(chunk)
    if size>1_048_576:raise ValueError('bounded1MiB metadata')
   complete=True
   if status==200:
    value=json.loads(b''.join(parts).decode('utf-8'));rows=value.get('res')
    if value.get('has_next_page') or value.get('next_page_token') or type(rows) is not list or len(rows)!=1:raise ValueError('one complete exact owned history row required')
    row=rows[0]
    if row.get('query_id')!=request['statementId']:raise ValueError('foreign historical statement refused')
    warehouse=row.get('warehouse_id');legacy=row.get('endpoint_id')
    if warehouse is None:warehouse=legacy
    if warehouse!=plan['warehouse'] or legacy not in (None,plan['warehouse']):raise ValueError('foreign warehouse refused')
    original=json.loads(Path(request['sourceFile']).read_text())['request']['statement']
    query=row.get('query_text')
    observation.update(status='EXACT_OWNED_METADATA_OBSERVED_NOT_QUALIFIED',nativeStatus=row.get('status'),isFinal=row.get('is_final'),plansState=row.get('plans_state'),cacheQueryId=row.get('cache_query_id'),resultFromCache=row.get('metrics',{}).get('result_from_cache'),queryTextSha256=None if type(query) is not str else digest(query.encode()),originalQueryTextMatches=query==original,resolvedImmutableTableIdsObserved=False,nativeIdentityFieldsPresent=[k for k in ('user_id','user_name','executed_as_user_id','executed_as_user_name') if k in row],unknownNativeFields=sorted(set(row)-{'query_id','status','query_text','query_start_time_ms','execution_end_time_ms','query_end_time_ms','user_id','user_name','spark_ui_url','endpoint_id','rows_produced','error_message','lookup_key','metrics','executed_as_user_id','executed_as_user_name','session_id','is_final','channel_used','plans_state','statement_type','warehouse_id','duration','client_application','query_source','cache_query_id','query_tags'}))
   else:observation.update(status='NATIVE_HTTP_REFUSAL',httpStatus=status)
  except BaseException as error:
   observation.update(status='CLOSED_REFUSAL',errorType=type(error).__name__,message=str(error));raise
  finally:
   native=b''.join(parts);(OUT/f'get-{i}.bin').write_bytes(native);observation.update(httpStatus=status,bodyComplete=complete,nativeBodySha256=digest(native),peerCertificateSha256=certificate)
   observations.append(observation);(OUT/'observations.json').write_text(json.dumps(observations,indent=2)+'\n');connection.close()
 end=digest(Path(__file__).read_bytes())
 receipt={'status':'HISTORICAL_DISCOVERY_ONLY','requestsAttempted':len(observations),'observations':observations,'sqlExecuted':False,'computeStarted':False,'resourceCreated':False,'nativeQualification':False,'nativeAuthority':False,'sourceStart':source_start,'sourceEnd':end,'sourceUnchanged':source_start==end,'warehouseStopNecessary':False,'r5ParserApplied':False}
 (OUT/'result.json').write_text(json.dumps(receipt,indent=2)+'\n')
 print(json.dumps({'status':receipt['status'],'requests':len(observations),'httpStatuses':[x['httpStatus'] for x in observations],'sourceUnchanged':source_start==end,'nativeQualification':False}))
if __name__=='__main__':main()
