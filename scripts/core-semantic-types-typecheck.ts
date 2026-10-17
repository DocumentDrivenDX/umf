/** Static compatibility: raw legacy metadata stays opaque; use typed semantic APIs. */
import type {Document,CoreSemanticTypeReference} from '../src/model/types';
const opaqueLegacy:Document={umf:'0.9.0',id:'opaque',vocabularies:{},modules:[{id:'m',namespace:'example',elements:[{id:'e',semanticTypes:{future:'opaque'},extensions:{}}]}]};
const declared:CoreSemanticTypeReference={vocabulary:'example',version:'release',term:'identifier'};
void opaqueLegacy;void declared;
