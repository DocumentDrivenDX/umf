import {relationshipCandidate} from '../core-relationship-cases';
import {declareCoreRelationship} from '../../src/model/relationships';
import type {Document} from '../../src/model/types';
import type {RelationshipSqlServerRequest} from '../../src/core-ideals/relationship-sqlserver-projection';
export function relationshipSqlServerCase(name='many-to-one'){
 const logical=relationshipCandidate(),rel=logical.modules[0].relationships[0];
 if(name.includes('optional'))rel.targetMultiplicity.min=0;
 if(name.includes('one-to-one'))rel.sourceMultiplicity.max=1;
 if(name.includes('junction'))rel.targetMultiplicity={min:0,max:'*'};
 if(name==='junction-one')rel.sourceMultiplicity.max=1;
 if(name==='junction-bounded'){rel.targetMultiplicity={min:2,max:3};rel.sourceMultiplicity={min:1,max:5};}
 if(name==='self')rel.target=[{module:'m',element:'Order',key:'identity'}];
 if(name==='owned')rel.targetLifecycle='owned';
 if(name==='undirected'){rel.directed=false;rel.targetLifecycle='unspecified';}
 if(name==='heterogeneous')rel.source.push({module:'m',element:'Company'});
 if(name==='association'){rel.associationRecord={module:'m',element:'Enrollment'};rel.targetMultiplicity.max='*';}
 const target=logical.modules[0].elements.find((x:any)=>x.id===rel.target[0].element);
 if(name==='alternate'){rel.target[0].key='account-number';logical.modules[0].elements.find((x:any)=>x.id==='Customer.code').scalarType='integer';}
 if(name.includes('composite')){logical.modules[0].elements.find((x:any)=>x.id==='Customer.code').scalarType='integer';target.keys[0].fields.push({module:'m',element:'Customer.code'});}
 if(name==='string-domain')logical.modules[0].elements.find((x:any)=>x.id==='Customer.id').scalarType='string';
 if(name==='boolean')logical.modules[0].elements.find((x:any)=>x.id==='Customer.id').scalarType='boolean';
 const author=declareCoreRelationship(logical,{module:'m'},rel),source=author.target;
 const sourceKey={keyId:'identity',constraintName:'SourceKey',columns:[{field:{module:'m',element:'Order.id'},name:'source_id',nativeType:'bigint' as const}]};
 const targetKey=name==='self'?structuredClone(sourceKey):{keyId:rel.target[0].key,constraintName:'TargetKey',columns:target.keys.find((k:any)=>k.id===rel.target[0].key).fields.map((f:any,i:number)=>({field:f,name:'target_'+i,nativeType:name==='boolean'?'bit' as const:name==='tinyint'?'tinyint' as const:name==='smallint'?'smallint' as const:name==='int'?'int' as const:'bigint' as const}))};
 const request:RelationshipSqlServerRequest={id:'sqlserver-'+name,relationship:{module:'m',id:rel.id},profile:'new-key-tables',mode:'report',namespace:'dbo',sourceKey,targetKey,referenceColumns:targetKey.columns.map((_:any,i:number)=>'ref_'+i),constraintName:'RelationFk',deleteAction:name==='cascade'?'CASCADE':name==='set-null-optional'?'SET_NULL':'NO_ACTION',updateAction:'NO_ACTION',...(name.includes('junction')||name==='association'?{junction:{tableName:'Links',sourceColumns:['source_ref'],sourceConstraintName:'SourceFk',pairConstraintName:'PairKey'}}:{})};
 const binding:Document={umf:'0.7.0',id:'binding-'+name,vocabularies:{'umf.binding':{version:'0.2.0'},future:{version:'1.0.0'}},modules:[],extensions:{future:{opaque:['retained',1]},'umf.binding':{profile:'umf-binding-2',logical:{documentId:source.id,coreVersion:source.umf},target:{system:'sqlserver',version:'16.0.4295.3',subset:'new-key-tables'},elements:[{module:'m',element:'Order',table:'Source'},...(name==='self'?[]:[{module:'m',element:'Customer',table:'Target'}])],fields:[...sourceKey.columns,...(name==='self'?[]:targetKey.columns)].map(c=>({...c.field,column:c.name,storage:'column'})),relationships:[{module:'m',id:rel.id,storage:request.junction?'junction':'foreign_key'}],indexes:[],future:{opaque:true}}}};
 if(name==='wrong-key')request.targetKey.keyId='wrong';
 if(name==='wrong-column')request.referenceColumns.push('extra');
 if(name==='unknown-binding')((binding.extensions!['umf.binding'] as any).relationships[0]).future={unknown:true};
 return {name,source,author,binding,request};
}
export function relationshipSqlServerCases(){const blocked=new Set(['heterogeneous','association','string-domain','wrong-key','wrong-column']);return ['boolean','tinyint','smallint','int','many-to-one','optional','one-to-one','optional-one-to-one','composite','optional-composite','self','alternate','junction','junction-one','junction-bounded','owned','undirected','cascade','set-null-optional','unknown-binding','heterogeneous','association','string-domain','wrong-key','wrong-column'].flatMap(name=>(['strict','report'] as const).map(mode=>{const c=relationshipSqlServerCase(name);c.request.mode=mode;return {...c,name:name+'-'+mode,expected:mode==='strict'||blocked.has(name)?'blocked' as const:'projected' as const};}));}
