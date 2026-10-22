"""Independent authored catalog and native typed-cell oracle; no UMF imports."""
import hashlib,re
from fractions import Fraction
REF=lambda n:dict(documentId='pg18-protection',moduleId='m',elementId=n)
ACTORS={'umf_sec_alice':['RA','RAB'],'umf_sec_bob':['RAB','RB'],'umf_sec_outsider':[]}
ROWS=[dict(id='RA',text="😀A'123\\e\u0301",integer='9007199254740993',decimal='-0.0032',day='2000-02-29'),dict(id='RAB',text=None,integer=None,decimal=None,day=None),dict(id='RB',text='',integer='-8',decimal='0.0003',day='9999-12-31'),dict(id='RD',text='private999',integer='9',decimal='-1.0000',day='0001-01-01'),dict(id='RO',text='ownerless123',integer='0',decimal='0',day='2024-04-03')]
RECIPES=[('constant','mask','constant',dict(value="fixed'\\😀"),'string'),('null_out','mask','null-out',{},'string'),('partial','mask','partial',dict(prefix=1,suffix=2,padding='■',unit='unicode-scalar'),'string'),('fixed','mask','fixed-length-redact',dict(length=4,padding='😀',unit='unicode-scalar'),'string'),('regex','mask','regex-replace',dict(pattern='[0-9]+',replacement=r"\1'😀",provider='umf.security.pg18-literal-regex/0.1'),'string'),('prefix','generalize','prefix-only',dict(length=3,unit='unicode-scalar'),'string'),('integer_bucket','generalize','range-bucket',dict(width='10',origin='3'),'integer'),('decimal_bucket','generalize','range-bucket',dict(width='0.0007',origin='-0.0031'),'decimal'),*[(f'date_{unit}','generalize','truncate-date',dict(calendar='umf-gregorian-date/1.0.0',unit=unit),'date') for unit in ['year','quarter','month','day']],('hash','hash',None,dict(dictionaryWarning='unsalted-dictionary-attack'),'string')]
def field(name,family,nullable=True,output=False):
 facets=dict(length=dict(min=0,max=512 if output else 64,unit='unicode-scalar')) if family=='string' else dict(integerWidth=dict(bits=256 if output else 128,signed=True)) if family=='integer' else dict(precision=42 if output else 40,scale=4) if family=='decimal' else {}
 return dict(id=name,kind='field',scalarType=family,cardinality='one',nullability='absent-allowed' if nullable else 'required',facets=facets,extensions={})
def fixture():
 elements=[field('resource_id','string',False)];transforms=[];bindings=[];inputs=[]
 for name,kind,function,params,family in RECIPES:
  incoming='input_'+name;outgoing='output_'+name;elements.extend([field(incoming,family),field(outgoing,family,output=True)]);inputs.append(incoming)
  parameters=[]
  for p,value in params.items():
   pf='param_'+name+'_'+p;typ=family if name in ['integer_bucket','decimal_bucket'] else 'integer' if type(value) is int else 'string'
   elements.append(field(pf,typ,False));literal={'integerToken':str(value)} if typ=='integer' else {'decimalToken':str(value)} if typ=='decimal' else {'string':value};parameters.append(dict(name=p,field=REF(pf),value=literal))
  transform=dict(id=name,version='1',kind=kind,inputDomain=REF(incoming),outputDomain=REF(outgoing),determinism='deterministic',reversibility='none',disclosureProfile=['equality'] if kind=='hash' else [],queryUse={k:'disclosed' for k in ['predicate','order','group','join','aggregate']},parameters=parameters)
  if function:transform['function']=function
  if kind=='hash':transform.update(algorithm='sha256-utf8-lowerhex',saltCustody=dict(kind='none'))
  transforms.append(transform);bindings.append(dict(transform=dict(id=name,version='1'),column=incoming,outputColumn=name))
 elements.append(dict(id='Resource',kind='record',members=[dict(module='m',element=n) for n in ['resource_id',*inputs]],keys=[dict(id='pk',name='Primary',fields=[dict(module='m',element='resource_id')])],extensions={}))
 document=dict(umf='0.10.0',id='pg18-protection',vocabularies={},modules=[dict(id='m',namespace='',elements=elements)])
 return dict(catalog=dict(vocabulary='umf.security.protection',version='0.1.0',id='pg18-catalog',revision='c1',transforms=transforms,native=dict(archive='opaque retained\r\n😀')),closure=dict(pins=[dict(documentId=document['id'],revision='d1')],documents=[dict(revision='d1',document=document)]),profile=dict(version='umf.security.pg18-catalog-projection/0.1',catalog=dict(id='pg18-catalog',revision='c1'),source=dict(schema='security_projection',table='resource',view='disclosed'),resource=dict(type=REF('Resource'),keyField=REF('resource_id'),keyColumn='id'),bindings=bindings))
