import {tableSpecKeyAuthors,keyRecord,keyId,keyCode} from './key-tablespec-projection-cases';
import {declareCoreKey,type CoreKeyDeclaration} from '../../src/model/keys';
import type {Document} from '../../src/model/types';
import type {KeySqlServerRequest} from '../../src/core-ideals/key-sqlserver-projection';
export function sqlserverKeyAuthors(primary=true){
 const c=tableSpecKeyAuthors(primary);
 const request:KeySqlServerRequest={id:'pg-key-native',record:keyRecord,namespace:'umf_key_projection',tableName:'Orders',scope:'new-table-stored-values',mode:'report',columns:[{field:keyId,name:'order_id',nativeType:'int'},{field:keyCode,name:'external_code',nativeType:'nvarchar',nativeSize:32,encoding:{bytesColumn:'code_bytes',lengthColumn:'code_length'}}],keyNames:[{keyId:'stable-id',name:'order_identity'},{keyId:'stable-code',name:'external_identity'}]};
 return {source:c.source,authors:c.authors,request};
}
export function sqlserverKeyProjectionCases(){
 const rows:{name:string;source:Document;authors:CoreKeyDeclaration[];request:KeySqlServerRequest;expected:'projected'|'blocked';expectedEquality?:'unknown'}[]=[];
 for(const primary of [true,false])for(const mode of ['strict','report'] as const){const c=sqlserverKeyAuthors(primary);c.request.mode=mode;rows.push({name:(primary?'primary':'no-primary')+'-'+mode,...c,expected:mode==='report'?'projected':'blocked'});}
 const renamed=sqlserverKeyAuthors(),rename=declareCoreKey(renamed.source,keyRecord,{id:'stable-id',name:'Renamed identity',fields:[keyId]});renamed.source=structuredClone(rename.target);renamed.authors[0]=rename;(renamed.source.modules[0]!.elements[0]!.keys as unknown[]).reverse();renamed.request.keyNames.reverse();rows.push({name:'rename-and-reorder',...renamed,expected:'projected'});
 for(const family of ['boolean','decimal','binary','integer-width','unsigned','string-length','binary-length'] as const){
  const c=sqlserverKeyAuthors(),d=structuredClone(c.authors[0]!.source),e=d.modules[0]!.elements[1]!;
  e.scalarType=family.startsWith('integer')||family==='unsigned'?'integer':family==='string-length'?'string':family==='binary-length'?'binary':family;
  c.request.columns[0]!.nativeType=e.scalarType==='boolean'?'bit':e.scalarType==='binary'?'varbinary':e.scalarType==='string'?'nvarchar':'decimal';
  if(e.scalarType==='binary'||e.scalarType==='string'){c.request.columns[0]!.nativeSize=32;c.request.columns[0]!.encoding={bytesColumn:'id_bytes',lengthColumn:'id_length'};}
  if(family==='decimal')e.facets={precision:5,scale:2};if(family==='integer-width')e.facets={integerWidth:{bits:8,signed:true}};if(family==='unsigned')e.facets={integerWidth:{bits:64,signed:false}};if(family==='string-length'||family==='binary-length')e.facets={length:{max:3,unit:family==='string-length'?'unicode-scalar':'byte'}};
  const a=declareCoreKey(d,keyRecord,{id:'stable-id',name:'Order identity',fields:[keyId],primary:true}),b=declareCoreKey(a.target,keyRecord,{id:'stable-code',name:'External code',fields:[keyCode]});rows.push({name:family,source:b.target,authors:[a,b],request:c.request,expected:'projected'});
 }
 const compound=sqlserverKeyAuthors(),a=declareCoreKey(compound.authors[0]!.source,keyRecord,{id:'stable-id',name:'Compound identity',fields:[keyCode,keyId],primary:true}),b=declareCoreKey(a.target,keyRecord,{id:'stable-code',name:'External code',fields:[keyCode]});rows.push({name:'compound-ordered',source:b.target,authors:[a,b],request:compound.request,expected:'projected'});
 const many=sqlserverKeyAuthors(),extra=declareCoreKey(many.source,keyRecord,{id:'compound',name:'Extra alternate',fields:[keyId,keyCode]});many.request.keyNames.push({keyId:'compound',name:'compound_identity'});rows.push({name:'multiple-alternates',source:extra.target,authors:[...many.authors,extra],request:many.request,expected:'projected'});
 const unknown=sqlserverKeyAuthors();unknown.source=structuredClone(unknown.source);unknown.source.vocabularies.future={version:'1.0.0'};unknown.source.extensions={future:{number:'9007199254740993',opaque:{quoted:'"\\'}}};rows.push({name:'unknown-extension',...unknown,expected:'projected'});
 for(const qualifier of ['key','member','facet'] as const){
  const c=sqlserverKeyAuthors(),d=structuredClone(c.source),record=d.modules[0]!.elements[0]!;
  if(qualifier==='key')(record.keys as any[])[0].future={equality:'uninterpreted'};
  if(qualifier==='member')(record.members as any[])[0].future={equality:'uninterpreted'};
  if(qualifier==='facet')d.modules[0]!.elements[1]!.facets={future:{equality:'uninterpreted'}};
  const a=declareCoreKey(d,keyRecord,{id:'stable-id',name:'Order identity',fields:[keyId]}),b=declareCoreKey(a.target,keyRecord,{id:'stable-code',name:'External code',fields:[keyCode]});
  rows.push({name:'unknown-'+qualifier+'-qualifier',source:b.target,authors:[a,b],request:c.request,expected:'projected',expectedEquality:'unknown'});
 }
 const mismatch=sqlserverKeyAuthors();mismatch.request.columns[0]!.nativeType='nvarchar';rows.push({name:'family-conflict',...mismatch,expected:'blocked'});
 const quoted=sqlserverKeyAuthors();quoted.request.tableName='Order "世界';quoted.request.columns[0]!.name='order " id';quoted.request.keyNames[0]!.name='identity " 世界';rows.push({name:'quoted-identifiers',...quoted,expected:'projected'});
 const bare=sqlserverKeyAuthors();delete bare.request.columns[1]!.encoding;rows.push({name:'missing-encoding',...bare,expected:'blocked'});
 const wide=sqlserverKeyAuthors();wide.request.columns[1]!.nativeSize=900;rows.push({name:'alternate-byte-budget',...wide,expected:'blocked'});
 const primaryWide=sqlserverKeyAuthors();primaryWide.request.columns[1]!.nativeSize=449;
 const primary=declareCoreKey(primaryWide.authors[0]!.source,keyRecord,{id:'stable-code',name:'Code primary',fields:[keyCode],primary:true}),other=declareCoreKey(primary.target,keyRecord,{id:'stable-id',name:'Order identity',fields:[keyId]});
 rows.push({name:'primary-byte-budget',source:other.target,authors:[primary,other],request:primaryWide.request,expected:'blocked'});
 return rows;
}
