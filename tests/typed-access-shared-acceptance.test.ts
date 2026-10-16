import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {readDocument,validateDocument,inspectBinding,validateCoreDatasetValues,validateCoreFieldValue} from '../src/index';
const root='fixtures/umf-typed-access/';
const models=JSON.parse(readFileSync(root+'models.json','utf8'));
const corpus=JSON.parse(readFileSync(root+'corpus.json','utf8'));
type Row=Record<string,any>;
type Truth='T'|'F'|'U';
const cmp=(a:any,b:any):number=>a<b?-1:a>b?1:0;
const not=(x:Truth):Truth=>x==='U'?'U':x==='T'?'F':'T';
const and=(a:Truth,b:Truth):Truth=>a==='F'||b==='F'?'F':a==='U'||b==='U'?'U':'T';
const or=(a:Truth,b:Truth):Truth=>a==='T'||b==='T'?'T':a==='U'||b==='U'?'U':'F';
const truth=(x:any):Truth=>x==null?'U':x?'T':'F';
// Unicode scalar comparison, deliberately avoids JS UTF-16 lexical ordering.
function unicode(a:string,b:string){const x=Array.from(a,c=>c.codePointAt(0)!),y=Array.from(b,c=>c.codePointAt(0)!);for(let i=0;i<Math.min(x.length,y.length);i++)if(x[i]!==y[i])return cmp(x[i],y[i]);return cmp(x.length,y.length);}
function decimal(s:string){if(!/^-?\d+(?:\.\d+)?$/.test(s))throw Error('Fixture decimal shape');const [a,b='']=s.split('.');if(/[^0]/.test(b.slice(2)))throw Error('Fixture would round');return BigInt(a!)*100n+BigInt((a!.startsWith('-')?'-':'')+(b+'00').slice(0,2));}
function instant(s:string):bigint {
 // UTC day arithmetic plus integer microseconds: Date is used only at whole seconds.
 const m=/^(.*T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(s);if(!m)throw Error('Fixture instant shape');
 const ms=Date.parse(m[1]+m[3]!);if(!Number.isSafeInteger(ms))throw Error('Fixture instant range');return BigInt(ms)*1000n+BigInt((m[2]??'').padEnd(6,'0'));
}
function value(field:string,s:any):any{if(s==null)return null;if(field==='n')return BigInt(s);if(field==='amount')return decimal(s);if(field==='instant')return /^-?\d+$/.test(s)?BigInt(s):instant(s);if(field==='local')return s.includes('.')?s.padEnd(26,'0'):s+'.000000';return s;}
function scalar(field:string,a:any,b:any){return ['id','label','requiredValue'].includes(field)?unicode(a,b):cmp(value(field,a),value(field,b));}
function predicate(row:Row,p:string,params:any):Truth {
 const nullTest=/^(\w+) IS (NOT )?(NULL|MISSING)$/.exec(p);
 if(nullTest){const result=nullTest[3]==='MISSING'?!Object.hasOwn(row,nullTest[1]!):row[nullTest[1]!]==null;return (nullTest[2]?!result:result)?'T':'F';}
 if(p.startsWith('NOT ('))return not(predicate(row,p.slice(5,-1),params));
 const member=/^(\w+) (NOT )?IN \(:values\)$/.exec(p);
 if(member){const list=params.values.value;const v=row[member[1]!];if(!list.length&&v==null)throw Error('Unresolved empty/null intersection');const result:Truth=!list.length?'F':v==null?'U':list.some((x:any)=>scalar(member[1]!,v,x)===0)?'T':'F';return member[2]?not(result):result;}
 const range=/^(\w+) (NOT )?BETWEEN (\S+) AND (\S+)$/.exec(p);
 if(range){const a=predicate(row,`${range[1]} >= ${range[3]}`,params),b=predicate(row,`${range[1]} <= ${range[4]}`,params);return range[2]?not(and(a,b)):and(a,b);}
 const m=/^(\w+) (=|<>|<|<=|>|>=) (.+)$/.exec(p);if(!m)throw Error('Unhandled fixture predicate '+p);
 const a=row[m[1]!],operand=m[3]!,b=operand.startsWith(':')?params[operand.slice(1)].value:operand==='TRUE'?true:operand.startsWith("'")?operand.slice(1,-1):operand;
 if(a==null||b==null)return 'U';const c=scalar(m[1]!,a,b);return ({'=':c===0,'<>':c!==0,'<':c<0,'<=':c<=0,'>':c>0,'>=':c>=0}[m[2]!]!)?'T':'F';
}
function ordering(keys:any[]){return (a:Row,b:Row)=>{for(const k of keys){const x=a[k.field],y=b[k.field];if(x==null||y==null){if(x==null&&y==null)continue;return (x==null?-1:1)*(k.nulls==='FIRST'?1:-1);}const c=scalar(k.field,x,y);if(c)return c*(k.direction==='DESC'?-1:1);}return 0;};}
function dataset(model:any,rows:Row[]){const fields=model.modules[0].elements.filter((e:any)=>e.kind==='field');const carriers:any={string:'string',integer:'integerToken',decimal:'decimalToken',boolean:'boolean',date:'date',timestamp:'timestamp'};return {scope:{id:'typed-access-fixed',closure:'supplied-dataset-only' as const},records:rows.map(row=>({instanceId:row.id,identity:{module:'fixture',element:'Item'},values:fields.map((f:any)=>({field:{module:'fixture',element:f.id},...(!Object.hasOwn(row,f.id)?{state:'absent'}:{state:'present',value:row[f.id]===null?null:{[carriers[f.scalarType]]:row[f.id]}})}))})),relationships:[]};}

test('source documents and physical binding pass public admission with explicit unknown access status',()=>{
 for(const name of ['propertyStore','relational']){const doc=readDocument(JSON.stringify(models[name]),'json');const result=validateDocument(doc);expect(result.valid).toBe(true);expect(result.complete).toBe(false);expect(result.diagnostics.some(d=>d.code.includes('UNKNOWN'))).toBe(true);expect(doc).toEqual(models[name]);}
 expect(inspectBinding(models.binding,models.relational).valid).toBe(true);
});

test('public dataset admission exposes temporal refusal; other field carriers are checked independently',()=>{
 for(const [name,rows] of Object.entries(corpus.datasets)){
  const model=models[name==='truth'||name==='missing'?'propertyStore':'relational'];
  const receipt=validateCoreDatasetValues(model,dataset(model,rows as Row[]) as any);
  const hasTemporal=(rows as Row[]).some(r=>['day','instant','local'].some(f=>r[f]!=null));
  expect(receipt.datasetValidation.valid).toBe(!hasTemporal);
  const errors=receipt.datasetValidation.diagnostics.filter(d=>d.severity==='error');
  expect(errors.every(d=>d.code==='CORE_SCHEMA_PROPERTIES'&&d.message.includes('temporal'))).toBe(true);
  for(const r of dataset(model,rows as Row[]).records)for(const v of r.values)if(v.state==='present'){
   const result=validateCoreFieldValue(model,v.field,(v as any).value);
   const temporal=['day','instant','local'].includes(v.field.element)&&(v as any).value!==null;
   expect(result.valid).toBe(!temporal);
  }
  expect(receipt.datasetValidation.complete).toBe(false);
  // A false carrier and duplicate key are rejected by actual public admission.
  const bad=dataset(model,rows as Row[]) as any;bad.records[0].values.find((v:any)=>v.field.element==='id').value={integerToken:'1'};
  expect(validateCoreDatasetValues(model,bad).datasetValidation.valid).toBe(false);
  const duplicate=dataset(model,rows as Row[]) as any;duplicate.records.push({...structuredClone(duplicate.records[0]),instanceId:'duplicate-key'});
  expect(validateCoreDatasetValues(model,duplicate).datasetValidation.diagnostics.some(d=>d.code.includes('KEY'))).toBe(true);
 }
});

for(const c of corpus.cases){test(c.id+' fixed semantic witness (backend UNTESTED)',()=>{
 expect(c.backendExecution).toBe('UNTESTED');expect(c.syntax.status).toBe('PROPOSED_NOT_ACCEPTED');expect(models[c.model]).toBeDefined();if(c.binding)expect(models[c.binding]).toBeDefined();
 const rows:Row[]=corpus.datasets[c.dataset],s=c.semantics;
 if(s.kind==='truth'){
  const actual=Object.fromEntries(rows.map(r=>[r.id,s.operator==='NOT'?not(truth(r.a)):s.operator==='AND'?and(truth(r.a),truth(r.b)):or(truth(r.a),truth(r.b))]));
  expect(actual).toEqual(c.expected.truthById);expect(Object.keys(actual).filter(id=>actual[id]==='T').sort()).toEqual(c.expected.orderedIds);
 }else if(s.kind==='filter'){
  expect(rows.filter(r=>predicate(r,s.predicate,c.parameters??{})==='T').sort((a,b)=>unicode(a.id,b.id)).map(r=>r.id)).toEqual(c.expected.orderedIds);
 }else if(s.kind==='count'||s.kind==='exists'){
  const matching=rows.filter(r=>predicate(r,s.predicate,{})==='T');expect(s.kind==='count'?matching.length:matching.length>0).toEqual(s.kind==='count'?c.expected.count:c.expected.exists);
 }else if(s.kind==='order'||s.kind==='page'){
  const compare=ordering(s.keys),ordered=[...rows].sort(compare);expect(ordered.map(r=>r.id)).toEqual(c.expected.orderedIds);
  if(s.kind==='page'){
   const ids:string[]=[],pages:string[][]=[],continuations:any[]=[];let after:Row|undefined;
   for(let i=0;i<rows.length+1;i++){
    // Selection from the original input on every page, strictly after the whole tuple.
    const page=rows.filter(r=>!after||compare(r,after)>0).sort(compare).slice(0,s.size);if(!page.length)break;
    pages.push(page.map(r=>r.id));ids.push(...page.map(r=>r.id));after=page.at(-1)!;continuations.push(s.keys.map((k:any)=>after![k.field]??null));
   }
   expect(pages).toEqual(c.expected.pages);expect(continuations).toEqual(c.expected.continuations);expect(ids).toEqual(c.expected.orderedIds);expect(new Set(ids).size).toBe(rows.length);
  }
 }else if(s.kind==='refusal'){
  // Requirements only: verify the premise against source facts/data, never simulate backend refusal.
  expect(c.expected.refusal.reason.length).toBeGreaterThan(0);expect(c.expected.refusal.code).toBeNull();
  if(c.id==='set-null-required'){const input=dataset(models.relational,rows) as any;input.records[0].values.find((v:any)=>v.field.element==='requiredValue').value=null;expect(validateCoreDatasetValues(models.relational,input).datasetValidation.valid).toBe(false);}
  if(c.id==='bulk-over-bound'){const ids=rows.filter(r=>predicate(r,'n >= 1',{})==='T').map(r=>r.id);expect(ids).toEqual(c.expectedSelectedIds);expect(ids.length).toBeGreaterThan(c.maxItems);expect(c.expected.unchangedDataset).toBe(true);}
 }else throw Error('Uncovered case '+c.id);
});}

test('minimum corpus safeguards and discriminating negative controls',()=>{
 expect(corpus.datasets.truth).toHaveLength(16);expect(corpus.cases.filter((c:any)=>c.semantics.kind==='truth')).toHaveLength(3);
 expect(unicode('\ue000','😀')).toBe(-1);expect('\ue000'<'😀').toBe(false);
 expect(decimal('1.2')).toBe(decimal('1.200'));expect(instant('2024-01-01T00:00:00.000001Z')).toBe(instant('2023-12-31T19:00:00.000001-05:00'));expect(instant('2024-01-01T00:00:00.000002Z')-instant('2024-01-01T00:00:00.000001Z')).toBe(1n);
 expect(not('U')).toBe('U');expect(predicate({n:null},'n <> 2',{})).toBe('U');expect(predicate({},'n IS MISSING',{})).toBe('T');expect(predicate({n:null},'n IS MISSING',{})).toBe('F');
 expect(corpus.ambiguities.map((x:any)=>x.id)).toContain('EMPTY_NULL_PRECEDENCE');
});
