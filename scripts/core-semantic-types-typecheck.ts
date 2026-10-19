// SPDX-License-Identifier: MIT OR Apache-2.0
/** Static compatibility: raw legacy metadata stays opaque; use typed semantic APIs. */
import type {Document,CoreSemanticTypeReference} from '../src/model/types';
const opaqueExtension:Document={umf:'0.10.0',id:'opaque',vocabularies:{},modules:[{id:'m',namespace:'example',elements:[{id:'e',extensions:{future:{semanticTypes:{future:'opaque'}}}}]}]};
const declared:CoreSemanticTypeReference={vocabulary:'example',version:'release',term:'identifier'};
void opaqueExtension;void declared;
