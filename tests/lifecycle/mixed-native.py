import argparse,hashlib,json
from pathlib import Path
import psycopg
from psycopg import sql
from umf_codegen import compile_table_deployment,compile_table_migration
from umf_access.lifecycle import apply_table_migration,apply_mixed_migration,CatalogError,inspect_table_history,verify_native_catalog
import umf_access.lifecycle.mixed as mixed
import umf_access.lifecycle.seeds as seeds
parser=argparse.ArgumentParser()
parser.add_argument('--dsn',default='dbname=postgres')
parser.add_argument('--report',type=Path,required=True)
args=parser.parse_args()
checks=[]
def record(name):checks.append(name)
f=Path('fixtures/table-lifecycle/legal'); pfx='u1x_'+hashlib.sha1(str(__import__('time').time()).encode()).hexdigest()[:10]+'_'
cfg={'module':'legal_lifecycle','schema':pfx+'schema','ownerRole':pfx+'owner','personRole':pfx+'person','batchRole':pfx+'batch','groupRoles':{'billing_admin':pfx+'billing'}}
alice,bob=pfx+'alice',pfx+'bob'; roles=[cfg['ownerRole'],cfg['personRole'],cfg['batchRole'],cfg['groupRoles']['billing_admin'],alice,bob]
def source(n):return json.loads((f/n).read_text())
def bundle(d):
 r=compile_table_deployment(json.dumps(d,separators=(',',':')),configuration=cfg);assert r['status']=='compiled',r;return r['bundle']
a=bundle(source('initial.json')); old=compile_table_migration(migration_id='base',previous_bundle=None,next_bundle=a,predecessor=None)['plan']
target=source('indexed.json'); target['modules'][0]['extensions']['umf.tables']['seedSets'].append({'id':'mixed-once','conflict':'error','rows':[{'table':'clients','values':[{'field':{'module':'legal_lifecycle','element':'clients__client_id'},'value':{'integerToken':'777'}},{'field':{'module':'legal_lifecycle','element':'clients__client_name'},'value':{'string':'Once only'}}]}]})
z=bundle(target)
o=json.loads((f/'evolution-options.json').read_text());o.update(version='umf.table-migration-options/0.2',concurrentIndexes=json.loads((f/'index-options.json').read_text())['concurrentIndexes'],reviewedChanges=[],validations=[{'table':'matters','constraint':'positive_id','kind':'check'},{'table':'matters','constraint':'fk_0','kind':'foreignKey'}])
r=compile_table_migration(migration_id='mixed',previous_bundle=a,next_bundle=z,predecessor={'id':'base','digest':old['digest']},options=o);assert r['status']=='compiled',r;p=r['plan'];assert p['phases'][-1]['kind']=='seed'
file='d'*64
with psycopg.connect(args.dsn,autocommit=True) as c:
 made=[]
 try:
  for role in roles:c.execute(sql.SQL('CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION').format(sql.Identifier(role)));made.append(role)
  for person in (alice,bob):c.execute(sql.SQL('GRANT {} TO {} WITH INHERIT TRUE,SET FALSE').format(sql.Identifier(cfg['personRole']),sql.Identifier(person)))
  c.execute(sql.SQL('CREATE SCHEMA {} AUTHORIZATION {}').format(sql.Identifier(cfg['schema']),sql.Identifier(cfg['ownerRole'])))
  c.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(cfg['ownerRole'])));c.execute('SET search_path=pg_catalog')
  with c.transaction(): base=apply_table_migration(c,old,approved_digest=old['digest'],expected_head=None,person_roles=(alice,bob))
  try:apply_mixed_migration(c,p,approved_digest=p['digest'],expected_head=base['headDigest'],person_roles=(alice,bob),file_digest='g'*64)
  except CatalogError as e:assert str(e)=='migration-file-digest-conflict',e
  else:raise AssertionError('malformed file digest admitted')
  assert c.execute(sql.SQL('SELECT to_regclass(%s)',),(cfg['schema']+'.umf_lifecycle_progress',)).fetchone()==(None,)
  record('malformed-digest-refuses-before-fence')
  # First effect creates only the nullable column. A new user trigger and external
  # role authority must be rejected before the following Weft backfill executes.
  staged=apply_mixed_migration(c,p,approved_digest=p['digest'],expected_head=base['headDigest'],person_roles=(alice,bob),file_digest=file,stop_after_phase=1);assert staged['status']=='in-progress'
  c.execute(sql.SQL('CREATE FUNCTION {}.u1_noop() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$').format(sql.Identifier(cfg['schema'])))
  c.execute(sql.SQL('CREATE TRIGGER u1_noop BEFORE UPDATE ON {}.matters FOR EACH ROW EXECUTE FUNCTION {}.u1_noop()').format(sql.Identifier(cfg['schema']),sql.Identifier(cfg['schema'])))
  try:apply_mixed_migration(c,p,approved_digest=p['digest'],expected_head=base['headDigest'],person_roles=(alice,bob),file_digest=file)
  except CatalogError as e:assert str(e)=='phase-table-boundary-mismatch',e
  else:raise AssertionError('trigger tamper admitted')
  record('trigger-drift-refuses-before-backfill')
  c.execute(sql.SQL('DROP TRIGGER u1_noop ON {}.matters').format(sql.Identifier(cfg['schema'])));c.execute(sql.SQL('DROP FUNCTION {}.u1_noop()').format(sql.Identifier(cfg['schema'])))
  c.execute('RESET ROLE');c.execute('GRANT CREATE ON SCHEMA public TO '+sql.Identifier(cfg['ownerRole']).as_string(c));c.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(cfg['ownerRole'])))
  try:apply_mixed_migration(c,p,approved_digest=p['digest'],expected_head=base['headDigest'],person_roles=(alice,bob),file_digest=file)
  except CatalogError as e:assert str(e)=='phase-external-authority-present',e
  else:raise AssertionError('role authority tamper admitted')
  record('external-role-authority-refuses-before-backfill')
  c.execute('RESET ROLE');c.execute('REVOKE CREATE ON SCHEMA public FROM '+sql.Identifier(cfg['ownerRole']).as_string(c));c.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(cfg['ownerRole'])))
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
  finally:mixed._run_required_phase=orig
 finally:
  c.execute('RESET ROLE');c.execute('RESET search_path');c.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(cfg['schema'])))
  for role in reversed(made):c.execute(sql.SQL('DROP ROLE {}').format(sql.Identifier(role)))
args.report.write_text(json.dumps({'serverMajor':18,'scope':'local fabricated PostgreSQL18 mixed migration; no managed/private-consumer or release claim','assertions':checks,'count':len(checks),'planDigest':p['digest'],'phaseKinds':[phase['kind'] for phase in p['phases']]},indent=2)+'\n')
print(json.dumps({'passed':len(checks),'report':str(args.report)}))
