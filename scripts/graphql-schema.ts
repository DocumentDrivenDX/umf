import ts from 'typescript-api';
if((await Bun.file('node_modules/graphql/package.json').json()).version!=='17.0.2')throw new Error('Schema generation requires pinned GraphQL.js 17.0.2');
const entry='node_modules/graphql/language/ast.d.ts';
const program=ts.createProgram([entry],{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,skipLibCheck:true});
const checker=program.getTypeChecker();const source=program.getSourceFile(entry)!;
const module=checker.getSymbolAtLocation(source)!;const exports=checker.getExportsOfModule(module);
const defs:Record<string,any>={};
function named(name:string):any {
 if(defs[name])return {$ref:'#/$defs/'+name};
 defs[name]={};
 const symbol=exports.find(s=>s.name===name);if(!symbol)throw new Error(name);
 const type=checker.getDeclaredTypeOfSymbol(symbol);
 if(type.isUnion()){defs[name]={anyOf:type.types.map(t=>convert(t))};return {$ref:'#/$defs/'+name};}
 const properties:Record<string,any>={};const required:string[]=[];
 for(const prop of type.getProperties()){
  if(['loc','tokenCount'].includes(prop.name))continue;
  const declaration=prop.valueDeclaration??prop.declarations![0]!;
  const value=checker.getTypeOfSymbolAtLocation(prop,declaration);
  properties[prop.name]=name==='DocumentNode'&&prop.name==='definitions'?{type:'array',minItems:1,items:{anyOf:[named('TypeSystemDefinitionNode'),named('TypeSystemExtensionNode')]}}:convert(value);
  if(!(prop.flags&ts.SymbolFlags.Optional))required.push(prop.name);
 }
 defs[name]={type:'object',required,properties};return {$ref:'#/$defs/'+name};
}
function convert(type:ts.Type):any {
 if(type.isStringLiteral())return {const:type.value};
 if(type.flags&ts.TypeFlags.String)return {type:'string'};
 if(type.flags&ts.TypeFlags.BooleanLike)return {type:'boolean'};
 if(type.isUnion())return {anyOf:type.types.filter(t=>!(t.flags&ts.TypeFlags.Undefined)).map(convert)};
 const ref=type as ts.TypeReference;const args=checker.getTypeArguments(ref);
 if(type.getSymbol()?.name==='ReadonlyArray'||type.getSymbol()?.name==='Array')return {type:'array',items:convert(args[0]!)};
 const name=type.aliasSymbol?.name??type.getSymbol()?.name;
 if(name&&exports.some(s=>s.name===name))return named(name);
 throw new Error('Unsupported AST type '+checker.typeToString(type));
}
const root=named('DocumentNode');
const schema={$schema:'https://json-schema.org/draft/2020-12/schema',$id:'urn:umf:graphql:0.1.0',type:'object',required:['profile','ast','originalSource'],properties:{profile:{const:'graphql-js-17.0.2-sdl'},mode:{enum:['schema','fragment']},ast:root,originalSource:{type:'string'}},$defs:defs};
const manifest={id:'umf.graphql',version:'0.1.0',coreVersion:'0.1.0',description:'GraphQL SDL native AST and source preservation',schema,semantics:'CONTRACT-009. SDL AST preserves native type/directive/default declarations; original source retains comments. Runtime scalar/directive behavior remains external.',scopes:['element'],capabilities:{validation:'semantic',directions:['import','export'],native:{system:'GraphQL SDL',version:'GraphQL.js 17.0.2; September 2025 specification plus explicitly reported runtime grammar additions',subset:'Schema definitions/extensions and constant values; executable operations are outside this schema adapter'},evidence:['tests/graphql/native.test.ts','tests/graphql/corpus.test.ts','fixtures/graphql/corpus-oracle-results.json']}};
await Bun.write('spec/extensions/graphql/schema.json',JSON.stringify(schema,null,2)+'\n');
await Bun.write('spec/extensions/graphql/package.json',JSON.stringify(manifest,null,2)+'\n');
console.log('GraphQL SDL AST definitions:',Object.keys(defs).length);
