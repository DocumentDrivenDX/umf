import type {ModelShape} from '../extensions/binding/model-shape';
import type {Bit128Ref,Resolved128Layout} from '../extensions/binding/bit128-layout';
export type ShapePathSegment={kind:'member';name:string}|{kind:'array-item'}|{kind:'map-value'};
export interface CompositeMapping {record:Bit128Ref;root:Bit128Ref;field:Bit128Ref;column:string;storage:'json-column'|'native-nested';path:ShapePathSegment[];slots:string[]}
export function compositeMappings(layout:Resolved128Layout,system:string):CompositeMapping[]{
 const result:CompositeMapping[]=[];
 for(const r of layout.records)for(const f of r.fields)if(f.carrier.kind==='json'){
  const c=f.carrier,storage=['avro','parquet'].includes(system)?'native-nested' as const:'json-column' as const;
  const visit=(node:ModelShape,path:ShapePathSegment[])=>{
   result.push({record:r.identity,root:f.identity,field:node.identity,column:c.column,storage,path,slots:node.kind==='leaf'&&node.carrier.kind==='words64'?[node.carrier.highColumn,node.carrier.lowColumn]:[]});
   if(node.kind==='array')visit(node.item,[...path,{kind:'array-item'}]);
   else if(node.kind==='map')visit(node.item,[...path,{kind:'map-value'}]);
   else if(node.kind==='group')node.members.forEach((m,i)=>visit(m,[...path,{kind:'member',name:'m'+i}]));
  };visit(c.shape,[]);
 }
 return result;
}
