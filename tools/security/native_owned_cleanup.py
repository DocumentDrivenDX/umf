"""Owned Docker cleanup observation; never claims an unobserved completion."""
def cleanup_owned(command,name,run_id,attempted):
 result={'attempted':attempted,'ownedLabelVerified':False,'removed':False,'verified':not attempted}
 if not attempted:return result
 def absent(response):return response.returncode!=0 and response.stdout.strip()=='[]' and response.stderr.lower().strip().endswith('no such object: '+name)
 try:
  inspected=command(['docker','inspect',name,'--format','{{ index .Config.Labels "umf.security.run" }}'])
  result['inspectExitCode']=inspected.returncode
  if inspected.returncode:
   result['verified']=absent(inspected);result['absentAfterRemoval']=result['verified'];result['outcome']='already-absent' if result['verified'] else 'inspection-unknown';return result
  if inspected.stdout.strip()!=run_id:result['outcome']='ownership-mismatch';return result
  result['ownedLabelVerified']=True;removed=command(['docker','rm','-f',name]);result['removeExitCode']=removed.returncode
  if removed.returncode:result['outcome']='removal-failed';return result
  result['removed']=True;after=command(['docker','inspect',name]);result.update(postRemoveExitCode=after.returncode,postRemoveStdout=after.stdout,postRemoveStderr=after.stderr,absentAfterRemoval=absent(after),verified=absent(after));result['outcome']='removed-and-absent' if result['verified'] else 'post-removal-unknown'
 except Exception as error:result['outcome']='transport-unknown';result['errorType']=type(error).__name__
 return result

def finalize_status(result,cleanup):
 work=result['status'];result['workStatus']=work;result['cleanup']=cleanup
 if work=='current-native-refusal-component-passed' and not cleanup['verified']:result['status']='native-passed-cleanup-unverified'
 return result
