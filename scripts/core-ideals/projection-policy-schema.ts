/** Shared structural policy for authored Field/Record projection receipts. */
export function enforceProjectionPolicy(schema:any){
 const exact={type:'object',properties:{outcome:{const:'exact'}}};
 const mapping=schema.properties.mapping?{mapping:exact}:{mappings:{type:'array',items:exact}};
 const diagnostic={type:'object',properties:{severity:{const:'error'}},required:['severity']};
 const nonexact={type:'object',properties:{outcome:{enum:['unknown','approximated','not-expressible']}},required:['outcome']};
 const nonexactMapping=schema.properties.mapping?{mapping:nonexact}:{mappings:{type:'array',contains:nonexact}};
 // Derived schemas replace this branch after replacing their mapping shape.
 schema.allOf=schema.allOf.filter((rule:any)=>rule.$comment!=='UMF projection policy');
 schema.allOf.push({$comment:'UMF projection policy',allOf:[
  {if:{properties:{status:{const:'projected'}}},then:{properties:{diagnostics:{type:'array',items:{type:'object',properties:{severity:{const:'warning'}}}}}},else:{properties:{residuals:{type:'array',minItems:1},diagnostics:{type:'array',minItems:1,contains:diagnostic}}}},
  {if:{properties:{status:{const:'projected'},request:{type:'object',properties:{mode:{const:'strict'}}}}},then:{properties:{residuals:{type:'array',maxItems:0},...mapping}}},
  {if:{properties:{status:{const:'projected'},...nonexactMapping}},then:{properties:{residuals:{type:'array',minItems:1}}}}
 ]});
}
