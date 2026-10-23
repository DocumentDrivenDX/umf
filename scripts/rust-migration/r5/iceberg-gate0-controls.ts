// Additive source-only edge-case capture for the R5 Iceberg schema predecessor.
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {importIcebergSchema,exportIcebergSchema,inspectIceberg,getIcebergNode,proposeIcebergNodeEdit} from '../../../src';

const root=process.cwd();
const err=(e:unknown)=>{const x=e as any;return {name:x?.name??typeof e,code:x?.code??null,message:String(x?.message??e)}};
function capture(id:string,text:string,extra?:{get?:string}){
 try{
  const document=importIcebergSchema(text,{id});
  let get:any=null;
  if(extra?.get){try{get={status:'ok',path:extra.get,value:getIcebergNode(document,extra.get)}}catch(e){get={status:'error',path:extra.get,error:err(e)}}}
  return {status:'imported',documentId:document.id,inspect:inspectIceberg(document),export:exportIcebergSchema(document),...(get?{get}:{})};
 }catch(e){return {status:'rejected',error:err(e)}}
}
const schema=(fieldId:string,fieldType='long',tail='')=>`{"type":"struct","fields":[{"id":${fieldId},"name":"x","type":${JSON.stringify(fieldType)},"required":true}${tail}],"schema-id":0,"identifier-field-ids":[]}`;
const probes:any[]=[];
for(const [id,lexeme,note] of [
 ['int32-min','-2147483648','Signed int32 lower boundary; normative CONTRACT-020 range.'],
 ['int32-max','2147483647','Signed int32 upper boundary; normative CONTRACT-020 range.'],
 ['int32-max-plus-fraction','2147483647.0000001','Predecessor binary64 projection may round this non-integer token to the max integer; record behavior without treating it as normative.'],
 ['one-past-int32','2147483648','One past signed int32; normative structural rejection.'],
 ['one-point-zero','1.0','Integral numeric value with decimal-point lexeme; preserve lexical spelling.'],
 ['one-exponent-zero','1e0','Integral numeric value with exponent lexeme; preserve lexical spelling.'],
 ['negative-zero','-0','Signed zero lexeme; record whether predecessor preserves it.'],
 ] as const) probes.push({id,category:'exact-id-lexeme',note,input:schema(lexeme),observed:capture(id,schema(lexeme))});
for(const [id,lexeme,note] of [
 ['reserved-below','2147483446','Immediately below reserved metadata-column boundary.'],
 ['reserved-boundary','2147483447','Boundary value from CONTRACT-020 adapter check.'],
 ['reserved-above','2147483448','Immediately above reserved metadata-column boundary.'],
 ] as const) probes.push({id,category:'reserved-id-context',note,input:schema(lexeme),observed:capture(id,schema(lexeme))});

const collisionInputs=[
 {id:'field-vs-list-component',note:'Field id collides globally with list element id.',input:'{"type":"struct","fields":[{"id":1,"name":"a","type":"long","required":true},{"id":2,"name":"b","type":{"type":"list","element-id":1,"element-required":true,"element":"string"},"required":true}],"schema-id":0,"identifier-field-ids":[]}'},
 {id:'map-key-vs-value',note:'Map key-id collides with value-id.',input:'{"type":"struct","fields":[{"id":1,"name":"m","type":{"type":"map","key-id":4,"key":"string","value-id":4,"value-required":true,"value":"long"},"required":true}],"schema-id":0,"identifier-field-ids":[]}'},
 {id:'map-component-vs-field',note:'Map value-id collides with a sibling field id.',input:'{"type":"struct","fields":[{"id":1,"name":"m","type":{"type":"map","key-id":2,"key":"string","value-id":3,"value-required":true,"value":"long"},"required":true},{"id":3,"name":"x","type":"long","required":true}],"schema-id":0,"identifier-field-ids":[]}'},
];
for(const c of collisionInputs)probes.push({...c,category:'global-id-collision',observed:capture(c.id,c.input)});

const unknownPrimitive='{"type":"struct","fields":[{"id":1,"name":"x","type":"future_primitive","required":true}],"schema-id":0,"identifier-field-ids":[]}';
const unknownIdentifier='{"type":"struct","fields":[{"id":1,"name":"x","type":"future_primitive","required":true}],"schema-id":0,"identifier-field-ids":[1]}';
probes.push({id:'unknown-primitive',category:'unknown-type',note:'Unknown primitive spelling is retained and warns; interpretation remains incomplete.',input:unknownPrimitive,observed:capture('unknown-primitive',unknownPrimitive)});
probes.push({id:'unknown-primitive-identifier',category:'unknown-identifier-eligibility',note:'Unknown primitive does not receive a guessed identifier-eligibility result.',input:unknownIdentifier,observed:capture('unknown-primitive-identifier',unknownIdentifier)});

