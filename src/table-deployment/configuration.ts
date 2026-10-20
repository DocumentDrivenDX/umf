// SPDX-License-Identifier: MIT OR Apache-2.0
import {copyJson} from '../model/json';
import {UmfError} from '../model/types';
import type {TableDeploymentConfiguration} from './types';
export function deploymentError(message:string,path=''):never{throw new UmfError('TABLE_DEPLOYMENT_UNSUPPORTED',message,path);}
export function nativeIdentifier(input:unknown,path:string):string{
 if(typeof input!=='string'||!input.length||input.includes('\0')||new TextEncoder().encode(input).length>63)deploymentError('Expected a nonempty PostgreSQL identifier of at most63 UTF-8 bytes',path);
 // Hashing also rejects invalid Unicode; a replacement-character identifier is never guessed.
 return input;
}
export function deploymentConfiguration(input:unknown):TableDeploymentConfiguration{
 const value=copyJson(input);
 if(!value||typeof value!=='object'||Array.isArray(value))deploymentError('Expected exact deployment configuration','/configuration');
 const required=['module','schema','ownerRole','personRole','batchRole','groupRoles'];
 if(Object.keys(value).length!==required.length||required.some(k=>!Object.hasOwn(value,k)))deploymentError('Unknown or missing deployment configuration member','/configuration');
 if(typeof value.module!=='string'||!value.module.length)deploymentError('Expected exact module identity','/configuration/module');
 for(const key of required.slice(1,-1))nativeIdentifier(value[key],'/configuration/'+key);
 if(typeof value.groupRoles!=='object'||!value.groupRoles||Array.isArray(value.groupRoles))deploymentError('Expected explicit group-role alias map','/configuration/groupRoles');
 if(Object.keys(value.groupRoles).length>256)deploymentError('Group-role alias inventory exceeds256','/configuration/groupRoles');
 for(const [alias,role] of Object.entries(value.groupRoles)){if(!alias.length)deploymentError('Empty group alias','/configuration/groupRoles');nativeIdentifier(role,'/configuration/groupRoles/'+alias);}
 const configuration=value as unknown as TableDeploymentConfiguration;
 if(configuration.schema==='public'||/^pg_/i.test(configuration.schema)||configuration.schema==='information_schema')deploymentError('A dedicated plugin schema is required','/configuration/schema');
 const principals=[configuration.ownerRole,configuration.personRole,configuration.batchRole,...Object.values(configuration.groupRoles)];
 if(new Set(principals).size!==principals.length)deploymentError('Install, person, batch and configured group roles must be distinct','/configuration');
 if(principals.some(r=>r==='public'||/^pg_/i.test(r)))deploymentError('System roles are not plugin principals','/configuration');
 return configuration;
}
