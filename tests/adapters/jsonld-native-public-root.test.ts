import {expect,test} from 'bun:test';
import {
  UmfError,
  exportJsonLdDocument,
  getJsonLdNode,
  importJsonLdDocument,
  proposeJsonLdFraming,
  proposeJsonLdNodeEdit,
} from '../../src/index-node-v4';

const options={id:'jsonld-public-root-flow',baseIRI:'https://example.test/'};

test('Node public root imports, reads and edits JSON-LD, awaits native framing, exports, and maps a native refusal',async()=>{
 const source=JSON.stringify({'@context':{name:'https://schema.org/name'},'@id':'https://example.test/alice',name:'Alice'});
 const document=importJsonLdDocument(source,options);
 expect(getJsonLdNode(document,'/name')).toMatchObject({kind:'string',value:'Alice'});
 const edited=proposeJsonLdNodeEdit(document,'/name','"Ada Lovelace"').document;
 const framed=await proposeJsonLdFraming(edited,{frame:JSON.stringify({'@context':{name:'https://schema.org/name'},name:{}}),lossPolicy:'report'});
 expect(framed.status).toBe('candidate');expect(framed.candidate).toBeDefined();
 const exported=exportJsonLdDocument(framed.candidate!);expect(exported).toContain('Ada Lovelace');expect(exported).toContain('name');
 let refusal:unknown;try{importJsonLdDocument('{',options);}catch(error){refusal=error;}
 expect(refusal).toBeInstanceOf(UmfError);expect(refusal).toMatchObject({name:'UmfError',code:'JSON_SCHEMA_SYNTAX'});
},60_000);
