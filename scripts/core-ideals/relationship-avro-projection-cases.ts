import {relationshipCandidate} from '../core-relationship-cases';
import {declareCoreRelationship} from '../../src/model/relationships';
import {projectRelationshipToAvro,type RelationshipAvroRequest} from '../../src/core-ideals/relationship-avro-projection';
export function relationshipAvroCase(name='many-to-one'){
 const logical=relationshipCandidate(),r=logical.modules[0].relationships[0];
 if(name==='one-to-one')r.sourceMultiplicity={min:0,max:1};
 if(name==='many-to-many')r.targetMultiplicity={min:0,max:'*'};
 if(name==='bounded-required')r.targetMultiplicity={min:1,max:3};
 if(name==='owned')r.targetLifecycle='owned';
 if(name==='undirected'){r.directed=false;delete r.inverse;}
 if(name==='heterogeneous')r.source.push({module:'m',element:'Company'});
 if(name==='heterogeneous-target')r.target.push({module:'m',element:'Company',key:'identity'});
 if(name==='association')r.associationRecord={module:'m',element:'Enrollment'};
 if(name==='self')r.source=[{module:'m',element:'Customer'}];
 if(name==='alternate')r.target[0].key='account-number';
 if(name==='unknown')r['a/b~c']={uninterpreted:true};
 const record=logical.modules[0].elements.find((e:any)=>e.id==='Customer'),key=record.keys.find((k:any)=>k.id===r.target[0].key),field=logical.modules[0].elements.find((e:any)=>e.id===key.fields[0].element);
 if(name==='composite')key.fields.push({module:'m',element:'Customer.code'});
 if(name==='facet')field.facets={integerWidth:{bits:16,signed:true}};
 
 logical.vocabularies.future={version:'1.0.0'};logical.extensions={future:{nativeText:'opaque 9007199254740993 1.2300\n'}};
 const author=declareCoreRelationship(logical,{module:'m'},Object.fromEntries(Object.entries(r).filter(([k])=>k!=='a/b~c')) as any),source=author.target;
 const request:RelationshipAvroRequest={id:'avro-'+name,profile:'target-key-record',relationship:{module:'m',id:r.id},mode:'report',recordName:'Source',namespace:'example',fieldName:'reference',keyRecordName:'TargetKey',shape:name==='many-to-many'||name==='bounded-required'?'array':name==='nullable'?'nullable-one':'one',components:key.fields.map((f:any,i:number)=>({targetField:f,name:'key_'+i,type:logical.modules[0].elements.find((e:any)=>e.id===f.element).scalarType==='string'?'string':'long'}))};
 if(name==='wrong-key-field')request.components[0]!.targetField={module:'m',element:'Order.id'};
 if(name==='type-conflict')request.components[0]!.type='string';
 if(name==='invalid-name')request.recordName='bad-name';

 return {name,source,author,request};
}
export function relationshipAvroProjectionCases(){
 const blocked=new Set(['heterogeneous','heterogeneous-target','association','wrong-key-field','type-conflict','invalid-name']);
 return ['many-to-one','one-to-one','many-to-many','bounded-required','owned','undirected','heterogeneous','heterogeneous-target','association','self','alternate','composite','unknown','nullable','facet','wrong-key-field','type-conflict','invalid-name'].flatMap(name=>(['strict','report'] as const).map(mode=>{const c=relationshipAvroCase(name);c.request.mode=mode;return {...c,name:name+'-'+mode,expected:mode==='strict'||blocked.has(name)?'blocked' as const:'projected' as const};}));
}
if(import.meta.main){
 const cases=relationshipAvroProjectionCases().map(c=>{const r=projectRelationshipToAvro(c.source,c.author,c.request);if(r.status!==c.expected)throw Error(c.name);return {name:c.name,status:r.status,...(r.nativeArchive?{schemaText:r.nativeArchive.schema}:{})};});
 await Bun.write('fixtures/avro/relationship-projection-cases.json',JSON.stringify({scope:'Generated authored relationship projections; strict/refusal outcomes retained, no native equivalence',cases},null,2)+'\n');
}
