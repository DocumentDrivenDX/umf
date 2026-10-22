import unittest,subprocess
from native_owned_cleanup import cleanup_owned,finalize_status
class CleanupTests(unittest.TestCase):
 def command(self,replies):
  calls=[]
  def run(args):
   calls.append(args);r=replies.pop(0)
   if isinstance(r,Exception):raise r
   return subprocess.CompletedProcess(args,*r)
  return run,calls
 def test_complete_and_already_absent(self):
  for replies in [[(0,'run\n',''),(0,'name\n',''),(1,'[]\n','error: no such object: name\n')],[(1,'[]\n','Error: No such object: name\n')]]:
   run,calls=self.command(replies);c=cleanup_owned(run,'name','run',True);self.assertTrue(c['verified']);self.assertEqual(finalize_status({'status':'current-native-refusal-component-passed'},c)['status'],'current-native-refusal-component-passed')
 def test_unknown_and_foreign_never_green(self):
  for replies in [[(0,'foreign\n','')],[(1,'','daemon unavailable')],[(0,'run',''),(1,'','remove failed')],[(0,'run',''),(0,'name',''),(1,'[]','no such object: other')],[(0,'run',''),(0,'name',''),(1,'[]','no such object: name-other')],[TimeoutError()]]:
   run,calls=self.command(replies);c=cleanup_owned(run,'name','run',True);self.assertFalse(c['verified']);r=finalize_status({'status':'current-native-refusal-component-passed'},c);self.assertEqual(r['status'],'native-passed-cleanup-unverified');self.assertEqual(r['workStatus'],'current-native-refusal-component-passed')
   if c['outcome'] in ['ownership-mismatch','inspection-unknown','transport-unknown']:self.assertFalse(any('rm' in command for command in calls))
 def test_primary_failure_survives_cleanup_failure(self):
  run,calls=self.command([TimeoutError()]);c=cleanup_owned(run,'name','run',True);r=finalize_status({'status':'incomplete','failure':{'type':'OriginalFailure'}},c);self.assertEqual(r['status'],'incomplete');self.assertEqual(r['failure']['type'],'OriginalFailure')
 def test_no_creation_means_no_cleanup_calls(self):
  run,calls=self.command([]);self.assertTrue(cleanup_owned(run,'name','run',False)['verified']);self.assertEqual(calls,[])
if __name__=='__main__':unittest.main()
