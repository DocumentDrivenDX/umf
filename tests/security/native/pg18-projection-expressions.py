"""Independent Python -> compiler -> native PG18 expression oracle.
Partial P02 prerequisite only: no policy/catalog binding, row eligibility or view.
"""
import hashlib,json,os,re,secrets,subprocess,sys,time,uuid
from fractions import Fraction
from pathlib import Path
ROOT=Path.cwd();IMAGE='postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336'
paths=['src/model/json.ts','src/model/types.ts','tools/security/protection-pg18-expressions.ts','tests/security/native/pg18-projection-compile.ts','tests/security/native/pg18-projection-expressions.py','tests/security/native/pg18-projection-expressions.test.ts']
sources={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in paths}
vectors=[]
def add(family,recipe,value,expected):
 vectors.append(dict(request=dict(profile='umf.security.pg18-expression/0.1',source=dict(alias='r',column='value'),family=family,recipe=recipe),value=value,expected=expected))
texts=[None,'','a','abcdef','😀ab𝄞e\u0301',"O'Reilly\\123",'000123999','a.a.a','a\nb\t12']
for value in texts:
 add('string',dict(operation='constant',value="fixed'\\😀"),value,"fixed'\\😀")
 add('string',dict(operation='constant',value="'; SELECT 'attack\\'; --"),value,"'; SELECT 'attack\\'; --")
 add('string',dict(operation='null-out'),value,None)
 for a,b in [(0,0),(1,2),(20,20),(2,0)]:
  expected=None if value is None else value[:a]+'■'*max(0,len(value)-min(a,len(value))-min(b,max(0,len(value)-a)))+(value[-min(b,max(0,len(value)-a)):] if min(b,max(0,len(value)-a)) else '')
  add('string',dict(operation='partial',prefix=a,suffix=b,padding='■',unit='unicode-scalar'),value,expected)
 for length in [0,2,20]:
  add('string',dict(operation='fixed-length-redact',length=length,padding='😀',unit='unicode-scalar'),value,None if value is None else '😀'*length)
  add('string',dict(operation='prefix-only',length=length,unit='unicode-scalar'),value,None if value is None else value[:length])
 for pattern,replacement in [('[0-9]+',r"\1'😀"),('a',''),('a',r'\&'),('a\nb','Q')]:
  expected=None if value is None else re.sub(pattern,lambda match:replacement,value)
  add('string',dict(operation='regex-replace',provider='umf.security.pg18-literal-regex/0.1',pattern=pattern,replacement=replacement),value,expected)
 add('string',dict(operation='hash',algorithm='sha256-utf8-lowerhex',salt='none',retainedEquality=True,dictionaryWarning='unsalted-dictionary-attack'),value,None if value is None else hashlib.sha256(value.encode()).hexdigest())
def decimal_string(value):
 # Exact finite Fraction decimal expansion; no Decimal context rounding.
 sign='-' if value<0 else '';value=abs(value);whole,rest=divmod(value.numerator,value.denominator);digits=''
 while rest:rest*=10;digit,rest=divmod(rest,value.denominator);digits+=str(digit)
 return sign+str(whole)+('.'+digits if digits else '')