const ancestry=(required:boolean)=>`{"type":"struct","fields":[{"id":1,"name":"parent","type":{"type":"struct","fields":[{"id":2,"name":"child","type":"long","required":true}]},"required":${required}}],"schema-id":0,"identifier-field-ids":[2]}`;
for(const [id,required,note] of [
 ['required-struct-ancestry',true,'Identifier under required struct ancestry is eligible.'],
 ['optional-struct-ancestry',false,'Identifier beneath optional struct ancestry is invalid.'],
 ] as const){const input=ancestry(required);probes.push({id,category:'identifier-required-ancestry',note,input,observed:capture(id,input)})}

const pointerInput='{"type":"struct","fields":[{"id":1,"name":"zero","type":"long","required":true}],"schema-id":0,"identifier-field-ids":[]}';
probes.push({id:'canonical-array-pointer-zero',category:'pointer-index',note:'Canonical RFC 6901 array index `/0`.',input:pointerInput,observed:capture('pointer-zero',pointerInput,{get:'/fields/0/name'})});
probes.push({id:'noncanonical-array-pointer-zero',category:'pointer-index',note:'Leading-zero `/00` must not alias array index zero.',input:pointerInput,observed:capture('pointer-00',pointerInput,{get:'/fields/00/name'})});

const unicodeAndPrototype='{"type":"struct","fields":[{"id":1,"name":"__proto__","type":"long","required":true},{"id":2,"name":"\ud83d\ude00","type":"string","required":true}],"schema-id":0,"identifier-field-ids":[],"__proto__":{"opaque":true},"😀":{"opaque":"unicode-key"}}';
const unicodeDoc=importIcebergSchema(unicodeAndPrototype,{id:'utf16-prototype'});
probes.push({id:'utf16-and-prototype-keys',category:'string-key-preservation',note:'Prototype-like, supplementary-plane field/property names stay data; exact native strings recover.',input:unicodeAndPrototype,observed:{status:'imported',inspect:inspectIceberg(unicodeDoc),export:exportIcebergSchema(unicodeDoc),proto:getIcebergNode(unicodeDoc,'/__proto__'),emoji:getIcebergNode(unicodeDoc,'/😀'),prototypeField:getIcebergNode(unicodeDoc,'/fields/0/name'),astralField:getIcebergNode(unicodeDoc,'/fields/1/name')}});

const editBase=importIcebergSchema(pointerInput,{id:'edit-order'}),editSource=exportIcebergSchema(editBase);
let rootReplacement:any;try{const proposed=proposeIcebergNodeEdit(editBase,'','{"type":"struct","fields":[],"schema-id":7}');rootReplacement={status:'accepted',candidate:exportIcebergSchema(proposed.document),sourceAfter:exportIcebergSchema(editBase),sourceUnchanged:exportIcebergSchema(editBase)===editSource,validation:proposed.validation}}catch(e){rootReplacement={status:'rejected',error:err(e),sourceAfter:exportIcebergSchema(editBase)}}
function editOutcome(path:string,replacement:string){try{return {status:'accepted',candidate:exportIcebergSchema(proposeIcebergNodeEdit(editBase,path,replacement).document),sourceAfter:exportIcebergSchema(editBase)}}catch(e){return {status:'rejected',error:err(e),sourceAfter:exportIcebergSchema(editBase)}}}
const replacementOrder={source:editSource,rootReplacement,missingTargetValidReplacement:editOutcome('/missing','true'),missingTargetMalformedReplacement:editOutcome('/missing','{'),existingTargetMalformedReplacement:editOutcome('/fields/0/name','{')};

const packet={capture:'R5 Iceberg Gate 0 additive predecessor controls',generatedBy:'scripts/rust-migration/r5/iceberg-gate0-controls.ts',runtime:{bunVersion:Bun.version,platform:process.platform,arch:process.arch},authority:{contract:'CONTRACT-020',normativeAndPredecessorDifferencesExplicit:true,notFullEditParity:true},probes,replacementOrder};
const text=JSON.stringify(packet,null,2)+'\n';
const target=join(root,'docs/helix/04-build/evidence/rust-migration/r5-iceberg-schema/controls.json');
if(Bun.argv.includes('--check')){if(await readFile(target,'utf8')!==text)throw Error('Gate 0 controls differ; review before replacing');console.log(`Iceberg Gate 0 controls match: ${probes.length} controls`)}else{await writeFile(target,text);console.log(`wrote ${probes.length} Iceberg Gate 0 controls`)}
