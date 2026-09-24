import {relationshipCandidate} from '../core-relationship-cases';
import {declareCoreRelationship} from '../../src/model/relationships';
import {importTableSpec,importTableSpecBundle} from '../../src/adapters/tablespec';
import type {Document} from '../../src/model/types';
import type {RelationshipTableSpecRequest} from '../../src/core-ideals/relationship-tablespec-projection';
export function relationshipTableSpecCase(name='many-to-one'){
 const logical=relationshipCandidate(),r=logical.modules[0].relationships[0];
 if(name==='one-to-one')r.sourceMultiplicity={min:0,max:1};
 if(name==='many-to-many')r.targetMultiplicity={min:0,max:'*'};
 if(name==='bounded-required')r.targetMultiplicity={min:1,max:3};
 if(name==='owned')r.targetLifecycle='owned';
 if(name==='undirected'){r.directed=false;delete r.inverse;}
 if(name==='heterogeneous')r.source.push({module:'m',element:'Company'});
 if(name==='association')r.associationRecord={module:'m',element:'Enrollment'};
 if(name==='self')r.source=[{module:'m',element:'Customer'}];
 if(name==='alternate')r.target[0].key='account-number';
 if(name==='unknown')r.future={uninterpreted:true};
 const targetRecord=logical.modules[0].elements.find((e:any)=>e.id==='Customer'),key=targetRecord.keys.find((k:any)=>k.id===r.target[0].key);
 if(name==='composite')key.fields.push({module:'m',element:'Customer.code'});
 const requestFields=Object.fromEntries(Object.entries(r).filter(([k])=>k!=='future'));
 const author=declareCoreRelationship(logical,{module:'m'},requestFields as any),source=author.target as unknown as Document;
 const targetColumns=key.fields.map((f:any,i:number)=>({name:'target_'+i,data_type:logical.modules[0].elements.find((e:any)=>e.id===f.element).scalarType==='string'?'TEXT':'INTEGER'}));
 const sourceColumns=targetColumns.map((c:any,i:number)=>({...c,name:'ref_'+i}));
 const base={version:'1.0',table_name:'Orders',columns:[{name:'id',data_type:'INTEGER'},...sourceColumns]};
 let nativeSource=importTableSpec(JSON.stringify(base),{id:'source-table',format:'json'}),nativeTarget=importTableSpec(JSON.stringify({version:'1.0',table_name:'Customers',columns:targetColumns}),{id:'target-table',format:'json'});
 const request:RelationshipTableSpecRequest={profile:'outgoing-metadata',relationship:{module:'m',id:r.id},mode:'report',columns:key.fields.map((f:any,i:number)=>({sourceColumn:'ref_'+i,targetField:f,targetColumn:'target_'+i}))};
 if(name==='self'){nativeSource=importTableSpec(JSON.stringify({...base,columns:[...base.columns,...targetColumns]}),{id:'self-table',format:'json'});nativeTarget=structuredClone(nativeSource);}
 if(name==='missing-column')request.columns[0]!.sourceColumn='missing';
 if(name==='wrong-key-field')request.columns[0]!.targetField={module:'m',element:'Order.id'};
 if(name==='type-conflict')nativeTarget=importTableSpec(JSON.stringify({version:'1.0',table_name:'Customers',columns:[{name:'target_0',data_type:'TEXT'}]}),{id:'target-table',format:'json'});
 if(name==='existing-conflict'||name==='existing-unrelated')nativeSource=importTableSpec(JSON.stringify({...base,relationships:{outgoing:[{target_table:name==='existing-conflict'?'Customers':'Elsewhere',source_column:'id',target_column:'id',type:'reference',confidence:0.5,future:{opaque:true}}]}}),{id:'source-table',format:'json'});
 if(name==='invalid-native-primary')nativeSource=importTableSpec(JSON.stringify({...base,primary_key:['missing']}),{id:'source-table',format:'json'});
 if(name==='invalid-native-context')nativeSource=importTableSpec(JSON.stringify({...base,context_column:'missing'}),{id:'source-table',format:'json'});
 if(name==='invalid-native-dimension')nativeSource=importTableSpec(JSON.stringify({...base,columns:base.columns.map(c=>({...c,dimension:3}))}),{id:'source-table',format:'json'});
 if(name.includes('jdbc-')){
  const jdbc={kind:'jdbc',url:'jdbc:example:local',...(name==='valid-jdbc-table'?{dbtable:'orders'}:name==='valid-jdbc-query'?{query:'select id, ref_0 from orders'}:name==='invalid-native-jdbc-both'?{dbtable:'orders',query:'select 1'}:{})};
  nativeSource=importTableSpec(JSON.stringify({...base,source:jdbc}),{id:'source-table',format:'json'});
 }
 if(name.includes('json-')){
  let projection=base.columns.map(c=>({column:c.name,path:c.name}));
  if(name==='invalid-native-json-coverage')projection=projection.slice(1);
  if(name==='invalid-native-json-duplicate')projection.push(projection[0]!);
  if(name==='invalid-native-json-path')projection[0]!.path='\u0085\u001c';
  nativeSource=importTableSpec(JSON.stringify({...base,source:{kind:'json',projection}}),{id:'source-table',format:'json'});
 }
 if(name.endsWith('derivation'))nativeSource=importTableSpec(JSON.stringify({...base,columns:base.columns.map(c=>({...c,derivation:{candidates:[{table:'upstream',priority:1,...(name==='valid-derivation'?{expression:'literal_metadata_only'}:{})}]}}))}),{id:'source-table',format:'json'});
 if(name==='split')nativeSource=importTableSpecBundle({'table.yaml':'version: "1.0"\ntable_name: Orders\nrelationships: {future: {n: 9007199254740993, decimal: 1.2300}}\n','columns/id.yaml':'column: {name: id, data_type: INTEGER}\n','columns/ref.yaml':'column: {name: ref_0, data_type: INTEGER}\n','notes.txt':'untouched\n'},{id:'source-table'});
 return {name,source,author,nativeSource,nativeTarget,request};
}
export function relationshipTableSpecProjectionCases(){
 const blocked=new Set(['heterogeneous','association','missing-column','wrong-key-field','type-conflict','existing-conflict','invalid-native-primary','invalid-native-context','invalid-native-dimension','invalid-native-jdbc-both','invalid-native-jdbc-neither','invalid-native-json-coverage','invalid-native-json-duplicate','invalid-native-json-path','invalid-native-derivation']);
 return ['many-to-one','one-to-one','many-to-many','bounded-required','owned','undirected','heterogeneous','association','self','alternate','composite','unknown','missing-column','wrong-key-field','type-conflict','existing-conflict','existing-unrelated','split','invalid-native-primary','invalid-native-context','invalid-native-dimension','invalid-native-jdbc-both','invalid-native-jdbc-neither','valid-jdbc-table','valid-jdbc-query','invalid-native-json-coverage','invalid-native-json-duplicate','invalid-native-json-path','valid-json-source','invalid-native-derivation','valid-derivation'].flatMap(name=>(['strict','report'] as const).map(mode=>{const c=relationshipTableSpecCase(name);c.request.mode=mode;return {...c,name:name+'-'+mode,expected:mode==='strict'||blocked.has(name)?'blocked' as const:'projected' as const};}));
}
