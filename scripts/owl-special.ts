import {importOwlTurtle,getOwlSpecialAxioms,writeDocument,readDocument} from '../src';
const raw=await Bun.file('native/owl/special-axioms.ttl').text(),doc=importOwlTurtle(raw,{id:'special',baseIRI:'https://example.org/'});
for(const format of ['json','yaml'] as const)await Bun.write('fixtures/owl/special-'+format+'.json',JSON.stringify(getOwlSpecialAxioms(readDocument(writeDocument(doc,format),format)),null,2)+'\n');
