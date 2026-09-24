import type {Document} from '../src/model/types';
import {relationshipCandidate} from './core-relationship-cases';
export function relationshipTransitionCases():{id:string;source:Document}[]{
 const authored=relationshipCandidate();
 const values=[null,false,'opaque',[],{future:['keep',null]},authored.modules[0].relationships];
 return values.map((value,index)=>{
  const source=relationshipCandidate();source.umf='0.6.0';source.modules[0].relationships=value;
  source.relationships={documentScope:'retained'};source.modules[0].elements[0].relationships={elementScope:'retained'};
  source.modules.push({id:'second/~',namespace:'other',elements:[],relationships:{unknown:9007199254740991}});
  return {id:'collision-'+index,source};
 }).concat([{id:'no-collision',source:(()=>{const d=relationshipCandidate();d.umf='0.6.0';delete d.modules[0].relationships;return d;})()}]);
}
