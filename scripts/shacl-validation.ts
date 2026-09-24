import {importShaclTurtle,importRdfTurtle,proposeShaclEngineValidation,exportRdfNQuads,readDocument,writeDocument} from '../src';
const input=await Bun.file('fixtures/shacl/validation-inputs.json').json(),results=[];
for(const [index,c] of input.cases.entries()){
 const shapes=importShaclTurtle(await Bun.file(c.shapes).text(),{id:c.shapes,baseIRI:c.shapesBase}),data=importRdfTurtle(await Bun.file(c.data).text(),{id:c.data,baseIRI:c.dataBase}),r=await proposeShaclEngineValidation(shapes,data,{id:c.id+'/report',blankNodePolicy:c.shapes===c.data?'shared-scope':'disjoint-inputs'}),reportPath='fixtures/shacl/validation/'+index+'.nq';
 if(r.report)await Bun.write(reportPath,exportRdfNQuads(r.report));
 results.push({...c,numericProfile:r.numericProfile,blankNodePolicy:r.blankNodePolicy,status:r.status,engineConforms:r.engineConforms,conformsEqual:r.engineConforms===c.expectedConforms,diagnostics:r.diagnostics,...(r.report?{reportPath}:{})});
}
await Bun.write('fixtures/shacl/validation-results.json',JSON.stringify({engine:'rdf-validate-shacl@0.6.5',numericProfile:'umf-numeric-2',complete:false,results},null,2)+'\n');console.log({cases:results.length,evaluated:results.filter(r=>r.status==='evaluated').length,conformsEqual:results.filter(r=>r.conformsEqual).length,blocked:results.filter(r=>r.status==='blocked').map(r=>({id:r.id,error:r.diagnostics.at(-1)})),mismatches:results.filter(r=>r.status==='evaluated'&&!r.conformsEqual).map(r=>r.id)});
