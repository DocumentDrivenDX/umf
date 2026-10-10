"""Fixed PostgreSQL text-key correspondence for original compiler handoffs.
Trusted fixture mapping only; no host authentication, policy lowering or full mapping.
"""
import copy,json,hashlib
class CompilerKeyCorrespondence:
 def __init__(self,artifact,type_homes,field_columns):
  self.artifact=copy.deepcopy(artifact);self.homes=copy.deepcopy(type_homes);self.fields=copy.deepcopy(field_columns)
 def valid(self,inventory):
  try:
   a=self.artifact;packet=a['handoff'];request=a['request'];document=json.loads(request['modules'][0]['documentJson'])
   if packet['version']!='weft.security.mapping-handoff/0.2.0' or packet['modelPins']!=[request['modules'][0]['pin']]:return False
   if hashlib.sha256(request['modules'][0]['documentJson'].encode()).hexdigest()!=packet['modelPins'][0]['sha256']:return False
   def ref(r):
    if set(r)!=set(['documentId','moduleId','elementId']) or r['documentId']!='domain' or r['moduleId']!='m':raise ValueError('Unsupported key identity')
    return r['elementId']
   elements={e['id']:e for e in document['modules'][0]['elements']}
   tables={(t['home']['catalog'],t['home']['schema'],t['home']['table']):t for t in inventory['tables']}
   if inventory['engine']!='170009' or len(tables)!=len(inventory['tables']) or not packet['scans']:return False
   for scan in packet['scans']:
    if not scan['actions']:return False
    for action in scan['actions']:
     if not action['keys']:return False
     for key in action['keys']:
      target=ref(key['target']);record=elements[target];semantic=next(k for k in record['keys'] if k['id']==key['keyId'])
      fields=[ref(f) for f in key['fields']]
      if fields!=[f['element'] for f in semantic['fields']] or not fields or len(set(fields))!=len(fields):return False
      columns=[self.fields[(target,field)] for field in fields]
      if len(set(columns))!=len(columns):return False
      table=tables[tuple(self.homes[target])];native={c['name']:c for c in table['columns']}
      if not any(k['primary'] and k['validated'] and k['columns']==columns for k in table['keys']):return False
      for field,column in zip(fields,columns):
       if elements[field].get('scalarType')!='string':return False
       c=native[column]
       if c['type']!='text' or not c['notNull'] or not c['deterministic']:return False
   return True
  except (KeyError,ValueError,TypeError,StopIteration):return False

class CompilerFactCorrespondence(CompilerKeyCorrespondence):
 """Required scalar fact/scan fields in the fixed text/boolean raw subset.
 No inference of issuer trust, scalar refinements, nullable/multivalue codecs or
 semantic attribute meaning from native type equality is admitted.
 """
 def valid(self,inventory):
  if not super().valid(inventory):return False
  try:
   packet=self.artifact['handoff'];document=json.loads(self.artifact['request']['modules'][0]['documentJson'])
   elements={e['id']:e for e in document['modules'][0]['elements']}
   tables={(t['home']['catalog'],t['home']['schema'],t['home']['table']):t for t in inventory['tables']}
   def ref(r):
    if set(r)!=set(['documentId','moduleId','elementId']) or r['documentId']!='domain' or r['moduleId']!='m':raise ValueError('Unsupported fact identity')
    return r['elementId']
   def field(target,reference):
    name=ref(reference);semantic=elements[name]
    if semantic.get('kind')!='field' or semantic.get('cardinality')!='one' or semantic.get('nullability')!='required' or semantic.get('facets',{}) or semantic.get('extensions',{}):return False
    expected={'string':'text','boolean':'boolean'}.get(semantic.get('scalarType'))
    if expected is None:return False
    table=tables[tuple(self.homes[target])];native=next(c for c in table['columns'] if c['name']==self.fields[(target,name)])
    return native['type']==expected and native['notNull'] and (expected!='text' or native['deterministic'])
   for scan in packet['scans']:
    target=ref(scan['target'])
    if any(not field(target,r) for r in [*scan['projectionFields'],*scan['queryFields']]):return False
    for action in scan['actions']:
     if action['context']:return False # An explicit host context provider is required.
     for group in action['fields']:
      if any(not field(ref(group['target']),r) for r in group['fields']):return False
   return True
  except (KeyError,ValueError,TypeError,StopIteration):return False
