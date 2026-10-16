import {copyJson} from '../../model/json';
import {UmfError,type Document} from '../../model/types';
import {inspectBit128Binding,type Bit128BindingPayload} from './bit128';
import {resolveBit128ModelLayout,type Resolved128Layout} from './bit128-layout';
/** Shared copied source resolution for projections and finite dataset validation. */
export function resolveBit128ModelSources(bindingInput:Document,sourceInput:Document):{binding:Document;source:Document;payload:Bit128BindingPayload;layout:Resolved128Layout}{
 const binding=copyJson(bindingInput) as unknown as Document,source=copyJson(sourceInput) as unknown as Document;
 const validation=inspectBit128Binding(binding,source);
 if(!validation.valid||!validation.complete)throw new UmfError('BIT128_MODEL_SOURCE',JSON.stringify(validation.diagnostics));
 const payload=binding.extensions!['umf.binding'] as unknown as Bit128BindingPayload;
 return {binding,source,payload,layout:resolveBit128ModelLayout(payload,source)};
}
