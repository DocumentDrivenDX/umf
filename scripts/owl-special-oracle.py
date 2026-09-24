import json
from pathlib import Path
import rdflib
rdflib.NORMALIZE_LITERALS=False
g=rdflib.Graph().parse('native/owl/special-axioms.ttl');O=rdflib.OWL
expected=[]
for kind,typ in [('allDifferent',O.AllDifferent),('allDisjointClasses',O.AllDisjointClasses),('allDisjointProperties',O.AllDisjointProperties)]:
 for n in g.subjects(rdflib.RDF.type,typ):
  if len(set(g.objects(n,rdflib.RDF.type))&{O.AllDifferent,O.AllDisjointClasses,O.AllDisjointProperties,O.NegativePropertyAssertion})!=1:continue
  heads=list(g.objects(n,O.members))+list(g.objects(n,O.distinctMembers))
  try:members=list(g.items(heads[0]))
  except ValueError:continue
  expected.append({'kind':kind,'members':[str(t) for t in members]})
for n in g.subjects(rdflib.RDF.type,O.NegativePropertyAssertion):
 targets=list(g.objects(n,O.targetIndividual))+list(g.objects(n,O.targetValue))
 if len(targets)!=1:continue
 expected.append({'kind':'negativePropertyAssertion','source':str(g.value(n,O.sourceIndividual)),'property':str(g.value(n,O.assertionProperty)),'target':str(targets[0]),'targetKind':'value' if isinstance(targets[0],rdflib.Literal) else 'individual'})
for fmt in ['json','yaml']:
 view=json.loads(Path('fixtures/owl/special-'+fmt+'.json').read_text());actual=[]
 for a in view['axioms']:
  actual.append({'kind':a['kind'],'members':[t['value'] for t in a['members']]} if 'members' in a else {'kind':a['kind'],'source':a['sourceIndividual']['value'],'property':a['assertionProperty']['value'],'target':a['target']['value'],'targetKind':a['targetKind']})
 assert sorted(map(lambda x:json.dumps(x,sort_keys=True),actual))==sorted(map(lambda x:json.dumps(x,sort_keys=True),expected))
Path('fixtures/owl/special-oracle.json').write_text(json.dumps({'oracle':'RDFLib','version':rdflib.__version__,'axioms':len(expected),'formats':['json','yaml'],'equal':True,'scope':'Explicit negative targets and ordered n-ary members; no entailment'},indent=2)+'\n')
print({'axioms':len(expected),'formats':2,'equal':True})
