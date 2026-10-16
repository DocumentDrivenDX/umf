"""Actual alternative-entrypoint probe on the frozen public-query fixture."""
import pathlib,sys,os,unittest,json,io,hashlib
root=pathlib.Path('/private/tmp/truss-current-query-root-replay-20261015');tree=root/'original';sys.path[:0]=[str(root/'original-weft'),str(tree/'packages/python/src'),str(tree/'packages/python/tests')];os.environ['TRUSS_BUN_EXECUTABLE']='/opt/homebrew/bin/bun'
import test_current_query_runtime_native as original
from truss import Ok
from truss.query import QueryRows
observations={}
class LegacyProbe(original.CurrentQueryRuntimeNativeTests):
 def test_public_masked_projection_with_authorized_exact_raw_predicate(self):
  original.CurrentQueryRuntimeNativeTests.test_public_masked_projection_with_authorized_exact_raw_predicate(self)
  c,h,a,t=self.consumer()
  from truss.catalog_runtime import _release
  manifest,digest,_=_release()
  raw=c.execute('SELECT truss.query_binding(%s::pg_catalog.jsonb,%s,%s,%s,%s,%s)',(json.dumps(['domain']),10000,10000,16777216,manifest['releaseId'],digest)).fetchone()[0]
  bundle=json.loads(bytes(raw));resource=next(r for r in bundle['binding']['records'] if r['identity']['element']=='Resource')
  rows=c.execute('SELECT * FROM truss.query_objects(%s::pg_catalog.jsonb,%s)',(bundle['bindingJson'],int(resource['typeId']))).fetchall()
  observations['alternativeNativeApi']='truss.query_binding + truss.query_objects';observations['ordinaryRows']=rows

stream=io.StringIO();result=unittest.TextTestRunner(stream=stream,verbosity=2).run(unittest.TestSuite([LegacyProbe('test_public_masked_projection_with_authorized_exact_raw_predicate')]))
assert result.wasSuccessful(),stream.getvalue();assert LegacyProbe.runtime._server is None and LegacyProbe.runtime._lease is None and not LegacyProbe.root.exists()
observations.update({'sourceCommit':'9a495c2351776f6d06c2d02345139ec025213cb4','scope':'Frozen fixture public current query passes first, then same ordinary actor invokes granted native query facades. Does not claim globally active policy because current source registration may be intentionally opt-in.','originalNativeAssertionsPassed':True,'runtimeStopped':True,'leaseReleased':True,'testDirectoryAbsent':True,'probeSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()})
pathlib.Path('/private/tmp/truss-current-query-native-facade-probe-20261015.json').write_text(json.dumps(observations,indent=2)+'\n');pathlib.Path('/private/tmp/truss-current-query-native-facade-probe-20261015.log').write_text(stream.getvalue());print(json.dumps(observations))
