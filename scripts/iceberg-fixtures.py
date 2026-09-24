import json,copy
from pathlib import Path
from pyiceberg.schema import Schema
base=Path('fixtures/iceberg');base.mkdir(parents=True,exist_ok=True);cases=[]
def field(id,name,type,required=True,**extra):return dict(id=id,name=name,type=type,required=required,**extra)
def emit(id,fields,valid=True,**extra):
 value={'type':'struct','schema-id':0,'fields':fields,**extra};raw=json.dumps(value,ensure_ascii=False,separators=(',',':'));(base/(id+'.json')).write_text(raw+'\n');c={'id':id,'path':str(base/(id+'.json')),'umfValid':valid}
 try:s=Schema.model_validate_json(raw);c.update(nativeAccepted=True,nativeOutput=s.model_dump_json(by_alias=True))
 except Exception as e:c.update(nativeAccepted=False,nativeError=str(e))
 cases.append(c)
for t in ['boolean','int','long','float','double','date','time','timestamp','timestamptz','timestamp_ns','timestamptz_ns','string','uuid','binary','fixed[16]','decimal(38, 9)','unknown','variant','geometry(srid:4326)','geography(srid:4326,spherical)','future_scalar']:
 emit('type-'+str(len(cases)),[field(1,'value',t)])
emit('nested',[field(1,'id','long'),field(2,'record',{'type':'struct','fields':[field(3,'a.b','string')]}),field(4,'list',{'type':'list','element-id':5,'element-required':False,'element':{'type':'struct','fields':[field(6,'nested','decimal(20,2)')]}}),field(7,'map',{'type':'map','key-id':8,'key':'string','value-id':9,'value-required':True,'value':'uuid'})],**{'identifier-field-ids':[1,3]})
emit('exact-defaults',[field(1,'__proto__','long',**{'initial-default':9223372036854775807,'write-default':-9223372036854775808,'future':{'n':9007199254740993}})],**{'future-root':True})
emit('future-object',[field(1,'future',{'type':'future_type','shape':[1,2,3]})])
emit('duplicate-id',[field(1,'a','int'),field(1,'b','string')],False)
emit('duplicate-name',[field(1,'a','int'),field(2,'a','string')],False)
emit('collection-id-collision',[field(1,'list',{'type':'list','element-id':1,'element-required':True,'element':'string'})],False)
emit('optional-identifier',[field(1,'id','long',False)],False,**{'identifier-field-ids':[1]})
emit('nested-optional-identifier',[field(1,'parent',{'type':'struct','fields':[field(2,'id','string')]},False)],False,**{'identifier-field-ids':[2]})
emit('float-identifier',[field(1,'id','float')],False,**{'identifier-field-ids':[1]})
emit('missing-identifier',[field(1,'id','string')],False,**{'identifier-field-ids':[8]})
emit('decimal-range',[field(1,'amount','decimal(39,0)')],False)
emit('missing-required',[{'id':1,'name':'id','type':'long'}],False)
emit('zero-id',[field(0,'zero','string')])
emit('negative-id',[field(-1,'negative','string')],**{'schema-id':-1})
(base/'manifest.json').write_text(json.dumps({'runtime':'PyIceberg 0.11.0','cases':cases},indent=2)+'\n');print({'cases':len(cases),'nativeAccepted':sum(c['nativeAccepted'] for c in cases)})
