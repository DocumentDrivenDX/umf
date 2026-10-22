import {CURRENT_CORE_VERSION} from '../../src/generated/core-model';
/** Private catalog projection compiler. Row eligibility remains a separately
 * installed native profile; this does not compile policy permission or mint it. */
import {copyJson} from '../../src/model/json';
import {validateDocument} from '../../src/validation/document';
import {inspectProtectionCatalog} from '../../src/extensions/security/protection/catalog';
import {ProtectionFieldIndex} from '../../src/extensions/security/protection/core-fields';
import {ProtectionLiteralBudget} from '../../src/extensions/security/protection/literals';
import {compilePg18ProtectionExpression} from './protection-pg18-expressions';
const VERSION='umf.security.pg18-catalog-projection/0.1';
const fail=(s:string):never=>{throw Error(s);};
const obj=(v:any):any=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v:fail('Object required');
function exact(v:any,names:string[]){obj(v);if(Object.keys(v).length!==names.length||names.some(n=>!Object.hasOwn(v,n)))fail('Closed signature required');}
const same=(a:any,b:any)=>JSON.stringify([a.documentId,a.moduleId,a.elementId])===JSON.stringify([b.documentId,b.moduleId,b.elementId]);
function ref(v:any){exact(v,['documentId','moduleId','elementId']);if(!Object.values(v).every(x=>typeof x==='string'&&x.length>0))fail('Qualified Field reference required');return v;}
function id(v:any):string{if(typeof v!=='string'||!/^[A-Za-z_][A-Za-z_0-9]{0,62}$/.test(v))fail('ASCII SQL identifier required');return '"'+v+'"';}
function pgMetadata(v:any):void{const stack=[v];while(stack.length){const x=stack.pop();if(typeof x==='string'){if(x.length>4096||/[\u0000\uD800-\uDFFF]/u.test(x))fail('SQL metadata requires bounded PostgreSQL UTF8 without NUL/unpaired surrogate');}else if(x!==null&&typeof x==='object')stack.push(...Object.values(x));}}
function column(v:any):string{const quoted=id(v);if(['ctid','xmin','xmax','cmin','cmax','tableoid'].includes(v))fail('PostgreSQL system column name is reserved');return quoted;}
const lit=(v:string)=>"E'"+v.replaceAll('\\','\\\\').replaceAll("'","''")+"'";
const num=(v:bigint)=>'('+lit(v.toString())+'::pg_catalog.numeric)';
const op=(a:string,o:string,b:string)=>'('+a+' OPERATOR(pg_catalog.'+o+') '+b+')';
function freeze(v:any):any{if(v!==null&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
interface Domain {field:any;doc:any;family:string;nullable:boolean;min:bigint;max:bigint;scale:number;minLength:number;maxLength:number}
export function compilePg18ProtectionCatalog(catalogInput:unknown,closureInput:unknown,profileInput:unknown):any {
 let catalog:any=null,closure:any=null,profile:any=null;const columns:any[]=[];let sourceDDL:string|null=null,viewSQL:string|null=null;let sqlUnits=0;
 const finish=(status:string,reason:string|null)=>freeze({status,complete:false,authority:false,version:VERSION,catalog,closure,profile,nativeRepresentability:{strings:'Unicode scalars excluding U+0000; PostgreSQL UTF8; scalar-length and literal bounds',dates:'finite Gregorian0001..9999 under explicit operation profile',numeric:'exact finite constrained coefficients; no rounded native type cast'},columns:status==='compiled'?columns:[],sourceDDL:status==='compiled'?sourceDDL:null,viewSQL:status==='compiled'?viewSQL:null,reason});
 try {
  catalog=copyJson(catalogInput);closure=copyJson(closureInput);profile=copyJson(profileInput);
  let sourceText=0;const pending=[catalog,closure,profile];while(pending.length){const v=pending.pop();if(typeof v==='string')sourceText+=v.length;else if(v!==null&&typeof v==='object')for(const [k,x] of Object.entries(v)){sourceText+=k.length;pending.push(x);}if(sourceText>4_000_000)fail('Aggregate source text bound exceeded');}
  const inspected=inspectProtectionCatalog(catalog);if(!inspected.valid||inspected.diagnostics.some(d=>d.code==='PROTECTION_UNKNOWN'))fail('Known catalog structure required');
  exact(closure,['pins','documents']);if(!Array.isArray(closure.pins)||!Array.isArray(closure.documents)||closure.documents.length<1||closure.documents.length>16)fail('Bounded exact core closure required');
  const seen=new Set<string>();for(const entry of closure.documents){exact(entry,['revision','document']);if(typeof entry.revision!=='string'||!entry.revision.length||entry.revision.length>4096)fail('Exact nonempty core revision required');const d=entry.document,v=validateDocument(d);if(d.umf!==CURRENT_CORE_VERSION||!v.valid||!v.complete||seen.has(d.id))fail('Complete current core definitions required');seen.add(d.id);}
  if(closure.pins.length!==seen.size)fail('Exact pin coverage required');const pins=new Set<string>();
  for(const pin of closure.pins){exact(pin,['documentId','revision']);if(typeof pin.documentId!=='string'||!pin.documentId.length||typeof pin.revision!=='string'||!pin.revision.length||pin.revision.length>4096)fail('Exact nonempty document/revision pin required');if(pins.has(pin.documentId)||!closure.documents.some((d:any)=>d.document.id===pin.documentId&&d.revision===pin.revision))fail('Stale/duplicate/missing core pin');pins.add(pin.documentId);}
  exact(profile,['version','catalog','source','resource','bindings']);if(profile.version!==VERSION)fail('Exact native projection profile required');
  exact(profile.catalog,['id','revision']);if(profile.catalog.id!==catalog.id||profile.catalog.revision!==catalog.revision)fail('Original catalog pin required');
  exact(profile.source,['schema','table','view']);const home=id(profile.source.schema)+'.'+id(profile.source.table),view=id(profile.source.schema)+'.'+id(profile.source.view);if(home===view)fail('Distinct private carrier and projection required');
  exact(profile.resource,['type','keyField','keyColumn']);ref(profile.resource.type);ref(profile.resource.keyField);column(profile.resource.keyColumn);
  const ownerDoc=closure.documents.find((d:any)=>d.document.id===profile.resource.type.documentId)?.document;
  const owner=ownerDoc?.modules.find((m:any)=>m.id===profile.resource.type.moduleId)?.elements.find((e:any)=>e.id===profile.resource.type.elementId);
  if(owner?.kind!=='record'||!Array.isArray(owner.members)||!Array.isArray(owner.keys)||owner.keys.length!==1||owner.keys[0].fields.length!==1||owner.keys[0].fields[0].module!==profile.resource.keyField.moduleId||owner.keys[0].fields[0].element!==profile.resource.keyField.elementId)fail('Exact single-Field Resource Key required');
  const index=new ProtectionFieldIndex(closure),budget=new ProtectionLiteralBudget();
  function domain(reference:any):Domain {
   ref(reference);const located=index.get(reference);if(!located)fail('Qualified original Field missing');const f:any=located!.field,facets=f.facets??{};
   if(f.kind!=='field'||f.cardinality!=='one'||!['required','absent-allowed'].includes(f.nullability)||f.itemType!==undefined||f.references?.length||f.allowedValues!==undefined||f.default!==undefined)fail('Admitted present scalar Field required');
   const family=f.scalarType;if(!['string','integer','decimal','date'].includes(family))fail('Native scalar family not admitted');
   const result:Domain={field:f,doc:located!.doc,family,nullable:f.nullability==='absent-allowed',min:0n,max:0n,scale:0,minLength:0,maxLength:0};
   if(family==='string'){
    exact(facets,['length']);const l=facets.length;exact(l,['min','max','unit']);if(l.unit!=='unicode-scalar'||!Number.isSafeInteger(l.min)||!Number.isSafeInteger(l.max)||l.min<0||l.max<l.min||l.max>512)fail('Explicit bounded Unicode-scalar string domain required');result.minLength=l.min;result.maxLength=l.max;
   }else if(family==='integer'){
    exact(facets,['integerWidth']);exact(facets.integerWidth,['bits','signed']);const w=facets.integerWidth;if(w.signed!==true||!Number.isSafeInteger(w.bits)||w.bits<2||w.bits>256)fail('Explicit signed integer width2..256 required');result.min=-(2n**BigInt(w.bits-1));result.max=2n**BigInt(w.bits-1)-1n;
   }else if(family==='decimal'){
    exact(facets,['precision','scale']);const p=facets.precision,s=facets.scale;if(!Number.isSafeInteger(p)||!Number.isSafeInteger(s)||p<1||p>100||s<0||s>12||s>p)fail('Explicit bounded decimal precision/scale required');result.scale=s;result.max=10n**BigInt(p)-1n;result.min=-result.max;
   }else if(Object.keys(facets).length)fail('Date facets require separate native admission');
   return result;
  }
  const key=domain(profile.resource.keyField);if(key.family!=='string'||key.nullable)fail('Required string Key carrier required');
  const member=(r:any)=>r.documentId===ownerDoc.id&&owner.members.some((m:any)=>m.module===r.moduleId&&m.element===r.elementId);
  if(!member(profile.resource.keyField))fail('Resource Key must be an original member');
  if(!Array.isArray(profile.bindings)||profile.bindings.length<1||profile.bindings.length>32||profile.bindings.length!==catalog.transforms.length)fail('Every catalog transform must bind exactly once within32');
  const used=new Set<string>(),carriers=new Set<string>([profile.resource.keyColumn]),outputs=new Set<string>(['id']);const inputRefs:any[]=[];const sourceColumns:string[]=[];
  function carrier(column:string,d:Domain):string {
   const c=id(column),type=d.family==='string'?'pg_catalog.text COLLATE pg_catalog."C"':d.family==='date'?'pg_catalog.date':'pg_catalog.numeric';let constraint:string;
   if(d.family==='string')constraint=op('pg_catalog.char_length('+c+')','>=',String(d.minLength))+' AND '+op('pg_catalog.char_length('+c+')','<=',String(d.maxLength));
   else if(d.family==='date')constraint='pg_catalog.isfinite('+c+') AND '+op(c,'>=',"'0001-01-01'::pg_catalog.date")+' AND '+op(c,'<=',"'9999-12-31'::pg_catalog.date");
   else {const coefficient=op(c,'*',num(10n**BigInt(d.scale)));constraint=['NaN','Infinity','-Infinity'].map(v=>op(c+'::pg_catalog.text','<>',lit(v))).join(' AND ')+' AND '+op('pg_catalog.trunc('+coefficient+')','=',coefficient)+' AND '+op(coefficient,'>=',num(d.min))+' AND '+op(coefficient,'<=',num(d.max));}
   return c+' '+type+(d.nullable?'':' NOT NULL')+' CHECK ('+c+' IS NULL OR ('+constraint+'))';
  }
  sourceColumns.push(carrier(profile.resource.keyColumn,key)+' PRIMARY KEY');
  for(const binding of profile.bindings){
   exact(binding,['transform','column','outputColumn']);exact(binding.transform,['id','version']);column(binding.column);column(binding.outputColumn);
   const identity=JSON.stringify([binding.transform.id,binding.transform.version]);if(used.has(identity)||carriers.has(binding.column)||outputs.has(binding.outputColumn))fail('Distinct transform/carrier/output required');used.add(identity);carriers.add(binding.column);outputs.add(binding.outputColumn);
   const t=catalog.transforms.find((v:any)=>v.id===binding.transform.id&&v.version===binding.transform.version);if(!t)fail('Exact transform identity missing');
   const from=domain(t.inputDomain),to=domain(t.outputDomain);if(!member(t.inputDomain)||same(t.inputDomain,profile.resource.keyField)||inputRefs.some(r=>same(r,t.inputDomain)))fail('Distinct original Resource Field required');inputRefs.push(t.inputDomain);
   if(t.determinism!=='deterministic'||t.reversibility!=='none')fail('Native provider requires deterministic/non-reversing recipe');
   const uses=['predicate','order','group','join','aggregate'];exact(t.queryUse,uses);if(uses.some(u=>t.queryUse[u]!=='disclosed'))fail('Visible native projection only admits explicitly disclosed query use');
   const params=new Map<string,{value:any;domain:Domain}>();for(const p of t.parameters){const d=domain(p.field);budget.check(d.doc,d.field,p.value);params.set(p.name,{value:p.value,domain:d});}
   for(const property of t.disclosureProfile)if(property!==null&&typeof property==='object'&&property.kind==='range'){const d=domain(property.bucket.field);if(!['integer','decimal'].includes(d.family))fail('Numeric range property required');budget.check(d.doc,d.field,property.bucket.value);}
   const names=(expected:string[])=>{if(params.size!==expected.length||expected.some(n=>!params.has(n)))fail('Exact typed parameter signature required');};
   const text=(n:string)=>{const p=params.get(n);if(p?.domain.family!=='string'||p.value===null||typeof p.value.string!=='string')fail('Typed string parameter required');return p!.value.string as string;};
   const coefficient=(n:string,family:string)=>{const p=params.get(n);if(p?.domain.family!==family||p.value===null)fail('Exact numeric parameter family required');const token=budget.identity(p!.domain.doc,p!.domain.field,p!.value);return BigInt(token.slice(token.indexOf(':')+1));};
   const count=(n:string)=>{const v=coefficient(n,'integer');if(v<0n||v>4096n)fail('Bounded scalar count required');return Number(v);};
   const decimal=(n:bigint,scale:number)=>{let s=(n<0n?-n:n).toString().padStart(scale+1,'0');if(scale)s=s.slice(0,-scale)+'.'+s.slice(-scale);return(n<0n?'-':'')+s;};
   let recipe:any;let outputMin=0,outputMax=0;const operation=t.function;
   if(t.kind==='mask'&&operation==='constant'){
    names(['value']);const v=params.get('value')!.value;budget.check(to.doc,to.field,v);if(from.family!=='string'||to.family!=='string')fail('Text-only constant native subset');recipe={operation,value:v===null?null:v.string};outputMin=outputMax=v===null?0:Array.from(v.string).length;
   }else if(t.kind==='mask'&&operation==='null-out'){
    names([]);if(!to.nullable)fail('Nullable output required for null-out');recipe={operation};
   }else if(t.kind==='generalize'&&operation==='range-bucket'){
    names(['width','origin']);if(!['integer','decimal'].includes(from.family)||to.family!==from.family||to.scale!==from.scale)fail('Same exact numeric family/scale required');
    for(const n of ['width','origin'])if(params.get(n)!.domain.scale!==from.scale)fail('Numeric parameter scale mismatch');
    const width=coefficient('width',from.family),origin=coefficient('origin',from.family);if(width<=0n)fail('Positive width required');
    const bucket=(x:bigint)=>{const d=x-origin;let q=d/width;if(d%width<0n)q--;return origin+q*width;};
    if(bucket(from.min)<to.min||bucket(from.max)>to.max)fail('Whole native input domain exceeds bucket output domain');
    recipe={operation,width:decimal(width,from.scale),origin:decimal(origin,from.scale)};
   }else if(t.kind==='generalize'&&operation==='truncate-date'){
    names(['calendar','unit']);if(from.family!=='date'||to.family!=='date')fail('Date-to-date required');recipe={operation,calendar:text('calendar'),unit:text('unit')};
   }else if(t.kind==='hash'){
    names(['dictionaryWarning']);if(from.family!=='string'||to.family!=='string'||t.algorithm!=='sha256-utf8-lowerhex'||t.saltCustody.kind!=='none'||!t.disclosureProfile.includes('equality'))fail('Explicit unsalted SHA256 and retained equality required');
    recipe={operation:'hash',algorithm:t.algorithm,salt:'none',retainedEquality:true,dictionaryWarning:text('dictionaryWarning')};outputMin=outputMax=64;
   }else {
    if(from.family!=='string'||to.family!=='string')fail('String-to-string recipe required');
    if(t.kind==='mask'&&operation==='partial'){names(['prefix','suffix','padding','unit']);recipe={operation,prefix:count('prefix'),suffix:count('suffix'),padding:text('padding'),unit:text('unit')};outputMin=from.minLength;outputMax=from.maxLength;}
    else if(t.kind==='mask'&&operation==='fixed-length-redact'){names(['length','padding','unit']);recipe={operation,length:count('length'),padding:text('padding'),unit:text('unit')};outputMin=outputMax=recipe.length;}
    else if(t.kind==='generalize'&&operation==='prefix-only'){names(['length','unit']);recipe={operation,length:count('length'),unit:text('unit')};outputMin=Math.min(from.minLength,recipe.length);outputMax=Math.min(from.maxLength,recipe.length);}
    else if(t.kind==='mask'&&operation==='regex-replace'){names(['pattern','replacement','provider']);recipe={operation,pattern:text('pattern'),replacement:text('replacement'),provider:text('provider')};outputMin=0;outputMax=from.maxLength*(Array.from(recipe.replacement).length+1);}
    else fail('Unqualified native catalog recipe');
   }
   if(recipe.operation!=='constant'&&recipe.operation!=='null-out'&&from.nullable&&!to.nullable)fail('Propagating null requires nullable output');
   if(to.family==='string'&&recipe.operation!=='null-out'&&!(recipe.operation==='constant'&&recipe.value===null)&&(outputMin<to.minLength||outputMax>to.maxLength))fail('Whole string output exceeds original output domain');
   const compiled=compilePg18ProtectionExpression({profile:'umf.security.pg18-expression/0.1',source:{alias:'r',column:binding.column},family:recipe.operation==='null-out'?to.family:from.family,recipe});
   if(compiled.status!=='compiled')fail(compiled.reason??'Native expression refused');
   const expression=compiled.sql!;let encoded:string;
   if(to.family==='string')encoded='pg_catalog.jsonb_build_object(\'string\','+expression+')';
   else if(to.family==='date')encoded='pg_catalog.jsonb_build_object(\'date\',pg_catalog.to_char(('+expression+'),\'YYYY-MM-DD\'))';
   else {let token='pg_catalog.trunc('+op(expression,'*',num(10n**BigInt(to.scale)))+')::pg_catalog.text';if(to.family==='decimal'&&to.scale)token=op(token,'||',lit('e-'+to.scale));encoded='pg_catalog.jsonb_build_object('+lit(to.family==='integer'?'integerToken':'decimalToken')+','+token+')';}
   const metadata={field:t.inputDomain,disposition:'transformed',outputDomain:t.outputDomain,transform:{vocabulary:'umf.security.protection',catalog:catalog.id,catalogRevision:catalog.revision,id:t.id,version:t.version},storageEffect:'canonical',bindingStorageEffect:'disclosed-only',valueProfile:to.family==='date'?'umf-gregorian-date/1.0.0':to.family==='decimal'?'exact-coefficient-scale/0.1':'core-literal/0.8'};
   pgMetadata(metadata);const metadataJson=JSON.stringify(metadata);if(metadataJson.length>32768)fail('Native metadata output bound exceeded');
   const cell=op(lit(metadataJson)+'::pg_catalog.jsonb','||',"pg_catalog.jsonb_build_object('value',CASE WHEN ("+expression+") IS NULL THEN 'null'::pg_catalog.jsonb ELSE "+encoded+' END)');
   sqlUnits+=cell.length+expression.length+carrier(binding.column,from).length;if(sqlUnits>262144)fail('Native SQL output bound exceeded');
   columns.push({column:binding.column,outputColumn:binding.outputColumn,inputDomain:t.inputDomain,outputDomain:t.outputDomain,recipe,expression,metadata,cellSQL:cell,warnings:compiled.warnings});sourceColumns.push(carrier(binding.column,from));
  }
  if(owner.members.length!==inputRefs.length+1||owner.members.some((m:any)=>!inputRefs.concat([profile.resource.keyField]).some(r=>r.documentId===ownerDoc.id&&r.moduleId===m.module&&r.elementId===m.element)))fail('Exhaustive Resource member carrier mapping required');
  sourceDDL='CREATE TABLE '+home+' (\n'+sourceColumns.join(',\n')+'\n);';
  viewSQL='CREATE VIEW '+view+' WITH (security_barrier=true) AS SELECT r.'+id(profile.resource.keyColumn)+' AS id,\n'+columns.map(c=>c.cellSQL+' AS '+id(c.outputColumn)).join(',\n')+' FROM '+home+' AS r;';
  if(sourceDDL.length+viewSQL.length>262144)fail('Native SQL output bound exceeded');
  return finish('compiled',null);
 }catch(error){return finish('refused',error instanceof Error?error.message:String(error));}
}
