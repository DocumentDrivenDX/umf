import {copyJson} from '../../model/json';
import {UmfError,type Document} from '../../model/types';
import {getBinding,inspectBinding,projectBindingIndexes,type BindingPayload} from '../../extensions/binding';
import {exportDeltaLog,inspectDeltaLog} from '../../adapters/delta/log';

export interface DeltaBindingResidual {path:string;reason:string;choice:unknown}
export interface DeltaBindingProjection {
  status:'blocked'|'reported'|'projected';
  logical:Document;binding:Document;nativeArchive:Document;
  target:BindingPayload['target'];residuals:DeltaBindingResidual[];
  /** A domainMetadata action proposal, not a transaction commit or clustered data files. */
  candidate?:string;
}

/** Project an authored liquid-clustering choice against a pinned, existing Delta table log. */
export function projectBindingToDelta(logical:Document,binding:Document,nativeArchive:Document,lossPolicy:'strict'|'report'):DeltaBindingProjection{
  if(inspectBinding(binding,logical).diagnostics.some(d=>d.code==='BINDING_UNKNOWN'))throw new UmfError('BINDING_INCOMPLETE','Unknown binding content may affect Delta projection');
  const payload=getBinding(binding,logical);
  if(payload.target.system!=='delta'||!/^3\.(?:2|[3-9])(?:\.|$)/.test(payload.target.version))throw new UmfError('BINDING_TARGET','Expected pinned Delta 3.2+ profile');
  const native=inspectDeltaLog(nativeArchive);
  if(!native.parsedAll)throw new UmfError('DELTA_BINDING_SOURCE','Native log has invalid actions');
  const actions=exportDeltaLog(nativeArchive).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line) as Record<string,any>);
  const protocol=[...actions].reverse().find(a=>a.protocol)?.protocol;
  const metadata=[...actions].reverse().find(a=>a.metaData)?.metaData;
  if(!protocol||!metadata||!Array.isArray(protocol.writerFeatures)||!['clustering','domainMetadata'].every(f=>protocol.writerFeatures.includes(f)))throw new UmfError('DELTA_BINDING_FEATURE','Native table must declare clustering and domainMetadata writer features');
  if(protocol.minWriterVersion!==7)throw new UmfError('DELTA_BINDING_FEATURE','Expected Delta writer version 7');
  let columns:Set<string>;
  try{const schema=JSON.parse(metadata.schemaString);if(schema.type!=='struct'||!Array.isArray(schema.fields))throw Error();columns=new Set(schema.fields.map((f:{name:string})=>f.name));}
  catch{throw new UmfError('DELTA_BINDING_SCHEMA','Native table has no known struct schema');}
  const residuals:DeltaBindingResidual[]=[];
  const add=(path:string,reason:string,choice:unknown)=>residuals.push({path,reason,choice:copyJson(choice)});
  if(metadata.partitionColumns?.length)add('/native/metaData/partitionColumns','Liquid clustering cannot coexist with native partitioning',metadata.partitionColumns);
  payload.elements.forEach((row,i)=>{
    if(row.partition!==undefined&&row.partition!==null)add(`/extensions/umf.binding/elements/${i}/partition`,'Delta liquid clustering does not support partitioned layout',row.partition);
    if(row.table!==undefined)add(`/extensions/umf.binding/elements/${i}/table`,'Table name is catalog context outside Delta log metadata',row.table);
  });
  payload.fields.forEach((row,i)=>{
    if(row.storage==='embedded')add(`/extensions/umf.binding/fields/${i}`,'Struct or variant embedded path has no verified carrier in this profile',row);
    else if(!columns.has(row.column!))add(`/extensions/umf.binding/fields/${i}`,'Declared storage column is absent from native Delta schema',row);
  });
  payload.relationships.forEach((row,i)=>add(`/extensions/umf.binding/relationships/${i}`,'Delta table log does not enforce relationship storage',row));
  const indexReport=projectBindingIndexes(binding,logical,'report');
  indexReport.outcomes.forEach((outcome,i)=>{if(outcome.outcome!=='exact')add(outcome.path,outcome.reason??'Unsupported index kind',payload.indexes[i]);});
  const clustering=payload.indexes.map((item,i)=>({item,i})).filter(x=>x.item.kind==='clustering'&&indexReport.outcomes[x.i]?.outcome==='exact');
  if(clustering.length>1)for(const {item,i} of clustering)add(`/extensions/umf.binding/indexes/${i}`,'One Delta table has one clustering column set',item);
  let candidate:string|undefined;
  if(clustering.length===1){
    const {item,i}=clustering[0]!;
    const physicalNames:string[][]=[];
    for(const target of item.on){
      if(!('field'in target))continue;
      const field=payload.fields.find(row=>row.module===target.field.module&&row.element===target.field.element&&row.field===target.field.field);
      if(!field?.column||!columns.has(field.column))add(`/extensions/umf.binding/indexes/${i}`,'Clustering column is absent from native Delta schema',item);
      else physicalNames.push([field.column]);
    }
    if(physicalNames.length===item.on.length){
      const configuration=JSON.stringify({clusteringColumns:physicalNames.map(physicalName=>({physicalName}))});
      candidate=JSON.stringify({domainMetadata:{domain:'delta.clustering',configuration,removed:false}})+'\n';
    }
  }
  const status=residuals.length?(lossPolicy==='strict'?'blocked':'reported'):'projected';
  return {status,logical:copyJson(logical) as unknown as Document,binding:copyJson(binding) as unknown as Document,nativeArchive:copyJson(nativeArchive) as unknown as Document,target:copyJson(payload.target) as BindingPayload['target'],residuals,...(status!=='blocked'&&candidate?{candidate}:{})};
}
