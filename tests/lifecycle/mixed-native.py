# SPDX-License-Identifier: MIT OR Apache-2.0
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

import psycopg
import umf_access.lifecycle.mixed as mixed
import umf_access.lifecycle.seeds as seeds
from psycopg import sql
from umf_access.lifecycle import (
 CatalogError,
 apply_mixed_migration,
 apply_table_migration,
 inspect_table_history,
 read_table_head,
 verify_native_catalog,
)
from umf_codegen import compile_table_deployment, compile_table_migration

parser=argparse.ArgumentParser()
parser.add_argument('--dsn',default='dbname=postgres')
parser.add_argument('--report',type=Path,required=True)
parser.add_argument('--legacy-python',type=Path,required=True)
parser.add_argument('--legacy-provenance',type=Path,required=True)
args=parser.parse_args()
legacy_provenance=json.loads(args.legacy_provenance.read_text())
legacy_probe='import json,sys; from importlib.metadata import version; import umf_access,umf_codegen; from umf_codegen._release import MANIFEST_SHA256; from umf_codegen._embedded import files; m=json.loads(files("umf_codegen").joinpath("_assets","manifest.json").read_bytes()); print(json.dumps({"python":sys.version.split()[0],"access":version("umf_access"),"codegen":version("umf-codegen"),"codegenManifestSha256":MANIFEST_SHA256,"codegenBundleSha256":m["bundleSha256"]}))'
legacy_runtime=json.loads(subprocess.run([str(args.legacy_python),'-I','-c',legacy_probe],check=True,capture_output=True,text=True).stdout)
assert legacy_runtime['access']=='0.1.0.dev5' and legacy_runtime['codegen']=='0.1.0a2'
for key in ('python','access','codegen','codegenManifestSha256','codegenBundleSha256'):
 assert legacy_runtime[key]==legacy_provenance['runtime'][key],(key,legacy_runtime,legacy_provenance['runtime'])
checks=[]
def record(name):checks.append(name)
f=Path('fixtures/table-lifecycle/legal'); pfx='u1x_'+hashlib.sha1(str(__import__('time').time()).encode()).hexdigest()[:10]+'_'
cfg={'module':'legal_lifecycle','schema':pfx+'schema','ownerRole':pfx+'owner','personRole':pfx+'person','batchRole':pfx+'batch','groupRoles':{'billing_admin':pfx+'billing'}}
alice,bob=pfx+'alice',pfx+'bob'; roles=[cfg['ownerRole'],cfg['personRole'],cfg['batchRole'],cfg['groupRoles']['billing_admin'],alice,bob]
def source(n):return json.loads((f/n).read_text())
def bundle(d,configuration=cfg):
 r=compile_table_deployment(json.dumps(d,separators=(',',':')),configuration=configuration);assert r['status']=='compiled',r;return r['bundle']
