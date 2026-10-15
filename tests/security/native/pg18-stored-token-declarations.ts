/** Authored original products; declaration inspection never grants native authority. */
import {storedWriteFixture} from '../catalog-write-fixture';
import {inspectProtectionObligations} from '../../../src/extensions/security/protection/obligations';
const f=storedWriteFixture();
const clear=f.closure.documents[0].document.modules[0].elements.find((e:any)=>e.id==='clear');
clear.scalarType='string';
f.catalog.transforms[0].determinism='keyed-deterministic';
f.catalog.transforms[0].disclosureProfile=['equality'];
const declaration=inspectProtectionObligations(f.policy,f.catalog,f.closure,f.ontology);
if(declaration.status!=='declared-obligations')throw Error(JSON.stringify(declaration.diagnostics));
console.log(JSON.stringify({policy:f.policy,catalog:f.catalog,closure:f.closure,ontology:f.ontology,owner:f.owner,declaration}));
