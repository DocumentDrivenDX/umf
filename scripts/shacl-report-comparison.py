"""Compare mandatory top-level report fields and path structure; record exclusions explicitly."""
import json,logging,warnings
from pathlib import Path
import rdflib
from rdflib import Graph,Namespace,RDF,BNode,URIRef
from rdflib.compare import isomorphic
from rdflib.extras.shacl import parse_shacl_path
rdflib.NORMALIZE_LITERALS=False
logging.getLogger('rdflib.term').setLevel(logging.CRITICAL);warnings.filterwarnings('ignore')
SH=rdflib.SH;MF=Namespace('http://www.w3.org/2001/sw/DataAccess/tests/test-manifest#')
fields={RDF.type,SH.focusNode,SH.value,SH.resultPath,SH.sourceShape,SH.sourceConstraintComponent,SH.resultSeverity}
def project(g,root,semantic_paths=False):
 out=Graph();out.add((root,RDF.type,SH.ValidationReport))
 for value in g.objects(root,SH.conforms):out.add((root,SH.conforms,value))
 for result in g.objects(root,SH.result):
  out.add((root,SH.result,result))
  for p,o in g.predicate_objects(result):
   if p not in fields:continue
   if p==SH.resultPath and semantic_paths:
    out.add((result,p,rdflib.Literal(parse_shacl_path(g,o).n3())));continue
   out.add((result,p,o))
   if p==SH.resultPath:
    seen=set()
    def visit(n):
     if not isinstance(n,BNode) or n in seen:return
     seen.add(n)
     for triple in g.triples((n,None,None)):out.add(triple);visit(triple[2])
    visit(o)
 return out
source=json.loads(Path('fixtures/shacl/validation-results.json').read_text());oracle=json.loads(Path('fixtures/shacl/validation-oracle-results.json').read_text());byid={r['id']:r for r in oracle['results']};rows=[]
for c in source['results']:
 original=Graph().parse(c['manifest'],publicID=c['baseIRI']);expected=project(original,original.value(URIRef(c['id']),MF.result));row={'id':c['id'],'expectedResults':len(list(expected.objects(None,SH.result)))}
 for name,record in [('engine',c),('pyshacl',byid[c['id']])]:
  if not record.get('reportPath'):row[name]={'status':'blocked'};continue
  # N-Quads outputs contain only default graph triples and are valid N-Triples.
  actual=Graph().parse(record['reportPath'],format='nt');roots=list(actual.subjects(RDF.type,SH.ValidationReport))
  if len(roots)!=1:row[name]={'status':'ambiguous','roots':len(roots)};continue
  report=project(actual,roots[0]);semantic=project(actual,roots[0],True);expected_semantic=project(original,original.value(URIRef(c['id']),MF.result),True);row[name]={'status':'compared','equal':isomorphic(expected,report),'pathSemanticEqual':isomorphic(expected_semantic,semantic),'results':len(list(report.objects(None,SH.result)))}
 rows.append(row)
out={'scope':'Mandatory top-level fields; both raw path structure isomorphism and equivalent mapped SPARQL paths (ignoring path-node sharing)','exclusions':['Generated/user messages','Nested details','Identity of blank focus/value/sourceShape relative to source graphs (anonymous equality only)'],'results':rows}
Path('fixtures/shacl/report-comparison.json').write_text(json.dumps(out,indent=2)+'\n');print({name:{'equal':sum(r[name].get('equal',False) for r in rows),'pathSemanticEqual':sum(r[name].get('pathSemanticEqual',False) for r in rows),'differences':[r['id'] for r in rows if not r[name].get('equal',False)]} for name in ['engine','pyshacl']})
