import * as u from '../../src';
import evidence from '../../fixtures/validation/facets-postgresql-constraints-native.json';
export function postgresqlFacetSource(){
 let document=u.importPostgresqlCatalogCapture(evidence.sourceText,{id:'postgresql-facets'});
 document=u.upgradeFieldEnvelope(document).target;
 document=u.upgradeNullabilityEnvelope(document).target;
 document=u.upgradeCardinalityEnvelope(document).target;
 document=u.upgradeFacetEnvelope(document).target;
 for(const e of document.modules.find(m=>m.id==='postgresql.columns')!.elements)e.kind='field';
 return document;
}
export function postgresqlFacetRequest(document:u.Document,relation:string,options:Partial<u.PostgresqlFacetRequest>={}):u.PostgresqlFacetRequest{
 const column=u.getPostgresqlColumnMetadata(document).find(c=>c.relation.name===relation)!.path;
 return {column,nativeSource:evidence.sourceText,supplement:JSON.stringify(evidence.capture),mode:'report',profile:'stored-value',datumFormat:'little-endian-datum64',obligation:'value-domain',...options};
}
