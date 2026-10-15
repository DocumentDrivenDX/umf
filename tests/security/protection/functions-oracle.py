#!/usr/bin/env python3
"""Independent expected values; no UMF implementation/fixtures imported.
Python Unicode scalars, fractions/Decimal, datetime.date. Refusal expectations
are authored contract obligations, not a competing core/domain interpreter."""
import copy, datetime as dt, hashlib, json, pathlib, sys
from decimal import Decimal
from fractions import Fraction
ROOT=pathlib.Path(__file__).resolve().parent
PROFILE='umf-gregorian-date/1.0.0'
CASES=[]
def field(s='string',nullable=False,**extra):
 return dict(kind='field',scalarType=s,cardinality='one',nullability='absent-allowed' if nullable else 'required',extensions={},**extra)
def lit(v,s='string'):return {dict(integer='integerToken',decimal='decimalToken',binary='binaryHex').get(s,s):v}
def param(n,v,s='string',domain=None):return dict(name=n,domain=domain or field(s),value=lit(v,s))
def count(n,v):return param(n,str(v),'integer')
def sparams(fn,**kw):
 names={'partial':['prefix','suffix'],'fixed-length-redact':['length'],'prefix-only':['length']}[fn]
 out=[count(n,kw[n]) for n in names]
 if fn!='prefix-only':out.append(param('padding',kw.get('padding','*')))
 return out+[param('unit','unicode-scalar')]
def number(token):return Fraction(Decimal(token))
def datevalue(token,unit):
 d=dt.date.fromisoformat(token)
 if unit=='year':d=d.replace(month=1,day=1)
 elif unit=='quarter':d=d.replace(month=(1,1,1,4,4,4,7,7,7,10,10,10)[d.month-1],day=1)
 elif unit=='month':d=d.replace(day=1)
 elif unit!='day':raise ValueError(unit)
 return d.isoformat()
