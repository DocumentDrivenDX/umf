from pathlib import Path
from urllib.request import urlopen
import hashlib,html,json,re
url='https://www.w3.org/TR/2012/REC-owl2-primer-20121211/'
raw=urlopen(url).read();text=raw.decode();section=text.split('id="Appendix:_The_Complete_Sample_Ontology"',1)[1]
block=section.split('<div class="turtle">',1)[1];pre=re.search(r'<pre>(.*?)</pre>',block,re.S).group(1)
turtle=html.unescape(re.sub(r'<[^>]+>','',pre)).replace('\u00a0',' ')+'\n'
root=Path('native/owl');root.mkdir(exist_ok=True);(root/'primer.html').write_bytes(raw);(root/'primer.ttl').write_text(turtle)
(root/'sources.json').write_text(json.dumps({'url':url,'sourceSha256':hashlib.sha256(raw).hexdigest(),'turtleSha256':hashlib.sha256(turtle.encode()).hexdigest(),'extraction':'First Turtle pre block in appendix 13; HTML tags stripped, entities decoded, HTML NBSP formatting replaced by ASCII space, trailing newline added','license':'https://www.w3.org/Consortium/Legal/2002/copyright-documents-20021231','copyright':'Copyright 2012 W3C (MIT, ERCIM, Keio). All Rights Reserved.'},indent=2)+'\n')

old='owl:hasSelf     "true"^^xsd:boolean .'
assert turtle.count(old)==1
corrected=turtle.replace(old,'owl:hasSelf     "true"^^xsd:boolean')
(root/'primer-corrected.ttl').write_text(corrected)
(root/'corrections.json').write_text(json.dumps({'source':'primer.ttl','derived':'primer-corrected.ttl','changes':[{'from':old,'to':'owl:hasSelf     "true"^^xsd:boolean','reason':'Period inside blank-node property list is invalid Turtle; both N3 and RDFLib reject the published source'}],'sha256':hashlib.sha256(corrected.encode()).hexdigest()},indent=2)+'\n')
