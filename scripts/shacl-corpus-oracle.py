import json,logging,warnings
from pathlib import Path
import rdflib
from rdflib import Graph
from rdflib.compare import isomorphic
from rdflib.extras.shacl import parse_shacl_path
rdflib.NORMALIZE_LITERALS=False
lexical_warnings=[]
warnings.showwarning=lambda message,category,filename,lineno,file=None,line=None: lexical_warnings.append(str(message))
class Capture(logging.Handler):
 def emit(self,record):lexical_warnings.append(record.getMessage())
logger=logging.getLogger('rdflib.term');logger.handlers=[Capture()];logger.propagate=False
source=json.loads(Path('fixtures/shacl/corpus-results.json').read_text());results=[]
for case in source['cases']:
 g=Graph().parse(case['path'],publicID=case['baseIRI']);formats=[]
 for export in case['exports']:
  restored=Graph().parse(export['path'],publicID=case['baseIRI'])
  formats.append({'format':export['format'],'equal':isomorphic(g,restored)})
 paths=[]
 if '/core/path/' in case['path']:
  for shape,path in g.subject_objects(rdflib.SH.path):
   try:paths.append({'status':'compiled','expression':str(parse_shacl_path(g,path))})
   except Exception as e:paths.append({'status':'blocked','error':str(e)})
 results.append({'path':case['path'],'triples':len(g),'formats':formats,'nativePaths':paths})
out={'oracle':'RDFLib','version':rdflib.__version__,'revision':source['revision'],'claim':'Graph isomorphism and native path parsing, not validation report execution','lexicalWarnings':lexical_warnings,'results':results}
Path('fixtures/shacl/corpus-oracle-results.json').write_text(json.dumps(out,indent=2)+'\n')
assert all(f['equal'] for r in results for f in r['formats'])
print({'sources':len(results),'roundTrips':sum(len(r['formats']) for r in results),'nativePaths':sum(len(r['nativePaths']) for r in results),'nativePathErrors':[r['path'] for r in results if any(p['status']=='blocked' for p in r['nativePaths'])]})
