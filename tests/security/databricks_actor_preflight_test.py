"""Synthetic observation/failure custody; these tests provide no native identities."""
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'tools/security/databricks-actors.py'
spec=importlib.util.spec_from_file_location('actor_preflight',SOURCE);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
PROFILES=['installer','ordinary_a','ordinary_b'];SECRET='SECRET-AUTH-DIAGNOSTIC-MUST-NOT-ESCAPE'
def cli(ids=('install','alice','bob'),*,fail=None,change=None):
    def invoke(args):
        stage='version' if args==['--version'] else 'contexts' if args[0]=='auth' else args[3]
        if fail==stage:raise RuntimeError(SECRET)
        if stage=='version':return 'Databricks CLI v1.19.0\n'
        if stage=='contexts':
            result={'profiles':[{'name':p,'host':'https://example.azuredatabricks.net','account_id':'account','workspace_id':'100','unknownSecret':SECRET} for p in PROFILES]}
        else:result={'id':ids[PROFILES.index(stage)],'active':True,'userName':SECRET,'unknown':SECRET}
        if change:replacement=change(stage,result);result=result if replacement is None else replacement
        return json.dumps(result)
    return invoke

def run(invoke=None,profiles=None):
    with tempfile.TemporaryDirectory() as directory:
        path=Path(directory)/'receipt.json';path.write_text(json.dumps({'status':'identities-available','old':True}))
        stdout=io.StringIO()
        with contextlib.redirect_stdout(stdout):code=m.main(PROFILES if profiles is None else profiles,invoke=cli() if invoke is None else invoke,output=path)
        return code,json.loads(path.read_text()),stdout.getvalue()

