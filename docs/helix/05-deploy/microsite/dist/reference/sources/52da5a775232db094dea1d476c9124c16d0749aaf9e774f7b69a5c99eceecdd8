import {CURRENT_CORE_VERSION} from '../generated/core-model';
import {copyJson} from './json';
import {UmfError,type Document,scalarTypesForVersion} from './types';
import {validateDocument} from '../validation/document';
/** Explicit copied metadata declaration; never converts stored values or issues a receipt. */
export function declareCoreBit128Field(input:Document,identityInput:{module:string;element:string},scalarType:'bits128'|'uuid'):Document{
 const source=copyJson(input) as unknown as Document,identity=copyJson(identityInput) as unknown as {module:string;element:string};
 const fail=(message:string):never=>{throw new UmfError('BIT128_FIELD',message);};
 if(source.umf!==CURRENT_CORE_VERSION||!validateDocument(source).valid)fail('Valid current core 0.10.0 source required');
 if(!identity||Object.keys(identity).sort().join(',')!=='element,module'||typeof identity.module!=='string'||typeof identity.element!=='string')fail('Exact Field identity required');
 if(scalarType!=='bits128'&&scalarType!=='uuid')fail('Explicit128-bit domain required');
 const field=source.modules.find(m=>m.id===identity.module)?.elements.find(e=>e.id===identity.element);
 if(!field||field.kind!=='field'||field.cardinality!=='one')fail('Singular Field required; container values use itemType');
 if(field!.scalarType!==undefined&&!scalarTypesForVersion(source.umf).includes(field!.scalarType))fail('Unknown scalar meaning cannot be overwritten');
 field!.scalarType=scalarType;
 const checked=validateDocument(source);
 const mi=source.modules.findIndex(m=>m.id===identity.module),ei=source.modules[mi]!.elements.findIndex(e=>e.id===identity.element),path=`/modules/${mi}/elements/${ei}`;
 if(checked.diagnostics.some(d=>d.severity==='warning'&&d.path.startsWith(path+'/')&&!d.path.startsWith(path+'/extensions/')))fail('Unknown selected Field meaning blocks authoring');
 if(!checked.valid)fail(JSON.stringify(checked.diagnostics));
 return source;
}