a=bundle(source('initial.json')); old=compile_table_migration(migration_id='base',previous_bundle=None,next_bundle=a,predecessor=None)['plan']
legacy_doc=json.loads(Path('tests/lifecycle/fixtures/legacy-note.json').read_text())
legacy_next=json.loads(json.dumps(legacy_doc))
legacy_module=legacy_next['modules'][0]
legacy_module['elements'].append({'id':'notes__category','name':'notes__category','kind':'field','scalarType':'string','cardinality':'one','nullability':'absent-allowed','extensions':{}})
legacy_module['elements'][-2]['members'].append({'module':'note_lifecycle','element':'notes__category'})
legacy_module['extensions']['umf.tables']['tables'][0]['columns'].append({'field':{'module':'note_lifecycle','element':'notes__category'},'name':'category','nativeType':{'kind':'text'}})
published_cfg={'module':'note_lifecycle','schema':pfx+'published_note','ownerRole':pfx+'published_owner','personRole':pfx+'published_person','batchRole':pfx+'published_batch','groupRoles':{'reader':pfx+'published_reader'}}
published_people=[pfx+'published_alice',pfx+'published_bob']
published_roles=[published_cfg['ownerRole'],published_cfg['personRole'],published_cfg['batchRole'],published_cfg['groupRoles']['reader'],*published_people]
policy_cfg={'module':'note_lifecycle','schema':pfx+'policy_note','ownerRole':pfx+'policy_owner','personRole':pfx+'policy_person','batchRole':pfx+'policy_batch','groupRoles':{'reader':pfx+'policy_reader'}}
policy_people=[pfx+'policy_alice',pfx+'policy_bob']
policy_roles=[policy_cfg['ownerRole'],policy_cfg['personRole'],policy_cfg['batchRole'],policy_cfg['groupRoles']['reader'],*policy_people]
legacy_payload={'initial':legacy_doc,'additive':legacy_next,'configuration':published_cfg,'policyConfiguration':policy_cfg}
legacy_script='\n'.join([
 'import json,sys',
 'from umf_codegen import compile_table_deployment,compile_table_migration',
 'x=json.load(sys.stdin); c=x["configuration"]; pc=x["policyConfiguration"]',
 'def b(d):',
 ' r=compile_table_deployment(json.dumps(d,separators=(",",":")),configuration=c)',
 ' assert r["status"]=="compiled",r',
 ' return r["bundle"]',
 'a=b(x["initial"]); z=b(x["additive"])',
 'one=compile_table_migration(migration_id="published-note-base",previous_bundle=None,next_bundle=a,predecessor=None)',
 'assert one["status"]=="compiled",one',
 'two=compile_table_migration(migration_id="published-note-additive",previous_bundle=a,next_bundle=z,predecessor={"id":"published-note-base","digest":one["plan"]["digest"]})',
 'assert two["status"]=="compiled",two',
 'policy=json.loads(json.dumps(x["initial"])); policy["modules"][0]["extensions"]["umf.tables"]["tables"][0]["policy"]["person"]["select"]={"kind":"deny"}',
 'policyBase=compile_table_deployment(json.dumps(x["initial"],separators=(",",":")),configuration=pc)["bundle"]',
 'onePolicy=compile_table_migration(migration_id="policy-note-base",previous_bundle=None,next_bundle=policyBase,predecessor=None); assert onePolicy["status"]=="compiled",onePolicy',
 'policyBundle=compile_table_deployment(json.dumps(policy,separators=(",",":")),configuration=pc); assert policyBundle["status"]=="compiled",policyBundle',
 'three=compile_table_migration(migration_id="reidentified-policy",previous_bundle=policyBase,next_bundle=policyBundle["bundle"],predecessor={"id":"policy-note-base","digest":onePolicy["plan"]["digest"]}); assert three["status"]=="compiled",three',
 'print(json.dumps({"initialPlan":one["plan"],"additivePlan":two["plan"],"policyBasePlan":onePolicy["plan"],"policyPlan":three["plan"],"next":z},separators=(",",":")))',
])
legacy_result=subprocess.run([str(args.legacy_python),'-I','-c',legacy_script],input=json.dumps(legacy_payload),text=True,capture_output=True)
if legacy_result.returncode:raise RuntimeError(legacy_result.stderr)
published_artifact=json.loads(legacy_result.stdout)
assert published_artifact['initialPlan']['version']==published_artifact['additivePlan']['version']=='umf.table-migration/0.1'
target=source('indexed.json'); target['modules'][0]['extensions']['umf.tables']['seedSets'].append({'id':'mixed-once','conflict':'error','rows':[{'table':'clients','values':[{'field':{'module':'legal_lifecycle','element':'clients__client_id'},'value':{'integerToken':'777'}},{'field':{'module':'legal_lifecycle','element':'clients__client_name'},'value':{'string':'Once only'}}]}]})
z=bundle(target)
o=json.loads((f/'evolution-options.json').read_text());o.update(version='umf.table-migration-options/0.2',concurrentIndexes=json.loads((f/'index-options.json').read_text())['concurrentIndexes'],reviewedChanges=[],validations=[{'table':'matters','constraint':'positive_id','kind':'check'},{'table':'matters','constraint':'fk_0','kind':'foreignKey'}])
r=compile_table_migration(migration_id='mixed',previous_bundle=a,next_bundle=z,predecessor={'id':'base','digest':old['digest']},options=o);assert r['status']=='compiled',r;p=r['plan'];assert p['phases'][-1]['kind']=='seed'
file='d'*64
with psycopg.connect(args.dsn,autocommit=True) as c:
 made=[]
 try:
  for role in roles+published_roles+policy_roles:c.execute(sql.SQL('CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION').format(sql.Identifier(role)));made.append(role)
  c.execute(sql.SQL('CREATE SCHEMA {} AUTHORIZATION {}').format(sql.Identifier(published_cfg['schema']),sql.Identifier(published_cfg['ownerRole'])))
  c.execute(sql.SQL('CREATE SCHEMA {} AUTHORIZATION {}').format(sql.Identifier(policy_cfg['schema']),sql.Identifier(policy_cfg['ownerRole'])))
  published_apply_script='\n'.join([
   'import json,sys,psycopg',
   'from umf_access.lifecycle import apply_table_migration',
   'x=json.load(sys.stdin)',
   'with psycopg.connect(x["dsn"],autocommit=True) as c:',
   ' c.execute("SET search_path=pg_catalog"); c.execute("SET ROLE " + psycopg.sql.Identifier(x["owner"]).as_string(c))',
   ' with c.transaction(): first=apply_table_migration(c,x["initial"],approved_digest=x["initial"]["digest"],expected_head=None,person_roles=tuple(x["people"]))',
   ' with c.transaction(): second=apply_table_migration(c,x["additive"],approved_digest=x["additive"]["digest"],expected_head=first["headDigest"],person_roles=tuple(x["people"]))',
   ' c.execute("RESET ROLE"); c.execute("SET ROLE " + psycopg.sql.Identifier(x["policyOwner"]).as_string(c))',
   ' with c.transaction(): policyBase=apply_table_migration(c,x["policyBase"],approved_digest=x["policyBase"]["digest"],expected_head=None,person_roles=tuple(x["policyPeople"]))',
   ' print(json.dumps({"first":first,"second":second,"policyBase":policyBase}))',
  ])
  for person in published_people:c.execute(sql.SQL('GRANT {} TO {} WITH INHERIT TRUE,SET FALSE').format(sql.Identifier(published_cfg['personRole']),sql.Identifier(person)))
  for person in policy_people:c.execute(sql.SQL('GRANT {} TO {} WITH INHERIT TRUE,SET FALSE').format(sql.Identifier(policy_cfg['personRole']),sql.Identifier(person)))
  old_plans={'initial':published_artifact['initialPlan'],'additive':published_artifact['additivePlan'],'policyBase':published_artifact['policyBasePlan'],'dsn':args.dsn,'owner':published_cfg['ownerRole'],'person':published_cfg['personRole'],'reader':published_cfg['groupRoles']['reader'],'people':published_people,'policyOwner':policy_cfg['ownerRole'],'policyPeople':policy_people}
  old_apply=subprocess.run([str(args.legacy_python),'-I','-c',published_apply_script],input=json.dumps(old_plans),text=True,capture_output=True)
  if old_apply.returncode:raise RuntimeError(old_apply.stderr)
  old_receipts=json.loads(old_apply.stdout)
  assert old_receipts['first']['status']=='applied-in-transaction' and old_receipts['second']['status']=='applied-in-transaction',old_receipts
  # Exact published access/codegen wrote both history entries; current access must
  # validate the same source and observe both entries without executing effects.
  c.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(published_cfg['ownerRole'])));c.execute('SET search_path=pg_catalog')
  with c.transaction():
   published_history=inspect_table_history(c,published_artifact['next'],person_roles=tuple(published_people))
   verify_native_catalog(c,published_artifact['next'])
  assert published_history['generation']==2,published_history
  with c.transaction():
   published_replay=apply_table_migration(c,published_artifact['additivePlan'],approved_digest=published_artifact['additivePlan']['digest'],expected_head=old_receipts['first']['headDigest'],person_roles=tuple(published_people))
  assert published_replay['status']=='already-applied',published_replay
  record('published-v053-initial-additive-history-verifies-after-upgrade')
  c.execute('RESET ROLE')
  for person in (alice,bob):c.execute(sql.SQL('GRANT {} TO {} WITH INHERIT TRUE,SET FALSE').format(sql.Identifier(cfg['personRole']),sql.Identifier(person)))
  c.execute(sql.SQL('CREATE SCHEMA {} AUTHORIZATION {}').format(sql.Identifier(cfg['schema']),sql.Identifier(cfg['ownerRole'])))
  c.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(cfg['ownerRole'])));c.execute('SET search_path=pg_catalog')
  with c.transaction(): base=apply_table_migration(c,old,approved_digest=old['digest'],expected_head=None,person_roles=(alice,bob))
  with c.transaction(): replay=apply_table_migration(c,old,approved_digest=old['digest'],expected_head=None,person_roles=(alice,bob))
  assert replay['status']=='already-applied',replay
  record('original-v01-history-verifies-and-replays')
  from umf_access.lifecycle.ledger import _verified_plan
  policy_plan=published_artifact['policyPlan']
  _verified_plan(policy_plan)
  c.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(policy_cfg['ownerRole'])));c.execute('SET search_path=pg_catalog')
  try:
   with c.transaction(): apply_table_migration(c,policy_plan,approved_digest=policy_plan['digest'],expected_head=old_receipts['policyBase']['headDigest'],person_roles=tuple(policy_people))
  except CatalogError as e:assert str(e)=='new-effect-admission-required',e
  else:raise AssertionError('reidentified unreviewed v0.1 plan admitted effects')
  with c.transaction():
   history=inspect_table_history(c,published_artifact['policyBasePlan']['next'],person_roles=tuple(policy_people))
   verify_native_catalog(c,published_artifact['policyBasePlan']['next'])
  assert history['generation']==1,history
  record('reidentified-unreviewed-v01-policy-refused-before-effects')
  c.execute('RESET ROLE')
  c.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(cfg['ownerRole'])))
  try:apply_mixed_migration(c,p,approved_digest=p['digest'],expected_head=base['headDigest'],person_roles=(alice,bob),file_digest='g'*64)
  except CatalogError as e:assert str(e)=='migration-file-digest-conflict',e
  else:raise AssertionError('malformed file digest admitted')
  assert c.execute(sql.SQL('SELECT to_regclass(%s)',),(cfg['schema']+'.umf_lifecycle_progress',)).fetchone()==(None,)
  record('malformed-digest-refuses-before-fence')
  # First effect creates only the nullable column. A new user trigger and external
  # role authority must be rejected before the following Weft backfill executes.
  staged=apply_mixed_migration(c,p,approved_digest=p['digest'],expected_head=base['headDigest'],person_roles=(alice,bob),file_digest=file,stop_after_phase=1);assert staged['status']=='in-progress'
  blocked_backfills=[];boundary_orig=mixed._run_required_phase
  def count_blocked_phase(conn,plan,phase,*args,**kwargs):
   if phase['kind']=='backfill':blocked_backfills.append(phase['id'])
   return boundary_orig(conn,plan,phase,*args,**kwargs)
  mixed._run_required_phase=count_blocked_phase
  def assert_still_fenced_and_unmodified():
   nulls=c.execute(sql.SQL('SELECT count(*) FILTER (WHERE review_state IS NULL),count(*) FROM {}.matters').format(sql.Identifier(cfg['schema']))).fetchone()
   assert nulls[0]==nulls[1],nulls
   assert not c.execute('SELECT pg_catalog.has_table_privilege(%s,%s,\'SELECT\')',(alice,cfg['schema']+'.umf_lifecycle_head')).fetchone()[0]
  saved_progress=c.execute(sql.SQL('SELECT phase_digest,prefix_witness::text FROM {}.umf_lifecycle_progress WHERE migration_id=%s').format(sql.Identifier(cfg['schema'])),('mixed',)).fetchone()
  c.execute(sql.SQL('UPDATE {}.umf_lifecycle_progress SET phase_digest=%s WHERE migration_id=%s').format(sql.Identifier(cfg['schema'])),('0'*64,'mixed'))
  try:apply_mixed_migration(c,p,approved_digest=p['digest'],expected_head=base['headDigest'],person_roles=(alice,bob),file_digest=file)
  except CatalogError as e:assert str(e)=='progress-phase-mismatch',e
  else:raise AssertionError('tampered phase digest resumed')
  c.execute(sql.SQL('UPDATE {}.umf_lifecycle_progress SET phase_digest=%s WHERE migration_id=%s').format(sql.Identifier(cfg['schema'])),(saved_progress[0],'mixed'))
  assert_still_fenced_and_unmodified()
  record('tampered-phase-digest-refuses-before-backfill')
  c.execute(sql.SQL('UPDATE {}.umf_lifecycle_progress SET prefix_witness=%s::jsonb WHERE migration_id=%s').format(sql.Identifier(cfg['schema'])),('{}','mixed'))
  try:apply_mixed_migration(c,p,approved_digest=p['digest'],expected_head=base['headDigest'],person_roles=(alice,bob),file_digest=file)
  except CatalogError as e:assert str(e)=='progress-prefix-mismatch',e
  else:raise AssertionError('tampered phase prefix resumed')
  c.execute(sql.SQL('UPDATE {}.umf_lifecycle_progress SET prefix_witness=%s::jsonb WHERE migration_id=%s').format(sql.Identifier(cfg['schema'])),(saved_progress[1],'mixed'))
  assert_still_fenced_and_unmodified()
  record('tampered-prefix-witness-refuses-before-backfill')
  c.execute(sql.SQL('CREATE FUNCTION {}.u1_noop() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$').format(sql.Identifier(cfg['schema'])))
  c.execute(sql.SQL('CREATE TRIGGER u1_noop BEFORE UPDATE ON {}.matters FOR EACH ROW EXECUTE FUNCTION {}.u1_noop()').format(sql.Identifier(cfg['schema']),sql.Identifier(cfg['schema'])))
  try:apply_mixed_migration(c,p,approved_digest=p['digest'],expected_head=base['headDigest'],person_roles=(alice,bob),file_digest=file)
  except CatalogError as e:assert str(e)=='phase-table-boundary-mismatch',e
  else:raise AssertionError('trigger tamper admitted')
  assert_still_fenced_and_unmodified()
  record('trigger-drift-refuses-before-backfill')
  c.execute(sql.SQL('DROP TRIGGER u1_noop ON {}.matters').format(sql.Identifier(cfg['schema'])));c.execute(sql.SQL('DROP FUNCTION {}.u1_noop()').format(sql.Identifier(cfg['schema'])))
  c.execute('RESET ROLE');c.execute(sql.SQL('GRANT CREATE ON SCHEMA {} TO {}').format(sql.Identifier(cfg['schema']),sql.Identifier(cfg['personRole'])));c.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(cfg['ownerRole'])))
  try:apply_mixed_migration(c,p,approved_digest=p['digest'],expected_head=base['headDigest'],person_roles=(alice,bob),file_digest=file)
  except CatalogError as e:assert str(e)=='phase-schema-privilege-mismatch',e
  else:raise AssertionError('private schema ACL tamper admitted')
  assert_still_fenced_and_unmodified()
  record('private-schema-acl-drift-refuses-before-backfill')
  c.execute('RESET ROLE');c.execute(sql.SQL('REVOKE CREATE ON SCHEMA {} FROM {}').format(sql.Identifier(cfg['schema']),sql.Identifier(cfg['personRole'])));c.execute(sql.SQL('ALTER ROLE {} BYPASSRLS').format(sql.Identifier(cfg['ownerRole'])));c.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(cfg['ownerRole'])))
  try:apply_mixed_migration(c,p,approved_digest=p['digest'],expected_head=base['headDigest'],person_roles=(alice,bob),file_digest=file)
  except CatalogError as e:assert str(e)=='install-authority-required',e
  else:raise AssertionError('trusted role attribute tamper admitted')
  assert_still_fenced_and_unmodified()
  record('trusted-role-attribute-drift-refuses-before-backfill')
  c.execute('RESET ROLE');c.execute(sql.SQL('ALTER ROLE {} NOBYPASSRLS').format(sql.Identifier(cfg['ownerRole'])));c.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(cfg['ownerRole'])))
  c.execute('RESET ROLE');c.execute('GRANT CREATE ON SCHEMA public TO '+sql.Identifier(cfg['ownerRole']).as_string(c));c.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(cfg['ownerRole'])))
  try:apply_mixed_migration(c,p,approved_digest=p['digest'],expected_head=base['headDigest'],person_roles=(alice,bob),file_digest=file)
  except CatalogError as e:assert str(e)=='phase-external-authority-present',e
  else:raise AssertionError('role authority tamper admitted')
  assert_still_fenced_and_unmodified()
  record('external-role-authority-refuses-before-backfill')
  c.execute('RESET ROLE');c.execute('REVOKE CREATE ON SCHEMA public FROM '+sql.Identifier(cfg['ownerRole']).as_string(c));c.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(cfg['ownerRole'])))
  mixed._run_required_phase=boundary_orig
  assert blocked_backfills==[],blocked_backfills
  backfills=[];orig=mixed._run_required_phase
  def count_phase(conn,plan,phase,*args,**kwargs):
   if phase['kind']=='backfill':backfills.append(phase['id'])
   return orig(conn,plan,phase,*args,**kwargs)
  mixed._run_required_phase=count_phase
  try:
   try:apply_mixed_migration(c,p,approved_digest=p['digest'],expected_head=base['headDigest'],person_roles=(alice,bob),file_digest='e'*64)
   except CatalogError as e:assert str(e)=='migration-file-digest-conflict',e
   else:raise AssertionError('resumed file digest mismatch admitted')
   record('resumed-file-digest-binding')
   try:apply_mixed_migration(c,p,approved_digest=p['digest'],expected_head=base['headDigest'],person_roles=(alice,bob),file_digest=file,after_phase_commit_unknown=True)
   except CatalogError as e:assert str(e)=='migration-outcome-unknown-observe-progress',e
   else:raise AssertionError('required phase unknown commit not surfaced')
   c.execute('RESET ROLE'); rows=c.execute(sql.SQL('SELECT review_state FROM {}.matters ORDER BY matter_id').format(sql.Identifier(cfg['schema']))).fetchall(); c.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(cfg['ownerRole'])))
   assert rows==[('restricted',),('restricted',)],rows
   record('backfill-effect-committed-once-after-unknown-result')
   # The source index lookup builds successfully but its committed effect is
   # deliberately reported unknown; resume must observe, not issue CREATE twice.
   creates=[];oldexec=mixed._execute
   def count_create(conn,statement,parameters=()):
    if statement.startswith('CREATE INDEX CONCURRENTLY'):creates.append(statement)
    return oldexec(conn,statement,parameters)
   mixed._execute=count_create
   try:
    try:apply_mixed_migration(c,p,approved_digest=p['digest'],expected_head=base['headDigest'],person_roles=(alice,bob),file_digest=file,after_concurrent_effect_before_receipt=True)
    except CatalogError as e:assert str(e)=='migration-outcome-unknown-observe-progress',e
    else:raise AssertionError('concurrent unknown effect not surfaced')
    try:apply_mixed_migration(c,p,approved_digest=p['digest'],expected_head=base['headDigest'],person_roles=(alice,bob),file_digest=file)
    except CatalogError as e:assert str(e)=='migration-outcome-unknown-observe-progress',e
    else:raise AssertionError('unique index failure should persist intent')
    try:apply_mixed_migration(c,p,approved_digest=p['digest'],expected_head=base['headDigest'],person_roles=(alice,bob),file_digest=file)
    except CatalogError as e:assert str(e)=='invalid-index-repair-required',e
    else:raise AssertionError('invalid index auto-repaired')
    assert sum('client_lookup' in x for x in creates)==1
    record('concurrent-index-success-observed-without-replay')
    record('failed-unique-index-requires-explicit-repair')
   finally:mixed._execute=oldexec
   # Resolve the duplicate rows while the generation head remains fenced, then
   # explicitly authorize repair of only the exact source-selected invalid index.
   c.execute('RESET ROLE');c.execute(sql.SQL("UPDATE {}.matters SET matter_title='Unique synthetic title' WHERE matter_id=2").format(sql.Identifier(cfg['schema'])));c.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(cfg['ownerRole'])))
   repaired=apply_mixed_migration(c,p,approved_digest=p['digest'],expected_head=base['headDigest'],person_roles=(alice,bob),file_digest=file,repair_invalid=True,stop_after_phase=10)
   assert repaired['status']=='in-progress',repaired
   record('source-shaped-invalid-index-repaired-explicitly')
   # Seed effect has its own final phase and conflict:error proves no replay.
   seed_calls=[];oldseed=seeds._apply_seeds
   def count_seed(*args,**kwargs):seed_calls.append(1);return oldseed(*args,**kwargs)
   seeds._apply_seeds=count_seed
   try:
    try:apply_mixed_migration(c,p,approved_digest=p['digest'],expected_head=base['headDigest'],person_roles=(alice,bob),file_digest=file,after_phase_commit_unknown=True)
    except CatalogError as e:assert str(e)=='migration-outcome-unknown-observe-progress',e
    else:raise AssertionError('seed commit uncertainty not surfaced')
    result=apply_mixed_migration(c,p,approved_digest=p['digest'],expected_head=base['headDigest'],person_roles=(alice,bob),file_digest=file)
   finally:seeds._apply_seeds=oldseed
   assert result['status']=='committed',result
   assert len(backfills)==1 and len(seed_calls)==1,(backfills,seed_calls)
   record('typed-seed-effect-committed-once-after-unknown-result')
   c.execute('RESET ROLE');seed_count=c.execute(sql.SQL('SELECT count(*) FROM {}.clients WHERE client_id=777').format(sql.Identifier(cfg['schema']))).fetchone();c.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(cfg['ownerRole'])))
   assert seed_count==(1,),seed_count
   record('conflict-error-seed-not-replayed')
   assert c.execute(sql.SQL('SELECT to_regclass(%s)',),(cfg['schema']+'.umf_lifecycle_progress',)).fetchone()==(None,)
   record('publication-drops-progress-relation')
   # Replays enforce both original file and predecessor bindings without effects.
   for kwargs in ({'file_digest':None},{'file_digest':'e'*64},{'expected_head':'f'*64,'file_digest':file}):
    call_args={'expected_head':base['headDigest'],'file_digest':file};call_args.update(kwargs)
    try:apply_mixed_migration(c,p,approved_digest=p['digest'],person_roles=(alice,bob),**call_args)
    except CatalogError as e:assert str(e)=='ledger-digest-conflict'
    else:raise AssertionError('replay mismatch admitted')
   replay=apply_mixed_migration(c,p,approved_digest=p['digest'],expected_head=base['headDigest'],person_roles=(alice,bob),file_digest=file)
   assert replay['status']=='already-applied'
   record('applied-replay-enforces-file-and-head-bindings')
   with c.transaction(): history=inspect_table_history(c,z,person_roles=(alice,bob));assert history['generation']==2
   with c.transaction(): verify_native_catalog(c,z)
   record('ordinary-native-history-and-catalog-readers-pass')
   with c.transaction():current=read_table_head(c,z,result['installationReference'])
   assert current['generation']==2,current
   c.execute('RESET ROLE');c.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(alice)))
   visible=c.execute(sql.SQL('SELECT client_id FROM {}.clients ORDER BY client_id').format(sql.Identifier(cfg['schema']))).fetchall()
   assert visible==[(1,),(777,)],visible
   c.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(cfg['ownerRole'])))
   record('person-read-observes-final-generation-after-publication')
  finally:mixed._run_required_phase=orig
 finally:
  c.execute('RESET ROLE');c.execute('RESET search_path')
  for schema_name in (cfg['schema'],published_cfg['schema'],policy_cfg['schema']):
   if c.execute('SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname=%s)',(schema_name,)).fetchone()[0]:c.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema_name)))
  for role in reversed(made):c.execute(sql.SQL('DROP ROLE {}').format(sql.Identifier(role)))
args.report.write_text(json.dumps({'serverMajor':18,'scope':'PostgreSQL18 migration oracle plus fabricated mixed migration; no managed/private-consumer claim','assertions':checks,'count':len(checks),'planDigest':p['digest'],'phaseKinds':[phase['kind'] for phase in p['phases']],'publishedOracle':{'releaseTag':legacy_provenance['releaseTag'],'sha256sumsSha256':legacy_provenance['sha256sumsSha256'],'wheels':legacy_provenance['wheels'],'runtime':legacy_runtime,'codegenManifestSha256':legacy_runtime['codegenManifestSha256'],'codegenBundleSha256':legacy_runtime['codegenBundleSha256'],'history':'published initial and additive histories were recorded by published access and verified/replayed by current access','policy':'published compiler emitted a v0.1 policy-change plan; current fresh-effect admission refuses its unreviewed replay'}},indent=2)+'\n')
print(json.dumps({'passed':len(checks),'report':str(args.report)}))
