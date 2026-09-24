import {tableSpecKeyAuthors,keyRecord,keyId,keyCode} from './key-tablespec-projection-cases';
import {declareCoreKey,type CoreKeyDeclaration} from '../../src/model/keys';
import type {Document} from '../../src/model/types';
import type {KeyAvroRequest} from '../../src/core-ideals/key-avro-projection';
export function avroKeyAuthors(primary=true){
 const c=tableSpecKeyAuthors(primary);
 const request:KeyAvroRequest={id:'avro-key-native',record:keyRecord,namespace:'umf_key_projection',recordName:'Orders',mode:'report',columns:[{field:keyId,name:'order_id',nativeType:'long'},{field:keyCode,name:'external_code',nativeType:'string'}]};
 return {source:c.source,authors:c.authors,request};
}
export function avroKeyProjectionCases(){
 const rows:{name:string;source:Document;authors:CoreKeyDeclaration[];request:KeyAvroRequest;expected:'projected'|'blocked'}[]=[];
 for(const primary of [true,false])for(const mode of ['strict','report'] as const){const c=avroKeyAuthors(primary);c.request.mode=mode;rows.push({name:(primary?'primary':'no-primary')+'-'+mode,...c,expected:mode==='report'?'projected':'blocked'});}
 const renamed=avroKeyAuthors(),rename=declareCoreKey(renamed.source,keyRecord,{id:'stable-id',name:'Renamed identity',fields:[keyId]});renamed.source=structuredClone(rename.target);renamed.authors[0]=rename;(renamed.source.modules[0]!.elements[0]!.keys as unknown[]).reverse();rows.push({name:'rename-and-reorder',...renamed,expected:'projected'});
 for(const family of ['boolean','decimal','binary','integer-width','unsigned','string-length','binary-length'] as const){
  const c=avroKeyAuthors(),d=structuredClone(c.authors[0]!.source),e=d.modules[0]!.elements[1]!;
  e.scalarType=family.startsWith('integer')||family==='unsigned'?'integer':family==='string-length'?'string':family==='binary-length'?'binary':family;
  c.request.columns[0]!.nativeType=e.scalarType==='boolean'?'boolean':e.scalarType==='binary'?'bytes':e.scalarType==='string'?'string':e.scalarType==='decimal'?'decimal-bytes':'long';
  if(family==='decimal')e.facets={precision:5,scale:2};if(family==='integer-width')e.facets={integerWidth:{bits:8,signed:true}};if(family==='unsigned')e.facets={integerWidth:{bits:64,signed:false}};if(family==='string-length'||family==='binary-length')e.facets={length:{max:3,unit:family==='string-length'?'unicode-scalar':'byte'}};
  const a=declareCoreKey(d,keyRecord,{id:'stable-id',name:'Order identity',fields:[keyId],primary:true}),b=declareCoreKey(a.target,keyRecord,{id:'stable-code',name:'External code',fields:[keyCode]});rows.push({name:family,source:b.target,authors:[a,b],request:c.request,expected:'projected'});
 }
 const compound=avroKeyAuthors(),a=declareCoreKey(compound.authors[0]!.source,keyRecord,{id:'stable-id',name:'Compound identity',fields:[keyCode,keyId],primary:true}),b=declareCoreKey(a.target,keyRecord,{id:'stable-code',name:'External code',fields:[keyCode]});rows.push({name:'compound-ordered',source:b.target,authors:[a,b],request:compound.request,expected:'projected'});
 const many=avroKeyAuthors(),extra=declareCoreKey(many.source,keyRecord,{id:'compound',name:'Extra alternate',fields:[keyId,keyCode]});rows.push({name:'multiple-alternates',source:extra.target,authors:[...many.authors,extra],request:many.request,expected:'projected'});
 const unknown=avroKeyAuthors();unknown.source=structuredClone(unknown.source);unknown.source.vocabularies.future={version:'1.0.0'};unknown.source.extensions={future:{number:'9007199254740993',opaque:{quoted:'"\\'}}};rows.push({name:'unknown-extension',...unknown,expected:'projected'});
 for(const qualifier of ['key','member','facet'] as const){
  const c=avroKeyAuthors(),d=structuredClone(c.source),record=d.modules[0]!.elements[0]!;
  if(qualifier==='key')(record.keys as any[])[0].future={equality:'uninterpreted'};
  if(qualifier==='member')(record.members as any[])[0].future={equality:'uninterpreted'};
  if(qualifier==='facet')d.modules[0]!.elements[1]!.facets={future:{equality:'uninterpreted'}};
  const a=declareCoreKey(d,keyRecord,{id:'stable-id',name:'Order identity',fields:[keyId]}),b=declareCoreKey(a.target,keyRecord,{id:'stable-code',name:'External code',fields:[keyCode]});
  rows.push({name:'unknown-'+qualifier+'-qualifier',source:b.target,authors:[a,b],request:c.request,expected:'projected'});
 }
 const mismatch=avroKeyAuthors();mismatch.request.columns[0]!.nativeType='string';rows.push({name:'family-conflict',...mismatch,expected:'blocked'});
 const quoted=avroKeyAuthors();quoted.request.recordName='Order "世界';quoted.request.columns[0]!.name='order " id';rows.push({name:'quoted-identifiers',...quoted,expected:'blocked'});
 return rows;
}
