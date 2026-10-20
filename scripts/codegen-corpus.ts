// SPDX-License-Identifier: MIT OR Apache-2.0
/** Cross-runtime corpus uses the real portable generator and complete results. */
import {generatePythonClient,type PythonClientRequest} from '../src/access';
import {stringify} from 'yaml';
import {tableOperationSource} from '../tests/unified/table-operation-fixture';
import {temporalSource} from '../tests/unified/table-temporal-fixture';
import {relatedSource} from '../tests/unified/table-related-fixture';
import {domainSource} from '../tests/unified/table-domain-fixture';
const original=await Bun.file(new URL('../tests/unified/commerce.json',import.meta.url)).text();
const document=JSON.parse(original);
const native=JSON.stringify(tableOperationSource());
const cases:{name:string;request:PythonClientRequest}[]=[
 {name:'original-json',request:{text:original,package:'shop'}},
 {name:'crlf-source',request:{text:original.replaceAll('\n','\r\n'),package:'shop'}},
 {name:'yaml',request:{text:stringify(document),format:'yaml',package:'shop'}},
 {name:'customer-selection',request:{text:original,package:'shop',records:[{module:'commerce',element:'Customer'}],actions:[]}},
 {name:'action-selection',request:{text:original,package:'shop',actions:[{module:'commerce',action:'shipOrder'}]}},
];
function changed(name:string,change:(doc:any)=>void){const doc=structuredClone(document);change(doc);cases.push({name,request:{text:JSON.stringify(doc),package:'shop'}});}
changed('unicode',doc=>{doc.title='Praxis café 東京 😀 \u2028';doc.modules[0].elements.find((e:any)=>e.id==='customerName').allowedValues=[{string:'\"; $1 \\ 😀 \u2028'}];});
changed('optional-value',doc=>{doc.modules[0].elements.find((e:any)=>e.id==='amount').nullability='absent-allowed';});
changed('array-value',doc=>{doc.modules[0].elements.push({id:'tags',name:'tags',kind:'field',cardinality:'array',nullability:'absent-allowed',itemType:{module:'commerce',element:'customerName'},extensions:{}});doc.modules[0].elements.find((e:any)=>e.id==='Customer').members.push({module:'commerce',element:'tags'});});
changed('foreign-field-extension-refuses',doc=>{doc.modules[0].elements[0].extensions={'foreign':{meaning:'retain'}};});
changed('nullable-key-refuses',doc=>{doc.modules[0].elements[0].nullability='absent-allowed';});
changed('reserved-name-refuses',doc=>{doc.modules[0].elements.find((e:any)=>e.id==='Customer').name='Client';});
changed('unknown-facet-refuses',doc=>{doc.modules[0].elements.find((e:any)=>e.id==='customerName').facets={futureLimit:3};});
changed('table-lifecycle-refuses-unqualified-client',doc=>{doc.vocabularies['umf.tables']={version:'0.1.0'};doc.modules[0].extensions['umf.tables']={profile:'postgresql18/0.1',tables:[],seedSets:[],commands:[]};});
cases.push({name:'source-core-refuses',request:{text:original.replace('0.10.0','0.8.0'),package:'shop'}});
cases.push({name:'invalid-package-refuses',request:{text:original,package:'../escape'}});
cases.push({name:'invalid-json-refuses',request:{text:'{"umf":',package:'shop'}});
cases.push({name:'declared-native-module',request:{text:native,package:'native_demo'}});
cases.push({name:'native-yaml-profile-refuses',request:{text:native,format:'yaml',package:'native_demo'}});
cases.push({name:'declared-native-temporal-module',request:{text:JSON.stringify(temporalSource()),package:'temporal_demo'}});
cases.push({name:'declared-native-domain-clock-module',request:{text:JSON.stringify(domainSource()),package:'domain_demo'}});
cases.push({name:'native-related-policy',request:{text:JSON.stringify(relatedSource()),package:'related_demo'}});
cases.push({name:'native-nested-related-policy',request:{text:JSON.stringify(relatedSource(true)),package:'related_demo'}});
const corpus=cases.map(item=>{try{return {...item,expected:{ok:true,result:generatePythonClient(item.request)}};}catch(error){const e=error as {code?:string;message?:string;path?:string};return {...item,expected:{ok:false,error:{code:e.code??'GENERATION_FAILED',message:e.message??'Generation refused',...(e.path===undefined?{}:{path:e.path})}}};}});
await Bun.write(process.argv[2]??'/private/tmp/umf-codegen-corpus.json',JSON.stringify(corpus,null,2)+'\n');
console.log(JSON.stringify(corpus.map(x=>({name:x.name,accepted:x.expected.ok}))));
