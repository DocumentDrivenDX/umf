// SPDX-License-Identifier: MIT OR Apache-2.0
import {importOwlTurtle,getOwlAxiomAnnotations} from '../src/index-node-v4';
const raw=await Bun.file('native/owl/annotations.ttl').text(),doc=importOwlTurtle(raw,{id:'annotations',baseIRI:'https://example.org/',blankNodeScope:'annotations'}),view=getOwlAxiomAnnotations(doc,0);
await Bun.write('fixtures/owl/annotations.json',JSON.stringify(view,null,2)+'\n');
