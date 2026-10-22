"""Native stable-cut completeness witness; no authenticated production issuer.
The host must independently attest the complete source cut. Neither SQL row
counts nor a caller-supplied 'complete' flag can supply that attestation. Future
legitimate authority changes require a newly qualified source cut and lifecycle
coordination; this frozen fixture does not implement those transitions.
"""
import json
SOURCE_SQL="""SELECT json_build_object(
 'employee',(SELECT coalesce(json_agg(json_build_array(id,native_login) ORDER BY id),'[]'::json) FROM security_raw.employee),
 'project',(SELECT coalesce(json_agg(json_build_array(id) ORDER BY id),'[]'::json) FROM security_raw.project),
 'resource',(SELECT coalesce(json_agg(json_build_array(id) ORDER BY id),'[]'::json) FROM security_raw.resource),
 'assignment',(SELECT coalesce(json_agg(json_build_array(employee_id,project_id,active) ORDER BY employee_id,project_id),'[]'::json) FROM security_raw.m2m_employee_project),
 'ownership',(SELECT coalesce(json_agg(json_build_array(resource_id,project_id) ORDER BY resource_id,project_id),'[]'::json) FROM security_raw.m2m_resource_project)
);"""
def canonical(value):
 encoded=json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False)
 if len(encoded)>16000000:raise ValueError('Authority cut bound exceeded')
 return encoded
class StableCutAuthorityAdmission:
 """Host pins exact complete required facts by value, not merely their counts.
 Provider and buffered operation require the same externally guarded stable cut.
 Source bytes/revisions/hashes are custody evidence, never native credentials.
 """
 def __init__(self,source_cut):self.__expected=canonical(source_cut)
 def read(self,current_facts,operation):
  try:
   if canonical(current_facts())!=self.__expected:return {'status':'refused','rows':[]}
   buffered=json.loads(canonical(operation()))
   return {'status':'admitted','rows':buffered}
  except Exception:return {'status':'refused','rows':[]}