def scalar(row,family,name=None):return row.get('fields',{}).get(name,row[{'string':'text','integer':'integer','decimal':'decimal','date':'day'}[family]])
def expected_value(row,name,kind,function,params,family):
 value=scalar(row,family,name)
 if name=='constant':value=params['value']
 elif name=='null_out':value=None
 elif value is None:pass
 elif name=='partial':
  a=params['prefix'];b=min(params['suffix'],max(0,len(value)-a));value=value[:a]+params['padding']*max(0,len(value)-min(a,len(value))-b)+(value[-b:] if b else '')
 elif name=='fixed':value=params['padding']*params['length']
 elif name=='regex':value=re.sub(params['pattern'],lambda match:params['replacement'],value)
 elif name=='prefix':value=value[:params['length']]
 elif name.endswith('_bucket'):
  w,o,x=Fraction(params['width']),Fraction(params['origin']),Fraction(value);coefficient=(o+((x-o)//w)*w)*(10000 if family=='decimal' else 1);assert coefficient.denominator==1;value=str(coefficient.numerator)+('e-4' if family=='decimal' else '')
 elif kind=='hash':value=hashlib.sha256(value.encode()).hexdigest()
 elif family=='date':
  y,m,d=map(int,value.split('-'));unit=params['unit'];m=1 if unit=='year' else ((m-1)//3)*3+1 if unit=='quarter' else m;d=d if unit=='day' else 1;value=f'{y:04d}-{m:02d}-{d:02d}'
 else:raise AssertionError(name)
 return None if value is None else {{'string':'string','integer':'integerToken','decimal':'decimalToken','date':'date'}[family]:value}
def expected_rows(actor,source_rows=ROWS):
 rows=[]
 for row in sorted(source_rows,key=lambda r:r['id']):
  if row['id'] not in ACTORS[actor]:continue
  result={'id':row['id']}
  for name,kind,function,params,family in RECIPES:
   result[name]=dict(field=REF('input_'+name),disposition='transformed',outputDomain=REF('output_'+name),transform=dict(vocabulary='umf.security.protection',catalog='pg18-catalog',catalogRevision='c1',id=name,version='1'),storageEffect='canonical',bindingStorageEffect='disclosed-only',valueProfile='umf-gregorian-date/1.0.0' if family=='date' else 'exact-coefficient-scale/0.1' if family=='decimal' else 'core-literal/0.8',value=expected_value(row,name,kind,function,params,family))
  rows.append(result)
 return rows

def rounds():
 import copy
 base=copy.deepcopy(ROWS);edges=copy.deepcopy(ROWS);boundary=copy.deepcopy(ROWS)
 for row in edges:
  if row['id']=='RA':row.update(text='\n'*64,integer=str(-(2**127)),decimal='-'+('9'*36)+'.9999',day='0001-01-01')
  if row['id']=='RB':row.update(text='😀'*64,integer=str(2**127-1),decimal=('9'*36)+'.9999',day='9999-12-31')
 for row in boundary:
  if row['id']=='RA':row.update(text='123a123',integer='2',decimal='-0.0031',day='2024-04-30')
  if row['id']=='RB':row.update(text=None,integer='13',decimal='-0.0030',day='2024-07-01')
 distinct=copy.deepcopy(ROWS)
 for row in distinct:
  text=row['text'] or '';row['fields']={name:name.upper()+':'+row['id']+':'+text[:40] for name,_,_,_,family in RECIPES if family=='string'}
  row['fields'].update(date_year='2000-12-31',date_quarter='2001-05-17',date_month='2002-08-19',date_day='2003-11-23')
 mixed=copy.deepcopy(distinct)
 # Unique null signatures across the three readable Resource IDs distinguish
 # even fixed-redact (which depends on nullness rather than the source text).
 for family in ['string','integer','decimal','date']:
  names=[name for name,_,_,_,f in RECIPES if f==family]
  assert len(names)<=8
  for row in mixed:
   if row['id'] not in ['RA','RB','RAB']:continue
   bit=['RA','RB','RAB'].index(row['id'])
   for index,name in enumerate(names):
    fallback={'string':name.upper()+':MIXED','integer':'7','decimal':'0.0012','date':'2024-05-17'}[family]
    row['fields'][name]=None if (index>>bit)&1 else scalar(row,family,name) or fallback
 return [('baseline',base),('domain-edges',edges),('bucket-date-boundaries',boundary),('distinct-field-carriers',distinct),('mixed-null-carriers',mixed)]
