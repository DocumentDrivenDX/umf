// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../model/errors';
import type {SmithyJsonSchemaBackend} from '../../projections/smithy-json-schema';
import {createSmithyJavaScriptBackend} from './host-backends';

/** Bind the explicit pinned JSON Schema converter to the already admitted Smithy host backend. */
export function createSmithyJavaScriptJsonSchemaBackend(module:{assemble(sourcesJson:string):string;jsonSchema(modelJson:string,rootShape:string):string;jsonSchemaWithRootDefinition?(modelJson:string,rootShape:string):string;jsonSchemaForService?(modelJson:string,rootShape:string,serviceContext:string,addRootDefinition:boolean):string}):SmithyJsonSchemaBackend{
 if(typeof module?.jsonSchema!=='function')throw new UmfError('SMITHY_RUNTIME','Expected the installed Smithy JSON Schema converter');
 return {...createSmithyJavaScriptBackend(module),converterIdentity:'smithy-jsonschema@1.73.0',jsonSchema:(model,root)=>module.jsonSchema(model,root),...(module.jsonSchemaForService?{jsonSchemaForService:(model:string,root:string,service:string,adapted:boolean)=>module.jsonSchemaForService!(model,root,service,adapted)}:{}),...(module.jsonSchemaWithRootDefinition?{jsonSchemaWithRootDefinition:(model:string,root:string)=>module.jsonSchemaWithRootDefinition!(model,root)}:{})};
}
