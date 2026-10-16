import pathlib,hashlib,json,shutil,sys,os,unittest,io
base=pathlib.Path('/private/tmp/truss-main-integration-20261010');out=pathlib.Path('/private/tmp/truss-external-protection-facade-20261015');out.mkdir(exist_ok=False);tree=out/'original';pins={}
for root in ['packages/python/src','packages/python/tests','packages/postgresql']:
 for p in sorted((base/root).rglob('*')):
  if p.is_file() and '__pycache__' not in p.parts and p.suffix not in ['.pyc','.so']:
   rel=p.relative_to(base);q=tree/rel;q.parent.mkdir(parents=True,exist_ok=True);data=p.read_bytes();q.write_bytes(data);pins[str(rel)]=hashlib.sha256(data).hexdigest()
rel=pathlib.Path('docs/helix/02-design/contracts/bindings/acceptance-input-capacity-v0.1.fixture.json');(tree/rel).parent.mkdir(parents=True,exist_ok=True);shutil.copy2(base/rel,tree/rel)
(out/'snapshot-pins.json').write_text(json.dumps(pins,indent=2)+'\n');sys.path[:0]=['/private/tmp/truss-current-query-root-replay-20261015/original-weft',str(tree/'packages/python/src'),str(tree/'packages/python/tests')];os.environ['TRUSS_BUN_EXECUTABLE']='/opt/homebrew/bin/bun'
import test_current_query_runtime_native as original
actual=original.activate_current_query_protection_in_transaction;observations={}
class Probe(original.CurrentQueryRuntimeNativeTests):
 def create_query_graph(self,**kw):
  def with_existing_wrapper(host,transaction,**args):
   self.admin.execute("CREATE FUNCTION public.preexisting_raw_resource() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS 'SELECT coalesce(jsonb_agg(props), ''[]''::jsonb) FROM truss.object'")
   owner=self.admin.execute('SELECT owner_oid::regrole::text FROM truss.catalog_runtime_installation WHERE singleton').fetchone()[0]
   from psycopg import sql
   self.admin.execute(sql.SQL('ALTER FUNCTION public.preexisting_raw_resource() OWNER TO {}').format(sql.Identifier(owner)))
   answer=actual(host,transaction,**args);observations['activationOutcome']=repr(answer);return answer
  original.activate_current_query_protection_in_transaction=with_existing_wrapper
  try:return super().create_query_graph(**kw)
  finally:original.activate_current_query_protection_in_transaction=actual
 def test_external(self):
  original.CurrentQueryRuntimeNativeTests.test_public_masked_projection_with_authorized_exact_raw_predicate(self)
  c,h,a,t=self.consumer();observations['ordinaryRawTableSelect']=c.execute("SELECT has_table_privilege('truss.object','SELECT')").fetchone()[0]
  observations['externalWrapperRows']=c.execute('SELECT public.preexisting_raw_resource()').fetchone()[0]
stream=io.StringIO();result=unittest.TextTestRunner(stream=stream,verbosity=2).run(unittest.TestSuite([Probe('test_external')]))
(out/'unittest.log').write_text(stream.getvalue());observations.update({'passed':result.wasSuccessful(),'originalRuntimeStopped':Probe.runtime._server is None,'leaseReleased':Probe.runtime._lease is None,'testDirectoryAbsent':not Probe.root.exists(),'scope':'Uncommitted owner working snapshot, test-only pre-existing outside-schema SECURITY DEFINER wrapper, not post-activation hostile DDL or a released security claim. Fresh owned DB.'});(out/'receipt.json').write_text(json.dumps(observations,indent=2)+'\n');print(json.dumps(observations));assert result.wasSuccessful(),stream.getvalue()
