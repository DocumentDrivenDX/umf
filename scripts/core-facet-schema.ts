export {};
const schema=await Bun.file('spec/core/cardinality-document.schema.json').json();
schema.$id='urn:umf:core:0.5.0';schema.title='UMF 0.5.0 experimental facet envelope';schema.properties.umf.const='0.5.0';
schema.description='Candidate facet envelope: author-stated scalar bounds with explicit units. Requires semantic validation of scale <= precision, identities and references. Native enforcement, encoding and exactness require separate bindings.';
const count={type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER};
schema.$defs.facets={type:'object',description:'Missing members impose no bound. Unknown members and qualifiers are retained without interpretation.',properties:{
 length:{type:'object',required:['max','unit'],properties:{max:count,unit:{type:'string',minLength:1,description:'Known units: unicode-scalar for string, byte for binary. Unknown units remain uninterpreted.'}}},
 precision:{...count,minimum:1,description:'Decimal coefficient digit bound; requires scale. Absolute coefficient is less than 10^precision. No implicit rounding.'},
 scale:{...count,description:'Fixed fractional digit count; requires precision. Semantic validation requires scale <= precision. Value equals integer coefficient times 10^-scale.'},
 integerWidth:{type:'object',required:['bits','signed'],properties:{bits:{...count,minimum:1},signed:{type:'boolean'}},description:'Signed [-2^(bits-1),2^(bits-1)-1] or unsigned [0,2^bits-1]; mathematical domain, not a physical storage-width assertion.'},
},dependentRequired:{precision:['scale'],scale:['precision']}};
schema.$defs.element.properties.facets={$ref:'#/$defs/facets'};
const hasFacet=(key:string)=>({required:['facets'],properties:{facets:{type:'object',required:[key],properties:{[key]:{}}}}});
const hasUnit=(unit:string)=>({required:['facets'],properties:{facets:{type:'object',required:['length'],properties:{length:{type:'object',required:['unit'],properties:{unit:{const:unit}}}}}}});
schema.$defs.element.allOf.push(
 {if:{required:['facets'],properties:{facets:{}}},then:{required:['kind'],properties:{kind:{const:'field'},cardinality:{enum:['one','unspecified']},references:{type:'array',not:{contains:{type:'object',required:['role'],properties:{role:{const:'record-type'}}}}}}}},
 {if:hasFacet('length'),then:{required:['scalarType'],properties:{scalarType:{enum:['string','binary']}}}},
 {if:hasUnit('unicode-scalar'),then:{required:['scalarType'],properties:{scalarType:{const:'string'}}}},
 {if:hasUnit('byte'),then:{required:['scalarType'],properties:{scalarType:{const:'binary'}}}},
 {if:hasFacet('precision'),then:{required:['scalarType'],properties:{scalarType:{const:'decimal'}}}},
 {if:hasFacet('integerWidth'),then:{required:['scalarType'],properties:{scalarType:{const:'integer'}}}},
);
await Bun.write('spec/core/facet-document.schema.json',JSON.stringify(schema,null,2)+'\n');
