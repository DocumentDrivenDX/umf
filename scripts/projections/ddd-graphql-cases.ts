import type {Document,DddGraphqlPolicy} from '../../src';
import fixture from '../../fixtures/projections/ddd-graphql/case.json';
import shared from '../../fixtures/projections/ddd-authored-relationships/base.json';
import {upgradeRelationshipEnvelope,declareCoreRelationship} from '../../src';
export interface GraphqlCase {id:string;logical:Document;policy:DddGraphqlPolicy}
export function graphqlCases():GraphqlCase[]{
  const base=()=>structuredClone(fixture) as unknown as {logical:Document;policy:DddGraphqlPolicy};
  const cases:GraphqlCase[]=[{id:'orders',...base()}];
  const self=base();(self.logical.modules[0]!.relationships as any[])[0].source=[{module:'sales',element:'Customer'}];
  self.policy.relationships[0]!.forwardName='parent';self.policy.relationships[0]!.inverseName='children';cases.push({id:'self',...self});
  const undirected=base();(undirected.logical.modules[0]!.relationships as any[])[0].directed=false;undirected.policy.relationships[0]!.orientation='source-to-target';cases.push({id:'undirected',...undirected});
  const heterogeneous=base();const r=(heterogeneous.logical.modules[0]!.relationships as any[])[0];r.source.push({module:'sales',element:'OrderProduct'});r.target.push({module:'sales',element:'Product',key:'identity'});
  heterogeneous.policy.relationships[0]!.forwardUnion='CustomerOrProduct';heterogeneous.policy.relationships[0]!.inverseUnion='OrderOrLine';cases.push({id:'heterogeneous',...heterogeneous});
  const bounded=base();(bounded.logical.modules[0]!.relationships as any[])[1].targetMultiplicity={min:1,max:3};cases.push({id:'bounded',...bounded});
  const noInverse=base();delete (noInverse.logical.modules[0]!.relationships as any[])[0].inverse;delete noInverse.policy.relationships[0]!.inverseName;cases.push({id:'no-inverse',...noInverse});
  const zero=base();(zero.logical.modules[0]!.relationships as any[])[0].targetMultiplicity={min:0,max:1};cases.push({id:'optional-single',...zero});
  let logical=upgradeRelationshipEnvelope(shared.logical as unknown as Document).target;
  for(const proposal of shared.relationshipProposals)logical=declareCoreRelationship(logical,{module:proposal.module},proposal.assertion as any).target;
  const records=new Map(shared.relationshipProposals.flatMap(r=>[...r.assertion.source,...r.assertion.target]).map(r=>[JSON.stringify([r.module,r.element]),{module:r.module,element:r.element}]));
  const policy={...structuredClone(shared.graphqlPolicy),sourceProfile:'core-ideals',endpoints:[...records.values()].map(r=>({record:r,entity:r})),relationships:shared.relationshipProposals.map(r=>({module:r.module,id:r.assertion.id,forwardName:r.assertion.name,...(r.assertion.inverse?{inverseName:r.assertion.inverse}:{})}))} as DddGraphqlPolicy;
  cases.push({id:'shared-authored-graph',logical:logical as unknown as Document,policy});
  return cases;
}