class ActorPreflightTests(unittest.TestCase):
    def test_three_distinct_identities_are_only_observations(self):
        code,r,output=run();self.assertEqual((code,r['status'],r['distinctNonInstallerActors']),(0,'identities-available',2));self.assertFalse(r['authority']);self.assertFalse(r['complete']);self.assertTrue(r['sourcesUnchanged']);self.assertEqual(r['sourceDigests'],r['finalSourceDigests']);self.assertNotIn(SECRET,json.dumps(r)+output);self.assertNotIn('old',r)
    def test_aliases_do_not_create_subjects(self):
        for ids,count in [(('same','same','same'),0),(('install','alice','alice'),1)]:
            with self.subTest(ids=ids):code,r,_=run(cli(ids));self.assertEqual((code,r['status'],r['distinctNonInstallerActors']),(1,'not-qualified',count))
    def test_one_ordinary_actor_is_insufficient(self):
        two=PROFILES[:2]
        def fake(args):
            if args[0]=='auth':return json.dumps({'profiles':[{'name':p,'host':'https://example.azuredatabricks.net'} for p in two]})
            return cli()(args)
        code,r,_=run(fake,two);self.assertEqual((code,r['status'],r['distinctNonInstallerActors']),(1,'not-qualified',1))
    def test_different_workspace_does_not_count(self):
        def change(stage,r):
            if stage=='contexts':r['profiles'][-1]['workspace_id']='101'
        code,r,_=run(cli(change=change));self.assertEqual((code,r['status'],r['distinctNonInstallerActors'],r['matchingConfiguredContext']),(1,'not-qualified',1,False))
    def test_auth_failure_replaces_old_success_and_keeps_only_partial_metadata(self):
        for stage,length in [('version',0),('contexts',0),('installer',0),('ordinary_a',1),('ordinary_b',2)]:
            with self.subTest(stage=stage):
                code,r,stdout=run(cli(fail=stage));self.assertEqual(code,2);self.assertEqual(r['status'],'observation-failed');self.assertEqual(len(r['observations']),length);self.assertIsNone(r['distinctNonInstallerActors']);self.assertIsNone(r['matchingConfiguredContext']);self.assertNotIn(SECRET,json.dumps(r)+stdout);self.assertNotIn('old',r)
    def test_pending_is_published_before_first_cli_call(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'receipt.json';path.write_text('{"status":"identities-available","old":true}');seen=[]
            def invoke(args):seen.append(json.loads(path.read_text()));raise m.ObservationError('CLI_COMMAND_FAILED')
            with contextlib.redirect_stdout(io.StringIO()):code=m.main(PROFILES,invoke=invoke,output=path)
            self.assertEqual(code,2);self.assertEqual(len(seen),1);self.assertEqual(seen[0]['status'],'observation-pending');self.assertNotIn('old',seen[0]);self.assertEqual(seen[0]['attemptId'],json.loads(path.read_text())['attemptId']);self.assertFalse(list(Path(directory).glob('*.tmp')))
    def test_termination_cannot_leave_an_old_success_current(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);binary=root/'databricks';ready=root/'ready';clone=root/'clone';copied=clone/'tools/security/databricks-actors.py';copied.parent.mkdir(parents=True);copied.write_bytes(SOURCE.read_bytes());cwd=root/'elsewhere';cwd.mkdir();output=clone/'docs/helix/04-build/evidence/security/databricks-actors.json';output.parent.mkdir(parents=True);output.write_text('{"status":"identities-available","old":true}')
            binary.write_text('#!'+sys.executable+'\nimport os,pathlib,time\npathlib.Path(os.environ["PREFLIGHT_TEST_READY"]).write_text("ready")\ntime.sleep(60)\n');binary.chmod(0o700)
            process=subprocess.Popen([sys.executable,str(copied),*PROFILES],cwd=cwd,env={**os.environ,'PATH':str(root)+os.pathsep+os.environ.get('PATH',''),'PREFLIGHT_TEST_READY':str(ready)},stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
            try:
                end=time.monotonic()+5
                while not ready.exists() and process.poll() is None and time.monotonic()<end:time.sleep(.01)
                self.assertTrue(ready.exists());self.assertIsNone(process.poll());r=json.loads(output.read_text());self.assertEqual(r['status'],'observation-pending');self.assertNotIn('old',r);self.assertIsNone(r['distinctNonInstallerActors'])
            finally:
                if process.poll() is None:os.killpg(process.pid,signal.SIGTERM)
                process.communicate(timeout=5)
            self.assertEqual(json.loads(output.read_text())['status'],'observation-pending')
    def test_keyboard_interrupt_is_explicit_failure(self):
        def interrupt(args):raise KeyboardInterrupt()
        code,r,_=run(interrupt);self.assertEqual(code,2);self.assertEqual(r['errors'][0]['code'],'OBSERVATION_INTERRUPTED')
    def test_unretained_pending_prevents_native_attempt(self):
        with tempfile.TemporaryDirectory() as directory:
            called=[]
            bad=Path(directory)/'directory-not-file';bad.mkdir()
            with self.assertRaises(OSError):m.main(PROFILES,invoke=lambda args:called.append(args),output=bad)
            self.assertEqual(called,[])
    def test_invalid_configuration_refuses_without_cli(self):
        for profiles in [['one'],['a','a'],['a','bad/name'],['a','b']*5]:
            with self.subTest(profiles=profiles):
                called=[];code,r,_=run(lambda args:called.append(args),profiles);self.assertEqual(code,2);self.assertEqual(called,[]);self.assertEqual(r['errors'][0]['code'],'INVALID_PROFILE_NAMES')
    def test_malformed_native_actor_never_becomes_zero_available_actors(self):
        for update in [{'active':False},{'active':1},{'id':None},{'id':123},{'id':''},{'id':'bad\nname'}]:
            with self.subTest(update=update):
                def change(stage,r):
                    if stage=='ordinary_a':r.update(update)
                code,r,_=run(cli(change=change));self.assertEqual(code,2);self.assertEqual(r['errors'][0]['code'],'INVALID_NATIVE_ACTOR');self.assertIsNone(r['distinctNonInstallerActors'])
    def test_missing_or_duplicate_profile_context_refuses(self):
        for duplicate in [False,True]:
            def change(stage,r):
                if stage=='contexts':r['profiles']=r['profiles']+[r['profiles'][0]] if duplicate else r['profiles'][1:]
            code,r,_=run(cli(change=change));self.assertEqual(code,2);self.assertEqual(r['errors'][0]['code'],'MISSING_OR_AMBIGUOUS_PROFILE_CONTEXT')
    def test_host_credentials_query_fragment_and_invalid_port_are_never_retained(self):
        for host in ['https://user:'+SECRET+'@example.com','https://example.com?token='+SECRET,'https://example.com/#'+SECRET,'https://example.com:'+SECRET,'http://example.com','https://example.com/path']:
            def change(stage,r):
                if stage=='contexts':r['profiles'][0]['host']=host
            code,r,stdout=run(cli(change=change));self.assertEqual(code,2);self.assertNotIn(SECRET,json.dumps(r)+stdout)
    def test_raw_cli_failures_and_timeouts_are_redacted(self):
        for effect,code in [(subprocess.TimeoutExpired(['databricks'],30,output=SECRET,stderr=SECRET),'CLI_TIMEOUT'),(FileNotFoundError(SECRET),'CLI_UNAVAILABLE')]:
            with patch.object(m.subprocess,'run',side_effect=effect):
                with self.assertRaises(m.ObservationError) as caught:m.invoke_cli(['--version'])
                self.assertEqual(str(caught.exception),code)
        with patch.object(m.subprocess,'run',return_value=subprocess.CompletedProcess(['databricks'],1,SECRET,SECRET)):
            with self.assertRaises(m.ObservationError) as caught:m.invoke_cli(['--version'])
            self.assertEqual(str(caught.exception),'CLI_COMMAND_FAILED')
    def test_unknown_exception_text_is_not_an_error_code(self):
        def invoke(args):raise m.ObservationError(SECRET)
        code,r,stdout=run(invoke);self.assertEqual(code,2);self.assertEqual(r['errors'][0]['code'],'OBSERVATION_UNAVAILABLE');self.assertNotIn(SECRET,json.dumps(r)+stdout)
    def test_malformed_json_and_version_are_redacted(self):
        for stage in ['version','contexts','installer']:
            def fake(args):
                selected='version' if args==['--version'] else 'contexts' if args[0]=='auth' else args[3]
                return SECRET if selected==stage else cli()(args)
            code,r,stdout=run(fake);self.assertEqual(code,2);self.assertNotIn(SECRET,json.dumps(r)+stdout)
    def test_older_success_cannot_replace_a_newer_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'receipt.json';newer=[];baseline=cli()
            def overlap(args):
                response=baseline(args)
                if args[:2]==['current-user','me'] and args[3]=='ordinary_b':
                    with contextlib.redirect_stdout(io.StringIO()):code=m.main(PROFILES,invoke=cli(fail='installer'),output=path)
                    self.assertEqual(code,2);newer.append(json.loads(path.read_text()))
                return response
            stdout=io.StringIO()
            with contextlib.redirect_stdout(stdout):code=m.main(PROFILES,invoke=overlap,output=path)
            self.assertEqual(code,2);self.assertEqual(json.loads(path.read_text()),newer[0]);self.assertEqual(newer[0]['status'],'observation-failed');self.assertEqual(json.loads(stdout.getvalue())['status'],'observation-superseded')
    def test_real_overlapping_processes_keep_the_newer_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);clone=root/'clone';copied=clone/'tools/security/databricks-actors.py';copied.parent.mkdir(parents=True);copied.write_bytes(SOURCE.read_bytes());binary=root/'databricks';ready=root/'ready';release=root/'release';output=clone/'docs/helix/04-build/evidence/security/databricks-actors.json'
            binary.write_text('#!'+sys.executable+'\n'+"""import sys,os,json,time,pathlib
root=pathlib.Path(os.environ['PREFLIGHT_TEST_ROOT']);args=sys.argv[1:]
if args==['--version']:print('Databricks CLI v1.19.0')
elif args[0]=='auth':print(json.dumps({'profiles':[{'name':p,'host':'https://example.azuredatabricks.net'} for p in ['installer','ordinary_a','ordinary_b']]}))
else:
 p=args[3]
 if os.environ['PREFLIGHT_TEST_MODE']=='newer' and p=='installer':sys.exit(1)
 if os.environ['PREFLIGHT_TEST_MODE']=='older' and p=='ordinary_b':
  (root/'ready').write_text('ready');end=time.monotonic()+10
  while not (root/'release').exists() and time.monotonic()<end:time.sleep(.01)
  if not (root/'release').exists():sys.exit(2)
 print(json.dumps({'id':{'installer':'install','ordinary_a':'alice','ordinary_b':'bob'}[p],'active':True}))
""");binary.chmod(0o700);processes=[]
            def start(mode):
                p=subprocess.Popen([sys.executable,str(copied),*PROFILES],cwd=root,env={**os.environ,'PATH':str(root)+os.pathsep+os.environ.get('PATH',''),'PREFLIGHT_TEST_ROOT':str(root),'PREFLIGHT_TEST_MODE':mode},stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True);processes.append(p);return p
            try:
                older=start('older');end=time.monotonic()+5
                while not ready.exists() and older.poll() is None and time.monotonic()<end:time.sleep(.01)
                self.assertTrue(ready.exists());self.assertIsNone(older.poll());newer=start('newer');newout,newerr=newer.communicate(timeout=5);self.assertEqual((newer.returncode,newerr),(2,b''));saved=output.read_bytes();self.assertEqual(json.loads(saved)['status'],'observation-failed')
                release.write_text('release');oldout,olderr=older.communicate(timeout=5);self.assertEqual((older.returncode,olderr),(2,b''));self.assertEqual(json.loads(oldout)['status'],'observation-superseded');self.assertEqual(output.read_bytes(),saved);self.assertEqual(json.loads(newout)['attemptId'],json.loads(saved)['attemptId'])
            finally:
                release.touch()
                for process in processes:
                    if process.poll() is None:os.killpg(process.pid,signal.SIGTERM)
                    process.communicate(timeout=5)
    def test_final_publication_is_at_most_once_for_current_pending_attempt(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'receipt.json';pending={'attemptId':'a','status':'observation-pending'};self.assertTrue(m.write_receipt(path,pending))
            failure={'attemptId':'a','status':'observation-failed'};self.assertTrue(m.write_receipt(path,failure,expected_attempt='a'))
            self.assertFalse(m.write_receipt(path,{'attemptId':'a','status':'identities-available'},expected_attempt='a'));self.assertEqual(json.loads(path.read_text()),failure)
            self.assertFalse(m.write_receipt(path,{'attemptId':'b','status':'identities-available'},expected_attempt='b'))
    def test_host_whitespace_controls_non_ascii_and_invalid_dns_are_not_retained(self):
        for host in ['https://exa\nmple.com','https://exa\tmple.com','https://example.com\x00','https://exa mple.com','https://éxample.com','https://example.com\x7f','https://example..com','https://-example.com','https://example.com\\bad']:
            def change(stage,r):
                if stage=='contexts':r['profiles'][0]['host']=host
            code,r,_=run(cli(change=change));self.assertEqual(code,2);self.assertEqual(r['errors'][0]['code'],'INVALID_CONFIGURED_CONTEXT');self.assertEqual(r['observations'],[])
    def test_each_attempt_has_new_custody(self):
        a=run(cli(fail='installer'))[1];b=run(cli(fail='installer'))[1];self.assertNotEqual(a['attemptId'],b['attemptId'])

if __name__=='__main__':unittest.main(verbosity=2)
