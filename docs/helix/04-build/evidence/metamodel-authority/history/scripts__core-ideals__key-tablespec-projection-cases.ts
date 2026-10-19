import {declareCoreKey,declareCoreRecordMembers,type CoreKeyDeclaration} from '../../src/model/keys';
import {copyJson} from '../../src/model/json';
import type {Document} from '../../src/model/types';
import type {KeyTableSpecRequest} from '../../src/core-ideals/key-tablespec-projection';
export const keyRecord={module:'m',element:'record'},keyId={module:'m',element:'id'},keyCode={module:'m',element:'code'};
export function tableSpecKeyAuthors(primary=true){
 const doc:Document={umf:'0.6.0',id:'author',vocabularies:{},modules:[{id:'m',namespace:'sales',elements:[{id:'record',kind:'record',extensions:{}},{id:'id',name:'id',kind:'field',scalarType:'integer',nullability:'required',cardinality:'one',extensions:{}},{id:'code',name:'code',kind:'field',scalarType:'string',nullability:'required',cardinality:'one',extensions:{}}]}]};
 const members=declareCoreRecordMembers(doc,keyRecord,[keyId,keyCode]),first=declareCoreKey(members.target,keyRecord,{id:'stable-id',name:'Order identity',fields:[keyId],...(primary?{primary:true}:{})}),second=declareCoreKey(first.target,keyRecord,{id:'stable-code',name:'External code',fields:[keyCode]});
 const request:KeyTableSpecRequest={id:'native',record:keyRecord,tableName:'Orders',mode:'report',columns:[{field:keyId,name:'order_id',nativeType:'INTEGER'},{field:keyCode,name:'external_code',nativeType:'TEXT'}]};
 return {source:second.target,authors:[first,second],request};
}
export function tableSpecKeyProjectionCases(){
 const rows:{name:string;source:Document;authors:CoreKeyDeclaration[];request:KeyTableSpecRequest;expected:'projected'|'blocked'}[]=[];
 for(const primary of [true,false])for(const mode of ['strict','report'] as const){const c=tableSpecKeyAuthors(primary);c.request.mode=mode;rows.push({name:(primary?'primary':'no-primary')+'-'+mode,...c,expected:mode==='report'?'projected':'blocked'});}
 const renamed=tableSpecKeyAuthors(),rename=declareCoreKey(renamed.source,keyRecord,{id:'stable-id',name:'Renamed identity',fields:[keyId]});renamed.source=rename.target;renamed.authors[0]=rename;renamed.source=copyJson(renamed.source) as unknown as Document;(renamed.source.modules[0]!.elements[0]!.keys as unknown[]).reverse();rows.push({name:'rename-and-reorder',...renamed,expected:'projected'});
 const qualified=tableSpecKeyAuthors(),q=copyJson(qualified.source) as unknown as Document;(q.modules[0]!.elements[0]!.keys as any[])[0].future={opaque:'retained'};q.modules[0]!.elements[1]!.future={opaque:'field'};
 const a=declareCoreKey(q,keyRecord,{id:'stable-id',name:'Order identity',fields:[keyId]}),b=declareCoreKey(a.target,keyRecord,{id:'stable-code',name:'External code',fields:[keyCode]});rows.push({name:'unknown-key-field-content',source:b.target,authors:[a,b],request:qualified.request,expected:'projected'});
 for(const [family,nativeType] of [['boolean','BOOLEAN'],['decimal','DECIMAL'],['binary','TEXT']] as const){
  const c=tableSpecKeyAuthors(),d=copyJson(c.authors[0]!.source) as unknown as Document,e=d.modules[0]!.elements[1]!;e.scalarType=family;if(family==='decimal')e.facets={precision:8,scale:2};
  const first=declareCoreKey(d,keyRecord,{id:'stable-id',name:'Order identity',fields:[keyId],primary:true}),second=declareCoreKey(first.target,keyRecord,{id:'stable-code',name:'External code',fields:[keyCode]});c.request.columns[0]!.nativeType=nativeType;rows.push({name:'family-'+family,source:second.target,authors:[first,second],request:c.request,expected:family==='binary'?'blocked':'projected'});
 }
 const compound=tableSpecKeyAuthors(),d=copyJson(compound.authors[0]!.source) as unknown as Document,first=declareCoreKey(d,keyRecord,{id:'stable-id',name:'Compound identity',fields:[keyCode,keyId],primary:true}),second=declareCoreKey(first.target,keyRecord,{id:'stable-code',name:'External code',fields:[keyCode]});rows.push({name:'compound-ordered',source:second.target,authors:[first,second],request:compound.request,expected:'projected'});
 for(const [name,value,accepted] of [['max-length','A'.repeat(128),true],['over-length','A'.repeat(129),false],['unicode','注文',false],['leading-digit','1Orders',false],['trailing-newline','Orders\n',false],['quoted','Order\"name',false],['underscore','_Orders',false],['valid-underscore','Order_1',true]] as const){
  for(const position of ['table','column'] as const){const c=tableSpecKeyAuthors();if(position==='table')c.request.tableName=value;else c.request.columns[0]!.name=value;rows.push({name:'native-name-'+position+'-'+name,...c,expected:accepted?'projected':'blocked'});}
 }
 for(const mode of ['report','strict'] as const){const c=tableSpecKeyAuthors(),third=declareCoreKey(c.source,keyRecord,{id:'stable-composite',name:'Composite alternate',fields:[keyId,keyCode]});c.request.mode=mode;rows.push({name:'multiple-alternates-'+mode,source:third.target,authors:[...c.authors,third],request:c.request,expected:mode==='report'?'projected':'blocked'});}
 return rows;
}
