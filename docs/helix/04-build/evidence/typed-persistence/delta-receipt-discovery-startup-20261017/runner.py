"""Reviewed-plan-only Delta native capability discovery; default performs no calls.

No warehouse start, principal/schema creation, automatic statement retry, native
receipt construction, compiler edit or qualification promotion exists here.
"""
from __future__ import annotations
import argparse,base64,hashlib,http.client,json,re,shutil,ssl,subprocess,time
from pathlib import Path
from uuid import UUID

ROOT=Path(__file__).resolve().parent
WAREHOUSE='d4b8eb5b4d6e34b8'
PROFILE='aidev-cus'
HOST='adb-7405607548213398.18.azuredatabricks.net'
SCHEMA='client_dev.umf_sdk_atomic_cf40c0c7aa74'
TERMINAL={'SUCCEEDED','FAILED','CANCELED','CLOSED'}
class DiscoveryStopped(RuntimeError):pass
class UncertainDispatch(DiscoveryStopped):pass
class NativeTerminalRefusal(DiscoveryStopped):
    def __init__(self,response):
        super().__init__('Original native terminal FAILED response retained')
        self.response=response

def digest(body):return hashlib.sha256(body).hexdigest()
def rows(response):
    manifest=response.get('manifest');result=response.get('result')
    if type(manifest) is not dict or type(result) is not dict:
        raise DiscoveryStopped('Explicit complete native manifest/result required')
    schema=manifest.get('schema');total=manifest.get('total_row_count');chunks=manifest.get('total_chunk_count')
    if (manifest.get('format')!='JSON_ARRAY' or manifest.get('truncated') is not False
            or type(total) is not int or not 0<=total<=20 or type(chunks) is not int
            or type(schema) is not dict or type(schema.get('column_count')) is not int
            or not 0<=schema['column_count']<=128
            or any(key in result for key in ('external_links','external_link','next_chunk_index','next_chunk_internal_link'))):
        raise DiscoveryStopped('Bounded complete inline native result required')
    columns=schema.get('columns',[])
    if (type(columns) is not list or len(columns)!=schema['column_count']
            or any(type(c) is not dict or type(c.get('position')) is not int or c.get('position')!=i or type(c.get('name')) is not str or not c['name'] for i,c in enumerate(columns))
            or len({c['name'] for c in columns})!=len(columns)):
        raise DiscoveryStopped('Complete original column inventory required')
    if total==0:
        if chunks!=0 or manifest.get('chunks',[])!=[] or result!={}:
            raise DiscoveryStopped('Explicit zero-row native result required')
        return []
    data=result.get('data_array')
    if (chunks!=1 or manifest.get('chunks')!=[{'chunk_index':0,'row_count':total,'row_offset':0}]
            or any(type(result.get(key)) is not int for key in ('chunk_index','row_offset','row_count'))
            or result.get('chunk_index')!=0 or result.get('row_offset')!=0 or result.get('row_count')!=total
            or type(data) is not list or len(data)!=total or any(type(row) is not list or len(row)!=len(columns) for row in data)):
        raise DiscoveryStopped('Complete single inline chunk required')
    return [dict(zip([c['name'] for c in columns],row,strict=True)) for row in data]

