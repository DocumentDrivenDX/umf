import { copyJson } from '../../../../../src/model/json';
// Feasibility representation, deliberately not the public action validator.
export function inspect(input: unknown) {
  const source = copyJson(input) as any;
  if (!source || Array.isArray(source) || typeof source !== 'object') throw Error('STRUCTURE');
  const required = ['id','parameters','preconditions','postconditions','reads','writes','binding'];
  if (required.some(k => !Object.hasOwn(source,k))) throw Error('STRUCTURE');
  if (typeof source.id !== 'string' || !source.id) throw Error('IDENTITY');
  for (const k of required.slice(1,-1)) if (!Array.isArray(source[k])) throw Error('STRUCTURE');
  const known = new Set(required);
  const unchecked = Object.keys(source).filter(k => !known.has(k));
  if (!['recipe','handler'].includes(source.binding?.kind)) unchecked.push('binding');
  for (const [i,r] of [...source.preconditions,...source.postconditions].entries()) {
    if (typeof r?.language !== 'string' || typeof r?.version !== 'string' || typeof r?.expression !== 'string') throw Error('RULE');
    unchecked.push('rule:'+i); // preservation never implies evaluating the language
  }
  return {source,unchecked,declaredCompatible:false,executionVerified:false};
}
export const candidates = [
 {id:'create-link',parameters:['order','customer','product'],preconditions:[],postconditions:[],reads:['customer','product'],writes:['order','order-customer','order-product'],binding:{kind:'recipe',effects:['create order','link customer','link product']}},
 {id:'approve',parameters:['order'],preconditions:[],postconditions:[{language:'spike.order',version:'1',expression:'post.order.status == approved'}],reads:['order'],writes:['order.status'],binding:{kind:'handler',id:'approve',version:'1'}},
 {id:'reserve',parameters:['quantity','order'],preconditions:[{language:'spike.stock',version:'1',expression:'pre.stock >= quantity'}],postconditions:[{language:'spike.stock',version:'1',expression:'post.stock == pre.stock - quantity'}],reads:['stock'],writes:['stock','order'],binding:{kind:'handler',id:'reserve',version:'1'}}
];
export function probe() {
 const reports = candidates.map(inspect);
 const future = inspect({...candidates[0],future:{meaning:['keep']}});
 const retained = JSON.stringify(future.source) === JSON.stringify({...candidates[0],future:{meaning:['keep']}});
 let getterCalls=0;
 const hostile=Object.defineProperty({},'id',{enumerable:true,get(){getterCalls++;return 'x'}});
 let refused=false;try{inspect(hostile)}catch{refused=true}
 const copied=inspect(candidates[0]);copied.source.writes.push('unrelated');
 return {reports,retained,getterCalls,refused,isolated:candidates[0].writes.length===3};
}
