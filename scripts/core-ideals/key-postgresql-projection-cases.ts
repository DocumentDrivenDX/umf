import {tableSpecKeyAuthors,keyRecord,keyId,keyCode} from './key-tablespec-projection-cases';
import {declareCoreKey,type CoreKeyDeclaration} from '../../src/model/keys';
import type {Document} from '../../src/model/types';
import type {KeyPostgresqlRequest} from '../../src/core-ideals/key-postgresql-projection';
export function postgresqlKeyAuthors(primary=true){
 const c=tableSpecKeyAuthors(primary);
 const request:KeyPostgresqlRequest={id:'pg-key-native',record:keyRecord,namespace:'umf_key_projection',tableName:'Orders',scope:'new-table-stored-values',mode:'report',columns:[{field:keyId,name:'order_id',nativeType:'integer'},{field:keyCode,name:'external_code',nativeType:'text'}],keyNames:[{keyId:'stable-id',name:'order_identity'},{keyId:'stable-code',name:'external_identity'}]};
 return {source:c.source,authors:c.authors,request};
}
export function postgresqlKeyProjectionCases(){
 const rows:{name:string;source:Document;authors:CoreKeyDeclaration[];request:KeyPostgresqlRequest;expected:'projected'|'blocked';expectedEquality?:'unknown'}[]=[];
 for(const primary of [true,false])for(const mode of ['strict','report'] as const){const c=postgresqlKeyAuthors(primary);c.request.mode=mode;rows.push({name:(primary?'primary':'no-primary')+'-'+mode,...c,expected:mode==='report'?'projected':'blocked'});}
 const renamed=postgresqlKeyAuthors(),rename=declareCoreKey(renamed.source,keyRecord,{id:'stable-id',name:'Renamed identity',fields:[keyId]});renamed.source=structuredClone(rename.target);renamed.authors[0]=rename;(renamed.source.modules[0]!.elements[0]!.keys as unknown[]).reverse();renamed.request.keyNames.reverse();rows.push({name:'rename-and-reorder',...renamed,expected:'projected'});
 for(const family of ['boolean','decimal','binary','integer-width','unsigned','string-length','binary-length'] as const){
  const c=postgresqlKeyAuthors(),d=structuredClone(c.authors[0]!.source),e=d.modules[0]!.elements[1]!;
  e.scalarType=family.startsWith('integer')||family==='unsigned'?'integer':family==='string-length'?'string':family==='binary-length'?'binary':family;
  c.request.columns[0]!.nativeType=e.scalarType==='boolean'?'boolean':e.scalarType==='binary'?'bytea':e.scalarType==='string'?'text':'numeric';
  if(family==='decimal')e.facets={precision:5,scale:2};if(family==='integer-width')e.facets={integerWidth:{bits:8,signed:true}};if(family==='unsigned')e.facets={integerWidth:{bits:64,signed:false}};if(family==='string-length'||family==='binary-length')e.facets={length:{max:3,unit:family==='string-length'?'unicode-scalar':'byte'}};
  const a=declareCoreKey(d,keyRecord,{id:'stable-id',name:'Order identity',fields:[keyId],primary:true}),b=declareCoreKey(a.target,keyRecord,{id:'stable-code',name:'External code',fields:[keyCode]});rows.push({name:family,source:b.target,authors:[a,b],request:c.request,expected:'projected'});
 }
 const compound=postgresqlKeyAuthors(),a=declareCoreKey(compound.authors[0]!.source,keyRecord,{id:'stable-id',name:'Compound identity',fields:[keyCode,keyId],primary:true}),b=declareCoreKey(a.target,keyRecord,{id:'stable-code',name:'External code',fields:[keyCode]});rows.push({name:'compound-ordered',source:b.target,authors:[a,b],request:compound.request,expected:'projected'});
 const many=postgresqlKeyAuthors(),extra=declareCoreKey(many.source,keyRecord,{id:'compound',name:'Extra alternate',fields:[keyId,keyCode]});many.request.keyNames.push({keyId:'compound',name:'compound_identity'});rows.push({name:'multiple-alternates',source:extra.target,authors:[...many.authors,extra],request:many.request,expected:'projected'});
 const unknown=postgresqlKeyAuthors();unknown.source=structuredClone(unknown.source);unknown.source.vocabularies.future={version:'1.0.0'};unknown.source.extensions={future:{number:'9007199254740993',opaque:{quoted:'"\\'}}};rows.push({name:'unknown-extension',...unknown,expected:'projected'});
 for(const qualifier of ['key','member','facet'] as const){
  const c=postgresqlKeyAuthors(),d=structuredClone(c.source),record=d.modules[0]!.elements[0]!;
  if(qualifier==='key')(record.keys as any[])[0].future={equality:'uninterpreted'};
  if(qualifier==='member')(record.members as any[])[0].future={equality:'uninterpreted'};
  if(qualifier==='facet')d.modules[0]!.elements[1]!.facets={future:{equality:'uninterpreted'}};
  const a=declareCoreKey(d,keyRecord,{id:'stable-id',name:'Order identity',fields:[keyId]}),b=declareCoreKey(a.target,keyRecord,{id:'stable-code',name:'External code',fields:[keyCode]});
  rows.push({name:'unknown-'+qualifier+'-qualifier',source:b.target,authors:[a,b],request:c.request,expected:'projected',expectedEquality:'unknown'});
 }
 const mismatch=postgresqlKeyAuthors();mismatch.request.columns[0]!.nativeType='text';rows.push({name:'family-conflict',...mismatch,expected:'blocked'});
 const quoted=postgresqlKeyAuthors();quoted.request.tableName='Order "世界';quoted.request.columns[0]!.name='order " id';quoted.request.keyNames[0]!.name='identity " 世界';rows.push({name:'quoted-identifiers',...quoted,expected:'projected'});
 return rows;
}
