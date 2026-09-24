export {};
const rdf=await Bun.file('spec/extensions/rdf/schema.json').json();
const term=rdf.properties.quads.items.properties.object,node=rdf.properties.quads.items.properties.subject,predicate=rdf.properties.quads.items.properties.predicate;
const obj=(properties:any)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const indexes={type:'array',items:{type:'integer',minimum:0}};
const axiom={oneOf:[
 obj({kind:{const:'negativePropertyAssertion'},node,sourceIndividual:node,assertionProperty:node,target:node,targetKind:{const:'individual'},quadIndexes:indexes}),
 obj({kind:{const:'negativePropertyAssertion'},node,sourceIndividual:node,assertionProperty:predicate,target:{allOf:[term,{properties:{kind:{const:'literal'}}}]},targetKind:{const:'value'},quadIndexes:indexes}),
 obj({kind:{const:'allDifferent'},node,members:{type:'array',minItems:2,items:node},memberPredicate:{enum:['members','distinctMembers']},quadIndexes:indexes}),
 obj({kind:{enum:['allDisjointClasses','allDisjointProperties']},node,members:{type:'array',minItems:2,items:node},memberPredicate:{const:'members'},quadIndexes:indexes})
]};
const schema={$schema:rdf.$schema,$id:'urn:umf:owl:special-axioms:0.1.0',...obj({profile:{const:'owl-special-axioms-1'},complete:{const:false},source:{$ref:'urn:umf:core:0.1.0'},blankNodeScope:{type:'string'},axioms:{type:'array',items:axiom},malformed:{type:'array',items:node}})};
await Bun.write('spec/extensions/owl/special-axioms-schema.json',JSON.stringify(schema,null,2)+'\n');
