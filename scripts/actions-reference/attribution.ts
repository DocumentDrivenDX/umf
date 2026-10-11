import type {ReferenceHandlerDeployment} from './handlers';
/** Telemetry only: unknown retained deployment metadata stays in retention, never in the journal. */
export function referenceObservedDeployment(input:unknown):ReferenceHandlerDeployment|null{
 if(!input||typeof input!=='object'||Array.isArray(input))return null;const value=input as Record<string,unknown>;
 if(Object.keys(value).length!==3||Object.keys(value).some(key=>!['id','version','build'].includes(key))||[value.id,value.version,value.build].some(part=>typeof part!=='string'||!part||part.length>256))return null;
 return {id:value.id as string,version:value.version as string,build:value.build as string};
}
