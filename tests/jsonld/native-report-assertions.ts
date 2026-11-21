// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect} from 'bun:test';
import {Parser} from 'n3';
/** Diagnostic prose and optional processor events differ between processors.
 * Require the structured contract, all retained semantic losses, and a concrete
 * reason for every refusal. Authored tests additionally assert specific losses. */
export function assertDiagnosticContract(report:any, saved:readonly any[],derived:string):void {
 expect(report.diagnostics.length).toBeGreaterThan(0);
 for(const d of report.diagnostics){expect(d.code).toMatch(/^JSONLD_/);expect(['warning','error']).toContain(d.severity);expect(d.path).toBeString();expect(d.message.length).toBeGreaterThan(0);}
 if(report.status==='candidate'){expect(report.diagnostics.some((d:any)=>d.code===derived&&d.severity==='warning')).toBe(true);expect(report.diagnostics.some((d:any)=>d.severity==='error')).toBe(false);}
 else {expect(report.candidate).toBeUndefined();expect(report.diagnostics.some((d:any)=>d.severity==='error'||d.severity==='warning')).toBe(true);}
 const semantic=new Set(['JSONLD_CONTEXT_MISSING','JSONLD_RDF_INDEX','JSONLD_RDF_EMPTY_GRAPH','JSONLD_RDF_TERM','JSONLD_RDF_NUMBER_LOSS']);
 for(const code of new Set(saved.map(d=>d.code).filter(code=>semantic.has(code))))expect(report.diagnostics.some((d:any)=>d.code===code),JSON.stringify({required:code,actual:report.diagnostics})).toBe(true);
}
export type RdfComparison={id:string;actual:string;expected:string};
/** N3 parses Unicode IRIs correctly. RDFLib then independently compares the
 * complete dataset, retaining graph names, literal lexemes and shared blanks. */
export async function assertRdfDatasets(rows:readonly RdfComparison[]):Promise<void>{
 const term=(t:any):any=>t.termType==='NamedNode'?{kind:'iri',value:t.value}:t.termType==='BlankNode'?{kind:'blank',value:t.value}:t.termType==='DefaultGraph'?{kind:'default'}:{kind:'literal',value:t.value,datatype:t.datatype.value,...(t.language?{language:t.language}:{})};
 const parse=(text:string)=>new Parser({format:'N-Quads'}).parse(text).map(q=>({subject:term(q.subject),predicate:term(q.predicate),object:term(q.object),graph:term(q.graph)}));
 const input=rows.map(row=>({id:row.id,actual:parse(row.actual),expected:parse(row.expected)}));
 const process=Bun.spawn([globalThis.process.env.UMF_PYTHON_PATH??'.venv/bin/python',new URL('./rdf-dataset-oracle.py',import.meta.url).pathname],{stdin:new Blob([JSON.stringify(input)]),stdout:'pipe',stderr:'pipe'});
 const [stdout,stderr,exit]=await Promise.all([new Response(process.stdout).text(),new Response(process.stderr).text(),process.exited]);
 expect(exit,stderr).toBe(0);const results=JSON.parse(stdout);expect(results.map((r:any)=>r.id)).toEqual(rows.map(r=>r.id));
 for(const result of results)expect(result.equal as boolean,String(result.id)).toBe(true);
}
