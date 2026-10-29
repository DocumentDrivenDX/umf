import copy,hashlib,json,subprocess
from pathlib import Path
root=Path('/private/tmp/weft-mig-g02')
source=json.loads((root/'tests/raw-postgresql/table-operation-model.json').read_text())
template=json.loads((root/'tests/raw-postgresql/table-lifecycle-read-template.json').read_text())
base=template['binding']
def enc(x):return json.dumps(x,ensure_ascii=False,separators=(',',':'))
def make_case(name,target,expression,extra_fields=(),nullable_owner=False):
 model=copy.deepcopy(source);module=model['modules'][0];note=next(e for e in module['elements'] if e['id']=='Note');table=module['extensions']['umf.tables']['tables'][0];binding=copy.deepcopy(base)
 if nullable_owner:
  next(e for e in module['elements'] if e['id']=='owner')['nullability']='absent-allowed'
  next(c for c in binding['tables'][0]['columns'] if c['logical']=='owner')['nullable']=True
 for item,native,carrier,nullable in extra_fields:
  module['elements'].append(item);note['members'].append({'module':'demo','element':item['id']});table['columns'].append({'field':{'module':'demo','element':item['id']},'name':native,'nativeType':nativeTypes[item['id']]});binding['tables'][0]['columns'].append({'logical':item['id'],'native':native,'carrier':carrier,'nullable':nullable})
 if target not in ('id','owner') and target not in {x[0]['id'] for x in extra_fields}:
  raise ValueError(target)
 cmd={'version':'umf.table-operation/0.2','id':'backfill_'+name.replace('-','_'),'parameters':[],'consistency':'transaction','replay':'caller-key-required','body':{'kind':'update','table':'notes','values':[{'field':{'module':'demo','element':target},'value':{'kind':'rowExpression','expression':expression}}],'where':{'op':'isNull','field':{'module':'demo','element':target}},'returning':[],'maxRows':100}}
 module['extensions']['umf.tables']['commands'].append(cmd)
 text=enc(model);binding['modelJson']=text;binding['modelSha256']=hashlib.sha256(text.encode()).hexdigest()
 request={'version':'weft.table-operation/0.2','target':'postgresql18','binding':binding,'module':'demo','operation':cmd['id'],'call':{'kind':'single','inputs':{}},'idempotencyKey':'g02-wasm-'+name}
 return {'name':'G02-'+name,'request':enc(request)}
nativeTypes={'sourceAmount':{'kind':'numeric','precision':10,'scale':2},'amount':{'kind':'numeric','precision':12,'scale':2},'display':{'kind':'text'},'integerTarget':{'kind':'int4'},'booleanTarget':{'kind':'boolean'},'dateTarget':{'kind':'date'},'uuidTarget':{'kind':'uuid'}}
field=lambda id:{'op':'field','field':{'module':'demo','element':id}}
lit=lambda value:{'op':'literal','value':value}
stringfield={'id':'display','kind':'field','scalarType':'string','cardinality':'one','nullability':'absent-allowed','extensions':{}}
numfields=(
 ({'id':'sourceAmount','kind':'field','scalarType':'decimal','cardinality':'one','nullability':'required','facets':{'precision':10,'scale':2},'extensions':{}},'source_amount','decimal',False),
 ({'id':'amount','kind':'field','scalarType':'decimal','cardinality':'one','nullability':'absent-allowed','facets':{'precision':12,'scale':2},'extensions':{}},'amount','decimal',True),
)
strfields=((stringfield,'display','string',True),)
integerfield=({'id':'integerTarget','kind':'field','scalarType':'integer','cardinality':'one','nullability':'absent-allowed','extensions':{}},'integer_target','integer',True)
booleanfield=({'id':'booleanTarget','kind':'field','scalarType':'boolean','cardinality':'one','nullability':'absent-allowed','extensions':{}},'boolean_target','boolean',True)
datefield=({'id':'dateTarget','kind':'field','scalarType':'date','cardinality':'one','nullability':'absent-allowed','extensions':{}},'date_target','date',True)
uuidfield=({'id':'uuidTarget','kind':'field','scalarType':'uuid','cardinality':'one','nullability':'absent-allowed','extensions':{}},'uuid_target','uuid',True)
cases=[]
cases.append(make_case('field-copy','owner',field('id')))
cases.append(make_case('literal','owner',lit({'string':'fixed'})))
cases.append(make_case('concat','owner',{'op':'concat','args':[field('id'),lit({'string':' '}),lit({'string':'g02'})]}))
cases.append(make_case('coalesce','owner',{'op':'coalesce','args':[lit(None),field('id')]}))
for op in ['add','subtract','multiply']:
 cases.append(make_case(op,'amount',{'op':op,'left':field('sourceAmount'),'right':lit({'decimalToken':'2'})},numfields))