for family,width,origin in [('integer','10','3'),('integer','100000000000000000000000000000000000000000000000000','0'),('decimal','0.0007','-0.0031'),('decimal','99999999999999999999999999999999999999999.9999','0.0001')]:
 w,o=Fraction(width),Fraction(origin)
 for value in [None,o,o-1,o+w,o+w-Fraction(1 if family=='integer' else '0.0001'),o-w-Fraction(1 if family=='integer' else '0.0001'),Fraction('9007199254740993')]:
  expected=None if value is None else decimal_string(o+((value-o)//w)*w)
  add(family,dict(operation='range-bucket',width=width,origin=origin),None if value is None else decimal_string(value),expected)
for value in [None,'0001-01-01','2000-02-29','2024-12-31','9999-12-31']:
 for unit in ['year','quarter','month','day']:
  if value is None:expected=None
  else:
   y,m,d=map(int,value.split('-'));m=1 if unit=='year' else ((m-1)//3)*3+1 if unit=='quarter' else m;d=d if unit=='day' else 1;expected=f'{y:04d}-{m:02d}-{d:02d}'
  add('date',dict(operation='truncate-date',calendar='umf-gregorian-date/1.0.0',unit=unit),value,expected)
def command(args,**kw):return subprocess.run(args,text=True,capture_output=True,timeout=kw.pop('timeout',15),**kw)
def require(result):
 if result.returncode:raise RuntimeError(result.stderr[:3000])
 return result.stdout.strip()
compiled=json.loads(require(command(['/opt/homebrew/bin/bun','tests/security/native/pg18-projection-compile.ts'],input=json.dumps([v['request'] for v in vectors]))))
assert len(compiled)==len(vectors)
for item in compiled:assert item['status']=='compiled' and item['complete'] is False and item['authority'] is False,item
run=str(uuid.uuid4());name='umf-pg18-expression-'+run;container=None;volumes=[];observations=[];created=False
secret=secrets.token_hex(32)
def sql(query):return command(['docker','exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres'],input=query)
def lit(value):return "E'"+value.replace('\\','\\\\').replace("'","''")+"'"
try:
 assert name not in require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines()
 created=True
 container=require(command(['docker','run','-d','--name',name,'--label','umf.security.expression='+run,'-e','POSTGRES_PASSWORD',IMAGE],env={**os.environ,'POSTGRES_PASSWORD':secret}))
 info=json.loads(require(command(['docker','inspect',container])))[0]
 assert info['Image']==IMAGE.split('@')[1]
 volumes=[m['Name'] for m in info['Mounts'] if m['Type']=='volume']
 deadline=time.monotonic()+20
 while command(['docker','exec',container,'pg_isready','-h','127.0.0.1','-U','postgres'],timeout=3).returncode:
  if time.monotonic()>deadline:raise TimeoutError('Readiness expired')
  time.sleep(.1)
 engine=require(sql('SHOW server_version_num;'));assert engine=='180006'
 statements=[]
 for i,(v,c) in enumerate(zip(vectors,compiled)):
  family=v['request']['family'];cast='text' if family=='string' else 'date' if family=='date' else 'numeric';value='NULL' if v['value'] is None else lit(v['value'])
  # Date formatting is explicitly numeric ISO, independent of DateStyle/TimeZone.
  expression=c['sql'];result='pg_catalog.to_char(('+expression+'),\'YYYY-MM-DD\')' if family=='date' else '('+expression+')::pg_catalog.text'
  statements.append(f'SELECT json_build_array({i},{result}) FROM (SELECT {value}::pg_catalog.{cast} AS value) AS r;')
 require(sql("""CREATE SCHEMA hostile;
CREATE DOMAIN hostile.text AS pg_catalog.text CHECK (false);
CREATE DOMAIN hostile.numeric AS pg_catalog.numeric CHECK (false);
CREATE DOMAIN hostile.date AS pg_catalog.date CHECK (false);
CREATE DOMAIN hostile.timestamp AS pg_catalog.timestamp CHECK (false);
CREATE FUNCTION hostile.concat(pg_catalog.text,pg_catalog.text) RETURNS pg_catalog.text LANGUAGE SQL IMMUTABLE AS $$ SELECT 'CAPTURED'::pg_catalog.text $$;
CREATE OPERATOR hostile.|| (LEFTARG=pg_catalog.text,RIGHTARG=pg_catalog.text,FUNCTION=hostile.concat);
CREATE FUNCTION hostile.subtract(pg_catalog.numeric,pg_catalog.numeric) RETURNS pg_catalog.numeric LANGUAGE SQL IMMUTABLE AS $$ SELECT 777::pg_catalog.numeric $$;
CREATE OPERATOR hostile.- (LEFTARG=pg_catalog.numeric,RIGHTARG=pg_catalog.numeric,FUNCTION=hostile.subtract);
"""))
 # Native weakened expression demonstrates hostile operator resolution.
 assert require(sql("SET search_path=hostile,pg_catalog; SELECT 'a'::pg_catalog.text || 'b'::pg_catalog.text;"))=='CAPTURED'
 observed=require(sql("SET search_path=hostile,pg_catalog; SET DateStyle='SQL, DMY'; SET TimeZone='Pacific/Kiritimati'; SET standard_conforming_strings=off;\n"+'\n'.join(statements))).splitlines()
 assert len(observed)==len(vectors)
 for expected_index,line in enumerate(observed):
  row=json.loads(line)
  if type(row) is not list or len(row)!=2 or type(row[0]) is not int or row[0]!=expected_index or (row[1] is not None and type(row[1]) is not str):raise AssertionError('Original result index/value correspondence refused')
  i,actual=row;v=vectors[i]
  # Numeric text scale is physical, not a logical discrepancy. Compare exact
  # finite rationals; retain both text forms. Text/date/hash compare byte-exact.
  numeric=v['request']['family'] in ['integer','decimal']
  assert (actual is None and v['expected'] is None) or (actual is not None and v['expected'] is not None and (Fraction(actual)==Fraction(v['expected']) if numeric else actual==v['expected'])),(i,v,actual)
  observations.append(dict(index=i,expected=v['expected'],observed=actual,comparison='exact-rational' if numeric else 'exact-utf8'))
 # Rounding mutant: native floor(numeric division) really misclassifies boundary.
 mutant=require(sql('SELECT floor((100000000000000000000000000000000000000000000000000::numeric-1)/100000000000000000000000000000000000000000000000000::numeric)::text;'))
 assert Fraction(mutant)==1
 receipt=dict(status='passed',scope='private-expression-prerequisite-only',complete=False,authority=False,image=IMAGE,engine=engine,sources=sources,vectors=vectors,observations=observations,compiled=compiled,executedStatements=statements,hostileSearchPathMutation=dict(expectedOriginal='ab',weakenedObserved='CAPTURED'),roundingMutation=dict(expectedExact='0',weakenedObserved=mutant),cleanup=None)
finally:
 if created:
  target=container or name
  inventory=require(command(['docker','container','ls','-a','--format','{{.ID}} {{.Names}}'])).splitlines()
  matches=[line.split()[0] for line in inventory if len(line.split())==2 and line.split()[1]==name]
  assert len(matches)<=1
  if matches:
   info=json.loads(require(command(['docker','inspect',matches[0]])))[0];assert info['Config']['Labels'].get('umf.security.expression')==run
   volumes=[m['Name'] for m in info['Mounts'] if m['Type']=='volume']
   for volume in volumes:
    users=require(command(['docker','ps','-aq','--filter','volume='+volume])).splitlines();assert len(users)==1 and info['Id'].startswith(users[0])
   require(command(['docker','rm','-fv',matches[0]]))
  remaining=require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines();assert name not in remaining
  remaining_volumes=require(command(['docker','volume','ls','--format','{{.Name}}'])).splitlines();assert not any(v in remaining_volumes for v in volumes)
if any(hashlib.sha256((ROOT/p).read_bytes()).hexdigest()!=h for p,h in sources.items()):raise RuntimeError('Sources changed during execution')
receipt['cleanup']=dict(containerAbsent=True,volumesAbsent=True,count=len(volumes))
output=Path(sys.argv[1]);output.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(dict(status=receipt['status'],observations=len(observations),output=str(output))))
