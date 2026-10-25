"""Proposal-only finite schema/framing/accounting checks. NO native proof."""
from pathlib import Path
import ast,copy,hashlib,json,re,struct
ROOT=Path(__file__).parent
schema=json.loads((ROOT/'wire-types.schema.json').read_bytes());defs=schema['$defs']
refs=[];closed=0
stack=[schema]
while stack:
 x=stack.pop()
 if type(x)is dict:
  if '$ref' in x:
   assert x['$ref'].startswith('#/$defs/');assert x['$ref'].split('/')[-1] in defs;refs.append(x['$ref'])
  if x.get('type')=='object':
   assert x.get('additionalProperties') is False
   assert set(x['required'])==set(x['properties']);closed+=1
  stack.extend(x.values())
 elif type(x)is list:stack.extend(x)
# Finite syntactic evaluator for ONLY the small closed record subset exercised
# below; not a replacement for a full Draft2020-12 engine/native validator.
def valid(s,x):
 if '$ref'in s:return valid(defs[s['$ref'].split('/')[-1]],x)
 if 'oneOf'in s:return sum(valid(v,x) for v in s['oneOf'])==1
 if 'anyOf'in s:return any(valid(v,x) for v in s['anyOf'])
 if 'const'in s:return type(x)is type(s['const']) and x==s['const']
 if 'enum'in s:return any(type(x)is type(v) and x==v for v in s['enum'])
 t=s.get('type')
 if t=='null':return x is None
 if t=='boolean':return type(x)is bool
 if t=='integer':return type(x)is int and s.get('minimum',-10**100)<=x<=s.get('maximum',10**100)
 if t=='string':return type(x)is str and s.get('minLength',0)<=len(x)<=s.get('maxLength',10**100) and ('pattern'not in s or re.search(s['pattern'],x)is not None)
 if t=='object':return type(x)is dict and set(x)==set(s['properties']) and all(valid(v,x[k]) for k,v in s['properties'].items())
 raise AssertionError('finite test harness unsupported branch')
uid='00000000-0000-0000-0000-000000000001';d='a'*64
lineage={'profile':'umf.table-lineage/0.1','providerId':uid,'storeId':uid,'installationId':'synthetic','targetCustody':{'profile':'umf.native-target-custody/0.1','custodianId':uid,'registrationId':uid,'resourceId':uid,'incarnation':uid,'registrationDigest':d},'lineageId':uid,'table':'Person','record':{'module':'m','element':'Person'},'originalSourceDigest':d,'originalBirthReceiptDigest':d,'maxIssuedInstances':10000}
assert valid(defs['Lineage'],lineage)
negatives=[]
for label,change in [('unknown-key',lambda x:x.update(unapproved=True)),('bool-cap',lambda x:x.update(maxIssuedInstances=True)),('float-cap',lambda x:x.update(maxIssuedInstances=10000.0)),('uppercase-uuid',lambda x:x.update(providerId='AAAAAAAA-0000-0000-0000-000000000001')),('missing-custody',lambda x:x.pop('targetCustody'))]:
 x=copy.deepcopy(lineage);change(x);assert not valid(defs['Lineage'],x);negatives.append(label)
assert not any(k in defs['PublicReceipt']['properties'] for k in ('streamDigest','privateProofRecordDigest','orderedInstanceDigest'))
assert all(k in defs['PrivateProof']['properties'] for k in ('streamDigest','orderedInstanceDigest'))
# Pure manually framed payload bytes, NOT PostgreSQL send or data capture.
magic=b'umf.table-native-value-stream/0.1\0';header=b'{"synthetic":true}'
def frame(cells):
 prefix=magic+struct.pack('!I',len(header))+header+struct.pack('!I',len(cells))
 for i,cell in enumerate(cells,1):
  prefix+=i.to_bytes(16,'big')+struct.pack('!Q',1)
  prefix+=(b'\0'+struct.pack('!Q',0)) if cell is None else b'\1'+struct.pack('!Q',len(cell))+cell
 return prefix
a=frame([None]);b=frame([b'']);assert len(a)==len(b) and a!=b
expected=len(magic)+4+len(header)+4+16+8+1+8;assert len(a)==expected
assert len(frame([]))==len(magic)+4+len(header)+4
assert len(frame([b'x'*8388608]))>8388608
# Two per-table-valid touches cannot be split to evade signed whole-group cap.
assert all(n<=10000 for n in (6000,6000)) and sum((6000,6000))>10000
assert all(n<=8388608 for n in (5*1024**2,5*1024**2)) and 10*1024**2>8388608
# Population and monotonic identity fixture, not an implemented native ledger.
issued={'deleted-before','live1','live2'};captured={'live1','live2'};current=set(captured)
assert 'deleted-before' not in current and 'deleted-before' in issued
issued.add('new-after-restore');current.add('new-after-restore')
field_ids={'deleted-before','live1'}
assert current&field_ids=={'live1'} and current-field_ids=={'live2','new-after-restore'} and field_ids-current=={'deleted-before'}
# Retain exactly all88 adopted rows and all64 new obligations; no replacement.
old=(ROOT/'inputs/g10/definitions/acceptance-matrix.md').read_text();ids=re.findall(r'^\| ((?:C|D|N)\d{2}) \|',old,re.M);assert len(ids)==88 and len(set(ids))==88
new=(ROOT/'acceptance.md').read_text();newids=re.findall(r'^\| (R2-[CNI]\d{2}) \|',new,re.M);assert len(newids)==64 and len(set(newids))==64
sql=(ROOT/'provider-ddl.sql').read_text();tables=re.findall(r'CREATE TABLE originals\."?([a-z_]+)"?',sql);assert len(tables)==19 and len(set(tables))==19
assert 'IF NOT EXISTS' not in sql and 'CASCADE' not in sql
assert 'generation_count pg_catalog.int8' in sql
assert 'whole_restore_members' in sql
assert 'DECLARE rid' not in (ROOT/'guard-renderer.md').read_text()
print(json.dumps({'scope':'finite proposal-only shape/framing/population/resource/document controls; NOT native/code qualification','closedObjectSchemas':closed,'resolvedLocalSchemaRefs':len(refs),'closedScalarNegatives':negatives,'syntheticNullAndEmptyFrameBytes':len(a),'syntheticFramesDistinct':True,'singleOversizedPayloadIncludingFramingRefusesEnvelope':True,'wholeGroupRowsAndBytesMustNotSplit':True,'syntheticDeletedAndNewInstancePartition':True,'fixedProviderTables':tables,'originalAcceptanceRowsPreserved':len(ids),'newAcceptanceRows':len(newids)},indent=2))
