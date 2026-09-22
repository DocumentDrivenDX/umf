import * as u from '../../src';
import type {SqlServerFacetRequest} from '../../src/core-ideals/facets-sqlserver';
import proof from '../../fixtures/validation/facets-sqlserver-discovery-native.json';
/** Each fixture is an explicit single-table capture, retaining the entire table.
 * Discovery-only root metadata is covered separately by unknown-content tests. */
export function sqlserverFacetCase(table:string,column='value',options:Partial<SqlServerFacetRequest>={}){
 const root=JSON.parse(proof.sourceText),selected=root.tables.find((t:any)=>t.name===table);
 if(!selected)throw Error('Unknown fixture '+table);
 root.tables=[selected];delete root.facetDiscovery;
 const nativeSource=JSON.stringify(root,null,2)+'\n',identity={module:'logical',element:'value'};
 let document=u.importSqlServerCatalog(nativeSource,{id:'sqlserver-facets-'+table});
 document=u.upgradeFieldEnvelope(document).target;document=u.upgradeNullabilityEnvelope(document).target;document=u.upgradeCardinalityEnvelope(document).target;document=u.upgradeFacetEnvelope(document).target;
 const row=u.getSqlServerColumnMetadata(document).find(c=>c.element.name===column)!;
 document.modules.push({id:identity.module,namespace:'',elements:[{id:identity.element,kind:'field',name:column,cardinality:'one',...(row.element.scalarType?{scalarType:row.element.scalarType}:{}),extensions:{}}]});
 const request:SqlServerFacetRequest={column:row.path,nativeSource,identity,mode:'report',profile:'stored-value',obligation:'value-domain',...options};
 return {document,request};
}
export const sqlserverFacetExamples=JSON.parse(proof.sourceText).tables.flatMap((t:any)=>t.columns.map((c:any)=>({table:t.name,column:c.name}))) as {table:string;column:string}[];
