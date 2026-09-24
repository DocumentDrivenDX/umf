"""Delta-rs schema parsing probe; table/protocol validity is a separate question."""
import copy,json,hashlib
from pathlib import Path
import deltalake
from deltalake import Schema
assert deltalake.__version__=='1.6.4'
base=Path('fixtures/delta');cases=[]
def field(kind,metadata=None):return {'name':'value','type':kind,'nullable':True,'metadata':metadata or {}}
def add(id,fields=None,**extras):cases.append({'id':id,'input':{'type':'struct','fields':fields or [field('string')],**extras}})
for kind in ['string','long','integer','short','byte','float','double','boolean','binary','date','timestamp','timestamp_ntz','void','variant','decimal(10,2)','decimal(38,18)','decimal(39,0)','decimal(10,-2)','char(5)','interval day to second','future_type']:
 add('type-'+str(len(cases)),[field(kind)])
for id,kind in [('variant-object',{'type':'variant'}),('array',{'type':'array','elementType':'string','containsNull':False}),('map',{'type':'map','keyType':'string','valueType':'long','valueContainsNull':False}),('nested',{'type':'struct','fields':[field('integer')]}),('future-object',{'type':'future','settings':{'x':1}})]:add(id,[field(kind)])
add('column-mapping',[field('long',{'delta.columnMapping.id':1,'delta.columnMapping.physicalName':'col-abcd'})])
add('identity',[field('long',{'delta.identity.start':1,'delta.identity.step':1,'delta.identity.highWaterMark':9223372036854775807,'delta.identity.allowExplicitInsert':False})])
add('invariant',[field('long',{'delta.invariants':json.dumps({'expression':{'expression':'value > 0'}})})])
add('generated',[field('long',{'delta.generationExpression':'other + 1','CURRENT_DEFAULT':'42','EXISTS_DEFAULT':'42'})])
add('metadata-unknown',[field('string',{'future':{'nested':[1,True,None]},'large':9223372036854775808})])
add('unknown-root',future={'meaning':True})
f=field('string');f['future']={'meaning':True};add('unknown-field',[f])
add('duplicate',[field('string'),field('long')]);f=field('long');f['name']='VALUE';add('case-duplicate',[field('string'),f])
add('missing-field-defaults',[{'name':'value','type':'string'}])
add('array-missing-nullability',[field({'type':'array','elementType':'string'})])
add('map-missing-nullability',[field({'type':'map','keyType':'string','valueType':'long'})])
protocol=Path('native/delta/sources/PROTOCOL.md').read_text();example=protocol.split('JSON Encoded Table Schema:')[1].split('```')[1].strip();cases.append({'id':'protocol-example','input':json.loads(example)})
rows=[]
for c in cases:
 text=json.dumps(c['input'],separators=(',',':'));(base/(c['id']+'.json')).write_text(text);row={'id':c['id'],'inputSha256':hashlib.sha256(text.encode()).hexdigest()}
 try:
  parsed=Schema.from_json(text);out=json.loads(parsed.to_json());row.update(status='accepted',output=out,sourceEqual=out==c['input'])
  try:row['arrowDescription']=str(parsed.to_arrow())
  except Exception as e:row['arrowError']=str(e)
  try:row['invariants']=parsed.invariants
  except Exception as e:row['invariantsError']=str(e)
 except Exception as e:row.update(status='rejected',errorType=type(e).__name__,message=str(e))
 rows.append(row)
report={'runtime':'deltalake '+deltalake.__version__,'cases':len(cases),'accepted':sum(r['status']=='accepted' for r in rows),'changed':[r['id'] for r in rows if r.get('sourceEqual') is False],'results':rows}
assert report['cases']==39 and report['accepted']==29
assert report['changed']==['unknown-root','unknown-field','map-missing-nullability']
(base/'cases.json').write_text(json.dumps(cases,indent=2)+'\n');(base/'capability-results.json').write_text(json.dumps(report,indent=2)+'\n');print({k:v for k,v in report.items() if k!='results'});print([(r['id'],r['status']) for r in rows])
