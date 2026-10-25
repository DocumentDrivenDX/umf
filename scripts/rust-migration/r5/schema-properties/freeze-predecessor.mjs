import {writeFile} from 'node:fs/promises';
const {schemaPropertiesFixture}=await import('../../../core-schema-properties-cases.ts');
const {declareCoreSchemaProperties,inspectCoreSchemaProperties}=await import('../../../../src/model/schema-properties.ts');
const {readDocument,writeDocument}=await import('../../../../src/model/document.ts');
const clone=(x)=>structuredClone(x);
const canonical=(x)=>Array.isArray(x)?`[${x.map(canonical).join(',')}]`:x&&typeof x==='object'?`{${Object.keys(x).sort().map(k=>`${JSON.stringify(k)}:${canonical(x[k])}`).join(',')}}`:JSON.stringify(x);
const capture=(fn)=>{try{return {ok:true,value:fn()};}catch(e){return {ok:false,error:{name:e.name,code:e.code??'',message:e.message??String(e),path:e.path??''}};}};
const base=schemaPropertiesFixture();
const identity={scope:'element',module:'m',element:'quantity'};
const declared=declareCoreSchemaProperties(base,identity,{title:'Count',facets:{range:{min:{integerToken:'1'},max:{integerToken:'4'}}}});
const unknownFacets=clone(base);unknownFacets.modules[0].elements[0].facets.futureGroup={payload:'keep'};
const unknownMerge=declareCoreSchemaProperties(unknownFacets,identity,{facets:{range:{min:{integerToken:'1'},max:{integerToken:'4'}}}});
const unknownRange=clone(base);unknownRange.modules[0].elements[0].facets.range={min:{integerToken:'1'},futureQualifier:{opaque:true}};
const invalidSource=clone(base);invalidSource.umf='0.7.0';
const unknownQualifier=clone(base);unknownQualifier.modules[0].elements[2].facets.length.futureQualifier='opaque';
const yaml=writeDocument(declared,'yaml');
const packet={
  predecessor:{source:'src/model/schema-properties.ts',operations:['inspectCoreSchemaProperties','declareCoreSchemaProperties'],version:'2.0.0'},
  inputs:{source:base,identity,patch:{title:'Count',facets:{range:{min:{integerToken:'1'},max:{integerToken:'4'}}}},unknownFacets:{source:unknownFacets,patch:{facets:{range:{min:{integerToken:'1'},max:{integerToken:'4'}}}}},unknownRange:{source:unknownRange,patch:{facets:{range:{max:{integerToken:'3'}}}}},invalidSource:{source:invalidSource,identity:{scope:'element',module:'missing',element:'missing'},patch:{title:'x'}},unknownPatch:{source:invalidSource,identity,patch:{future:true}}},
  success:{inspectDocument:capture(()=>inspectCoreSchemaProperties(base,{scope:'document'})),inspectModule:capture(()=>inspectCoreSchemaProperties(base,{scope:'module',module:'m'})),inspectElement:capture(()=>inspectCoreSchemaProperties(base,identity)),declare:capture(()=>declared),unknownUnrelatedFacetMerge:capture(()=>unknownMerge),unknownQualifierInspection:capture(()=>inspectCoreSchemaProperties(unknownQualifier,{scope:'element',module:'m',element:'label'}))},
  refusals:{patchBeforeInvalidSource:capture(()=>declareCoreSchemaProperties(invalidSource,identity,{future:true})),sourceBeforeMissingIdentity:capture(()=>declareCoreSchemaProperties(invalidSource,{scope:'element',module:'missing',element:'missing'},{title:'x'})),unknownExistingGroup:capture(()=>declareCoreSchemaProperties(unknownRange,identity,{facets:{range:{max:{integerToken:'3'}}}}))},
  copyAndRoundTrip:{inputUnchanged:canonical(base)===canonical(schemaPropertiesFixture()),resultIsIndependent:declared!==base&&declared.modules!==base.modules&&declared.modules[0]!==base.modules[0],jsonRoundTrip:readDocument(writeDocument(declared,'json'),'json'),yamlRoundTrip:readDocument(yaml,'yaml'),yamlSource:yaml},
};
const output=process.argv[2];if(!output)throw new Error('Output path required');
await writeFile(output,JSON.stringify(packet,null,2)+'\n');
