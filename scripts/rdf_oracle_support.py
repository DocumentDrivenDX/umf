"""RDF 1.1 comparison helpers; do not enable RDFLib literal normalization."""
import rdflib
rdflib.NORMALIZE_LITERALS=False
def term(t):
    if t['kind']=='iri':return rdflib.URIRef(t['value'])
    if t['kind']=='blank':return rdflib.BNode(t['value'])
    if t['kind']=='default':return None
    return rdflib.Literal(t['value'],lang=t.get('language'),datatype=None if t.get('language') else rdflib.URIRef(t['datatype']),normalize=False)
def declared(rows):return [(term(q['subject']),term(q['predicate']),term(q['object']),term(q['graph'])) for q in rows]
def parsed(text):
    d=rdflib.Dataset();d.parse(data=text,format='nquads');return [(s,p,rdflib.Literal(str(o),datatype=rdflib.XSD.string,normalize=False) if isinstance(o,rdflib.Literal) and not o.language and o.datatype is None else rdflib.Literal(str(o),lang=o.language.lower(),normalize=False) if isinstance(o,rdflib.Literal) and o.language else o,None if g==d.default_graph.identifier else g) for s,p,o,g in d.quads()]
def encoded(quads,graphs=()):
    # Reify the dataset for one blank-node mapping shared across subjects, objects and graph names.
    g=rdflib.Graph();used={str(v) for q in quads for v in q if isinstance(v,rdflib.BNode)} | {str(v) for v in graphs if isinstance(v,rdflib.BNode)}
    for index,(s,p,o,graph) in enumerate(set(quads)):
        key='umf_oracle_quad_'+str(index)
        while key in used:key+='x'
        used.add(key);node=rdflib.BNode(key)
        for label,value in [('subject',s),('predicate',p),('object',o)]:g.add((node,rdflib.URIRef('urn:umf:oracle:'+label),value))
        g.add((node,rdflib.URIRef('urn:umf:oracle:default'),rdflib.Literal(graph is None)))
        if graph is not None:g.add((node,rdflib.URIRef('urn:umf:oracle:graph'),graph))
    for name in set(graphs):g.add((name,rdflib.URIRef('urn:umf:oracle:graph-presence'),rdflib.Literal(True)))
    return g
