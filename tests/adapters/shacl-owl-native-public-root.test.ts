// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {
 UmfError,
 getOwlQuads,
 getOwlOntologyHeaders,
 importOwlTurtle,
 getShaclQuads,
 importShaclTurtle,
 proposeShaclEngineValidation,
} from '../../src/index-node-v4';

import {createRdfEngine} from '../../bindings/core/node/index.js';
import type {Document} from '../../src/model/types';

const options={baseIRI:'https://example.test/'};

test('Node public root routes SHACL validation and OWL graph views through native families',async()=>{
 const shapes=importShaclTurtle(`<https://example.test/shape> a <http://www.w3.org/ns/shacl#NodeShape> ; <http://www.w3.org/ns/shacl#targetNode> <https://example.test/alice> ; <http://www.w3.org/ns/shacl#property> [ <http://www.w3.org/ns/shacl#path> <https://example.test/name> ; <http://www.w3.org/ns/shacl#minCount> "1"^^<http://www.w3.org/2001/XMLSchema#integer> ] .`,{...options,id:'shacl-public-shapes'});
 const data=createRdfEngine().importRdfTurtle('',{...options,id:'shacl-public-data'}) as Document;
 expect(getShaclQuads(shapes)).toHaveLength(5);
 const report=await proposeShaclEngineValidation(shapes,data,{id:'shacl-public-report',blankNodePolicy:'disjoint-inputs'});
 expect(report.status).toBe('evaluated');expect(report.engineConforms).toBe(false);expect(report.report).toBeDefined();
 let shaclRefusal:unknown;try{importShaclTurtle('this is not valid Turtle ???',{...options,id:'shacl-invalid'});}catch(error){shaclRefusal=error;}
 expect(shaclRefusal).toBeInstanceOf(UmfError);
 const ontology=importOwlTurtle(`<https://example.test/ontology> a <http://www.w3.org/2002/07/owl#Ontology> ; <http://www.w3.org/2002/07/owl#versionIRI> <https://example.test/ontology/1> .`,{...options,id:'owl-public-root'});
 expect(getOwlQuads(ontology)).toHaveLength(2);
 expect(getOwlOntologyHeaders(ontology)).toHaveLength(1);
 let refusal:unknown;try{importOwlTurtle('this is not valid Turtle ???',{...options,id:'owl-invalid'});}catch(error){refusal=error;}
 expect(refusal).toBeInstanceOf(UmfError);
 expect(refusal).toMatchObject({name:'UmfError'});
},60_000);
