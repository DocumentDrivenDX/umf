import json
from pathlib import Path
import rdflib
from rdflib import Graph, URIRef, BNode, RDF, OWL, Literal

kinds = {OWL.propertyChainAxiom:'propertyChain', OWL.hasKey:'key', OWL.disjointUnionOf:'disjointUnion'}
def term(t):
    return str(t) if isinstance(t, URIRef) else '_:resource'
def actual_term(t):
    return t['value'] if t['kind'] == 'iri' else '_:resource'
rows=[]
for case in json.loads(Path('fixtures/owl/list-axioms.json').read_text())['cases']:
    graph=Graph().parse(data=case['text'], format='turtle', publicID='https://example.org/')
    expected=[]
    invalid=[]
    for predicate, kind in kinds.items():
        for subject, head in graph.subject_objects(predicate):
            members=[]
            seen=set()
            cell=head
            bad=kind == 'disjointUnion' and not isinstance(subject, URIRef)
            while not bad and cell != RDF.nil:
                if isinstance(cell, Literal) or cell in seen or len(seen)>=10000:
                    bad=True
                    break
                seen.add(cell)
                first=set(graph.objects(cell, RDF.first))
                rest=set(graph.objects(cell, RDF.rest))
                if len(first)!=1 or len(rest)!=1 or isinstance(next(iter(first)), Literal):
                    bad=True
                    break
                members.append(next(iter(first)))
                cell=next(iter(rest))
            if any(graph.objects(RDF.nil, RDF.first)) or any(graph.objects(RDF.nil, RDF.rest)):
                bad=True
            if len(members)<(1 if kind=='key' else 2):
                bad=True
            if bad:
                invalid.append([term(subject), kind])
            else:
                expected.append([term(subject), kind, [term(t) for t in members]])
    actual=[[actual_term(a['node']),a['kind'],[actual_term(t) for t in a['members']]] for a in case['view']['axioms']]
    malformed=[[actual_term(a['node']),a['kind']] for a in case['view']['malformed']]
    edited=case['variant']!='edited' or any(graph.triples((None,RDF.first,URIRef('https://example.org/EditedMember'))))
    row={'file':case['file'],'variant':case['variant'],'format':case['format'],'expected':sorted(expected),'invalid':sorted(invalid),'agrees':sorted(expected)==sorted(actual) and sorted(invalid)==sorted(malformed),'editObserved':edited}
    rows.append(row)
result={'oracle':'RDFLib '+rdflib.__version__,'scope':'Ordered explicit list members and malformed local structure; blank resource identities abstracted, no OWL validity or inference','cases':rows}
Path('fixtures/owl/list-axioms-oracle.json').write_text(json.dumps(result,indent=2)+'\n')
assert all(r['agrees'] and r['editObserved'] for r in rows)
print(f'{len(rows)} list axiom comparisons agree')
