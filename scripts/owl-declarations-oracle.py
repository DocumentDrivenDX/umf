import json
from pathlib import Path
import rdflib
from rdflib import Graph, URIRef, BNode, RDF, RDFS, OWL

kinds = {OWL.Class: 'class', RDFS.Datatype: 'datatype', OWL.ObjectProperty: 'objectProperty',
         OWL.DatatypeProperty: 'dataProperty', OWL.AnnotationProperty: 'annotationProperty',
         OWL.NamedIndividual: 'namedIndividual'}
rows = []
for case in json.loads(Path('fixtures/owl/declarations.json').read_text())['cases']:
    graph = Graph().parse(data=case['text'], format='turtle', publicID='https://example.org/')
    named = sorted((str(s), kind) for t, kind in kinds.items() for s in graph.subjects(RDF.type, t) if isinstance(s, URIRef))
    anonymous = sorted(kind for t, kind in kinds.items() for s in graph.subjects(RDF.type, t) if isinstance(s, BNode))
    actual = sorted((d['node']['value'], d['kind']) for d in case['view']['declarations'])
    actual_anonymous = sorted(d['kind'] for d in case['view']['anonymousTypeAssertions'])
    original = Graph().parse(data=case['input'], format='turtle', publicID='https://example.org/')
    edited_iri = URIRef('https://example.org/EditedDeclaration')
    edit_observed = case['variant'] != 'edited' or (any(graph.triples((edited_iri, RDF.type, None))) and not any(original.triples((edited_iri, RDF.type, None))))
    rows.append({'file':case['file'], 'variant':case['variant'], 'format':case['format'],
                 'named':named, 'anonymousKinds':anonymous, 'agrees':named == actual and anonymous == actual_anonymous,
                 'editObserved':edit_observed})
result = {'oracle':'RDFLib '+rdflib.__version__, 'scope':'Explicit RDF type roles, anonymous role counts and edited subject presence; no OWL profile validation or reasoning', 'cases':rows}
Path('fixtures/owl/declarations-oracle.json').write_text(json.dumps(result, indent=2)+'\n')
assert all(r['agrees'] and r['editObserved'] for r in rows)
print(f'{len(rows)} declaration comparisons agree')
