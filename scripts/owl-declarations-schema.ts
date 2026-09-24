export {};
const rdf=await Bun.file('spec/extensions/rdf/schema.json').json();
const obj=(properties:any)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const record=(kind:string)=>obj({node:obj({kind:{const:kind},value:{type:'string',minLength:1}}),kind:{enum:['class','datatype','objectProperty','dataProperty','annotationProperty','namedIndividual']},quadIndexes:{type:'array',minItems:1,uniqueItems:true,items:{type:'integer',minimum:0}}});
await Bun.write('spec/extensions/owl/declarations-schema.json',JSON.stringify({$schema:rdf.$schema,$id:'urn:umf:owl:declarations:0.1.0',...obj({profile:{const:'owl-declarations-1'},complete:{const:false},source:{$ref:'urn:umf:core:0.1.0'},blankNodeScope:{type:'string'},declarations:{type:'array',items:record('iri')},anonymousTypeAssertions:{type:'array',items:record('blank')}})},null,2)+'\n');
