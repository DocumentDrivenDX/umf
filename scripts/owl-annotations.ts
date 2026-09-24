import {importOwlTurtle,getOwlAxiomAnnotations} from '../src';
const raw=await Bun.file('native/owl/annotations.ttl').text(),doc=importOwlTurtle(raw,{id:'annotations',baseIRI:'https://example.org/',blankNodeScope:'annotations'}),view=getOwlAxiomAnnotations(doc,0);
await Bun.write('fixtures/owl/annotations.json',JSON.stringify(view,null,2)+'\n');