def native_sql_api(method,path,payload,token,record_response,deadline):
    """One exact-host HTTPS request; no retry, redirect, or credential journaling."""
    match=re.fullmatch(r'/api/2.0/sql/statements(?:/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(/cancel)?)?',path)
    expected='POST' if match is not None and (match[1] is None or match[2] is not None) else 'GET'
    if match is None or method!=expected:
        raise DiscoveryStopped('Closed original SQL API method/path required')
    if method=='GET' and payload is not None:
        raise DiscoveryStopped('Original bounded status GET has no payload')
    if match[1] is None and (type(payload) is not dict or payload.get('warehouse_id')!=WAREHOUSE):
        raise DiscoveryStopped('Exact original warehouse submission required')
    if (type(token) is not str or not 1<=len(token)<=16384 or not token.isascii()
            or any(not 33<=ord(char)<=126 for char in token)):
        raise DiscoveryStopped('Original provider token framing refused')
    body=None if payload is None else json.dumps(payload).encode()
    def remaining():
        value=deadline-time.monotonic()
        if value<=0:raise TimeoutError('Exact native request deadline expired')
        return min(20,value)
    connection=http.client.HTTPSConnection(HOST,443,timeout=remaining(),context=ssl.create_default_context())
    recorded=False;parts=[];response=None;tls=None
    def observed_body(complete,error=None):
        native=b''.join(parts)
        return {'status':None if response is None else response.status,'tls':tls,'body':native.decode('utf-8',errors='backslashreplace'),'nativeBodyBase64':base64.b64encode(native).decode('ascii'),'nativeBodySha256':digest(native),'bodyComplete':complete,'failureType':None if error is None else type(error).__name__,'automaticRetries':0,'redirectsFollowed':0}
    try:
        connection.connect()
        native_socket=connection.sock
        certificate=native_socket.getpeercert(binary_form=True)
        tls={'host':HOST,'port':443,'peerCertificateSha256':digest(certificate),'version':native_socket.version(),'cipher':native_socket.cipher()}
        native_socket.settimeout(remaining())
        connection.request(method,path,body=body,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json','Accept':'application/json'})
        native_socket.settimeout(remaining())
        response=connection.getresponse();size=0
        while True:
            native_socket.settimeout(remaining())
            part=response.read1(min(65536,8_388_609-size))
            if not part:break
            parts.append(part);size+=len(part)
            if size>8_388_608:raise DiscoveryStopped('Bounded native response required')
        native=b''.join(parts)
        record_response(observed_body(True));recorded=True
        if not 200<=response.status<300:raise DiscoveryStopped('Original native HTTP refusal retained')
        if not native and path.endswith('/cancel'):return {}
        try:return json.loads(native.decode('utf-8'))
        except (ValueError,UnicodeError):raise DiscoveryStopped('Native JSON response framing refused') from None
    except BaseException as error:
        if not recorded and response is not None:record_response(observed_body(False,error))
        raise
    finally:connection.close()

def execute(plan,approved_sha,out):
    raw=(ROOT/'plan.json').read_bytes()
    if digest(raw)!=approved_sha or plan!=json.loads(raw):raise DiscoveryStopped('Exact reviewed plan SHA and complete plan required')
    if plan.get('transportReviewRequired') is not False:raise DiscoveryStopped('Submission transport review remains held; no native calls')
    if plan['profile']!=PROFILE or plan['warehouse']!=WAREHOUSE or plan['existingSchema']!=SCHEMA or plan['startWarehouse'] or plan['createSchema'] or plan['createPrincipal']:
        raise DiscoveryStopped('Closed existing approved target required')
    if len(plan['tables'])!=3 or any(not re.fullmatch(re.escape(SCHEMA)+r'\.receipt_discovery_20261017_(objects|receipts|empty)',name) for name in plan['tables'].values()):
        raise DiscoveryStopped('Only exact three reviewed fixture tables permitted')
    for case in plan['cases']:
        if 'sourceFile' in case and digest(Path(case['sourceFile']).read_bytes())!=case['sourceSha256']:raise DiscoveryStopped('Original retained statement source changed')
    cli_path=shutil.which('databricks')
    if cli_path is None:raise DiscoveryStopped('Existing original CLI provider unavailable')
    source_start={str(path):digest(path.read_bytes()) for path in (Path(__file__).resolve(),ROOT/'plan.json',Path(cli_path))}
    out.mkdir(exist_ok=False)
    (out/'approved-plan.json').write_bytes(raw)
    (out/'runner.py').write_bytes(Path(__file__).read_bytes())
    (out/'source-start.json').write_text(json.dumps(source_start,indent=2))
    until=time.monotonic()+plan['limits']['overallSeconds']
    calls=[];sql_count=0;created={};unknown=False;entered=False;observations=[];credential=None;cleanup_until=None;creation_submissions={}
    def save(name,value):
        (out/name).write_text(json.dumps(value,indent=2,default=str)+'\n')
    def retain_source_end():
        observed={name:digest(Path(name).read_bytes()) for name in source_start}
        save('source-end.json',{'files':observed,'unchanged':observed==source_start})
        if observed!=source_start:raise DiscoveryStopped('Native discovery source/provider changed')
    def original_token(deadline):
        nonlocal credential
        if credential is None:
            provider=cli_path
            command=[provider,'auth','token',PROFILE,'--timeout','10s','--output','json']
            remaining=deadline-time.monotonic()
            if remaining<=0:raise TimeoutError('Original provider deadline expired')
            response=subprocess.run(command,capture_output=True,text=True,timeout=min(15,remaining),check=False)
            save('authentication-provider.json',{'provider':provider,'providerSha256':digest(Path(provider).read_bytes()),'command':command,'exitCode':response.returncode,'credentialStored':False,'credentialLogged':False})
            if response.returncode:raise DiscoveryStopped('Existing provider authentication refused')
            try:credential=json.loads(response.stdout)['access_token']
            except (ValueError,KeyError,TypeError):raise DiscoveryStopped('Original provider token response framing refused') from None
        return credential

    def cli(args,payload=None,cleanup=False,deadline=None):
        deadline=deadline if deadline is not None else cleanup_until if cleanup else until
        if deadline is None or time.monotonic()>=deadline:raise TimeoutError('Exact discovery phase deadline expired')
        ordinal=len(calls);request=out/f'api-{ordinal:03}-request.json'
        if payload is not None:request.write_text(json.dumps(payload))
        if args[:1]==['api']:
            method,path=args[1].upper(),args[2]
            record={'ordinal':ordinal,'method':method,'path':path,'payload':payload,'transport':'single-attempt-stdlib-https','host':HOST}
            calls.append(record);save('calls.json',calls)
            def retain_response(native):
                record.update({key:value for key,value in native.items() if key!='body'})
                (out/f'api-{ordinal:03}-stdout.json').write_text(native['body'])
                (out/f'api-{ordinal:03}-response.bin').write_bytes(base64.b64decode(native['nativeBodyBase64'],validate=True))
                save('calls.json',calls)
            return native_sql_api(method,path,payload,original_token(deadline),retain_response,deadline)
        command=[cli_path,*args,'--profile',PROFILE,'--output','json']
        if payload is not None:command+=['--json','@'+str(request)]
        record={'ordinal':ordinal,'command':command,'payload':payload}
        calls.append(record);save('calls.json',calls)
        try:
            result=subprocess.run(command,capture_output=True,text=True,timeout=min(20,deadline-time.monotonic()),check=False)
        except subprocess.TimeoutExpired as error:
            record['transport']='timeout';save('calls.json',calls)
            raise DiscoveryStopped('Native CLI transport timeout') from error
        (out/f'api-{ordinal:03}-stdout.json').write_text(result.stdout)
        (out/f'api-{ordinal:03}-stderr.txt').write_text(result.stderr)
        record['exitCode']=result.returncode;save('calls.json',calls)
        if result.returncode:raise DiscoveryStopped('Native CLI request refused; original output retained')
        return json.loads(result.stdout)
    def statement(sql,cleanup=False):
        nonlocal sql_count,unknown
        sql_count+=1
        if sql_count>plan['limits']['sqlStatements']:raise DiscoveryStopped('SQL statement budget exceeded')
        phase_until=cleanup_until if cleanup else until
        if phase_until is None or time.monotonic()>=phase_until:raise TimeoutError('Native statement phase deadline expired')
        statement_until=min(phase_until,time.monotonic()+plan['limits']['statementSeconds']);sid=None;terminal=False;cancel_attempted=False
        try:
            result=cli(['api','post','/api/2.0/sql/statements'],{'warehouse_id':WAREHOUSE,'statement':sql,'wait_timeout':'10s','on_wait_timeout':'CONTINUE','format':'JSON_ARRAY','disposition':'INLINE','row_limit':20},cleanup=cleanup,deadline=statement_until)
            sid=result.get('statement_id')
            if not isinstance(sid,str) or str(UUID(sid))!=sid:raise DiscoveryStopped('Original native StatementId absent')
            while result.get('status',{}).get('state') not in TERMINAL:
                if time.monotonic()>=statement_until:
                    cancel_attempted=True
                    cli(['api','post',f'/api/2.0/sql/statements/{sid}/cancel'],{},cleanup=True,deadline=time.monotonic()+10)
                    unknown=True
                    raise UncertainDispatch('Native statement deadline; cancellation does not prove noncommit')
                time.sleep(min(.5,max(0,statement_until-time.monotonic())))
                result=cli(['api','get',f'/api/2.0/sql/statements/{sid}'],cleanup=cleanup,deadline=statement_until)
                if result.get('statement_id')!=sid:raise UncertainDispatch('Original native StatementId changed during polling')
            terminal=True
            if result['status']['state']=='FAILED':raise NativeTerminalRefusal(result)
            if result['status']['state']!='SUCCEEDED':
                unknown=True
                raise UncertainDispatch('Native terminal state does not supply original successful outcome')
            return result
        except BaseException as error:
            if not terminal:
                unknown=True
                uncertainty={'originalStatementId':sid,'originalSqlSha256':digest(sql.encode()),'originalFailureType':type(error).__name__,'nativeNoncommitProven':False,'cancellationAttempted':cancel_attempted}
                if sid is not None and not cancel_attempted:
                    cancel_attempted=True;uncertainty['cancellationAttempted']=True
                    try:cli(['api','post',f'/api/2.0/sql/statements/{sid}/cancel'],{},cleanup=True,deadline=time.monotonic()+10)
                    except BaseException as cancellation_error:uncertainty['cancellationFailureType']=type(cancellation_error).__name__
                save('uncertainty-'+str(sql_count)+'.json',uncertainty)
            raise
    def detail(name,cleanup=False):
        result=rows(statement('DESCRIBE DETAIL '+name,cleanup=cleanup))
        if len(result)!=1 or result[0].get('name')!=name or not isinstance(result[0].get('id'),str):raise DiscoveryStopped('Exact native table identity absent')
        UUID(result[0]['id'])
        return result[0]
    def histories(keys):
        result={}
        for key in keys:
            name=plan['tables'][key]
            before=detail(name)
            if before['id']!=created[key]['id']:raise DiscoveryStopped('History original UUID mismatch')
            history=rows(statement('DESCRIBE HISTORY '+name+' LIMIT 20'))
            after=detail(name)
            if after['id']!=before['id']:raise DiscoveryStopped('History UUID changed during observation')
            result[key]={'nativeTableUuidBefore':before['id'],'nativeTableUuidAfter':after['id'],'history':history,'nativeIdentityFenceQualified':False}
        return result
    try:
        warehouse=cli(['warehouses','get',WAREHOUSE]);save('warehouse-before.json',warehouse)
        hostname=warehouse.get('odbc_params',{}).get('hostname')
        entered=warehouse.get('id')==WAREHOUSE and hostname==HOST and warehouse.get('state')=='RUNNING'
        if not entered:
            raise DiscoveryStopped('Already-running exact reviewed warehouse required; runner never starts it')
        save('native-platform-and-actor.json',statement("SELECT to_json(named_struct('version',current_version(),'actor',current_user(),'catalog',current_catalog(),'schema',current_schema())) AS original_native_context"))
        statement('DESCRIBE SCHEMA EXTENDED '+SCHEMA)
        for key,name in plan['tables'].items():
            existing=rows(statement("SHOW TABLES IN "+SCHEMA+" LIKE '"+name.rsplit('.',1)[1]+"'"))
            if existing:raise DiscoveryStopped('Fixture name already exists; do not adopt or overwrite it')
        for item in plan['setup']:
            key=item['id'];name=plan['tables'][key]
            creation_submissions[key]={'name':name,'originalSqlSha256':digest(item['statement'].encode()),'submissionAttempted':True,'acknowledged':False,'nativeUuidObserved':False}
            save('creation-submissions.json',creation_submissions)
            response=statement(item['statement'])
            creation_submissions[key].update(acknowledged=True,originalStatementId=response['statement_id'])
            save('creation-submissions.json',creation_submissions)
            try:native=detail(name)
            except BaseException as error:
                creation_submissions[key]['uuidObservationFailureType']=type(error).__name__
                save('creation-submissions.json',creation_submissions)
                raise
            created[key]=native;creation_submissions[key].update(nativeUuidObserved=True,nativeUuid=native['id'])
            save('creation-submissions.json',creation_submissions);save('created-native-identities.json',created)
            properties=native.get('properties')
            if isinstance(properties,str):properties=json.loads(properties)
            if type(properties) is not dict or properties.get('delta.enableChangeDataFeed')!='false':raise DiscoveryStopped('Explicit native fixture CDF=false required before any data write')
        statement(plan['seed'])
        for case in plan['cases']:
            refused=False
            try:response=statement(case['statement'])
            except NativeTerminalRefusal as error:
                if not case.get('mayRefuse'):raise
                response=error.response;refused=True
            sid=response['statement_id'];record={'case':case,'originalResponse':response,'originalStatementId':sid,'nativeTerminalRefusalObserved':refused,'sameUnitReturnedRows':None if refused else rows(response)}
            observations.append(record);save('observations.json',observations)
            if case.get('laterWriter'):
                later=statement(case['laterWriter']);record['independentLaterWriterStatementId']=later['statement_id'];assert later['statement_id']!=sid
            if case.get('readOriginalMarker'):
                record['originalStoredMarkerResponse']=statement(case['readOriginalMarker'])
            record['nativeHistories']=histories(case['expectedDmlTables']);record['matches']={}
            for key,observed_history in record['nativeHistories'].items():
                history=observed_history['history']
                matching=[]
                for row in history:
                    if row.get('queryHistoryStatementId')!=sid:continue
                    metrics=row.get('operationMetrics')
                    if isinstance(metrics,str):metrics=json.loads(metrics)
                    version=str(row.get('version'))
                    if not re.fullmatch(r'0|[1-9][0-9]*',version):raise DiscoveryStopped('Noncanonical exact native version')
                    matching.append({'version':version,'txnId':(metrics or {}).get('txnId'),'nativeTableUuid':created[key]['id'],'originalNativeRecord':row})
                record['matches'][key]=matching
            matches=[record['matches'][key] for key in case['expectedDmlTables']]
            transaction_ids=[items[0]['txnId'] for items in matches if len(items)==1]
            try:
                canonical_txn=bool(transaction_ids) and all(type(txn) is str and str(UUID(txn))==txn for txn in transaction_ids)
            except ValueError:canonical_txn=False
            record['unambiguousHistoricalLinkageObserved']=not refused and len(transaction_ids)==len(matches) and canonical_txn and len(set(transaction_ids))==1
            record['receiptComponentDomainQualified']=False
            # Observation only. Never manufacture an empty component or receipt.
            record['qualified']=False;record['nativeIdentityFenceQualified']=False
            save('observations.json',observations)
        save('result.json',{'status':'DISCOVERY_OBSERVED_NOT_QUALIFIED','observations':len(observations),'nativeAuthority':False,'qualification':False,'receiptComponentDomain':'UNRESOLVED','actorQualification':False,'temporal':'HELD'})
    except BaseException as error:
        save('failure.json',{'errorType':type(error).__name__,'message':str(error),'uncertainDispatch':unknown,'qualified':False})
        raise
    finally:
        cleanup_until=time.monotonic()+plan['limits'].get('cleanupSqlSeconds',60)
        cleanup={'enteredApprovedWarehouse':entered,'uncertainDispatch':unknown,'tables':{},'warehouseStopped':False,'creationSubmissions':creation_submissions,'pendingUnidentifiedCreations':{key:value for key,value in creation_submissions.items() if key not in created}}
        try:
            if entered and not unknown:
                for key,original in reversed(list(created.items())):
                    try:
                        if detail(plan['tables'][key],cleanup=True)['id']!=original['id']:raise DiscoveryStopped('Cleanup refuses changed UUID')
                        statement('DROP TABLE '+plan['tables'][key],cleanup=True);cleanup['tables'][key]='dropped-exact-owned-uuid'
                    except BaseException as error:cleanup['tables'][key]={'cleanupErrorType':type(error).__name__}
            elif created:cleanup['tablesPendingManualApprovedSettlement']=list(created)
            if unknown:cleanup['possibleResourcesFromUncertainSubmission']=plan['tables']
        finally:
            if entered:
                try:
                    stop_until=time.monotonic()+plan['limits']['stopWaitSeconds']
                    cli(['warehouses','stop',WAREHOUSE],cleanup=True,deadline=stop_until)
                    while time.monotonic()<stop_until:
                        state=cli(['warehouses','get',WAREHOUSE],cleanup=True,deadline=stop_until)
                        if state.get('state')=='STOPPED':cleanup['warehouseStopped']=True;break
                        time.sleep(min(2,max(0,stop_until-time.monotonic())))
                finally:
                    save('cleanup.json',cleanup)
                    retain_source_end()
            else:
                save('cleanup.json',cleanup)
                retain_source_end()
        if entered and not cleanup['warehouseStopped']:raise DiscoveryStopped('Warehouse stop not confirmed')
        if entered and (unknown or set(creation_submissions)!=set(created) or set(cleanup['tables'])!=set(created) or any(value!='dropped-exact-owned-uuid' for value in cleanup['tables'].values())):raise DiscoveryStopped('Fixture cleanup/settlement incomplete; no qualification')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--execute-approved-plan-sha');parser.add_argument('--out',type=Path)
    args=parser.parse_args();plan=json.loads((ROOT/'plan.json').read_text())
    if args.execute_approved_plan_sha is None:
        print(json.dumps({'status':'PLAN_ONLY_NO_NATIVE_CALLS','planSha256':digest((ROOT/'plan.json').read_bytes()),'plan':plan},indent=2))
    else:
        if args.out is None:parser.error('--out required for approved execution')
        execute(plan,args.execute_approved_plan_sha,args.out)
