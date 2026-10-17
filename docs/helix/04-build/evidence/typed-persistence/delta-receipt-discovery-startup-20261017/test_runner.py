"""Pure runner controls. All subprocess/network calls are replaced; no native proof."""
import base64,copy,hashlib,json,runpy,ssl,tempfile,time,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parent
MODULE=runpy.run_path(str(ROOT/'runner.py'),run_name='isolated_discovery_controls')

def inline(data,columns):
    count=len(data)
    manifest={'format':'JSON_ARRAY','schema':{'column_count':len(columns),'columns':[{'name':name,'position':i} for i,name in enumerate(columns)]},'total_chunk_count':int(bool(count)),'total_row_count':count,'truncated':False}
    result={}
    if count:
        manifest['chunks']=[{'chunk_index':0,'row_count':count,'row_offset':0}]
        result={'chunk_index':0,'row_count':count,'row_offset':0,'data_array':data}
    return {'manifest':manifest,'result':result}

class RunnerControls(unittest.TestCase):
    def test_wrong_plan_hash_or_target_never_calls_cli(self):
        plan=json.loads((ROOT/'plan.json').read_text());sha=hashlib.sha256((ROOT/'plan.json').read_bytes()).hexdigest()
        for candidate,digest in [(plan,'0'*64),(dict(plan,warehouse='other'),sha)]:
            with tempfile.TemporaryDirectory() as directory,patch('subprocess.run',side_effect=AssertionError('no CLI')),self.assertRaises(MODULE['DiscoveryStopped']):MODULE['execute'](candidate,digest,Path(directory)/'out')

    def test_unreviewed_transport_cannot_start_or_submit(self):
        plan=json.loads((ROOT/'plan.json').read_text());sha=hashlib.sha256((ROOT/'plan.json').read_bytes()).hexdigest()
        self.assertTrue(plan['transportReviewRequired'])
        with tempfile.TemporaryDirectory() as directory,patch('subprocess.run',side_effect=AssertionError('no CLI')),self.assertRaisesRegex(MODULE['DiscoveryStopped'],'transport review'):MODULE['execute'](plan,sha,Path(directory)/'out')

    def test_complete_rows_match_actual_preserved_native_manifests(self):
        for number in (6,9,17):
            original=json.loads((Path('/private/tmp/sdk-managed-atomic-20261016-r1')/f'statement-{number:03}.json').read_text())['response']
            self.assertEqual(len(MODULE['rows'](original)),original['manifest']['total_row_count'])
        valid=inline([['2']],['version']);self.assertEqual(MODULE['rows'](valid),[{'version':'2'}])
        bads=[]
        for mutate in (lambda x:x['manifest'].pop('total_row_count'),lambda x:x['manifest'].update(truncated=True),lambda x:x['manifest'].update(total_chunk_count=2),lambda x:x['result'].update(row_count=0),lambda x:x['result'].update(row_count=True),lambda x:x['result'].update(next_chunk_index=1),lambda x:x['result'].update(external_links=[]),lambda x:x['result'].update(data_array=[]),lambda x:x['result'].update(data_array=[['2','3']])):
            item=copy.deepcopy(valid);mutate(item);bads.append(item)
        bads += [{}, {'manifest':valid['manifest']}, {'manifest':{'total_row_count':0},'result':{}}]
        for item in bads:
            with self.subTest(item=item),self.assertRaises(MODULE['DiscoveryStopped']):MODULE['rows'](item)

    def transport(self,status=200,body=b'{"statement_id":"00000000-0000-0000-0000-000000000001"}',advance_on_read=None):
        connections=[];recorded=[];clock=[10.0]
        class Socket:
            def __init__(self):self.timeouts=[]
            def getpeercert(self,**kwargs):return b'fixture-certificate'
            def version(self):return 'TLSv1.3'
            def cipher(self):return ('fixture','TLSv1.3',256)
            def settimeout(self,value):self.timeouts.append(value)
        class Response:
            def __init__(self):self.status=status;self.sent=False
            def read1(self,bound):
                if self.sent:return b''
                self.sent=True
                if advance_on_read is not None:clock[0]=advance_on_read
                return body
        class Connection:
            def __init__(self,host,port,**kwargs):
                self.requests=[];self.closed=False;self.sock=Socket();self.retained=self.sock;connections.append(self)
                self.verified=host==MODULE['HOST'] and port==443 and kwargs['context'].check_hostname and kwargs['context'].verify_mode==ssl.CERT_REQUIRED
                self.timeout=kwargs['timeout']
            def connect(self):pass
            def request(self,*args,**kwargs):self.requests.append((args,kwargs))
            def getresponse(self):
                self.sock=None  # Actual HTTP Connection:close lifecycle.
                return Response()
            def close(self):self.closed=True
        with patch('http.client.HTTPSConnection',Connection),patch('time.monotonic',side_effect=lambda:clock[0]):
            try:value=MODULE['native_sql_api']('POST','/api/2.0/sql/statements',{'warehouse_id':MODULE['WAREHOUSE']},'fixture-token-do-not-record',recorded.append,15.0);error=None
            except BaseException as raised:value=None;error=raised
        return value,error,connections,recorded

    def test_connection_close_single_request_no_retry_redirect_or_token_journal(self):
        for status in (200,302,503):
            value,error,connections,recorded=self.transport(status=status)
            self.assertEqual(error is None,status==200)
            self.assertEqual(len(connections),1);self.assertEqual(len(connections[0].requests),1)
            self.assertTrue(connections[0].closed);self.assertTrue(connections[0].verified)
            self.assertTrue(all(0<item<=5 for item in connections[0].retained.timeouts))
            self.assertNotIn('fixture-token-do-not-record',json.dumps(recorded))
            self.assertEqual(recorded[0]['automaticRetries'],0);self.assertEqual(recorded[0]['redirectsFollowed'],0)

    def test_slow_read_expires_and_retains_partial_exact_native_bytes(self):
        value,error,connections,recorded=self.transport(body=b'partial',advance_on_read=16)
        self.assertIsInstance(error,TimeoutError);self.assertTrue(connections[0].closed)
        self.assertFalse(recorded[0]['bodyComplete']);self.assertEqual(base64.b64decode(recorded[0]['nativeBodyBase64']),b'partial')
        with patch('http.client.HTTPSConnection',side_effect=AssertionError('no connection')),patch('time.monotonic',return_value=20),self.assertRaises(TimeoutError):MODULE['native_sql_api']('POST','/api/2.0/sql/statements',{'warehouse_id':MODULE['WAREHOUSE']},'fixture',lambda _:None,19)

    def test_malformed_utf8_retains_original_raw_bytes_and_refuses_json(self):
        value,error,connections,recorded=self.transport(body=b'\xff\x00')
        self.assertIsInstance(error,MODULE['DiscoveryStopped'])
        self.assertEqual(base64.b64decode(recorded[0]['nativeBodyBase64']),b'\xff\x00')
        self.assertEqual(recorded[0]['nativeBodySha256'],hashlib.sha256(b'\xff\x00').hexdigest())
        self.assertTrue(recorded[0]['bodyComplete'])

    def test_transport_rejects_foreign_method_path_and_warehouse(self):
        for method,path,payload in [('GET','/api/2.0/sql/statements',None),('POST','/api/2.0/sql/statements',{'warehouse_id':'foreign'}),('POST','/api/2.0/permissions',{}),('GET','/api/2.0/sql/statements/00000000-0000-0000-0000-000000000001/cancel',None)]:
            with patch('http.client.HTTPSConnection',side_effect=AssertionError('no socket')),self.assertRaises(MODULE['DiscoveryStopped']):MODULE['native_sql_api'](method,path,payload,'fixture',lambda _:None,time.monotonic()+1)

    def simulate(self,*,wrong_host=False,platform_refused=False,drop_refused=False,uncertain_case=False,pending_case=False,detail_wrong_name=False,create_uncertain=False):
        """Synthetic protocol only; no SQL is evaluated and no native claim follows."""
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);plan=json.loads((ROOT/'plan.json').read_text());plan['transportReviewRequired']=False
            (root/'plan.json').write_text(json.dumps(plan));sha=hashlib.sha256((root/'plan.json').read_bytes()).hexdigest()
            module=runpy.run_path(str(ROOT/'runner.py'),run_name='synthetic_protocol_only');module['execute'].__globals__['ROOT']=root
            commands=[];sqls=[];stopped=False;active_sid=None;counter=0
            uuids={name:f'00000000-0000-0000-0000-{index:012d}' for index,name in enumerate(plan['tables'].values(),1)}
            def command(args,**kwargs):
                nonlocal stopped
                commands.append(args)
                if args[1:3]==['auth','token']:data={'access_token':'fixture-memory-only'}
                else:
                    if args[1:3]==['warehouses','stop']:stopped=True
                    data={'id':module['WAREHOUSE'],'state':'STOPPED' if stopped else 'RUNNING','odbc_params':{'hostname':'wrong.invalid' if wrong_host else module['HOST']}}
                class Response:returncode=0;stderr=''
                result=Response();result.stdout=json.dumps(data);return result
            def native(method,path,payload,token,observe,deadline):
                nonlocal counter,active_sid
                self.assertGreater(deadline,time.monotonic())
                if method=='GET':raise TimeoutError('synthetic status poll timeout')
                self.assertEqual(method,'POST')
                if path.endswith('/cancel'):
                    sqls.append('<CANCEL>')
                    native={'statement_id':active_sid,'status':{'state':'CANCELED'}}
                    body=json.dumps(native).encode();observe({'status':200,'tls':{'synthetic':True},'body':body.decode(),'nativeBodyBase64':base64.b64encode(body).decode(),'nativeBodySha256':hashlib.sha256(body).hexdigest(),'bodyComplete':True,'automaticRetries':0,'redirectsFollowed':0});return native
                statement=payload['statement'];sqls.append(statement);counter+=1;sid=f'00000000-0000-0000-0000-{counter:012d}'
                result={'statement_id':sid,'status':{'state':'SUCCEEDED'},**inline([],[])}
                if 'original_native_context' in statement and platform_refused:result['status']['state']='FAILED'
                elif statement.startswith('DESCRIBE DETAIL '):
                    name=statement.removeprefix('DESCRIBE DETAIL ');result.update(inline([['foreign_name' if detail_wrong_name else name,uuids[name],json.dumps({'delta.enableChangeDataFeed':'false'})]],['name','id','properties']))
                elif statement.startswith('CREATE TABLE ') and create_uncertain:raise TimeoutError('synthetic CREATE response lost')
                elif statement.startswith('DESCRIBE HISTORY '):result.update(inline([],[]))
                elif statement.startswith('SELECT invocation'):result.update(inline([['fixture','0','0']],['invocation','changed','observed']))
                elif statement.startswith('DROP TABLE ') and drop_refused:result['status']['state']='FAILED'
                elif statement in [case['statement'] for case in plan['cases']]:
                    active_sid=sid
                    if uncertain_case:raise TimeoutError('synthetic missing response')
                    if pending_case:result['status']['state']='PENDING'
                    if next(case for case in plan['cases'] if case['statement']==statement).get('mayRefuse'):result['status']['state']='FAILED'
                body=json.dumps(result).encode();observe({'status':200,'tls':{'synthetic':True},'body':body.decode(),'nativeBodyBase64':base64.b64encode(body).decode(),'nativeBodySha256':hashlib.sha256(body).hexdigest(),'bodyComplete':True,'automaticRetries':0,'redirectsFollowed':0})
                return result
            error=None
            with patch('subprocess.run',side_effect=command),patch.dict(module['execute'].__globals__,native_sql_api=native):
                try:module['execute'](plan,sha,root/'out')
                except BaseException as raised:error=raised
            cleanup=json.loads((root/'out/cleanup.json').read_text())
            observations=json.loads((root/'out/observations.json').read_text()) if (root/'out/observations.json').exists() else []
            return error,commands,sqls,cleanup,observations

    def test_known_refused_shapes_continue_all_cases_and_cleanup(self):
        error,commands,sqls,cleanup,observations=self.simulate()
        self.assertIsNone(error);self.assertEqual(len(observations),5)
        self.assertEqual(sum(item['nativeTerminalRefusalObserved'] for item in observations),3)
        self.assertTrue(cleanup['warehouseStopped']);self.assertEqual(len(cleanup['tables']),3)
        self.assertFalse(any(command[1:3]==['warehouses','start'] for command in commands))

    def test_initial_running_identity_stop_and_wrong_host_never_touched(self):
        error,commands,sqls,cleanup,_=self.simulate(platform_refused=True)
        self.assertIsNotNone(error);self.assertTrue(cleanup['warehouseStopped'])
        error,commands,sqls,cleanup,_=self.simulate(wrong_host=True)
        self.assertIsNotNone(error);self.assertFalse(sqls);self.assertFalse(cleanup['enteredApprovedWarehouse'])
        self.assertFalse(any(command[1:3]==['warehouses','stop'] for command in commands))

    def test_cleanup_failures_and_uncertainty_cannot_be_success(self):
        error,commands,sqls,cleanup,_=self.simulate(drop_refused=True)
        self.assertIsNotNone(error);self.assertTrue(cleanup['warehouseStopped']);self.assertEqual(len(cleanup['tables']),3)
        error,commands,sqls,cleanup,_=self.simulate(uncertain_case=True)
        self.assertIsNotNone(error);self.assertTrue(cleanup['uncertainDispatch']);self.assertTrue(cleanup['warehouseStopped'])
        self.assertFalse(any(statement.startswith('DROP TABLE') for statement in sqls))
        self.assertTrue(cleanup['possibleResourcesFromUncertainSubmission'])
        error,commands,sqls,cleanup,_=self.simulate(pending_case=True)
        self.assertIsNotNone(error);self.assertTrue(cleanup['uncertainDispatch']);self.assertTrue(cleanup['warehouseStopped'])
        self.assertEqual(sqls.count('<CANCEL>'),1)
        self.assertFalse(any(statement.startswith('DROP TABLE') for statement in sqls))

    def test_create_ack_or_submission_without_uuid_never_disappears_from_cleanup(self):
        for flag in ('detail_wrong_name','create_uncertain'):
            error,commands,sqls,cleanup,_=self.simulate(**{flag:True})
            self.assertIsNotNone(error);self.assertTrue(cleanup['warehouseStopped'])
            self.assertEqual(len(cleanup['creationSubmissions']),1)
            self.assertEqual(len(cleanup['pendingUnidentifiedCreations']),1)
            original=next(iter(cleanup['creationSubmissions'].values()))
            self.assertEqual(original['acknowledged'],flag=='detail_wrong_name')
            self.assertTrue(original['submissionAttempted']);self.assertFalse(original['nativeUuidObserved'])
            self.assertFalse(any(statement.startswith('DROP TABLE') for statement in sqls))

    def test_original009015_identifier_relocation_is_exact(self):
        plan=json.loads((ROOT/'plan.json').read_text())
        for case in plan['cases'][:2]:
            original=json.loads(Path(case['sourceFile']).read_text())['request']['statement']
            for name in ('objects','receipts'):original=original.replace(MODULE['SCHEMA']+'.'+name,plan['tables'][name])
            self.assertEqual(case['statement'],original)
        self.assertFalse(plan['startWarehouse']);self.assertFalse(plan['createSchema']);self.assertFalse(plan['createPrincipal'])
        self.assertEqual(plan['limits']['newTables'],3)

if __name__=='__main__':unittest.main(verbosity=2)
