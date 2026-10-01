import {copyJson,declareCoreRelationship,type CoreRelationshipDeclaration,type CoreRelationshipRequest,type Document,type RelationshipPostgresqlRequest} from '../../src';
import {postgresqlLayoutCases} from '../relationship-postgresql-layout-cases';
export function postgresqlRelationshipCases(){
 const selected=['keyed-association-and-fk','alternate-unique-target','nullable-composite','anonymous-junction','edge','heterogeneous-fk','type-mismatch','collation-mismatch','association-attribute-loss','partitioned-key'];
 return postgresqlLayoutCases().filter(c=>selected.includes(c.id)).map(c=>{
  const logical=copyJson(c.logical) as unknown as Document,authored=(logical.modules[0]!.relationships??[]) as CoreRelationshipRequest[];
  delete logical.modules[0]!.relationships;let source=logical;const authors:CoreRelationshipDeclaration[]=[];
  for(const relationship of authored){const author=declareCoreRelationship(source,{module:'sales'},relationship);authors.push(author);source=author.target as Document;}
  return {id:c.id,source,binding:c.binding,authors,request:{id:'pg-relationship-'+c.id,profile:'new-keyed-tables' as const,mode:'report' as const,policy:c.policy} as RelationshipPostgresqlRequest,expected:c.valid&&c.id!=='edge'?'projected' as const:'blocked' as const};
 });
}
