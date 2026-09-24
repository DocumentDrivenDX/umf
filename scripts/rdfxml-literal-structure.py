import json
from pathlib import Path
from xml.dom import minidom,Node
import rdflib
from rdflib import Graph,RDF
rdflib.NORMALIZE_LITERALS=False
XMLNS='http://www.w3.org/2000/xmlns/'
def children(node):
    result=[]
    for n in node.childNodes:
        if n.nodeType in (Node.TEXT_NODE,Node.CDATA_SECTION_NODE):
            if result and result[-1][0]=='text': result[-1][1]+=n.data
            else: result.append(['text',n.data])
        elif n.nodeType==Node.ELEMENT_NODE:
            attrs=sorted([(a.namespaceURI or '',a.localName,a.value) for a in n.attributes.values() if a.namespaceURI!=XMLNS])
            result.append(['element',n.namespaceURI or '',n.localName,attrs,children(n)])
        elif n.nodeType==Node.COMMENT_NODE: result.append(['comment',n.data])
        elif n.nodeType==Node.PROCESSING_INSTRUCTION_NODE: result.append(['pi',n.target,n.data])
    return result
rows=[]
for c in json.loads(Path('fixtures/rdfxml/literals.json').read_text())['results']:
    if not c['id'].startswith('literal-'): continue
    dom=minidom.parseString(c['input'])
    props=[n for n in dom.getElementsByTagName('*') if n.getAttributeNS(str(RDF),'parseType')=='Literal']
    assert len(props)==1
    expected=children(props[0]);error=None;actual=None
    try:
        graph=Graph().parse(data=c['nquads'],format='nt')
        values=[str(o) for s,p,o in graph if getattr(o,'datatype',None)==RDF.XMLLiteral]
        assert len(values)==1
        actual=children(minidom.parseString('<wrapper>'+values[0]+'</wrapper>').documentElement)
    except Exception as e: error=str(e)
    rows.append({'id':c['id'],'profile':c['profile'],'agrees':actual==expected,'error':error,'expected':expected,'actual':actual})
report={'oracle':'Python minidom/Expat + RDFLib '+rdflib.__version__,'scope':'Expanded element/attribute names, attribute values, coalesced character data, comments and PIs; excludes unused namespace bindings and QName-valued text interpretation','results':rows}
Path('fixtures/rdfxml/literal-structure.json').write_text(json.dumps(report,indent=2)+'\n')
assert all(r['agrees'] for r in rows if r['profile']=='literal-repair')
print({p:sum(r['agrees'] for r in rows if r['profile']==p) for p in ['finalized','literal-repair']})
