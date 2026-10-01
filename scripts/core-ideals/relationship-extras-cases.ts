import corpus from '../../fixtures/relationship/authored/corpus.json';
import {upgradeRelationshipEnvelope,declareCoreRelationship,type CoreRelationshipDeclaration,type Document,type RelationshipExtraRequest,type RelationshipExtraSystem} from '../../src';
export interface ExtraCase {name:string;source:Document;author:CoreRelationshipDeclaration;request:RelationshipExtraRequest;expected:'projected'|'blocked'}
export function relationshipExtraCases():ExtraCase[]{
 const result:ExtraCase[]=[];
 const variants=[...corpus.cases.map(c=>({name:c.id,relationship:structuredClone(c.relationship) as any})),{name:'heterogeneous-target',relationship:{...structuredClone(corpus.cases[3]!.relationship),target:[{module:'sales',element:'Product',key:'pk'},{module:'sales',element:'Customer',key:'account'}]}}];
 for(const c of variants){
  const legacy=structuredClone(corpus.base) as unknown as Document;legacy.vocabularies.future={version:'1.0.0'};legacy.extensions={future:{opaque:['9007199254740993',null,{uninterpreted:true}]}};
  const upgrade=upgradeRelationshipEnvelope(legacy),author=declareCoreRelationship(upgrade.target,{module:'sales'},c.relationship);
  const r=author.request,refs=[...new Map([...r.source,...r.target].map(ref=>[JSON.stringify([ref.module,ref.element]),{module:ref.module,element:ref.element}])).values()];
  for(const system of ['graphql','rdf','linkml'] as RelationshipExtraSystem[])for(const mode of ['strict','report'] as const){
   const common={id:'extra-'+c.name+'-'+system,mode,relationship:{module:'sales',id:r.id},records:refs.map(ref=>({...ref,name:system==='rdf'?'https://example.org/type/'+ref.element:ref.element,...(system==='graphql'?{markerField:'_umfRecord'}:{})})),...(!r.directed?{orientation:'source-to-target' as const}:{})};
   const request:RelationshipExtraRequest=system==='graphql'?{...common,system,root:{typeName:'Query',fieldName:'_umfSchema'},field:r.name,...(r.inverse?{inverseField:r.inverse}:{}),...(r.target.length>1?{forwardUnion:'SelectedTarget'}:{}),...(r.inverse&&r.source.length>1?{inverseUnion:'SelectedSource'}:{})}:system==='rdf'?{...common,system,predicate:'https://example.org/relationship/'+r.name,unionPolicy:'owl-union',...(r.inverse?{inversePredicate:'https://example.org/relationship/'+r.inverse}:{})}:{...common,system,schemaId:'https://example.org/extra/'+c.name,schemaName:'extra_relationship',slot:r.name,...(r.inverse?{inverseSlot:r.inverse}:{})};
   result.push({name:c.name+'-'+system+'-'+mode,source:author.target as unknown as Document,author,request,expected:mode==='strict'||system==='linkml'&&(r.target.length!==1||!!r.inverse&&r.source.length!==1)?'blocked':'projected'});
  }
 }
 return result;
}
