// SPDX-License-Identifier: MIT OR Apache-2.0
import {mkdir,mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

function isAddressInUse(error:unknown):boolean{
 if(error&&typeof error==='object'){
  const candidate=error as {code?:unknown;errno?:unknown};
  if(candidate.code==='EADDRINUSE'||candidate.errno==='EADDRINUSE')return true;
 }
 return String(error).includes('EADDRINUSE');
}
const collisionMessage=Object.assign(new Error('Failed to start server. Is port 47595 in use?'),{syscall:'listen',errno:0,code:'EADDRINUSE'});
if(!isAddressInUse(collisionMessage)||!isAddressInUse(new Error('listen EADDRINUSE'))||isAddressInUse(Object.assign(new Error('connection refused'),{code:'ECONNREFUSED'})))throw new Error('Loopback bind collision classifier regression');

let archive=resolve(process.argv[2]??'');
if(!process.argv[2]){
 archive=resolve('.cache/sdk-distribution/umf-sdk.tgz');
}
const scratch=await mkdtemp(join(tmpdir(),'umf-rust-sdk-default-test-'));
const testStarted=Date.now();
const install=join(scratch,'node_modules/@umf/core');
const original=await readFile('tests/unified/commerce.json','utf8');
const corpus=JSON.parse(await readFile('docs/helix/04-build/evidence/rust-migration/r3/baseline/operations.json','utf8')) as {cases:{id:string;operation:string;request:unknown;expected:unknown}[]};
const cardinalityPacket=JSON.parse(await readFile('docs/helix/04-build/evidence/rust-migration/r5-model-bindings/frozen-cardinality-typescript.json','utf8')) as any;
const facetsPacket=JSON.parse(await readFile('docs/helix/04-build/evidence/rust-migration/r5-core-facets/frozen-typescript.json','utf8')) as any;
const facetsRegression=JSON.parse(await readFile('docs/helix/04-build/evidence/rust-migration/r5-core-facets/regression-cases.json','utf8')) as any;
const keysPacket=JSON.parse(await readFile('docs/helix/04-build/evidence/rust-migration/r5-core-keys-default-route/frozen-typescript.json','utf8')) as any;
const bit128Packet=JSON.parse(await readFile('scripts/rust-migration/r5/bit128-default-route/predecessor.json','utf8')) as any;
const javascriptNumericOracle=JSON.parse(await readFile('docs/helix/04-build/evidence/rust-migration/r5-javascript-numeric/oracle-output.json','utf8')) as {op:string;token?:string;bits?:string;scalarType?:'integer'|'decimal';integer?:boolean;oracle:{ok:boolean;value:unknown}}[];
const javascriptNumericDocument=JSON.parse(await readFile('tests/lifecycle/fixtures/legacy-note.json','utf8')) as unknown;
const compactDirectory='docs/helix/04-build/evidence/rust-migration/r5-dataset-values-compact-default-cutover';
const compactCases=await Promise.all((await readdir(compactDirectory))
 .filter(name=>name.startsWith('frozen-')&&name.endsWith('.json')&&name!=='frozen-forged-receipt.json')
 .sort()
 .map(async name=>({...JSON.parse(await readFile(join(compactDirectory,name),'utf8')) as any,__filename:name})));
if(compactCases.length!==19)throw new Error(`Expected 19 frozen compact Dataset validation vectors, found ${compactCases.length}`);
const canonical=(value:unknown):string=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);
const javascriptNumericReplaySnippet=`
const numericRows=${JSON.stringify(javascriptNumericOracle)};
const numericContext={document:${JSON.stringify(javascriptNumericDocument)},field:{module:'note_lifecycle',element:'notes__note_id'}};
const numericCanonical=value=>JSON.stringify(value,(_key,item)=>typeof item==='bigint'?item.toString():item);
const numericCall=(api,row)=>{
 switch(row.op){
  case 'exactDecimal': return api.exactDecimal(row.token);
  case 'integerFromBigInt': return api.integerFromBigInt(BigInt(row.token));
  case 'integerToBigInt': return api.integerToBigInt({integerToken:row.token}).toString();
  case 'admitJavascriptNumber': { const bytes=Uint8Array.from(row.bits.match(/../g),part=>Number.parseInt(part,16)); return api.admitJavascriptNumber(new DataView(bytes.buffer).getFloat64(0,false),row.scalarType); }
  case 'numericToNumberLossless': return api.numericToNumberLossless(row.integer?{integerToken:row.token}:{decimalToken:row.token});
  default: throw new Error('Unknown numeric oracle operation: '+row.op);
 }
};
if(!['exactDecimal','integerFromBigInt','integerToBigInt','admitJavascriptNumber','numericToNumberLossless'].every(name=>typeof root[name]==='function'))throw new Error('Rust JavaScript numeric root exports missing');
let numericDefaultFirstCallMs;
for(const row of numericRows){
 const outcomes=[root,referenceCore].map((api,index)=>{const started=performance.now();try{return {ok:true,value:numericCall(api,row)}}catch{return {ok:false,value:null}}finally{if(index===0&&numericDefaultFirstCallMs===undefined)numericDefaultFirstCallMs=performance.now()-started}});
 for(const outcome of outcomes)if(outcome.ok!==row.oracle.ok||(outcome.ok&&numericCanonical(outcome.value)!==numericCanonical(row.oracle.value)))throw new Error('JavaScript numeric route disagrees with independent oracle: '+JSON.stringify({row,outcome}));
 if(outcomes[0].ok!==outcomes[1].ok||(outcomes[0].ok&&numericCanonical(outcomes[0].value)!==numericCanonical(outcomes[1].value)))throw new Error('JavaScript numeric Rust/reference root mismatch: '+row.op);
}
const numericCapture=operation=>{try{return {ok:true,value:operation()}}catch(error){return {ok:false,error:{code:error.code??'',path:error.path??'',message:error.message??String(error)}}}};
let numericGetterCalls=0;const numericAccessor={get decimalToken(){numericGetterCalls++;return '1'}};
const numericRefusals=[
 ['infinity',api=>api.admitJavascriptNumber(Infinity,'decimal')],
 ['nan',api=>api.admitJavascriptNumber(NaN,'decimal')],
 ['negative-zero',api=>api.admitJavascriptNumber(-0,'decimal')],
 ['extra-carrier',api=>api.numericToNumberLossless({decimalToken:'1',future:true})],
 ['symbol-carrier',api=>api.numericToNumberLossless(Object.assign({decimalToken:'1'},{[Symbol('future')]:true}))],
 ['accessor-carrier',api=>api.numericToNumberLossless(numericAccessor)],
];
for(const [label,operation] of numericRefusals){const outcomes=[root,referenceCore].map(api=>numericCapture(()=>operation(api)));if(numericCanonical(outcomes[0])!==numericCanonical(outcomes[1]))throw new Error('JavaScript numeric host refusal differs from reference: '+label+' '+numericCanonical(outcomes));}
if(numericGetterCalls!==0)throw new Error('JavaScript numeric accessor admission invoked a getter');
const numericProxyTrace=api=>{const trace=[];const target={decimalToken:'1'};const proxy=new Proxy(target,{getPrototypeOf(value){trace.push('getPrototypeOf');return Reflect.getPrototypeOf(value)},ownKeys(value){trace.push('ownKeys');return Reflect.ownKeys(value)},getOwnPropertyDescriptor(value,key){trace.push('descriptor:'+String(key));return Reflect.getOwnPropertyDescriptor(value,key)}});const result=numericCapture(()=>api.numericToNumberLossless(proxy));return {trace,result}};
const numericProxyOutcomes=[root,referenceCore].map(numericProxyTrace);
if(numericCanonical(numericProxyOutcomes[0])!==numericCanonical(numericProxyOutcomes[1]))throw new Error('JavaScript numeric proxy reflection order differs from reference: '+numericCanonical(numericProxyOutcomes));
const numericContextOutcomes=[root,referenceCore].map(api=>numericCapture(()=>api.integerFromBigInt(1n,numericContext)));
if(numericCanonical(numericContextOutcomes[0])!==numericCanonical(numericContextOutcomes[1])||!numericContextOutcomes[0].ok)throw new Error('JavaScript numeric Field-context validation differs from reference');
const numericBoundaryCapture=(operation)=>{try{return {ok:true,value:operation()}}catch(error){return {ok:false,error:{code:error.code??'',path:error.path??'',message:error.message??String(error)}}}};
const numericBoundaryEqual=(label,operation)=>{const outcomes=[root,referenceCore].map(api=>numericBoundaryCapture(()=>operation(api)));if(numericCanonical(outcomes[0])!==numericCanonical(outcomes[1]))throw new Error('Numeric default resource boundary differs from TypeScript reference: '+label+' '+numericCanonical(outcomes));return outcomes[0]};
const overlongNumericToken='1'.repeat(4_000_001);
const overlongExponent='1e'+'9'.repeat(33);
const overlongTokenResult=numericBoundaryEqual('token-over-4m',api=>api.exactDecimal(overlongNumericToken));
if(overlongTokenResult.ok||overlongTokenResult.error.code!=='LIMIT')throw new Error('Numeric default accepted token beyond CONTRACT-049 text limit: '+numericCanonical(overlongTokenResult));
const overlongExponentResult=numericBoundaryEqual('exponent-over-32',api=>api.exactDecimal(overlongExponent));
if(overlongExponentResult.ok||overlongExponentResult.error.code!=='LIMIT')throw new Error('Numeric default accepted exponent beyond CONTRACT-049 bound: '+numericCanonical(overlongExponentResult));
const oversizedContext={...numericContext,future:Array(100_001).fill(0)};
const oversizedContextResult=numericBoundaryEqual('context-over-100k-values',api=>api.integerFromBigInt(1n,oversizedContext));
if(oversizedContextResult.ok||!['LIMIT','RESOURCE_LIMIT'].includes(oversizedContextResult.error.code))throw new Error('Numeric default accepted over-budget context: '+numericCanonical(oversizedContextResult));
const deepContextNode={};let deepContextTail=deepContextNode;for(let index=0;index<132;index++){deepContextTail.next={};deepContextTail=deepContextTail.next;}
const deepContextResult=numericBoundaryEqual('context-over-depth',api=>api.integerFromBigInt(1n,{...numericContext,future:deepContextNode}));
if(deepContextResult.ok||!['LIMIT','RESOURCE_LIMIT'].includes(deepContextResult.error.code))throw new Error('Numeric default accepted over-depth context: '+numericCanonical(deepContextResult));
let numericContextGetterCalls=0;const accessorContext={...numericContext,future:{get value(){numericContextGetterCalls++;return 1;}}};
const accessorContextResult=numericBoundaryEqual('context-getter-refusal',api=>api.integerFromBigInt(1n,accessorContext));
if(accessorContextResult.ok||numericContextGetterCalls!==0)throw new Error('Numeric context admission accepted or invoked a getter');
const longButBoundedNumericToken='1'.repeat(100_001);
for(const api of [root,referenceCore]){const accepted=api.exactDecimal(longButBoundedNumericToken);if(accepted.decimalToken.length!==longButBoundedNumericToken.length)throw new Error('Numeric default changed a bounded long token');}
const numericBoundaryCases=6;
const numericCaseCount=numericRows.length;
`;
const cardinalityReplaySnippet=`
const cp=${JSON.stringify(cardinalityPacket)};
const cardCapture=fn=>{try{return {ok:true,value:fn()}}catch(error){return {ok:false,error:{code:error.code??'',message:error.message??String(error),path:error.path??''}}}};
const cardPrototypeShape=value=>{if(Array.isArray(value))return value.map(cardPrototypeShape);if(value&&typeof value==='object'){const proto=Object.getPrototypeOf(value);return {prototype:proto===null?'null':proto===Object.prototype?'plain':'other',fields:Object.fromEntries(Object.keys(value).sort().map(key=>[key,cardPrototypeShape(value[key])]))}}return typeof value};
const cardShapeSource=structuredClone(cp.document);const cardShapeRequest=structuredClone(cp.request);const cardRustShape=root.declareCoreCardinality(cardShapeSource,cp.identity,cardShapeRequest);const cardTsShape=referenceCore.declareCoreCardinality(cardShapeSource,cp.identity,cardShapeRequest);if(JSON.stringify(cardPrototypeShape(cardRustShape))!==JSON.stringify(cardPrototypeShape(cardTsShape)))throw new Error('cardinality result object prototype shape differs from TypeScript reference');
const cardIsolation=declare=>{const input=structuredClone(cp.document),identity=structuredClone(cp.identity),request=structuredClone(cp.request);const first=declare(input,identity,request);first.source.modules[0].elements[0].id='source-only';const sourceTargetIndependent=first.target.modules[0].elements[0].id==='e';const sourceInputIndependent=input.modules[0].elements[0].id==='e';const second=declare(input,identity,request);second.target.modules[0].elements[0].id='target-only';const targetSourceIndependent=second.source.modules[0].elements[0].id==='e';second.identity.module='identity-only';second.provenance.cardinality='provenance-only';return {sourceTargetIndependent,sourceInputIndependent,targetSourceIndependent,identityInputIndependent:identity.module===cp.identity.module,provenanceInputIndependent:request.cardinality===cp.request.cardinality}};const cardRustIsolation=cardIsolation(root.declareCoreCardinality),cardTsIsolation=cardIsolation(referenceCore.declareCoreCardinality);if(JSON.stringify(cardRustIsolation)!==JSON.stringify(cardTsIsolation)||Object.values(cardRustIsolation).some(value=>!value))throw new Error('cardinality nested result objects do not preserve TypeScript copy isolation');
const cardSurrogate=structuredClone(cp.document);cardSurrogate.modules[0].elements[0].cardinality='\\ud800';
let cardAccessorCalls=0;const cardAccessorIdentity={get module(){cardAccessorCalls++;return 'm'},get element(){cardAccessorCalls++;return 'e'}};const cardAccessorSource={get future(){return true}};
const cardSourceWith=mutate=>{const value=structuredClone(cp.document);mutate(value);return value};
const cardHidden=cardSourceWith(value=>Object.defineProperty(value,'hidden',{value:true,enumerable:false}));
const cardSymbol=cardSourceWith(value=>Object.defineProperty(value,Symbol('hidden'),{value:true,enumerable:true}));
const cardCustomPrototype=cardSourceWith(value=>Object.setPrototypeOf(value,{future:true}));
const cardSparse=cardSourceWith(value=>{value.modules=[];value.modules.length=1});
const cardCycle=cardSourceWith(value=>{value.extensions={};value.extensions.self=value});
const cardNaN=cardSourceWith(value=>{value.extensions={future:NaN}});
const cardInfinity=cardSourceWith(value=>{value.extensions={future:Infinity}});
const cardUndefined=cardSourceWith(value=>{value.extensions={future:undefined}});
const cardBigint=cardSourceWith(value=>{value.extensions={future:1n}});
const cardNested=cardSourceWith(value=>{value.modules[0].elements[0].extensions.future.deep=undefined});
const cardNonEnumerableIdentity={module:'m'};Object.defineProperty(cardNonEnumerableIdentity,'element',{value:'e',enumerable:false});
const cardSymbolIdentity={module:'m',element:'e',[Symbol('future')]:true};
const cardCustomIdentity=Object.assign(Object.create({future:true}),{module:'m',element:'e'});
const cardSparseRequest={cardinality:'array',itemType:[]};cardSparseRequest.itemType.length=1;
const cardCyclicRequest={cardinality:'array',itemType:{module:'m',element:'v'}};cardCyclicRequest.itemType.future=cardCyclicRequest;
const cardRequestInputs={null:null,empty:{},number:42,boolean:true,array:[],extra:{cardinality:'one',future:true},invalidCardinality:{cardinality:'bogus'},nullCardinality:{cardinality:null},numberCardinality:{cardinality:1},conditionalOne:{cardinality:'one',itemType:{module:'m',element:'v'}},arrayNullItem:{cardinality:'array',itemType:null},arrayEmptyItem:{cardinality:'array',itemType:{}},arrayModuleEmpty:{cardinality:'array',itemType:{module:'',element:'v'}},arrayElementEmpty:{cardinality:'array',itemType:{module:'m',element:''}},arrayItemExtra:{cardinality:'array',itemType:{module:'m',element:'v',future:true}},arrayItemArray:{cardinality:'array',itemType:[]},mapItemNumber:{cardinality:'map',itemType:1},conditionalUnspecified:{cardinality:'unspecified',itemType:{module:'m',element:'v'}},conditionalNull:{cardinality:null,itemType:{module:'m',element:'v'}},conditionalNumber:{cardinality:1,itemType:{module:'m',element:'v'}},conditionalBogus:{cardinality:'bogus',itemType:{module:'m',element:'v'}},arrayItemNumberKeys:{cardinality:'array',itemType:{module:1,element:2}}};
const cardRequestSchemaControls=Object.fromEntries(Object.entries(cardRequestInputs).map(([name,request])=>[name,cardCapture(()=>root.declareCoreCardinality(cp.document,cp.identity,request))]));
const cardInvalidReceipt=structuredClone(cp.declaration);cardInvalidReceipt.source=cp.unknown;cardInvalidReceipt.request={cardinality:'one'};
const cardCurrentAccessor={get future(){return true}};
const cardCases={
 inspections:{missing:cardCapture(()=>root.inspectCoreCardinality(cp.document,cp.identity)),known:cardCapture(()=>root.inspectCoreCardinality(cp.known,cp.identity)),unknown:cardCapture(()=>root.inspectCoreCardinality(cp.unknown,cp.identity)),surrogate:cardCapture(()=>root.inspectCoreCardinality(cardSurrogate,cp.identity)),inapplicable:cardCapture(()=>root.inspectCoreCardinality(cp.inapplicable,cp.identity))},
 declaration:cardCapture(()=>root.declareCoreCardinality(cp.document,cp.identity,cp.request)),
 surrogateItemDeclaration:cardCapture(()=>root.declareCoreCardinality(cp.surrogateItemDocument,cp.identity,cp.surrogateItemRequest)),
 verified:cardCapture(()=>root.verifyCoreCardinalityDeclaration(cp.declaration,cp.declaration.target)),
 refusals:{unknownOverwrite:cardCapture(()=>root.declareCoreCardinality(cp.unknown,cp.identity,{cardinality:'one'})),invalidRequest:cardCapture(()=>root.declareCoreCardinality(cp.document,cp.identity,{cardinality:'array',itemType:{module:'',element:''}})),missingIdentity:cardCapture(()=>root.inspectCoreCardinality(cp.document,{module:'absent',element:'absent'})),malformedSourceReceipt:cardCapture(()=>root.verifyCoreCardinalityDeclaration(cp.malformedSourceReceipt,cp.declaration.target)),malformedTargetReceipt:cardCapture(()=>root.verifyCoreCardinalityDeclaration(cp.malformedTargetReceipt,cp.declaration.target)),surrogateIdentity:cardCapture(()=>root.inspectCoreCardinality(cp.surrogateIdentityDocument,cp.surrogateIdentity)),invalidSourceDiagnostics:cardCapture(()=>root.inspectCoreCardinality(cp.invalidSource,cp.identity))},
 identityControls:{nullIdentity:cardCapture(()=>root.inspectCoreCardinality(cp.document,null)),extraIdentity:cardCapture(()=>root.inspectCoreCardinality(cp.document,{module:'m',element:'e',future:true})),accessorIdentity:cardCapture(()=>root.inspectCoreCardinality(cp.document,cardAccessorIdentity)),accessorGetterCalls:cardAccessorCalls},
 orderingControls:{declareInvalidRequestBeforeSource:cardCapture(()=>root.declareCoreCardinality(cardAccessorSource,cp.identity,{cardinality:'array',itemType:{module:'',element:''}})),declareSourceBeforeIdentity:cardCapture(()=>root.declareCoreCardinality(cardAccessorSource,null,cp.request)),inspectSourceBeforeIdentity:cardCapture(()=>root.inspectCoreCardinality(cardAccessorSource,null))},
 hostAdmissionControls:{hidden:cardCapture(()=>root.inspectCoreCardinality(cardHidden,cp.identity)),symbol:cardCapture(()=>root.inspectCoreCardinality(cardSymbol,cp.identity)),customPrototype:cardCapture(()=>root.inspectCoreCardinality(cardCustomPrototype,cp.identity)),sparse:cardCapture(()=>root.inspectCoreCardinality(cardSparse,cp.identity)),cycle:cardCapture(()=>root.inspectCoreCardinality(cardCycle,cp.identity)),nan:cardCapture(()=>root.inspectCoreCardinality(cardNaN,cp.identity)),infinity:cardCapture(()=>root.inspectCoreCardinality(cardInfinity,cp.identity)),undefined:cardCapture(()=>root.inspectCoreCardinality(cardUndefined,cp.identity)),bigint:cardCapture(()=>root.inspectCoreCardinality(cardBigint,cp.identity)),nestedPath:cardCapture(()=>root.inspectCoreCardinality(cardNested,cp.identity)),requestControls:{nan:cardCapture(()=>root.declareCoreCardinality(cp.document,cp.identity,{cardinality:'array',future:NaN})),infinity:cardCapture(()=>root.declareCoreCardinality(cp.document,cp.identity,{cardinality:'array',future:Infinity})),undefined:cardCapture(()=>root.declareCoreCardinality(cp.document,cp.identity,{cardinality:'array',future:undefined})),bigint:cardCapture(()=>root.declareCoreCardinality(cp.document,cp.identity,{cardinality:'array',future:1n})),sparse:cardCapture(()=>root.declareCoreCardinality(cp.document,cp.identity,cardSparseRequest)),cycle:cardCapture(()=>root.declareCoreCardinality(cp.document,cp.identity,cardCyclicRequest))},identityControlsFull:{nullIdentity:cardCapture(()=>root.inspectCoreCardinality(cp.document,null)),extraIdentity:cardCapture(()=>root.inspectCoreCardinality(cp.document,{module:'m',element:'e',future:true})),accessorIdentity:cardCapture(()=>root.inspectCoreCardinality(cp.document,cardAccessorIdentity)),nonEnumerable:cardCapture(()=>root.inspectCoreCardinality(cp.document,cardNonEnumerableIdentity)),symbol:cardCapture(()=>root.inspectCoreCardinality(cp.document,cardSymbolIdentity)),customPrototype:cardCapture(()=>root.inspectCoreCardinality(cp.document,cardCustomIdentity))},receiptBeforeCurrent:cardCapture(()=>root.verifyCoreCardinalityDeclaration(cardInvalidReceipt,cardCurrentAccessor)),accessorGetterCalls:cardAccessorCalls}
 ,requestSchemaControls:cardRequestSchemaControls
};
const expectedAdmission={...cp.hostAdmissionControls};delete expectedAdmission.receiptBeforeCurrent;delete expectedAdmission.accessorGetterCalls;delete expectedAdmission.requestSchemaControls;
const observedAdmission={...cardCases.hostAdmissionControls};delete observedAdmission.receiptBeforeCurrent;delete observedAdmission.accessorGetterCalls;
if(canonical(observedAdmission)!==canonical(expectedAdmission))throw new Error('cardinality host copyJson admission matrix differs from frozen TypeScript envelopes');
if(canonical(cardCases.requestSchemaControls)!==canonical(cp.hostAdmissionControls.requestSchemaControls))throw new Error('cardinality request schema diagnostics differ from frozen TypeScript envelopes');
if(canonical(cardCases.hostAdmissionControls.receiptBeforeCurrent)!==canonical(cp.hostAdmissionControls.receiptBeforeCurrent))throw new Error('cardinality verify receipt-before-current refusal differs from frozen TypeScript');
const expectedCardHostAdmission={...cp.hostAdmissionControls};delete expectedCardHostAdmission.requestSchemaControls;
if(canonical(cardCases)!==canonical({inspections:cp.inspections,declaration:{ok:true,value:cp.declaration},surrogateItemDeclaration:cp.surrogateItemDeclaration,verified:cp.verified,refusals:cp.refusals,identityControls:cp.identityControls,orderingControls:cp.orderingControls,hostAdmissionControls:expectedCardHostAdmission,requestSchemaControls:cp.hostAdmissionControls.requestSchemaControls}))throw new Error('cardinality default route differs from frozen TypeScript envelopes');
if(typeof root.inspectCoreCardinality!=='function'||typeof root.declareCoreCardinality!=='function'||typeof root.verifyCoreCardinalityDeclaration!=='function')throw new Error('cardinality default exports missing');
const countCardOutcomes=value=>{if(!value||typeof value!=='object')return 0;if(typeof value.ok==='boolean')return 1;return Object.values(value).reduce((sum,item)=>sum+countCardOutcomes(item),0)};
const cardinalityCaseCount=countCardOutcomes(cardCases);
`;
const facetsReplaySnippet=`
const fp=${JSON.stringify(facetsPacket)},fr=${JSON.stringify(facetsRegression)};
const facetCapture=fn=>{try{return {ok:true,value:fn()}}catch(error){return {ok:false,error:{name:error.name??'Error',code:error.code??'',message:error.message??String(error),path:error.path??''}}}};
let facetIdentityGetterCalls=0;const facetAccessorIdentity={get module(){facetIdentityGetterCalls++;return 'm'},get element(){facetIdentityGetterCalls++;return 'v'}};
const facetSourceGetter={get future(){throw new Error('source getter should be rejected by copy admission')}};
let facetRequestSourceGetterCalls=0;const facetRequestOrderSource={get future(){facetRequestSourceGetterCalls++;return true}};
const facetOutcomes={
 inspection:facetCapture(()=>root.inspectCoreFacets(fp.receipt.target,fp.identity)),
 declaration:facetCapture(()=>root.declareCoreFacets(fp.source,fp.identity,fp.request)),
 verified:facetCapture(()=>root.verifyCoreFacetDeclaration(fp.receipt,fp.receipt.target)),
 unknownFacetDeclaration:facetCapture(()=>root.declareCoreFacets(fp.unknownFacetDeclaration.source,fp.unknownFacetDeclaration.identity,fp.unknownFacetDeclaration.request)),
 historical:fr.cases.historical.map(item=>facetCapture(()=>root.historicalCoreFacetPatch(item.input))),
 unsafeInteger:facetCapture(()=>root.historicalCoreFacetPatch({integerWidth:{bits:Number(fr.cases.unsafeIntegerCopyRefusal.bitsLexeme),signed:true}})),
 malformedReceiptBeforeCurrent:facetCapture(()=>root.verifyCoreFacetDeclaration(fr.cases.verifyMalformedBeforeCurrentCopy.receipt,Number(fr.cases.verifyMalformedBeforeCurrentCopy.currentNumberLexeme))),
 forgedReceiptBeforeCurrent:facetCapture(()=>root.verifyCoreFacetDeclaration(fr.cases.verifyForgedBeforeCurrentCopy.receipt,Number(fr.cases.verifyForgedBeforeCurrentCopy.currentNumberLexeme))),
 loneSurrogate:facetCapture(()=>root.inspectCoreFacets(fr.cases.loneSurrogateQualifier.source,fr.cases.loneSurrogateQualifier.identity)),
 identityInputs:{
  nullIdentity:facetCapture(()=>root.inspectCoreFacets(fp.source,null)),
  extraIdentity:facetCapture(()=>root.inspectCoreFacets(fp.source,{module:'m',element:'v',future:true})),
  accessorIdentity:facetCapture(()=>root.inspectCoreFacets(fp.source,facetAccessorIdentity)),
  sourceAccessorBeforeIdentity:facetCapture(()=>root.inspectCoreFacets(facetSourceGetter,null)),
 },
 declarationOrder:{invalidRequestBeforeSourceCopy:facetCapture(()=>root.declareCoreFacets(facetRequestOrderSource,null,{precision:2})),sourceGetterCalls:facetRequestSourceGetterCalls},
};
const expectedFacets={
 inspection:{ok:true,value:fp.inspection},declaration:{ok:true,value:fp.receipt},verified:{ok:true,value:fp.receipt},
 unknownFacetDeclaration:{ok:true,value:fp.unknownFacetDeclaration},
 historical:fr.cases.historical.map(item=>item.outcome.error?{ok:false,error:item.outcome.error}:{ok:true,value:item.outcome}),unsafeInteger:{ok:false,error:fr.cases.unsafeIntegerCopyRefusal.outcome.error},
 malformedReceiptBeforeCurrent:{ok:false,error:fr.cases.verifyMalformedBeforeCurrentCopy.outcome.error},forgedReceiptBeforeCurrent:{ok:false,error:fr.cases.verifyForgedBeforeCurrentCopy.outcome.error},
 loneSurrogate:{ok:true,value:fr.cases.loneSurrogateQualifier.outcome},
 identityInputs:{nullIdentity:fr.cases.identityInputs.nullIdentity,extraIdentity:fr.cases.identityInputs.extraIdentity,accessorIdentity:fr.cases.identityInputs.accessorIdentity,sourceAccessorBeforeIdentity:fr.cases.identityInputs.sourceAccessorBeforeIdentity},
 declarationOrder:{invalidRequestBeforeSourceCopy:fr.cases.declarationOrder.invalidRequestBeforeSourceCopy,sourceGetterCalls:fr.cases.declarationOrder.sourceGetterCalls},
};
if(canonical(facetOutcomes)!==canonical(expectedFacets))throw new Error('facets root route differs from frozen TypeScript envelopes');
const largeFacetSource=structuredClone(fp.source);largeFacetSource.extensions.future.retained={opaque:'x'.repeat(700_000)};
const largeFacetDeclaration=facetCapture(()=>root.declareCoreFacets(largeFacetSource,fp.identity,fp.request));
const largeFacetReference=facetCapture(()=>referenceCore.declareCoreFacets(largeFacetSource,fp.identity,fp.request));
if(canonical(largeFacetDeclaration)!==canonical(largeFacetReference))throw new Error('large retained facet declaration differs from TypeScript reference');
if(!largeFacetDeclaration.ok)throw new Error('large retained facet declaration unexpectedly refused: '+JSON.stringify(largeFacetDeclaration.error));
const largeFacetVerification=facetCapture(()=>root.verifyCoreFacetDeclaration(largeFacetDeclaration.value,largeFacetDeclaration.value.target));
const largeFacetReferenceVerification=facetCapture(()=>referenceCore.verifyCoreFacetDeclaration(largeFacetReference.value,largeFacetReference.value.target));
if(canonical(largeFacetVerification)!==canonical(largeFacetReferenceVerification))throw new Error('large retained facet verification differs from TypeScript reference');
if(!largeFacetVerification.ok)throw new Error('large retained facet verification unexpectedly refused: '+JSON.stringify(largeFacetVerification.error));
const shape=value=>{if(Array.isArray(value))return value.map(shape);if(value&&typeof value==='object'){const proto=Object.getPrototypeOf(value);return {p:proto===null?'null':proto===Object.prototype?'plain':'other',v:Object.fromEntries(Object.keys(value).sort().map(key=>[key,shape(value[key])]))}}return typeof value};
const facetPrototypeCases=[
 [root.inspectCoreFacets(fp.receipt.target,fp.identity),referenceCore.inspectCoreFacets(fp.receipt.target,fp.identity)],
 [root.declareCoreFacets(fp.source,fp.identity,fp.request),referenceCore.declareCoreFacets(fp.source,fp.identity,fp.request)],
 [root.verifyCoreFacetDeclaration(fp.receipt,fp.receipt.target),referenceCore.verifyCoreFacetDeclaration(fp.receipt,fp.receipt.target)],
 [root.historicalCoreFacetPatch({integerWidth:{bits:8,signed:true}}),referenceCore.historicalCoreFacetPatch({integerWidth:{bits:8,signed:true}})],
];
if(facetPrototypeCases.some(([actual,expected])=>JSON.stringify(shape(actual))!==JSON.stringify(shape(expected))))throw new Error('facets result prototype shape differs from TypeScript reference');
const isolated=root.declareCoreFacets(fp.source,fp.identity,fp.request);isolated.source.id='source-only';if(isolated.target.id==='source-only')throw new Error('facets source and target alias');isolated.target.id='target-only';if(fp.source.id==='source-only'||fp.source.id==='target-only')throw new Error('facets result aliases caller input');
const countFacetOutcomes=value=>{if(!value||typeof value!=='object')return 0;if(typeof value.ok==='boolean')return 1;if(Array.isArray(value))return value.reduce((sum,item)=>sum+countFacetOutcomes(item),0);return Object.values(value).reduce((sum,item)=>sum+countFacetOutcomes(item),0)};
const facetCaseCount=countFacetOutcomes(facetOutcomes);
`;
const keysReplaySnippet=`
const kp=${JSON.stringify(keysPacket)};
const keyCapture=fn=>{try{return {ok:true,value:fn()}}catch(error){return {ok:false,error:{name:error.name??'Error',code:error.code??'',message:error.message??String(error),path:error.path??''}}}};
let keyAccessorCurrent;
let keyCurrentGetterCalls=0;
const keyOutcomes={
 inspect:keyCapture(()=>root.inspectCoreKeys(kp.outcomes.inspect.value.source,kp.outcomes.inspect.value.identity)),
 lookup:keyCapture(()=>root.lookupCoreKey(kp.outcomes.lookup.value.source,kp.outcomes.lookup.value.identity)),
 declareMembers:keyCapture(()=>root.declareCoreRecordMembers(kp.outcomes.declareMembers.value.source,kp.outcomes.declareMembers.value.identity,kp.outcomes.declareMembers.value.request)),
 declareKey:keyCapture(()=>root.declareCoreKey(kp.outcomes.declareKey.value.source,kp.outcomes.declareKey.value.identity,kp.outcomes.declareKey.value.request)),
 verifyKey:keyCapture(()=>root.verifyCoreKeyOperation(kp.fixtures.receipt,kp.fixtures.receipt.target)),
 host:(()=>{let sourceCalls=0,identityCalls=0,currentCalls=0,requestCalls=0;const badSource={get future(){sourceCalls++;return true}};const badIdentity={get module(){identityCalls++;return 'm'},element:'record',key:'id'};const badCurrent={get future(){currentCalls++;keyCurrentGetterCalls++;return true}};keyAccessorCurrent=badCurrent;const badRequest={get id(){requestCalls++;return 'pk'},name:'ID',fields:[kp.fixtures.field]};const invalidKeyIdentity={module:'m',element:'record',key:2};return {
  inspectSourceAccessor:keyCapture(()=>root.inspectCoreKeys(badSource,kp.fixtures.record)),
  inspectIdentityAccessor:keyCapture(()=>root.inspectCoreKeys(kp.fixtures.source,badIdentity)),
  lookupIdentityBeforeSource:keyCapture(()=>root.lookupCoreKey(badSource,invalidKeyIdentity)),
  memberRequestBeforeSource:keyCapture(()=>root.declareCoreRecordMembers(badSource,kp.fixtures.record,[kp.fixtures.field,kp.fixtures.field])),
  keyRequestAccessor:keyCapture(()=>root.declareCoreKey(kp.fixtures.source,kp.fixtures.record,badRequest)),
  keyRequestBeforeSource:keyCapture(()=>root.declareCoreKey(badSource,kp.fixtures.record,{id:'',name:'ID',fields:[kp.fixtures.field]})),
  malformedReceiptBeforeCurrent:keyCapture(()=>root.verifyCoreKeyOperation({operation:'declare-core-key',version:'2.0.0'},badCurrent)),
  nullReceiptBeforeCurrent:keyCapture(()=>root.verifyCoreKeyOperation(null,badCurrent)),
  primitiveReceiptBeforeCurrent:keyCapture(()=>root.verifyCoreKeyOperation(7,badCurrent)),
  validReceiptBeforeCurrent:keyCapture(()=>root.verifyCoreKeyOperation(kp.fixtures.receipt,badCurrent)),
  getterCalls:{source:sourceCalls,identity:identityCalls,current:currentCalls,request:requestCalls}
 }})(),
};
const keyNullReference=keyCapture(()=>referenceCore.verifyCoreKeyOperation(null,keyAccessorCurrent));
if(canonical(keyOutcomes.host.nullReceiptBeforeCurrent)!==canonical(keyNullReference))throw new Error('Key null-receipt refusal differs from the same-runtime TypeScript reference');
if(keyNullReference.ok||keyNullReference.error.name!=='TypeError'||keyOutcomes.host.getterCalls.current!==0||keyCurrentGetterCalls!==0)throw new Error('Key null-receipt check accessed current before TypeError');
keyOutcomes.host.nullReceiptBeforeCurrent.error.message=kp.outcomes.host.nullReceiptBeforeCurrent.error.message;
if(canonical(keyOutcomes)!==canonical(kp.outcomes))throw new Error('core Keys default route differs from frozen TypeScript envelopes');
const keyShape=value=>{if(Array.isArray(value))return value.map(keyShape);if(value&&typeof value==='object'){const proto=Object.getPrototypeOf(value);return {prototype:proto===null?'null':proto===Object.prototype?'plain':'other',fields:Object.fromEntries(Object.keys(value).sort().map(key=>[key,keyShape(value[key])]))}}return typeof value};
for(const [name,actual,expected] of [['inspect',root.inspectCoreKeys(kp.outcomes.inspect.value.source,kp.outcomes.inspect.value.identity),referenceCore.inspectCoreKeys(kp.outcomes.inspect.value.source,kp.outcomes.inspect.value.identity)],['lookup',root.lookupCoreKey(kp.outcomes.lookup.value.source,kp.outcomes.lookup.value.identity),referenceCore.lookupCoreKey(kp.outcomes.lookup.value.source,kp.outcomes.lookup.value.identity)],['declareMembers',root.declareCoreRecordMembers(kp.outcomes.declareMembers.value.source,kp.outcomes.declareMembers.value.identity,kp.outcomes.declareMembers.value.request),referenceCore.declareCoreRecordMembers(kp.outcomes.declareMembers.value.source,kp.outcomes.declareMembers.value.identity,kp.outcomes.declareMembers.value.request)],['declareKey',root.declareCoreKey(kp.outcomes.declareKey.value.source,kp.outcomes.declareKey.value.identity,kp.outcomes.declareKey.value.request),referenceCore.declareCoreKey(kp.outcomes.declareKey.value.source,kp.outcomes.declareKey.value.identity,kp.outcomes.declareKey.value.request)],['verifyKey',root.verifyCoreKeyOperation(kp.fixtures.receipt,kp.fixtures.receipt.target),referenceCore.verifyCoreKeyOperation(kp.fixtures.receipt,kp.fixtures.receipt.target)]])if(canonical(keyShape(actual))!==canonical(keyShape(expected))||canonical(keyShape(actual))!==canonical(kp.prototypeShapes[name]))throw new Error('core Keys result prototype differs from TypeScript: '+name);
const keyOrder=value=>{if(Array.isArray(value))return value.map(keyOrder);if(value&&typeof value==='object'){const keys=Object.keys(value);return {keys,children:keys.map(key=>keyOrder(value[key]))}}return typeof value};
for(const [name,actual,expected] of [['inspect',root.inspectCoreKeys(kp.outcomes.inspect.value.source,kp.outcomes.inspect.value.identity),referenceCore.inspectCoreKeys(kp.outcomes.inspect.value.source,kp.outcomes.inspect.value.identity)],['lookup',root.lookupCoreKey(kp.outcomes.lookup.value.source,kp.outcomes.lookup.value.identity),referenceCore.lookupCoreKey(kp.outcomes.lookup.value.source,kp.outcomes.lookup.value.identity)],['declareMembers',root.declareCoreRecordMembers(kp.outcomes.declareMembers.value.source,kp.outcomes.declareMembers.value.identity,kp.outcomes.declareMembers.value.request),referenceCore.declareCoreRecordMembers(kp.outcomes.declareMembers.value.source,kp.outcomes.declareMembers.value.identity,kp.outcomes.declareMembers.value.request)],['declareKey',root.declareCoreKey(kp.outcomes.declareKey.value.source,kp.outcomes.declareKey.value.identity,kp.outcomes.declareKey.value.request),referenceCore.declareCoreKey(kp.outcomes.declareKey.value.source,kp.outcomes.declareKey.value.identity,kp.outcomes.declareKey.value.request)]])if(canonical(keyOrder(actual))!==canonical(keyOrder(expected)))throw new Error('core Keys recursive Object.keys order differs from TypeScript: '+name);
const keyIncompleteSource=structuredClone(kp.fixtures.source);const keyIncompleteBefore=canonical(keyIncompleteSource);const keyIncomplete=keyCapture(()=>root.declareCoreKey(keyIncompleteSource,kp.fixtures.record,kp.fixtures.receipt.request));const keyIncompleteReference=keyCapture(()=>referenceCore.declareCoreKey(structuredClone(kp.fixtures.source),kp.fixtures.record,kp.fixtures.receipt.request));if(keyIncomplete.ok||keyIncomplete.error.code!=='CORE_KEY_CONFLICT'||canonical(keyIncomplete)!==canonical(keyIncompleteReference)||canonical(keyIncompleteSource)!==keyIncompleteBefore)throw new Error('core Keys incomplete fixture must be rejected without mutation and match the same-runtime TypeScript reference');
const keyIsolationSource=structuredClone(kp.outcomes.declareKey.value.source);const keyIsolationIdentity=structuredClone(kp.outcomes.declareKey.value.identity);const keyIsolationRequest=structuredClone(kp.outcomes.declareKey.value.request);const keyIsolation=root.declareCoreKey(keyIsolationSource,keyIsolationIdentity,keyIsolationRequest);keyIsolation.source.id='source-only';if(keyIsolation.target.id==='source-only')throw new Error('core Keys source and target alias');keyIsolation.target.id='target-only';if(keyIsolation.source.id==='target-only'||keyIsolationSource.id==='source-only'||keyIsolationSource.id==='target-only')throw new Error('core Keys result aliases caller input');keyIsolation.identity.module='identity-only';keyIsolation.provenance.basis='provenance-only';if(keyIsolationIdentity.module!==kp.fixtures.record.module||keyIsolationRequest.id!==kp.fixtures.receipt.request.id)throw new Error('core Keys nested result aliases identity/request input');
const keyLarge=structuredClone(kp.outcomes.inspect.value.source);keyLarge.modules[0].elements[0].keys[0].futureQualifier={opaque:'x'.repeat(kp.largeResource.units)};const keyLargeInspection=root.inspectCoreKeys(keyLarge,kp.fixtures.record);const keyLargeInspectionSummary={sourceUnits:keyLargeInspection.source.modules[0].elements[0].keys[0].futureQualifier.opaque.length,meaning:keyLargeInspection.meaning.state};if(canonical(keyLargeInspectionSummary)!==canonical(kp.largeResource.inspect.value))throw new Error('core Keys large retained inspect differs from TypeScript');const keyLargeInspectionReference=referenceCore.inspectCoreKeys(keyLarge,kp.fixtures.record);if(canonical(keyOrder(keyLargeInspection))!==canonical(keyOrder(keyLargeInspectionReference)))throw new Error('core Keys large retained unknown qualifier order differs from TypeScript');const keyLargeMembers=root.declareCoreRecordMembers(keyLarge,kp.fixtures.record,[kp.fixtures.field]);const keyLargeDeclaration=root.declareCoreKey(keyLargeMembers.target,kp.fixtures.record,{id:'id',name:'Renamed',fields:[kp.fixtures.field],primary:true});const keyLargeDeclarationSummary={sourceUnits:keyLargeDeclaration.source.modules[0].elements[0].keys[0].futureQualifier.opaque.length,targetUnits:keyLargeDeclaration.target.modules[0].elements[0].keys[0].futureQualifier.opaque.length};if(canonical(keyLargeDeclarationSummary)!==canonical(kp.largeResource.declare.value))throw new Error('core Keys large retained declaration differs from TypeScript');
const keyCaseCount=Object.keys(kp.outcomes.host).length-1+4;
`;
const bit128ReplaySnippet=`
const bp=${JSON.stringify(bit128Packet)};
const bitCapture=fn=>{try{return {ok:true,value:bitNormalize(fn())}}catch(error){const failure={name:error?.name??'Error',code:error?.code,message:error?.message??String(error)};if(Object.hasOwn(error??{},'path'))failure.path=error.path;return {ok:false,error:failure}}};
const bitShape=value=>({prototype:Object.getPrototypeOf(value)===Object.prototype?'Object.prototype':Object.getPrototypeOf(value)===null?'null':Object.getPrototypeOf(value)?.constructor?.name??'other',frozen:Object.isFrozen(value),keys:Object.keys(value),descriptors:Object.fromEntries(Object.keys(value).map(key=>[key,Object.getOwnPropertyDescriptor(value,key)?.writable===false?'readonly':'mutable']))});
const bitNormalize=value=>{if(value instanceof Uint8Array)return {type:value.constructor.name,bytes:Array.from(value),shape:bitShape(value)};if(Array.isArray(value))return value.map(bitNormalize);if(value&&typeof value==='object')return {...Object.fromEntries(Object.keys(value).map(key=>[key,bitNormalize(value[key])])),$shape:bitShape(value)};return value};
const bitHex='8000000000000000ffffffffffffffff',bitUuid='80000000-0000-0000-ffff-ffffffffffff';
const bitParsed=root.parseBits128(bitHex),bitParsedUuid=root.parseUuid(bitUuid);
const bitWordsUnsigned=root.bits128ToWords(bitParsed,false),bitWordsSigned=root.bits128ToWords(bitParsed,true);
const bitIntegerUnsigned=root.bits128ToInteger(bitParsed,false),bitIntegerSigned=root.bits128ToInteger(bitParsed,true);
const bitBytes=Uint8Array.from({length:20},(_,index)=>index),bitView=new Uint8Array(bitBytes.buffer,2,16),bitFromView=root.bits128FromBytes(bitView);bitView[0]=255;const bitIsolated=root.bits128ToBytes(bitFromView);
class InstalledByteSubclass extends Uint8Array{}
if(root.bits128FromBytes(new InstalledByteSubclass(new Uint8Array(16))).hex!=='0'.repeat(32))throw new Error('Bit128 Uint8Array subclass input rejected');
const bitCases={
 parseBits128:bitCapture(()=>root.parseBits128(bitHex.toUpperCase())),
 parseUuid:bitCapture(()=>root.parseUuid(bitUuid.toUpperCase())),
 bits128FromBytes:bitCapture(()=>bitFromView),
 bits128ToBytes:bitCapture(()=>root.bits128ToBytes(bitParsed)),
 uuidFromBits128:bitCapture(()=>root.uuidFromBits128(bitParsed)),
 uuidToBits128:bitCapture(()=>root.uuidToBits128(bitParsedUuid)),
 compareBits128:bitCapture(()=>[root.compareBits128(root.parseBits128('0'.repeat(32)),bitParsed),root.compareBits128(bitParsed,bitParsed),root.compareBits128(bitParsed,root.parseBits128('f'.repeat(32)))]),
 bits128ToWords:bitCapture(()=>({unsigned:bitWordsUnsigned,signed:bitWordsSigned,unsignedShape:bitShape(bitWordsUnsigned),signedShape:bitShape(bitWordsSigned)})),
 bits128FromWords:bitCapture(()=>({unsigned:root.bits128FromWords(bitWordsUnsigned,false),signed:root.bits128FromWords(bitWordsSigned,true)})),
 bits128ToInteger:bitCapture(()=>({unsigned:bitIntegerUnsigned,signed:bitIntegerSigned,unsignedShape:bitShape(bitIntegerUnsigned),signedShape:bitShape(bitIntegerSigned)})),
 bits128FromInteger:bitCapture(()=>({zero:root.bits128FromInteger({integerToken:'0'},false),maxUnsigned:root.bits128FromInteger({integerToken:'340282366920938463463374607431768211455'},false),minSigned:root.bits128FromInteger({integerToken:'-170141183460469231731687303715884105728'},true)})),
 typedArray:{offset:bitFromView.hex,subclass:'accepted',copiedBeforeMutation:bitIsolated[0]===2},
 descriptorAndErrorOrder:{
  bitProfileBeforeHex:bitCapture(()=>root.bits128ToBytes({profile:'other',get hex(){throw new Error('getter ran')}})),
  bitAccessorWithExtra:bitCapture(()=>root.bits128ToBytes({profile:'umf-128/1',get hex(){throw new Error('getter ran')},extra:true})),
  uuidOriginalBeforeConsistency:bitCapture(()=>root.uuidToBits128({profile:'umf-128/1',hex:'0'.repeat(32),canonicalText:'00000000-0000-0000-0000-000000000000',originalText:'x'})),
  symbolMember:bitCapture(()=>root.bits128ToBytes(Object.assign({profile:'umf-128/1',hex:'0'.repeat(32)},{[Symbol('x')]:1}))),
  integerShapeBeforeType:bitCapture(()=>root.bits128FromInteger({integerToken:1n,extra:true},false)),
  wordsShapeBeforeAccessor:bitCapture(()=>root.bits128FromWords({get high(){throw new Error('getter ran')},low:'0',extra:true},false))
 },
 syntaxAndBoundaries:{
  utf16SurrogateBits:bitCapture(()=>root.parseBits128('0'.repeat(31)+'\\ud800')),
  uuidUpperOriginal:bitParsedUuid.originalText,
  negativeZeroInteger:bitCapture(()=>root.bits128FromInteger({integerToken:'-0'},true)),
  noncanonicalInteger:bitCapture(()=>root.bits128FromInteger({integerToken:'01'},false)),
  unsignedOverflow:bitCapture(()=>root.bits128FromInteger({integerToken:'340282366920938463463374607431768211456'},false)),
  signedMinimumAndMaximum:[root.bits128FromInteger({integerToken:'-170141183460469231731687303715884105728'},true).hex,root.bits128FromInteger({integerToken:'170141183460469231731687303715884105727'},true).hex],
  signedWordMinimumAndMaximum:[root.bits128FromWords({high:'-9223372036854775808',low:'9223372036854775807'},true).hex,root.bits128FromWords({high:'9223372036854775807',low:'-9223372036854775808'},true).hex],
  invalidSignedness:bitCapture(()=>root.bits128ToWords(bitParsed,0))
 }
};
if(canonical(bitCases)!==canonical(bp.cases))throw new Error('Bit128/UUID default exports differ from frozen predecessor packet');
const bitFunctions=['parseBits128','parseUuid','bits128FromBytes','bits128ToBytes','uuidFromBits128','uuidToBits128','compareBits128','bits128ToWords','bits128FromWords','bits128ToInteger','bits128FromInteger'];
let bitUmfErrorIdentity=false;
try{root.parseBits128(1)}catch(error){bitUmfErrorIdentity=error instanceof root.UmfError&&error.code==='BIT128_TYPE'}
if(!bitUmfErrorIdentity)throw new Error('installed Bit128 refusal is not an instance of the public root UmfError');
for(const name of bitFunctions)if(typeof root[name]!=='function'||typeof referenceCore[name]!=='function')throw new Error('Bit128/UUID root/reference function missing: '+name);
const bitReferenceBytes=referenceCore.bits128FromBytes(new Uint8Array([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]));
if(canonical(bitNormalize(root.bits128FromBytes(new Uint8Array([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]))))!==canonical(bitNormalize(bitReferenceBytes)))throw new Error('Bit128 root/reference byte input differs');
let bitBufferInput='unavailable';
if(typeof Buffer!=='undefined'){
 const buffer=Buffer.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]);const expected=referenceCore.bits128FromBytes(buffer);const actual=root.bits128FromBytes(buffer);
 if(canonical(bitNormalize(actual))!==canonical(bitNormalize(expected)))throw new Error('Bit128 Node Buffer input differs from same-runtime TypeScript reference');
 const stable=actual.hex;buffer[0]=255;if(actual.hex!==stable)throw new Error('Bit128 Buffer input was retained instead of snapshotted');bitBufferInput='accepted-and-copied';
}
const bit128CaseCount=bp.publicFunctions.length;
if(bit128CaseCount!==11||bp.publicFunctions.length!==bitFunctions.length||bp.publicFunctions.some((name,index)=>name!==bitFunctions[index]))throw new Error('Bit128/UUID frozen public function inventory changed');
`;
const compactReplaySnippet=`
const compactCapture=fn=>{try{return {ok:true,value:fn()}}catch(error){return {ok:false,error:{name:error.name??'Error',code:error.code??null,path:error.path??null,message:error.message??String(error)}}}};
const compactShape=value=>{if(Array.isArray(value))return value.map(compactShape);if(value&&typeof value==='object'){const proto=Object.getPrototypeOf(value);return {prototype:proto===null?'null':proto===Object.prototype?'plain':'other',fields:Object.fromEntries(Object.keys(value).map(key=>[key,compactShape(value[key])]))}}return typeof value};
const compactOrder=value=>{if(Array.isArray(value))return value.map(compactOrder);if(value&&typeof value==='object'){const keys=Object.keys(value);return {keys,children:keys.map(key=>compactOrder(value[key]))}}return typeof value};
const compactOutcomes=compactCases.map(vector=>{
 const actual=compactCapture(()=>root.validateCoreDatasetValuesCompact(vector.source,vector.input));
 const expected=vector.thrown?{ok:false,error:{code:vector.thrown.code,path:vector.thrown.path,message:vector.thrown.message}}:{ok:true,value:vector.result};
 const semantic=outcome=>outcome.ok?{ok:true,value:outcome.value}:{ok:false,error:{code:outcome.error.code,path:outcome.error.path,message:outcome.error.message}};
 if(canonical(semantic(actual))!==canonical(expected))throw new Error('compact Dataset frozen envelope differs: '+vector.id);
 const reference=compactCapture(()=>referenceCore.validateCoreDatasetValuesCompact(vector.source,vector.input));
 if(canonical(actual)!==canonical(reference))throw new Error('compact Dataset runtime error/result envelope differs from same-runtime reference: '+vector.id);
 if(actual.ok&&canonical(compactShape(actual.value))!==canonical(compactShape(reference.value)))throw new Error('compact Dataset result prototype shape differs from reference: '+vector.id);
 if(actual.ok&&canonical(compactOrder(actual.value))!==canonical(compactOrder(reference.value)))throw new Error('compact Dataset recursive Object.keys order differs from reference: '+vector.id);
 return vector.id;
});
const compactValidateCaseCount=compactOutcomes.length;
const compactValidateFiles=compactCases.map(vector=>vector.__filename);
if(typeof root.validateCoreDatasetValuesCompact!=='function'||typeof referenceCore.validateCoreDatasetValuesCompact!=='function')throw new Error('compact Dataset validation root export missing');
`;
function assert(condition:unknown,message:string):asserts condition{if(!condition)throw new Error(message)}
function assertPackageRoutes(pkg:{exports?:Record<string,Record<string,string>>}){
 const root=pkg.exports?.['.'];
 assert(root,'installed package root export is missing');
 assert(root.types==='./dist/src/index.d.ts'&&root.node==='./dist/umf-node.js'&&root.browser==='./dist/umf-browser.js'&&root.import==='./dist/umf-browser.js'&&root.default==='./dist/umf-browser.js','installed package root condition map does not select the qualified Rust entries');
 const reference=pkg.exports?.['./reference'];
 assert(reference,'installed TypeScript reference export is missing');
 assert(reference.types==='./dist/src/index.d.ts'&&reference.import==='./dist/umf.js','installed TypeScript reference route map mismatch');
}
function assertRouteTamperRefused(label:string,mutate:(exports:Record<string,Record<string,string>>)=>void,pkg:{exports?:Record<string,Record<string,string>>}){
 const changed=structuredClone(pkg);
 assert(changed.exports,'installed package has no exports map');
 mutate(changed.exports);
 let refused=false;try{assertPackageRoutes(changed)}catch{refused=true}
 assert(refused,`installed ${label} route tampering was accepted`);
}
async function run(command:string[],cwd=scratch){
 const child=Bun.spawn(command,{cwd,stdout:'pipe',stderr:'pipe'});
 const [stdout,stderr]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);
 const code=await child.exited;
 if(code!==0)throw new Error(`${command.join(' ')} failed (${code})\n${stdout}\n${stderr}`);
 return stdout.trim();
}
try{
 await mkdir(install,{recursive:true});
 await run(['tar','-xzf',archive,'--strip-components=1','-C',install]);
 const manifest=JSON.parse(await readFile(join(install,'dist/rust-default-manifest.json'),'utf8')) as {format:string;releaseStatus:string;defaultRouteSource:string;api:{entry:string;reference:string};platform:{os:string;arch:string};resources:{count:number};sourceClosure:{sha256:string;fileCount:number;inputs:Record<string,string>;capturedLiveSha256:string;transform:{status:string;generatedInputs:{path:string;before:string;after:string}[]}};assets:Record<string,string>};
 const packageManifest=JSON.parse(await readFile(join(install,'package.json'),'utf8')) as {exports?:Record<string,Record<string,string>>};
 const routeGuardBaseline=structuredClone(packageManifest);
 assert(routeGuardBaseline.exports,'installed package has no exports map');
 routeGuardBaseline.exports['./reference']??={types:'./dist/src/index.d.ts',import:'./dist/umf.js'};
 assertPackageRoutes(routeGuardBaseline);
 assertRouteTamperRefused('Node root',exports=>{const root=exports['.'];assert(root,'root export missing');root.node='./dist/umf.js'},routeGuardBaseline);
 assertRouteTamperRefused('browser root',exports=>{const root=exports['.'];assert(root,'root export missing');root.browser='./dist/umf.js'},routeGuardBaseline);
 assertRouteTamperRefused('reference',exports=>{const reference=exports['./reference'];assert(reference,'reference export missing');reference.import='./dist/umf-node.js'},routeGuardBaseline);
 console.log(JSON.stringify({stage:'package-root-route-guards',rootNode:'./dist/umf-node.js',rootBrowser:'./dist/umf-browser.js',reference:'./dist/umf.js',tamperRefusals:3}));
 assertPackageRoutes(packageManifest);
 const rootConditions=packageManifest.exports?.['.'];assert(rootConditions,'installed package root export is missing');
 const referenceConditions=packageManifest.exports?.['./reference'];assert(referenceConditions,'installed package reference export is missing');
 const browserRootEntry=rootConditions.browser;assert(browserRootEntry,'installed browser route is missing');
 const localSmoke=`import {readFile} from 'node:fs/promises';import * as reference from '@umf/core/reference';const rootImportStarted=performance.now();const root=await import('@umf/core');const defaultRootInitializationMs=performance.now()-rootImportStarted;const referenceCore=reference;if(typeof root.generatePythonClient!=='function'||typeof reference.generatePythonClient!=='function')throw new Error('source package route missing');const request={text:await readFile('tests/unified/commerce.json','utf8'),package:'shop'};const canonical=value=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);const a=root.generatePythonClient(request),b=reference.generatePythonClient(request);if(a&&typeof a.then==='function'||canonical(a)!==canonical(b))throw new Error('source package Rust/reference route mismatch');${javascriptNumericReplaySnippet}${cardinalityReplaySnippet}${facetsReplaySnippet}${keysReplaySnippet}${bit128ReplaySnippet}`;
 await run(['node','--input-type=module','-e',localSmoke],process.cwd());
 await run(['bun','--eval',localSmoke],process.cwd());
 assert(manifest.format==='umf.r7-rust-sdk-default/1'&&manifest.releaseStatus.startsWith('private-r7-default-route-qualification-'),'default-route manifest identity/status mismatch');
 assert(['fixed-point','derived-private-snapshot-not-release-fixed-point'].includes(manifest.sourceClosure.transform.status),'unknown source transform status');
 assert(manifest.api.entry==='.'&&manifest.api.reference==='./reference'&&manifest.defaultRouteSource.includes('selected by package.json'),'default package root route mismatch');
 assert(manifest.resources.count===9,'fixed resource count mismatch');
 for(const path of ['scripts/test-sdk-rust-default.ts','scripts/test-sdk-install.ts','scripts/rust-migration/r8/security-and-or-installed-replay.mjs','docs/helix/04-build/evidence/rust-migration/r8-security-and-or-v4-source-replay/predecessor.json','docs/helix/04-build/evidence/rust-migration/r3/baseline/operations.json','docs/helix/04-build/evidence/rust-migration/r5-model-bindings/frozen-cardinality-typescript.json','docs/helix/04-build/evidence/rust-migration/r5-core-facets/frozen-typescript.json','docs/helix/04-build/evidence/rust-migration/r5-core-facets/regression-cases.json','docs/helix/04-build/evidence/rust-migration/r5-core-keys-default-route/frozen-typescript.json','scripts/rust-migration/r5/freeze-core-keys-default.ts','scripts/rust-migration/r5/bit128-default-route/freeze.ts','scripts/rust-migration/r5/bit128-default-route/predecessor.json','tests/bit128.test.ts','tests/uuid.test.ts','docs/helix/02-design/contracts/CONTRACT-076-128-bit-uuid.md','tests/unified/commerce.json']){
  const actual=await Bun.CryptoHasher.hash('sha256',await readFile(path),'hex');
  assert(actual===manifest.sourceClosure.inputs[path],`installed replay input differs from frozen source closure: ${path}`);
 }
 const compactEvidencePrefix='docs/helix/04-build/evidence/rust-migration/r5-dataset-values-compact-default-cutover/';
 const compactEvidenceFiles=(await readdir(compactDirectory)).filter(name=>name.startsWith('frozen-')&&name.endsWith('.json')).sort();
 for(const name of compactEvidenceFiles){
  const path=compactEvidencePrefix+name;
  const actual=await Bun.CryptoHasher.hash('sha256',await readFile(join(compactDirectory,name)),'hex');
  assert(actual===manifest.sourceClosure.inputs[path],`compact Dataset frozen vector is missing or differs in the installed source closure: ${name}`);
 }
 for(const [path,hash] of Object.entries(manifest.assets)){
  const bytes=await readFile(join(install,path));
  const actual=await Bun.CryptoHasher.hash('sha256',bytes,'hex');
  assert(actual===hash,`asset closure hash mismatch: ${path}`);
 }
 const archiveMembers=(await run(['tar','-tzf',archive])).split('\n').filter(Boolean).map(path=>path.replace(/^package\//,''));
 const expectedMembers=new Set([...Object.keys(manifest.assets),'dist/rust-default-manifest.json','package.json','manifest.json','README.md','LICENSE.md','LICENSE-MIT','LICENSE-APACHE']);
 assert(archiveMembers.length===expectedMembers.size&&archiveMembers.every(path=>expectedMembers.has(path)),`archive has an unmanifested or missing member: ${archiveMembers.filter(path=>!expectedMembers.has(path)).join(', ')}`);
 const fixture=join(scratch,'commerce.json');await writeFile(fixture,original);
 const corpusFile=join(scratch,'operations.json');await writeFile(corpusFile,JSON.stringify(corpus));
 const legacyEntry='@umf/core/reference';
 const smoke=`import {readFile} from 'node:fs/promises';
const rootImportStarted=performance.now();const root=await import('@umf/core');const defaultRootInitializationMs=performance.now()-rootImportStarted;
const legacy=await import(${JSON.stringify(legacyEntry)});
const referenceCore=legacy;
const loader=await import('@umf/core/loader-contract');
const candidateV2=await import('@umf/core/rust-codegen-candidate/v2');
if(typeof candidateV2.createPythonClientRustCandidateV2!=='function'||!loader)throw new Error('preserved package subpath export missing');
const canonical=value=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);
if(JSON.stringify(Object.keys(root).sort())!==JSON.stringify(Object.keys(legacy).sort()))throw new Error('root export set changed');
if(!new URL(import.meta.resolve('@umf/core')).pathname.endsWith('/dist/umf-node.js'))throw new Error('installed Node condition did not resolve the Rust root entry');
if(!new URL(import.meta.resolve('@umf/core/reference')).pathname.endsWith('/dist/umf.js'))throw new Error('installed TypeScript reference condition did not resolve its retained bundle');
${cardinalityReplaySnippet}
${facetsReplaySnippet}
${keysReplaySnippet}
${bit128ReplaySnippet}
${javascriptNumericReplaySnippet}
const compactCases=${JSON.stringify(compactCases)};
${compactReplaySnippet}
const frozen=JSON.parse(await readFile(new URL('./operations.json',import.meta.url),'utf8'));
const cases=frozen.cases.filter(item=>item.operation==='generatePythonClient');
for(const item of cases){let observed;try{const result=root.generatePythonClient(item.request);if(result&&typeof result.then==='function')throw new Error('root generator is asynchronous');observed={ok:true,result}}catch(error){observed={ok:false,error:{code:error.code,message:error.message,path:error.path}}}if(canonical(observed)!==canonical(item.expected))throw new Error('R3 root replay mismatch: '+item.id)}
const request={text:await readFile(new URL('./commerce.json',import.meta.url),'utf8'),package:'shop'};
const expected=legacy.generatePythonClient(request),actual=root.generatePythonClient(request);
if(actual&&typeof actual.then==='function'||canonical(actual)!==canonical(expected))throw new Error('Node root-entry output mismatch or asynchronous API');
let touched=0,caught;try{root.generatePythonClient({...request,records:new Proxy(new Array(10001),{get(target,key,receiver){if(typeof key==='string'&&/^\\d+$/.test(key))touched++;return Reflect.get(target,key,receiver)}})})}catch(error){caught=error}
if(touched!==0||caught?.code!=='RESOURCE_LIMIT'||caught?.path!=='/records'||caught?.message!=='V4 host-read resource limit exceeded')throw new Error('Node root raw-position control failed');
let single;try{root.generatePythonClient({...request,records:[{module:'x'.repeat(4_000_000),element:''}]})}catch(error){single=error}
if(single?.code!=='RESOURCE_LIMIT'||single?.path!=='/records'||single?.message!=='V4 host-read resource limit exceeded')throw new Error('Node root single-identity budget control failed');
console.log(JSON.stringify({files:actual.files.length,synchronous:true,r3Cases:cases.length,numericCases:numericCaseCount,numericBoundaryCases,defaultRootInitializationMs,numericDefaultFirstCallMs,cardinalityCases:cardinalityCaseCount,facetsCases:facetCaseCount,keysCases:keyCaseCount,bit128Cases:bit128CaseCount,bit128BufferInput:bitBufferInput,bitUmfErrorIdentity,compactValidateCases:compactValidateCaseCount,compactValidateFiles,exports:Object.keys(root).length,rawLimit:caught.code,singleIdentityLimit:single.path,node:process.version,bun:typeof Bun==='undefined'?undefined:Bun.version}));`;
 const smokeFile=join(scratch,'smoke.mjs');await writeFile(smokeFile,smoke);
 console.log(JSON.stringify({stage:'node-r3-replay-start'}));
 const node=await run(['node',smokeFile]);
 console.log(JSON.stringify({stage:'node-r3-replay',elapsedMs:Date.now()-testStarted}));
 console.log(JSON.stringify({stage:'bun-r3-replay-start'}));
 const bun=await run(['bun',smokeFile]);
 console.log(JSON.stringify({stage:'bun-r3-replay',elapsedMs:Date.now()-testStarted}));
const nodeEntry=JSON.parse(node) as {files:number;synchronous:boolean;numericCases:number;numericBoundaryCases:number;defaultRootInitializationMs:number;numericDefaultFirstCallMs:number;cardinalityCases:number;facetsCases:number;keysCases:number;bit128Cases:number;bit128BufferInput:string;bitUmfErrorIdentity:boolean;compactValidateCases:number;compactValidateFiles:string[];node?:string;bun?:string};
 const bunEntry=JSON.parse(bun) as {files:number;synchronous:boolean;numericCases:number;numericBoundaryCases:number;defaultRootInitializationMs:number;numericDefaultFirstCallMs:number;cardinalityCases:number;facetsCases:number;keysCases:number;bit128Cases:number;bit128BufferInput:string;bitUmfErrorIdentity:boolean;compactValidateCases:number;compactValidateFiles:string[];node?:string;bun?:string};
 assert(nodeEntry.synchronous&&bunEntry.synchronous&&nodeEntry.files===7&&bunEntry.files===7&&nodeEntry.numericCases===27&&bunEntry.numericCases===27&&nodeEntry.numericBoundaryCases===6&&bunEntry.numericBoundaryCases===6&&nodeEntry.defaultRootInitializationMs>0&&bunEntry.defaultRootInitializationMs>0&&nodeEntry.numericDefaultFirstCallMs>0&&bunEntry.numericDefaultFirstCallMs>0&&nodeEntry.cardinalityCases===66&&bunEntry.cardinalityCases===66&&nodeEntry.facetsCases===19&&bunEntry.facetsCases===19&&nodeEntry.keysCases===14&&bunEntry.keysCases===14&&nodeEntry.bit128Cases===11&&bunEntry.bit128Cases===11&&nodeEntry.bit128BufferInput==='accepted-and-copied'&&bunEntry.bit128BufferInput==='accepted-and-copied'&&nodeEntry.bitUmfErrorIdentity&&bunEntry.bitUmfErrorIdentity&&nodeEntry.compactValidateCases===19&&bunEntry.compactValidateCases===19,`Node/Bun installed replay aggregate mismatch: ${JSON.stringify({nodeEntry,bunEntry})}`);
 assert(JSON.stringify(nodeEntry.compactValidateFiles)===JSON.stringify(bunEntry.compactValidateFiles)&&!nodeEntry.compactValidateFiles.includes('frozen-forged-receipt.json'),'Node/Bun compact Dataset vector manifests differ or include verifier-only receipt');

 const missing=join(scratch,'missing');const missingPackage=join(missing,'node_modules/@umf/core');await mkdir(missingPackage,{recursive:true});
 await run(['tar','-xzf',archive,'--strip-components=1','-C',missingPackage]);
  await rm(join(missingPackage,'dist/umf_core_node.node'));
 for(const runtime of ['node','bun']){
  const probe=join(missing,`${runtime}-missing.mjs`);
  await writeFile(probe,`const expectedRoot=new URL('./node_modules/@umf/core/dist/umf-node.js',import.meta.url).href,expectedReference=new URL('./node_modules/@umf/core/dist/umf.js',import.meta.url).href;if(import.meta.resolve('@umf/core')!==expectedRoot||import.meta.resolve('@umf/core/reference')!==expectedReference)throw new Error('missing-addon probe package resolution escaped its isolated install');let failure;try{await import('@umf/core')}catch(error){failure=String(error?.message??error)}if(!failure||!failure.includes('umf_core_node.node'))throw new Error('missing addon did not fail at the native load boundary: '+failure);const legacy=await import('@umf/core/reference');if(typeof legacy.generatePythonClient!=='function')throw new Error('reference rollback route unavailable');`);
  await run([runtime,probe],missing);
 }
 const corruptNative=join(scratch,'corrupt-native');const corruptNativePackage=join(corruptNative,'node_modules/@umf/core');await mkdir(corruptNativePackage,{recursive:true});
 await run(['tar','-xzf',archive,'--strip-components=1','-C',corruptNativePackage]);
 await writeFile(join(corruptNativePackage,'dist/umf_core_node.node'),new Uint8Array([0,1,2,3]));
 for(const runtime of ['node','bun']){
  const probe=join(corruptNative,`${runtime}-corrupt.mjs`);
  await writeFile(probe,`const expectedRoot=new URL('./node_modules/@umf/core/dist/umf-node.js',import.meta.url).href,expectedReference=new URL('./node_modules/@umf/core/dist/umf.js',import.meta.url).href;if(import.meta.resolve('@umf/core')!==expectedRoot||import.meta.resolve('@umf/core/reference')!==expectedReference)throw new Error('corrupt-addon probe package resolution escaped its isolated install');let failure;try{await import('@umf/core')}catch(error){failure=String(error?.message??error)}if(!failure||!failure.includes('umf_core_node.node'))throw new Error('corrupt addon did not fail at native load boundary: '+failure);const reference=await import('@umf/core/reference');if(typeof reference.generatePythonClient!=='function')throw new Error('reference rollback route is unavailable');`);
  await run([runtime,probe],corruptNative);
 }

 let server:Bun.Server<unknown>|undefined;
 let serverPort=0;
 let lastBindError:unknown;
 for(let attempt=0;attempt<20;attempt++){
  // Bun's port-zero listener is unreliable on some macOS runners. Select a
  // loopback port from a bounded range and retry only bind collisions.
  const candidatePort=41000+((Date.now()+attempt*7919)%18000);
  try{server=Bun.serve({hostname:'127.0.0.1',port:candidatePort,async fetch(request){
  const url=new URL(request.url);let path=url.pathname;
  const corrupt=path.startsWith('/corrupt/'),missingAsset=path.startsWith('/missing/');
  if(corrupt)path=path.slice('/corrupt'.length);else if(missingAsset)path=path.slice('/missing'.length);
  const relativePath=path==='/'?'index.html':path.slice(1);
  if(relativePath==='index.html')return new Response(`<!doctype html><meta charset="utf-8"><script type="importmap">${JSON.stringify({imports:{'@umf/core':browserRootEntry,'@umf/core/reference':'/dist/umf.js'}})}</script><script type="module" src="/browser-check.js"></script>`,{headers:{'content-type':'text/html'}});
  if(relativePath==='browser-check.js')return new Response(browserCheck,{headers:{'content-type':'text/javascript'}});
  if(relativePath==='commerce.json')return new Response(original,{headers:{'content-type':'application/json'}});
  if(relativePath==='operations.json')return new Response(JSON.stringify(corpus),{headers:{'content-type':'application/json'}});
  if(relativePath==='compact-cases.json')return new Response(JSON.stringify(compactCases),{headers:{'content-type':'application/json'}});
  const target=join(install,relativePath);
  try{
   if(missingAsset&&relativePath.endsWith('.wasm'))return new Response('not found',{status:404});
   const bytes=await readFile(target);
   if(corrupt&&relativePath.endsWith('.wasm'))return new Response(new Uint8Array([0,1,2,3]),{headers:{'content-type':'application/wasm'}});
   const type=relativePath.endsWith('.wasm')?'application/wasm':relativePath.endsWith('.js')?'text/javascript':'application/octet-stream';
   return new Response(bytes,{headers:{'content-type':type}});
 }catch{return new Response('not found',{status:404})}
 }});serverPort=candidatePort;break}catch(error){lastBindError=error;if(!isAddressInUse(error))throw error}
 }
 if(!server)throw new Error(`Could not bind Chromium replay server after 20 loopback ports: ${String(lastBindError)}`);
const browserCheck=`const rootImportStarted=performance.now();const root=await import('@umf/core');const defaultRootInitializationMs=performance.now()-rootImportStarted;
import * as legacy from '@umf/core/reference';
const referenceCore=legacy;
const canonical=value=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);
if(JSON.stringify(Object.keys(root).sort())!==JSON.stringify(Object.keys(legacy).sort()))throw new Error('browser root export set changed');
${cardinalityReplaySnippet}
${facetsReplaySnippet}
${keysReplaySnippet}
${bit128ReplaySnippet}
${javascriptNumericReplaySnippet}
const compactCases=await(await fetch('/compact-cases.json')).json();
${compactReplaySnippet}
const corpus=await(await fetch('/operations.json')).json();const cases=corpus.cases.filter(item=>item.operation==='generatePythonClient');
for(const item of cases){let observed;try{const result=root.generatePythonClient(item.request);if(result&&typeof result.then==='function')throw new Error('root generator is asynchronous');observed={ok:true,result}}catch(error){observed={ok:false,error:{code:error.code,message:error.message,path:error.path}}}if(canonical(observed)!==canonical(item.expected))throw new Error('browser R3 root replay mismatch: '+item.id)}
const text=await(await fetch('/commerce.json')).text();const request={text,package:'shop'};const out=root.generatePythonClient(request);
if(out&&typeof out.then==='function'||canonical(out)!==canonical(legacy.generatePythonClient(request)))throw new Error('browser root-entry output mismatch');
let touched=0,caught;try{root.generatePythonClient({...request,actions:new Proxy(new Array(1001),{get(target,key,receiver){if(typeof key==='string'&&/^\\d+$/.test(key))touched++;return Reflect.get(target,key,receiver)}})})}catch(error){caught=error}
if(touched!==0||caught?.code!=='RESOURCE_LIMIT'||caught?.path!=='/actions')throw new Error('browser root action raw-limit control failed');
let single;try{root.generatePythonClient({...request,records:[{module:'x'.repeat(4_000_000),element:''}]})}catch(error){single=error}
if(single?.code!=='RESOURCE_LIMIT'||single?.path!=='/records'||single?.message!=='V4 host-read resource limit exceeded')throw new Error('browser root single-identity budget control failed');
window.browserRootResult={files:out.files.length,synchronous:true,r3Cases:cases.length,numericCases:numericCaseCount,numericBoundaryCases,defaultRootInitializationMs,numericDefaultFirstCallMs,cardinalityCases:cardinalityCaseCount,facetsCases:facetCaseCount,keysCases:keyCaseCount,bit128Cases:bit128CaseCount,bit128BufferInput:bitBufferInput,bitUmfErrorIdentity,compactValidateCases:compactValidateCaseCount,compactValidateFiles,exports:Object.keys(root).length,rawLimit:caught.code,singleIdentityLimit:single.path};`;
 console.log(JSON.stringify({stage:'chromium-r3-replay-start'}));
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();const external:string[]=[];const pageErrors:string[]=[];const browserLogs:string[]=[];const requests:string[]=[];const badResponses:string[]=[];page.on('request',request=>{requests.push(request.url());if(!request.url().startsWith(server!.url.href))external.push(request.url())});page.on('response',response=>{if(response.status()>=400)badResponses.push(`${response.status()} ${response.url()}`)});page.on('pageerror',error=>pageErrors.push(error.stack??error.message));page.on('console',message=>{if(message.type()==='error')browserLogs.push(message.text())});
  await page.goto(server.url.href);try{await page.waitForFunction(()=>Boolean((window as unknown as {browserRootResult?:unknown}).browserRootResult),undefined,{timeout:600000})}catch{throw new Error(`Browser root import failed: ${pageErrors.join('\n')} ${browserLogs.join('\n')} bad=${badResponses.join(',')} requests=${requests.join(',')}`)}
  const result=await page.evaluate(()=> (window as unknown as {browserRootResult:{files:number;synchronous:boolean;r3Cases:number;numericCases:number;numericBoundaryCases:number;defaultRootInitializationMs:number;numericDefaultFirstCallMs:number;cardinalityCases:number;facetsCases:number;keysCases:number;bit128Cases:number;bit128BufferInput:string;bitUmfErrorIdentity:boolean;compactValidateCases:number;compactValidateFiles:string[];exports:number;rawLimit:string;singleIdentityLimit:string}}).browserRootResult);
 assert(result.files===7&&result.synchronous&&result.r3Cases===31&&result.numericCases===27&&result.numericBoundaryCases===6&&result.defaultRootInitializationMs>0&&result.numericDefaultFirstCallMs>0&&result.cardinalityCases===66&&result.facetsCases===19&&result.keysCases===14&&result.bit128Cases===11&&result.bit128BufferInput==='unavailable'&&result.bitUmfErrorIdentity&&result.compactValidateCases===19&&result.exports>0&&result.rawLimit==='RESOURCE_LIMIT'&&result.singleIdentityLimit==='/records'&&external.length===0,'browser root parity, frozen replay, error identity, sync, resource limit, or network boundary failed');
  const corrupt=await page.evaluate(async(modulePath)=>{
   try{await import(modulePath);return ''}catch(error){return error instanceof Error?error.message:String(error)}
  },`/corrupt/${browserRootEntry.replace(/^\.\//,'')}`);
  assert(/wasm|compile|magic/i.test(corrupt)&&requests.some(url=>url.includes('/corrupt/dist/umf_core_wasm_bg.wasm')),'corrupt browser WASM did not fail at its requested asset boundary');
  const missingWasm=await page.evaluate(async(missingPath:string)=>{
   try{await import(missingPath);return ''}catch(error){return error instanceof Error?error.message:String(error)}
  },`/missing/${browserRootEntry.replace(/^\.\//,'')}`);
  assert(missingWasm&&requests.some(url=>url.includes('/missing/dist/umf_core_wasm_bg.wasm'))&&badResponses.some(item=>item.includes('/missing/dist/umf_core_wasm_bg.wasm')),'missing browser WASM did not fail at its requested asset boundary');
  const securityPacketPath=resolve('docs/helix/04-build/evidence/rust-migration/r8-security-and-or-v4-source-replay/predecessor.json');
  const securityReceiptPath=join(resolve(archive,'..'),'security-and-or-installed-receipt.json');
  await run([process.execPath,resolve('scripts/rust-migration/r8/security-and-or-installed-replay.mjs'),install,archive,securityPacketPath,securityReceiptPath]);
  const securityReceipt=JSON.parse(await readFile(securityReceiptPath,'utf8')) as {status:string;archive:{sha256:string};fixture:{sha256:string;cases:number};runtimes:{node:{validRustCalls:number};bun:{validRustCalls:number};chromium:{version:string;validWasmCalls:number;wasmAssetRequested:boolean;externalRequests:number}}};
  assert(securityReceipt.status==='passed'&&securityReceipt.archive.sha256===createHash('sha256').update(await readFile(archive)).digest('hex')&&securityReceipt.fixture.cases===68&&securityReceipt.runtimes.node.validRustCalls===30&&securityReceipt.runtimes.bun.validRustCalls===30&&securityReceipt.runtimes.chromium.validWasmCalls===30&&securityReceipt.runtimes.chromium.wasmAssetRequested&&securityReceipt.runtimes.chromium.externalRequests===0,'installed securityAnd/securityOr qualification receipt mismatch');
  const receipt={status:'passed',archive:archive.split('/').at(-1),archiveSha256:createHash('sha256').update(await readFile(archive)).digest('hex'),packageRootConditions:rootConditions,referenceConditions,routeTamperRefusals:3,platform:manifest.platform,node:nodeEntry.node,bun:bunEntry.bun,browser:`Chromium ${browser.version()}`,serverPort,files:result.files,r3Cases:result.r3Cases,javascriptNumericCases:result.numericCases,javascriptNumericBoundaryCases:result.numericBoundaryCases,javascriptNumericDefaultRootInitializationMs:{node:nodeEntry.defaultRootInitializationMs,bun:bunEntry.defaultRootInitializationMs,browser:result.defaultRootInitializationMs},javascriptNumericDefaultFirstCallMs:{node:nodeEntry.numericDefaultFirstCallMs,bun:bunEntry.numericDefaultFirstCallMs,browser:result.numericDefaultFirstCallMs},cardinalityCases:result.cardinalityCases,facetsCases:result.facetsCases,keysCases:result.keysCases,bit128Functions:bit128Packet.publicFunctions,bit128PacketSha256:await Bun.CryptoHasher.hash('sha256',await readFile('scripts/rust-migration/r5/bit128-default-route/predecessor.json'),'hex'),bit128Cases:result.bit128Cases,bit128NodeBufferInput:nodeEntry.bit128BufferInput,bit128BunBufferInput:bunEntry.bit128BufferInput,bit128BrowserBufferInput:result.bit128BufferInput,bit128UmfErrorIdentity:{node:nodeEntry.bitUmfErrorIdentity,bun:bunEntry.bitUmfErrorIdentity,browser:result.bitUmfErrorIdentity},compactValidateCases:result.compactValidateCases,compactValidateFiles:result.compactValidateFiles,exports:result.exports,securityAndOrInstalled:{status:securityReceipt.status,receiptPath:securityReceiptPath,fixtureSha256:securityReceipt.fixture.sha256,cases:securityReceipt.fixture.cases,validRustCalls:{node:securityReceipt.runtimes.node.validRustCalls,bun:securityReceipt.runtimes.bun.validRustCalls,chromium:securityReceipt.runtimes.chromium.validWasmCalls},browser:securityReceipt.runtimes.chromium.version},sourcePackageNodeAndBun:true,missingNativeRefused:true,corruptNativeRefused:true,corruptWasmRefused:true,missingWasmRefused:true,assetCount:Object.keys(manifest.assets).length,archiveMemberCount:archiveMembers.length,sourceTreeSha256:manifest.sourceClosure.sha256,sourceTransformStatus:manifest.sourceClosure.transform.status,sourceTransformCount:manifest.sourceClosure.transform.generatedInputs.length,totalElapsedMs:Date.now()-testStarted};
  const receiptPath=join(resolve(archive,'..'),'installed-test-receipt.json');
  await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(receipt));
 }finally{await browser.close();server!.stop(true)}
}finally{await rm(scratch,{recursive:true,force:true});}