def value(fn,x,params,out):
 p={r['name']:r['value'] for r in params}
 if fn=='constant':return copy.deepcopy(p['value'])
 if fn=='null-out' or x is None:return None
 if fn in ['partial','fixed-length-redact','prefix-only']:
  s=x['string']
  if fn=='partial':
   a=min(int(number(p['prefix']['integerToken'])),len(s));b=min(int(number(p['suffix']['integerToken'])),len(s)-a)
   result=s[:a]+p['padding']['string']*(len(s)-a-b)+(s[len(s)-b:] if b else '')
  elif fn=='fixed-length-redact':result=p['padding']['string']*int(number(p['length']['integerToken']))
  else:result=s[:int(number(p['length']['integerToken']))]
  return lit(result)
 if fn=='range-bucket':
  key='integerToken' if out['scalarType']=='integer' else 'decimalToken'
  n,w,o=number(x[key]),number(p['width'][key]),number(p['origin'][key])
  y=o+((n-o)//w)*w;scale=out.get('facets',{}).get('scale',0);coef=y*10**scale
  assert coef.denominator==1
  return {key:str(coef.numerator)+(f'e-{scale}' if scale else '')}
 if fn=='truncate-date':return lit(datevalue(x['date'],p['unit']['string']),'date')
 raise AssertionError(fn)
def yes(id,fn,x,params,ind=None,out=None):
 ind=copy.deepcopy(ind or field());out=copy.deepcopy(out or ind)
 c=dict(id=id,kind='generalize' if fn in ['prefix-only','range-bucket','truncate-date'] else 'mask',function=fn,
  inputDomain=ind,outputDomain=out,parameters=copy.deepcopy(params),input=copy.deepcopy(x),determinism='deterministic',reversibility='none')
 c['expected']={'status':'evaluated','value':value(fn,x,params,out)};CASES.append(c);return c
def no(id,base,reason,change=None):
 c=copy.deepcopy(base);c['id']=id;c['expected']={'status':'refused','reason':reason}
 if change:change(c)
 CASES.append(c);return c
def setp(c,n,v,domain=None):
 p=next(r for r in c['parameters'] if r['name']==n);p['value']=v
 if domain is not None:p['domain']=domain
def units(x):return len(json.dumps(x,ensure_ascii=False,separators=(',',':'),sort_keys=True).encode('utf-16-le','surrogatepass'))//2

# Constants retain original literal spelling and validate independent domains.
for i,(s,v) in enumerate([('string','visible'),('boolean',False),('integer','9007199254740993'),('integer','1e2'),('decimal','-0.00'),('decimal','123.4500'),('binary','00aB00')]):
 out=field(s,facets={'precision':24,'scale':4}) if s=='decimal' else field(s)
 yes(f'constant-family-{i}','constant',lit('original'),[param('value',v,s,out)],out=out)
const=CASES[0]
yes('constant-null-input-not-propagated','constant',None,[param('value','visible')],field(nullable=True),field())
p=param('value','unused',domain=field(nullable=True));p['value']=None
yes('constant-explicit-null','constant',lit('original'),[p],out=field(nullable=True))
no('constant-wrong-output-family',const,'output-domain',lambda c:c.update(outputDomain=field('integer')))
no('constant-invalid-input',const,'input-domain',lambda c:c.update(input=lit('1','integer')))
no('constant-null-required-input',const,'input-domain',lambda c:c.update(input=None))
no('constant-array-input',const,'scalar-applicability',lambda c:c['inputDomain'].update(cardinality='array'))
no('constant-unknown-output-nullability',const,'scalar-applicability',lambda c:c['outputDomain'].pop('nullability'))
no('constant-temporal-input-unselected',const,'temporal-profile',lambda c:c.update(inputDomain=field('date'),input=lit('2000-01-01','date')))
no('constant-temporal-output-unselected',const,'temporal-profile',lambda c:(c.update(outputDomain=field('date')),setp(c,'value',lit('2000-01-01','date'),field('date'))))
no('constant-output-allowedvalues',const,'output-domain',lambda c:c['outputDomain'].update(allowedValues=[lit('other')]))
no('constant-invalid-surrogate',const,'input-domain',lambda c:c.update(input=lit('\ud800')))

# Python strings index Unicode scalar values; invalid surrogates tested as refusal.
strings=['','a','ab','abc','abcdef','\U0001f600A\U0001f680B','e\u0301x','\u00e9x','\ufeffA\x00B','\n"\\x','\U0001f1e6\U0001f1e7x']
for i,s in enumerate(strings):
 for a,b in [(0,0),(1,1),(2,1),(0,3),(5,5)]:
  yes(f'partial-{i}-{a}-{b}','partial',lit(s),sparams('partial',prefix=a,suffix=b,padding='\U0001f7e5' if i%2 else '*'))
 for n in [0,1,2,5]:yes(f'prefix-{i}-{n}','prefix-only',lit(s),sparams('prefix-only',length=n))
for n in [0,1,3,20]:
 for i,pad in enumerate(['*','\U0001f7e5','\x00','\u0301']):
  yes(f'fixed-{n}-{i}','fixed-length-redact',lit('input-length-does-not-control-output'),sparams('fixed-length-redact',length=n,padding=pad))
partial=next(c for c in CASES if c['id']=='partial-5-1-1')
fixed=next(c for c in CASES if c['id']=='fixed-3-0')
prefix=next(c for c in CASES if c['id']=='prefix-5-2')
for fn,base in [('partial',partial),('fixed-length-redact',fixed),('prefix-only',prefix)]:
 yes(fn+'-null-propagation',fn,None,base['parameters'],field(nullable=True),field(nullable=True))
 no(fn+'-null-required-output',base,'null-output',lambda c:c.update(input=None,inputDomain=field(nullable=True)))
 no(fn+'-unknown-unit',base,'unit',lambda c:setp(c,'unit',lit('utf16-code-unit')))
 no(fn+'-null-invalid-unit',base,'unit',lambda c:(c.update(input=None,inputDomain=field(nullable=True),outputDomain=field(nullable=True)),setp(c,'unit',lit('utf16-code-unit'))))
 name='prefix' if fn=='partial' else 'length'
 for token in ['-1','1.5','4097','1e1000000']:
  no(fn+'-count-'+token,base,'count-or-resource',lambda c,t=token,n=name:setp(c,n,lit(t,'integer')))
 no(fn+'-count-string-domain',base,'count-domain',lambda c,n=name:setp(c,n,lit('1'),field()))
 no(fn+'-count-null',base,'count-role',lambda c,n=name:setp(c,n,None,field('integer',nullable=True)))
 no(fn+'-output-length',base,'output-domain',lambda c:c['outputDomain'].update(facets={'length':{'min':100,'unit':'unicode-scalar'}}))
 no(fn+'-input-allowedvalues',base,'input-domain',lambda c:c['inputDomain'].update(allowedValues=[lit('not-this-value')]))
 no(fn+'-input-array',base,'scalar-applicability',lambda c:c['inputDomain'].update(cardinality='array'))
 no(fn+'-input-unspecified',base,'scalar-applicability',lambda c:c['inputDomain'].update(cardinality='unspecified'))
 no(fn+'-unknown-input-meaning',base,'unknown-meaning',lambda c:c['inputDomain'].update(futureMeaning=True))
 for side in ['input','output']:
  no(fn+'-'+side+'-record-valued',base,'record-domain',lambda c,s=side:c[s+'Domain'].update(references=[{'role':'record-type','target':{'module':'m','element':'record'}}]))
for pad in ['', '**','\ud800','\udfff']:
 no('partial-padding-'+str(len(CASES)),partial,'padding',lambda c,p=pad:setp(c,'padding',lit(p)))
yes('prefix-exact-exponent-count','prefix-only',lit('abcdefghijk'),[count('length','1e1'),param('unit','unicode-scalar')])
yes('fixed-exact-integral-fraction-count','fixed-length-redact',lit('x'),[count('length','3.00'),param('padding','*'),param('unit','unicode-scalar')])
for label,pad in [('ascii','x'),('astral','\U0001f7e5'),('control','\x00'),('quote','"'),('slash','\\')]:
 n=0
 while units(lit(pad*(n+1)))<=4096:n+=1
 c=yes('fixed-canonical-bound-'+label,'fixed-length-redact',lit('x'),sparams('fixed-length-redact',length=n,padding=pad))
 assert units(c['expected']['value'])<=4096<units(lit(pad*(n+1)))
 no('fixed-canonical-over-'+label,c,'canonical-result-bound',lambda c,k=n+1:setp(c,'length',lit(str(k),'integer')))
no('partial-canonical-padding-expansion',partial,'canonical-result-bound',lambda c:c.update(input=lit('x'*2000),parameters=sparams('partial',prefix=0,suffix=0,padding='\x00')))

# Fraction floor, exact decimal coefficients, nonzero/negative origins.
for x in [-101,-100,-99,-11,-10,-9,-1,0,1,9,10,11,99,100,101,9007199254740993]:
 for w,o in [(10,0),(10,3),(7,-5)]:
  yes(f'bucket-int-{x}-{w}-{o}','range-bucket',lit(str(x),'integer'),[param('width',str(w),'integer'),param('origin',str(o),'integer')],field('integer'))
for scale,triples in [(0,[('100','30','0'),('-1','10','0')]),(2,[('1.23','0.10','0'),('-0.01','0.10','0'),('1.23','0.10','0.03'),('-1.23','0.10','0.03'),('90071992547409.93','0.07','0.02'),('-0.00','0.10','0')]),(4,[('1.0001','0.0003','0.0001'),('-1.0001','0.0003','0.0001')])]:
 f=field('decimal',facets={'precision':30,'scale':scale})
 for i,(x,w,o) in enumerate(triples):yes(f'bucket-dec-{scale}-{i}','range-bucket',lit(x,'decimal'),[param('width',w,'decimal',f),param('origin',o,'decimal',f)],f)
bucket=next(c for c in CASES if c['id']=='bucket-int--1-10-0')
dbucket=next(c for c in CASES if c['id']=='bucket-dec-2-0')
yes('bucket-zero-normalization','range-bucket',lit('-0','integer'),[param('width','10','integer'),param('origin','-0','integer')],field('integer'))
yes('bucket-equivalent-tokens','range-bucket',lit('1e2','integer'),[param('width','1e1','integer'),param('origin','0.00','integer')],field('integer'))
yes('bucket-null-propagation','range-bucket',None,bucket['parameters'],field('integer',nullable=True),field('integer',nullable=True))
for n,v in [('width','0'),('width','-10'),('width','1.1'),('origin','0.1'),('width','1e1000000')]:
 no(f'bucket-bad-{n}-{v}',bucket,'numeric-parameter',lambda c,n=n,v=v:setp(c,n,lit(v,'integer')))
no('bucket-null-invalid-width',bucket,'numeric-parameter',lambda c:(c.update(input=None,inputDomain=field('integer',nullable=True),outputDomain=field('integer',nullable=True)),setp(c,'width',lit('0','integer'))))
no('bucket-output-range-no-clamp',bucket,'output-domain',lambda c:c['outputDomain'].update(facets={'range':{'min':lit('-5','integer')}}))
no('bucket-input-range',bucket,'input-domain',lambda c:c['inputDomain'].update(facets={'range':{'min':lit('0','integer')}}))
no('bucket-output-width-no-wrap',bucket,'output-domain',lambda c:c['outputDomain'].update(facets={'integerWidth':{'bits':4,'signed':True}}))
no('bucket-output-allowedvalues-no-nearest',bucket,'output-domain',lambda c:c['outputDomain'].update(allowedValues=[lit('0','integer')]))
no('bucket-output-family',bucket,'numeric-family',lambda c:c.update(outputDomain=field('decimal',facets={'precision':20,'scale':0})))
no('bucket-output-scale',dbucket,'numeric-scale',lambda c:c['outputDomain']['facets'].update(scale=3))
no('bucket-parameter-scale',dbucket,'numeric-scale',lambda c:next(p for p in c['parameters'] if p['name']=='width')['domain']['facets'].update(scale=3))
no('bucket-input-needs-rounding',dbucket,'input-domain',lambda c:c.update(input=lit('1.001','decimal')))
no('bucket-input-precision',dbucket,'input-domain',lambda c:c['inputDomain']['facets'].update(precision=2))
no('bucket-missing-scale',dbucket,'numeric-scale',lambda c:c['inputDomain']['facets'].pop('scale'))

# Gregorian calendar independently implemented by Python datetime.
for token in ['0001-01-01','0099-12-31','0400-02-29','1582-10-10','1900-03-01','2000-02-29','2024-03-31','2024-04-01','2024-06-30','2024-07-01','2024-09-30','2024-10-01','2026-10-15','9999-12-31']:
 for unit in ['year','quarter','month','day']:
  yes(f'date-{token}-{unit}','truncate-date',lit(token,'date'),[param('calendar',PROFILE),param('unit',unit)],field('date'))
datecase=next(c for c in CASES if c['id']=='date-2000-02-29-quarter')
yes('date-null-propagation','truncate-date',None,datecase['parameters'],field('date',nullable=True),field('date',nullable=True))
for i,token in enumerate(['0000-01-01','10000-01-01','-001-01-01','1900-02-29','2100-02-29','2000-02-30','2026-04-31','2026-00-01','2026-13-01','2026-01-00','2026-01-32','2026-1-01','2026-01-1','2026-01-01\n',' 2026-01-01','２０２６-01-01','2026-W01-1','2026-001','2026-01-01T00:00:00Z']):
 no(f'date-invalid-{i}',datecase,'date-profile',lambda c,t=token:c.update(input=lit(t,'date')))
for selector in ['', 'gregorian','umf-gregorian-date/0.1.0','umf-gregorian-date/2.0.0']:
 no('date-selector-'+str(len(CASES)),datecase,'profile-selector',lambda c,s=selector:setp(c,'calendar',lit(s)))
for unit in ['week','Month','hour','']:
 no('date-unit-'+str(len(CASES)),datecase,'date-unit',lambda c,u=unit:setp(c,'unit',lit(u)))
for side in ['input','output']:
 for label,patch in [('default',{'default':lit('2000-01-01','date')}),('allowed',{'allowedValues':[lit('2000-01-01','date')]}),('facet',{'facets':{'length':{'min':10,'unit':'unicode-scalar'}}}),('unknown',{'calendarMeaning':'other'}),('itemtype',{'itemType':{'module':'m','element':'input'}})]:
  no(f'date-{side}-{label}',datecase,'date-field-profile',lambda c,s=side,p=patch:c[s+'Domain'].update(copy.deepcopy(p)))
no('date-null-invalid-profile',datecase,'profile-selector',lambda c:(c.update(input=None,inputDomain=field('date',nullable=True),outputDomain=field('date',nullable=True)),setp(c,'calendar',lit('guess'))))
no('date-null-invalid-facet',datecase,'date-field-profile',lambda c:(c.update(input=None,inputDomain=field('date',nullable=True),outputDomain=field('date',nullable=True)),c['inputDomain'].update(facets={'precision':4})))

# Every signature: order independence, closed shape, missing vs null, no promotion.
for base in [const,partial,fixed,prefix,bucket,datecase]:
 fn=base['function']
 no(fn+'-missing-parameter',base,'closed-signature',lambda c:c['parameters'].pop())
 no(fn+'-extra-parameter',base,'closed-signature',lambda c:c['parameters'].append(param('undeclared','x')))
 no(fn+'-duplicate-parameter',base,'closed-signature',lambda c:c['parameters'].append(copy.deepcopy(c['parameters'][0])))
 no(fn+'-missing-input',base,'absence',lambda c:c.pop('input'))
 no(fn+'-withheld-not-value',base,'value-shape',lambda c:c.update(input={'disposition':'withheld'}))
 no(fn+'-random-declaration',base,'pure-declaration',lambda c:c.update(determinism='random'))
 no(fn+'-keyed-declaration',base,'pure-declaration',lambda c:c.update(determinism='keyed-deterministic'))
 no(fn+'-vault-declaration',base,'pure-declaration',lambda c:c.update(reversibility='vault'))
 no(fn+'-unknown-parameter-meaning',base,'unknown-meaning',lambda c:c['parameters'][0]['domain'].update(futureMeaning=True))
 yes(fn+'-parameter-order',fn,base['input'],list(reversed(base['parameters'])),base['inputDomain'],base['outputDomain'])

# Null-out supplemental: not a replacement for any S19 class.
nullout=yes('null-out-string','null-out',lit('value'),[],out=field(nullable=True))
yes('null-out-null','null-out',None,[],field(nullable=True),field(nullable=True))
no('null-out-required-output',nullout,'output-domain',lambda c:c.update(outputDomain=field()))
no('null-out-invalid-input',nullout,'input-domain',lambda c:c.update(input=lit('bad','integer')))
no('null-out-unknown-input',nullout,'unknown-meaning',lambda c:c['inputDomain'].update(futureMeaning=True))
no('null-out-extra-parameter',nullout,'closed-signature',lambda c:c['parameters'].append(param('value','x')))
custody={'owner':'owner','keyRef':'key','vaultRef':'vault','formatPreserving':False,'storageEffect':'stored-transformed','propagation':dict(history='retain-transformed',snapshots='retain-transformed',exports='retain-transformed',feeds='retain-transformed',caches='retain-transformed')}
for kind in ['tokenize','encrypt']:
 for determinism in ['random','keyed-deterministic']:
  no(kind+'-'+determinism+'-not-executed',const,'non-pure-operation',lambda c,k=kind,d=determinism:(c.pop('function'),c.update(kind=k,determinism=d,reversibility='vault',parameters=[],custody=copy.deepcopy(custody))))
no('regex-not-executed',const,'unqualified-engine',lambda c:c.update(function='regex-replace',parameters=[param('pattern','(a+)+$'),param('replacement','x')]))

# Strengthened non-pure controls must first pass the original wire inspector.
for kind in ['tokenize','encrypt']:
 for determinism in ['random','keyed-deterministic']:
  for reversal in ['keyed','vault']:
   c=no('wire-valid-'+kind+'-'+determinism+'-'+reversal,const,'non-pure-operation',
     lambda c,k=kind,d=determinism,r=reversal:(c.pop('function'),c.update(kind=k,determinism=d,reversibility=r,parameters=[],custody=copy.deepcopy(custody),reverseAction='reverse-original-action')))
   c['expected'].update(wireValid=True,errorCode='PROTECTION_FUNCTION',errorContains='no qualified pure reference recipe')
for salt in [{'kind':'none'},{'kind':'keyed','owner':'owner','keyRef':'salt-key'}]:
 c=no('wire-valid-hash-'+salt['kind'],const,'non-pure-operation',
   lambda c,s=salt:(c.pop('function'),c.update(kind='hash',parameters=[],algorithm='SHA-256',saltCustody=copy.deepcopy(s),disclosureProfile=['equality'])))
 c['expected'].update(wireValid=True,errorCode='PROTECTION_FUNCTION',errorContains='no qualified pure reference recipe')
for side in ['input','output']:
 for family in ['string','integer']:
  c=no('exact-policy-'+side+'-different-'+family+'-ref',const,'selected-domain-correspondence',
    lambda c,s=side,f=family:c.update(fieldSubstitution={'side':s,'domain':field(f)}))
  c['expected'].update(wireValid=True,errorCode='PROTECTION_FUNCTION',errorContains='Selected policy input/output Fields')

assert len({c['id'] for c in CASES})==len(CASES)
assert {c['function'] for c in CASES if c['expected']['status']=='evaluated'}=={'constant','partial','fixed-length-redact','prefix-only','range-bucket','truncate-date','null-out'}
for c in CASES:
 if c['expected']['status']=='evaluated':assert units(c['expected']['value'])<=4096,c['id']
h=hashlib.sha256();d=dt.date(1600,1,1);end=dt.date(2000,1,1);days=0
while d<end:
 token=d.isoformat();line='|'.join([token]+[datevalue(token,u) for u in ['year','quarter','month','day']])+'\n'
 h.update(line.encode('ascii'));days+=1;d+=dt.timedelta(days=1)
assert days==146097
cycle={'startInclusive':'1600-01-01','endExclusive':'2000-01-01','days':days,'format':'date|year|quarter|month|day followed by LF; ASCII','sha256':h.hexdigest()}
packet={'version':'independent-protection-functions/0.1.0','cases':CASES,'calendarDigest':cycle}
(ROOT/'fixtures.json').write_text(json.dumps(packet,ensure_ascii=True,indent=2)+'\n')
summary={'cases':len(CASES),'evaluated':sum(c['expected']['status']=='evaluated' for c in CASES),'refused':sum(c['expected']['status']=='refused' for c in CASES),'calendarDigest':cycle,'python':sys.version}
(ROOT/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary))
