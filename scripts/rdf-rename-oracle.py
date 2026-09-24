import json
from pathlib import Path
import rdflib
from rdflib.compare import isomorphic
from rdf_oracle_support import parsed,encoded
base=Path('fixtures/rdf/rename');results=[]
for case in json.loads((base/'results.json').read_text())['cases']:
    before=parsed(Path(case['path']).read_text());old=rdflib.URIRef(case['from']);new=rdflib.URIRef(case['to'])
    def rename(value):
        if isinstance(value,rdflib.URIRef) and value==old:return new
        if isinstance(value,rdflib.Literal) and value.datatype==old:return rdflib.Literal(str(value),datatype=new,normalize=False)
        return value
    expected=[tuple(rename(term) for term in quad) for quad in before]
    for export in case['exports']:
        actual=parsed(Path(export['path']).read_text());assert isomorphic(encoded(expected),encoded(actual)),(case['id'],export['format'])
        results.append({'id':case['id'],'format':export['format'],'isomorphic':True,'sourceDistinctQuads':len(set(before)),'candidateDistinctQuads':len(set(actual))})
(base/'oracle-results.json').write_text(json.dumps({'rdflib':rdflib.__version__,'literalNormalization':False,'results':results},indent=2)+'\n')
print({'nativeRenameComparisons':len(results)})
