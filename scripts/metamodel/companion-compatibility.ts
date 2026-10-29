// SPDX-License-Identifier: MIT OR Apache-2.0
import {createHash} from 'node:crypto';
import {structuralSource} from './structural';

const schemaPaths=['spec/core/schema.json','spec/core/semantic-type-reference.schema.json','spec/core/extension-package.schema.json'] as const;
const validatorPath='src/generated/core-validators.ts';
const provenance=/^Generated from spec\/metamodel\/umf\.yaml; model [0-9a-f]{64}; compiler [0-9a-f]{64}$/;
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');

/** Reuse the byte-pinned accounted companion only for unchanged schema/code semantics. */
export function verifyCompanionCompatibility(archived:Record<string,string>,current:Record<string,string>){
 const oldSchemas=schemaPaths.map(path=>JSON.parse(archived[path]!));
 const newSchemas=schemaPaths.map(path=>JSON.parse(current[path]!));
 const inputs:Record<string,{sha256:string;archivedSha256:string}>={};
 for(let i=0;i<schemaPaths.length;i++){
  const path=schemaPaths[i]!,old=oldSchemas[i],next=newSchemas[i];
  if(!provenance.test(old.$comment)||!provenance.test(next.$comment))throw Error('METAMODEL_COMPANION_PROVENANCE '+path);
  const restored={...next,$comment:old.$comment};
  // Keep property order and formatting exact; replace only the root provenance value.
  if(JSON.stringify(restored,null,2)+'\n'!==archived[path])throw Error('METAMODEL_COMPANION_SEMANTIC_DRIFT '+path);
  inputs[path]={sha256:digest(current[path]!),archivedSha256:digest(archived[path]!)};
 }
 // Reproduce the archived validator with today's backend. Any code, dependency,
 // or schema change other than the verified root provenance values fails closed.
 if(structuralSource(oldSchemas)!==archived[validatorPath])throw Error('METAMODEL_COMPANION_ARCHIVED_BACKEND_DRIFT');
 if(structuralSource(newSchemas)!==current[validatorPath])throw Error('METAMODEL_COMPANION_CURRENT_BACKEND_DRIFT');
 inputs[validatorPath]={sha256:digest(current[validatorPath]!),archivedSha256:digest(archived[validatorPath]!)};
 return {profile:'umf.metamodel.accounted-companion-provenance-compatibility/1',scope:'root-schema-provenance-only',inputs};
}
