import {compile,NodeHost,getTypeName,walkPropertiesInherited} from '@typespec/compiler';
import {resolve} from 'node:path';
const program=await compile(NodeHost,resolve('fixtures/typespec/project/main.tsp'),{noEmit:true});
if(program.hasError())throw new Error('Native filesystem-host compilation failed');
const [model]=program.resolveTypeReference('Sales.Order');if(model?.kind!=='Model')throw new Error('Missing native model');
const native=[...walkPropertiesInherited(model)].map(p=>({name:p.name,type:getTypeName(p.type),optional:p.optional,...(p.defaultValue?.valueKind==='NumericValue'?{defaultNumber:p.defaultValue.value.toString()}:{} )}));
const graph=await Bun.file('fixtures/typespec/semantic-graph.json').json();const nodes=new Map<string,any>(graph.nodes.map((n:any)=>[n.id,n]));
function properties(id:string):any[]{
 const node=nodes.get(id);const own=node.edges.filter((e:any)=>e.role==='property').map((e:any)=>{const p=nodes.get(e.target);return {name:e.name,type:nodes.get(p.edges.find((x:any)=>x.role==='type').target).label,optional:p.attributes.optional,...(p.attributes.default?.kind==='NumericValue'?{defaultNumber:p.attributes.default.value}:{})};});
 const base=node.edges.find((e:any)=>e.role==='baseModel');return [...own,...(base?properties(base.target).filter(p=>!own.some((o:any)=>o.name===p.name)):[])];
}
const extracted=properties(graph.roots.find((r:any)=>r.expression==='Sales.Order').target);
if(JSON.stringify(extracted)!==JSON.stringify(native))throw new Error('Compiled graph differs from native inherited-property view');
if(!native.some(p=>p.name==='id'&&p.type==='string')||!native.some(p=>p.defaultNumber==='42'))throw new Error('Native expectations absent');
await Bun.write('fixtures/typespec/semantic-oracle-results.json',JSON.stringify({compiler:'@typespec/compiler@1.16.0',properties:native,scope:'Filesystem-host native inherited properties compared with UMF graph traversal; same compiler implementation, not independent language implementation'},null,2)+'\n');
console.log('TypeSpec semantic graph: native inherited properties, resolved types, optionality and numeric defaults agree');
