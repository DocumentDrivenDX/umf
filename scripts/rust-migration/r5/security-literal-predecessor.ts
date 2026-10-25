// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze direct checkSchemaLiteral outcomes used by security disclosure cells.
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {checkSchemaLiteral} from '../../../src/model/schema-literals';

const output='docs/helix/04-build/evidence/rust-migration/r8-security-literal/predecessor.json';
const document={umf:'0.10.0',id:'security-literal',vocabularies:{},modules:[{id:'m',namespace:'urn:security-literal',elements:[]}]};
const intField=(extra:Record<string,unknown>={})=>({id:'n',kind:'field',scalarType:'integer',cardinality:'one',nullability:'required',facets:{integerWidth:{bits:64,signed:true}},extensions:{},...extra});
const cases=[
 {id:'integer-max-i64',field:intField(),value:{integerToken:'9223372036854775807'}},
 {id:'integer-overflow',field:intField(),value:{integerToken:'9223372036854775808'}},
 {id:'integer-malformed-token',field:intField(),value:{integerToken:'01'}},
 {id:'integer-null-required',field:intField(),value:null},
 {id:'integer-null-absent-allowed',field:intField({nullability:'absent-allowed'}),value:null},
 {id:'integer-unknown-wrapper-member',field:intField(),value:{integerToken:'1',future:0}},
 {id:'unknown-facet-precedes-null',field:intField({facets:{integerWidth:{bits:64,signed:true},future:1}}),value:null},
 {id:'decimal-exact-scale',field:{id:'d',kind:'field',scalarType:'decimal',cardinality:'one',nullability:'required',facets:{precision:6,scale:2},extensions:{}},value:{decimalToken:'1.230'}},
 {id:'decimal-rounding-refusal',field:{id:'d',kind:'field',scalarType:'decimal',cardinality:'one',nullability:'required',facets:{precision:6,scale:2},extensions:{}},value:{decimalToken:'1.234'}},
 {id:'string-supplementary-unicode-length',field:{id:'s',kind:'field',scalarType:'string',cardinality:'one',nullability:'required',facets:{length:{min:1,max:1,unit:'unicode-scalar'}},extensions:{}},value:{string:'😀'}},
 {id:'string-lone-surrogate-refusal',field:{id:'s',kind:'field',scalarType:'string',cardinality:'one',nullability:'required',facets:{},extensions:{}},value:{string:'\ud800'}},
].map(test=>({...test,document}));
const sourceFiles=['src/model/schema-literals.ts','src/validation/literal-kernel.ts','src/validation/literal-policy.ts','src/validation/current-policy.ts','spec/metamodel/generated/domain-policy.json'];
const outcomes=cases.map(test=>{
 try {checkSchemaLiteral(test.document as any,test.field as any,test.value);return {...test,outcome:{accepted:true}};}
 catch(error){const e=error as Error&{code?:string;path?:string};return {...test,outcome:{accepted:false,code:e.code??null,path:e.path??'',message:e.message}};}
});
const packet={format:'umf.rust.security-literal.predecessor/1',runtime:{bun:Bun.version},sourceHashes:Object.fromEntries(sourceFiles.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')])),captureScriptSha256:createHash('sha256').update(readFileSync('scripts/rust-migration/r5/security-literal-predecessor.ts')).digest('hex'),caseCount:outcomes.length,cases:outcomes};
const serialized=JSON.stringify(packet,null,2)+'\n';
if(process.argv.includes('--check')){
 const current=readFileSync(output);
 if(!current.equals(Buffer.from(serialized)))throw new Error('Frozen security literal predecessor differs; inspect current sources, then refresh explicitly.');
 console.log(`Security literal predecessor matches: ${output}`);
}else writeFileSync(output,serialized);
