import {copyJson} from '../../model/json';
import {UmfError,type Document,type JsonObject} from '../../model/types';
import {exportTypeSpecSources} from './index';
import {compileTypeSpecProgram,typeSpecCompilerReport} from './compiler';
/** Native emitter output is evidence for a projection, not a lossless type-model conversion. */
export async function emitTypeSpecJsonSchema(document:Document,input:{options:JsonObject}){
 const policy=copyJson(input) as unknown as typeof input;
 if(Object.keys(policy).some(k=>k!=='options')||!policy.options||Array.isArray(policy.options)||typeof policy.options!=='object'||!['string','number'].includes(policy.options['int64-strategy'] as string))throw new UmfError('TYPESPEC_EMISSION_POLICY','Emitter options must explicitly select int64-strategy string or number');
 if(Object.hasOwn(policy.options,'emitter-output-dir'))throw new UmfError('TYPESPEC_EMISSION_POLICY','Output location is controlled by the memory host');
 const bundle=exportTypeSpecSources(document);
 if(bundle.libraries?.['@typespec/json-schema']!=='1.16.0')throw new UmfError('TYPESPEC_EMISSION_LIBRARY','Select @typespec/json-schema 1.16.0 explicitly');
 const files:Record<string,string>=Object.create(null);
 const program=await compileTypeSpecProgram(bundle.files,bundle.entrypoint,bundle.libraries,{options:policy.options,outputs:files});
 const compilation=typeSpecCompilerReport(program,bundle.libraries);
 compilation.limitations[0]='Compiler ran the selected pinned JSON Schema emitter in the memory host; arbitrary project JavaScript remains unregistered';
 // Compiler failure may leave partial writes; never return them as a usable output bundle.
 return {status:compilation.valid?(Object.keys(files).length?'emitted' as const:'empty' as const):'blocked' as const,source:copyJson(document) as unknown as Document,emitter:'@typespec/json-schema@1.16.0',policy,compilation,files:compilation.valid?files:{},complete:false as const,limitations:['Native emitter output is not proof of lossless TypeSpec semantic projection','Native JSON Schema 1.16.0 emission can round exact numeric literals through JavaScript numbers (9007199254740993 becomes 9007199254740992); int64-strategy does not prevent literal rounding','Native JSON Schema 1.16.0 emission omits int64/uint64 bounds; string strategy also omits numeric syntax constraints. Generated validators can therefore accept values outside the source scalar domain','TypeSpec operations, decorators, source identity and runtime semantics are retained in source, not guaranteed by generated validators']};
}
