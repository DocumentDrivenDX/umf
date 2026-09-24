from unittest.mock import patch
from pathlib import Path
import rdflib
from rdflib.plugins.parsers.notation3 import RDFSink
def trig(text,base_iri):
    d=rdflib.Dataset();names=[];original=RDFSink.newGraph
    def observed(sink,identifier):
        if identifier!=sink.graph.identifier:names.append(identifier)
        return original(sink,identifier)
    with patch.object(RDFSink,'newGraph',observed):d.parse(data=text,format='trig',publicID=base_iri)
    def normalize(o):
        if not isinstance(o,rdflib.Literal):return o
        if o.language:return rdflib.Literal(str(o),lang=o.language.lower(),normalize=False)
        if o.datatype is None:return rdflib.Literal(str(o),datatype=rdflib.XSD.string,normalize=False)
        return o
    quads=[(s,p,normalize(o),None if g==d.default_graph.identifier else g) for s,p,o,g in d.quads()]
    return quads,set(names)|{g for s,p,o,g in quads if g is not None}
def text(path):return Path(path).read_bytes().decode('utf-8')
