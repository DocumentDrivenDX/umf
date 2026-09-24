import SHACLValidator from 'rdf-validate-shacl';
import {Parser,Store} from 'n3';
import {importShaclTurtle,importRdfTurtle,proposeShaclEngineValidation} from '../src';
const raw='<urn:s> <http://www.w3.org/ns/shacl#targetNode> <urn:a> ; <http://www.w3.org/ns/shacl#and> <urn:list> .';
let native:unknown;try{const result=await new SHACLValidator(new Store(new Parser().parse(raw))).validate(new Store());native={status:'evaluated',conforms:result.conforms};}catch(e){native={status:'error',message:String(e)};}
const result=await proposeShaclEngineValidation(importShaclTurtle(raw,{id:'s',baseIRI:'urn:base:'}),importRdfTurtle('',{id:'d',baseIRI:'urn:base:'}),{id:'r',blankNodePolicy:'disjoint-inputs'});
if(result.status!=='blocked'||result.report||result.engineConforms!==undefined)throw Error('Malformed list was evaluated');
await Bun.write('fixtures/shacl/list-gap.json',JSON.stringify({engine:'rdf-validate-shacl@0.6.5',shapes:raw,native,umf:{status:result.status,diagnostics:result.diagnostics}},null,2)+'\n');console.log(native);