for op,when in [('conditional-eq',{'op':'eq','field':{'module':'demo','element':'owner'},'value':{'kind':'literal','value':{'string':'alice'}}}),('conditional-in',{'op':'in','field':{'module':'demo','element':'owner'},'values':[{'kind':'literal','value':{'string':'alice'}},{'kind':'literal','value':{'string':'bob'}}]})]:
 cases.append(make_case(op,'display',{'op':'conditional','when':when,'then':field('id'),'else':lit({'string':'unknown'})},strfields))
cases.append(make_case('tiny-decimal','amount',lit({'decimalToken':'1e-1000'}),numfields))
cases.append(make_case('fractional-integer','integerTarget',lit({'decimalToken':'1.5'}),(integerfield,)))
cases.append(make_case('null-add-null-decimal','amount',{'op':'add','left':lit(None),'right':lit(None)},numfields))
cases.append(make_case('null-add-null-integer','integerTarget',{'op':'add','left':lit(None),'right':lit(None)},(integerfield,)))
cases.append(make_case('null-add-null-string-refused','display',{'op':'add','left':lit(None),'right':lit(None)},strfields))
cases.append(make_case('null-add-null-boolean-refused','booleanTarget',{'op':'add','left':lit(None),'right':lit(None)},(booleanfield,)))
cases.append(make_case('null-add-null-date-refused','dateTarget',{'op':'add','left':lit(None),'right':lit(None)},(datefield,)))
cases.append(make_case('null-concat-null-string','display',{'op':'concat','args':[lit(None),lit(None)]},strfields))
cases.append(make_case('null-concat-null-integer-refused','integerTarget',{'op':'concat','args':[lit(None),lit(None)]},(integerfield,)))
cancelled='0.'+'0'*2000+'99999e2005'
cases.append(make_case('exponent-cancellation-integerToken','integerTarget',lit({'integerToken':cancelled}),(integerfield,)))
cases.append(make_case('exponent-cancellation-decimalToken','integerTarget',lit({'decimalToken':cancelled}),(integerfield,)))
fractional='0.'+'0'*2001+'99999e2005'
cases.append(make_case('exponent-cancellation-fractional-refused','integerTarget',lit({'decimalToken':fractional}),(integerfield,)))
for op in ['eq','ne']:
 when={'op':op,'field':{'module':'demo','element':'owner'},'value':{'kind':'literal','value':None}}
 cases.append(make_case('conditional-null-'+op,'amount',{'op':'conditional','when':when,'then':field('sourceAmount'),'else':lit({'decimalToken':'1.0'})},numfields,True))
 cases.append(make_case('conditional-null-not-'+op,'amount',{'op':'conditional','when':{'op':'not','arg':when},'then':field('sourceAmount'),'else':lit({'decimalToken':'1.0'})},numfields,True))
for elem,extra,operator in [('booleanTarget',(booleanfield,),'lt'),('uuidTarget',(uuidfield,),'lt')]:
 fielddef=extra[0][0];fielddef['nullability']='absent-allowed'
 cases.append(make_case('conditional-null-order-'+elem,'amount',{'op':'conditional','when':{'op':operator,'field':{'module':'demo','element':elem},'value':{'kind':'literal','value':None}},'then':field('sourceAmount'),'else':lit({'decimalToken':'1.0'})},numfields+extra))
long_zero='-0e'+'9'*32
cases.append(make_case('negative-zero-huge-exponent','integerTarget',lit({'decimalToken':long_zero}),(integerfield,)))
cases.append(make_case('self-reference','owner',field('owner')))
cases.append(make_case('literal-1mib','display',lit({'string':'a'*1_048_576}),strfields))
cases.append(make_case('literal-over-1mib','display',lit({'string':'a'*1_048_577}),strfields))
binary=Path('/private/tmp/umf-g02-weft-wasm-target/debug/examples/compile_table_operation')
for case in cases:
 raw=case['request'];out=subprocess.run([str(binary)],input=raw,text=True,capture_output=True,check=True,timeout=120).stdout
 case['expected']=json.loads(out);case['status']=case['expected']['status'];case['requestSha256']=hashlib.sha256(raw.encode()).hexdigest()
 want='blocked' if case['name'] in ('G02-fractional-integer','G02-self-reference','G02-literal-over-1mib','G02-null-add-null-string-refused','G02-null-add-null-boolean-refused','G02-null-add-null-date-refused','G02-null-concat-null-integer-refused','G02-exponent-cancellation-fractional-refused','G02-conditional-null-order-booleanTarget','G02-conditional-null-order-uuidTarget') else 'compiled'
 assert case['status']==want,(case['name'],case['status'],case['expected'].get('diagnostics'))
print(json.dumps({'cases':len(cases),'names':[c['name'] for c in cases],'statuses':[c['status'] for c in cases]}))
out=Path('/private/tmp/umf-g02-weft-wasm-target/g02-browser-cases-006.json');out.write_text(json.dumps(cases,ensure_ascii=False,separators=(',',':'))+'\n')
