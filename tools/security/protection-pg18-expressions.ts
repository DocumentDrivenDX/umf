/** Private PostgreSQL 18 projection primitives, not a catalog or authority compiler.
 * Caller must establish present, typed input, native representability, output
 * domain/facets and row eligibility before installing any generated expression.
 * No SQL statement, arbitrary expression, identifier path or native code accepted.
 */
import {copyJson} from '../../src/model/json';

const PROFILE='umf.security.pg18-expression/0.1';
const REGEX='umf.security.pg18-literal-regex/0.1';
const DATE='umf-gregorian-date/1.0.0';
type Obj=Record<string,unknown>;
export type Pg18ExpressionResult = Readonly<{
 status:'compiled'|'refused';complete:false;authority:false;profile:typeof PROFILE;
 sql:string|null;warnings:readonly string[];reason:string|null;
}>;
function fail(message:string):never {throw new Error(message);}
function object(value:unknown):Obj {
 if(value===null||typeof value!=='object'||Array.isArray(value))fail('Object required');return value as Obj;
}
function keys(value:Obj,names:string[]):void {
 if(Object.keys(value).length!==names.length||names.some(k=>!Object.hasOwn(value,k)))fail('Exact closed signature required');
}
function text(value:unknown):string {
 if(typeof value!=='string'||value.length>4096||/[\u0000\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)||value.includes('\0'))fail('Bounded PostgreSQL UTF8 text without NUL or unpaired surrogate required');
 return value;
}
function identifier(value:unknown):string {
 const s=text(value);if(!/^[A-Za-z_][A-Za-z_0-9]{0,62}$/.test(s))fail('Bounded ASCII identifier required');return '"'+s+'"';
}
function literal(value:unknown):string {return "E'"+text(value).replaceAll('\\','\\\\').replaceAll("'","''")+"'";}
function count(value:unknown):number {
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>4096)fail('Count must be an integer in0..4096');return value;
}
function numeric(value:unknown):string {
 if(typeof value!=='string'||value.length>512||!/^[-]?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value))fail('Exact bounded decimal token required');return value;
}
function padding(value:unknown):string {const s=text(value);if(Array.from(s).length!==1)fail('One Unicode scalar padding required');return literal(s);}
export function compilePg18ProtectionExpression(input:unknown):Pg18ExpressionResult {
 const warnings:string[]=[];
 const finish=(status:'compiled'|'refused',sql:string|null,reason:string|null):Pg18ExpressionResult=>Object.freeze({status,complete:false,authority:false,profile:PROFILE,sql,warnings:Object.freeze(warnings),reason});
 try {
  const r=object(copyJson(input));keys(r,['profile','source','family','recipe']);if(r.profile!==PROFILE)fail('Exact provider profile required');
  const source=object(r.source);keys(source,['alias','column']);const x=identifier(source.alias)+'.'+identifier(source.column);
  if(!['string','integer','decimal','date'].includes(r.family as string))fail('Native family not admitted');
  const p=object(r.recipe);const op=p.operation;
  let sql:string;
  if(op==='constant') {keys(p,['operation','value']);if(r.family!=='string')fail('Only string constant primitive admitted');sql=p.value===null?'NULL::pg_catalog.text':literal(p.value);}
  else if(op==='null-out') {keys(p,['operation']);sql='NULL::pg_catalog.'+(r.family==='string'?'text':r.family==='date'?'date':'numeric');}
  else if(op==='range-bucket') {
   keys(p,['operation','width','origin']);if(!['integer','decimal'].includes(r.family as string))fail('Exact numeric input required');
   const w=numeric(p.width),o=numeric(p.origin);if(!/[1-9]/.test(w)||w.startsWith('-'))fail('Positive width required');
   if(r.family==='integer'&&(w.includes('.')||o.includes('.')))fail('Integer operands required');
   // PostgreSQL numeric div truncates toward zero. Correct negative remainders
   // explicitly; numeric division then floor may round width-minus-one to1.
   const width='('+literal(w)+'::pg_catalog.numeric)',origin='('+literal(o)+'::pg_catalog.numeric)',d='('+x+' OPERATOR(pg_catalog.-) '+origin+')';
   const quotient='(pg_catalog.div('+d+','+width+') OPERATOR(pg_catalog.-) CASE WHEN pg_catalog.mod('+d+','+width+') OPERATOR(pg_catalog.<) 0 THEN 1 ELSE 0 END)';
   // OPERATOR(...) uses generic operator precedence, even for built-in *.
   sql='('+origin+' OPERATOR(pg_catalog.+) ('+quotient+' OPERATOR(pg_catalog.*) '+width+'))';
  } else if(op==='truncate-date') {
   keys(p,['operation','calendar','unit']);if(r.family!=='date'||p.calendar!==DATE||!['year','quarter','month','day'].includes(p.unit as string))fail('Exact Gregorian date provider/unit required');
   sql='pg_catalog.date_trunc('+literal(p.unit)+', '+x+'::pg_catalog.timestamp)::pg_catalog.date';
   warnings.push('Input and output must be finite Gregorian dates in0001..9999; installer must enforce this range.');
  } else {
   if(r.family!=='string')fail('Text input required');
   if(op==='partial') {
    keys(p,['operation','prefix','suffix','padding','unit']);if(p.unit!=='unicode-scalar')fail('Unicode scalar unit required');
    const a=count(p.prefix),b=count(p.suffix),pad=padding(p.padding),n='pg_catalog.char_length('+x+')';
    const start='LEAST('+a+','+n+')',end='LEAST('+b+',GREATEST(0,'+n+' OPERATOR(pg_catalog.-) '+start+'))';
    sql='(pg_catalog.left('+x+','+start+') OPERATOR(pg_catalog.||) pg_catalog.repeat('+pad+',GREATEST(0,'+n+' OPERATOR(pg_catalog.-) '+start+' OPERATOR(pg_catalog.-) '+end+')) OPERATOR(pg_catalog.||) pg_catalog.right('+x+','+end+'))';
   } else if(op==='fixed-length-redact') {
    keys(p,['operation','length','padding','unit']);if(p.unit!=='unicode-scalar')fail('Unicode scalar unit required');
    sql='pg_catalog.repeat('+padding(p.padding)+','+count(p.length)+')';
    // This recipe propagates null; constant and null-out deliberately do not.
    sql='CASE WHEN '+x+' IS NULL THEN NULL::pg_catalog.text ELSE '+sql+' END';
   } else if(op==='prefix-only') {
    keys(p,['operation','length','unit']);if(p.unit!=='unicode-scalar')fail('Unicode scalar unit required');sql='pg_catalog.left('+x+','+count(p.length)+')';
   } else if(op==='regex-replace') {
    keys(p,['operation','provider','pattern','replacement']);if(p.provider!==REGEX)fail('Exact regex provider required');
    const pattern=text(p.pattern),replacement=text(p.replacement);
    if(pattern!=='[0-9]+'&&(!pattern||/[.\\^$*+?()[\]{}|]/.test(pattern)))fail('Only nonempty regex literals or exactly[0-9]+ admitted');
    // Provider is global, C-collation, literal replacement (including backslashes).
    sql='pg_catalog.regexp_replace('+x+' COLLATE pg_catalog."C",'+literal(pattern)+','+literal(replacement.replaceAll('\\','\\\\'))+',\'g\')';
   } else if(op==='hash') {
    keys(p,['operation','algorithm','salt','retainedEquality','dictionaryWarning']);
    if(p.algorithm!=='sha256-utf8-lowerhex'||p.salt!=='none'||p.retainedEquality!==true||p.dictionaryWarning!=='unsalted-dictionary-attack')fail('Exact unsalted SHA256 profile, retained equality and warning required');
    sql='pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('+x+',\'UTF8\')),\'hex\')';
    warnings.push('Unsalted SHA256 retains equality and permits dictionary attacks; no custody or authorization proof.');
   } else fail('Unqualified native recipe');
  }
  warnings.push('Expression only: typed present input, source eligibility, output domain, storage effect, catalog correspondence and installation remain obligations.');
  return finish('compiled',sql,null);
 } catch(error) {return finish('refused',null,error instanceof Error?error.message:String(error));}
}
