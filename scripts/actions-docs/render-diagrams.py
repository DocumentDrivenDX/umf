"""Deterministic storyboard-specific SVGs; figure titles/descriptions in source.json; topology and labels authored here."""
from pathlib import Path
import json,html,textwrap,sys
root=Path('docs/helix/04-build/guides/actions/diagrams');check='--check' in sys.argv
figures=json.loads((root/'source.json').read_text())
def diagram(f,mobile):
 W=360 if mobile else 720;parts=[];height=900 if mobile else 760
 def text(x,y,value,size=17,width=None,bold=False):
  lines=textwrap.wrap(value,max(8,int((width or W-40)/(size*.56))))
  for i,line in enumerate(lines):parts.append(f'<text x="{x}" y="{y+i*(size+5)}" font-size="{size}"'+(' font-weight="700"' if bold else '')+'>'+html.escape(line)+'</text>')
 def box(x,y,w,h,title,body='',dashed=False):
  parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="#fffdf7" stroke="#738972" stroke-width="1.5"'+(' stroke-dasharray="5 4"' if dashed else '')+'/>');text(x+12,y+27,title,18,w-24,True)
  if body:text(x+12,y+35+len(textwrap.wrap(title,max(8,int((w-24)/(18*.56)))))*23,body,17,w-24)
 def arrow(x1,y1,x2,y2,label='',color='#203c35'):
  parts.append(f'<path d="M{x1} {y1} L{x2} {y2}" fill="none" stroke="{color}" stroke-width="2" marker-end="url(#arrow)"/>')
  if label:text(min(x1,x2)+8,(y1+y2)/2-8,label,16,abs(x2-x1)-16 if abs(x2-x1)>40 else 230)
 def rule(y,label):
  parts.append(f'<path d="M20 {y} H{W-20}" stroke="#738972" stroke-dasharray="4 4"/>');text(25,y+28,label,17,W-50)
 text(20,58,f['title'],26,W-40)
 text(20,24,f['figure']+' · '+f['kind'].upper(),13,W-40)
 start=110
 k=f['id']
 if k=='model':
  if mobile:
   box(20,110,320,140,'UMF metadata · sales','Field id: required string. Field status: required string.')
   arrow(180,250,180,290)
   box(20,290,320,130,'Record: order','members → id, status. Key pk → [id].')
   box(20,450,320,120,'Module extension','umf.actions → approve. Required SET of status.')
   rule(600,'Outside the UMF document')
   box(20,660,320,110,'Stored order · example','id: order-1; status: pending')
  else:
   box(20,110,260,170,'Fields · sales','id: string, required. status: string, required.')
   box(430,110,270,170,'Record · sales.order','members: id, status. primary Key pk: [id]')
   arrow(430,190,280,190,'references')
   box(170,335,380,120,'Module extension','sales → umf.actions → approve')
   rule(500,'Model definitions above; stored business data below')
   box(170,575,380,115,'Example stored instance','order-1: status pending')
 elif k=='responsibilities':
  if mobile:
   box(20,110,320,280,'LIBRARY · portable','Document → inspection → declared assessment. No store access or business writes.')
   box(40,250,280,110,'Explicit interpretation','Compile; evaluate supplied state. Separate from inspection.')
   rule(425,'No execution arrow between lanes')
   box(20,480,320,280,'CONSUMER · host-only','Trusted actor → authorization → native transaction → durable outcome.')
   text(38,690,'Owns selected state, verification and commit.',17,280)
  else:
   box(20,115,325,475,'LIBRARY · portable','Read the declaration.')
   box(375,115,325,475,'CONSUMER · host-only','Receive a business request.')
   box(40,235,285,95,'Inspect / assess','No business write.')
   box(40,370,285,155,'Explicit interpretation','Compile supported profiles. Evaluate supplied state separately.')
   box(395,235,285,95,'Trusted authorization','Authenticate actor / service.');arrow(535,330,535,370)
   box(395,370,285,155,'Native transaction','Freeze, execute, verify. Commit outcome atomically.')
   text(50,640,'No arrow from inspection to execution. Compatibility is not verified execution.',18,620)
 elif k=='approval':
  step=230 if mobile else 190
  for i,(head,before,after,note) in enumerate([
   ('1 · First request token','pending','approved','Changed: outcome + fact; version V_A.'),
   ('2 · Fresh request token','approved','approved','No-op: new outcome; same V_A, no new fact.'),
   ('3 · Original-token replay','retained','original result','No execution. Current authorization still required.')]):
   y=110+i*step;box(20,y,W-40,step-24,head)
   text(38,y+70,before,18,125,True);text(W-150,y+70,after,18,125,True);arrow(155 if mobile else 255,y+92,W-160,y+92)
   text(38,y+135,note,17,W-75)
  text(20,110+3*step+12,'V_A is an illustrative opaque version, not a sortable clock.',16,W-40)
 elif k=='create-link':
  box(W/2-105,110,210,140,'1 · create order','Explicit Key. Effect ID: create.')
  box(20,390,(W-60)/2,140,'Customer','existing input')
  box(W/2+10,390,(W-60)/2,140,'Product','existing input')
  arrow(W/2-30,250,90 if mobile else 175,390,'2 · link')
  arrow(W/2+30,250,W-90 if mobile else W-175,390,'3 · link')
  text(25,555,'Both sources bind created:create.',17,W-50)
  box(20,590,W-40,160,'Frozen permission frame','Permit create + these links. Required effects are distinct from permission. No forward reference or allocated Key.',True)
 elif k=='retry':
  xs=[60,W-65] if mobile else [110,355,610]
  names=['Client','Consumer / store'] if mobile else ['Client','Consumer','Native store']
  for x,name in zip(xs,names):text(x-40,125,name,16,140,True);parts.append(f'<path d="M{x} 165 V650" stroke="#738972" stroke-dasharray="4 5"/>')
  arrow(xs[0],205,xs[1],205);text(25,185,'1 · Original request + token',17,W-50)
  if not mobile:arrow(xs[1],285,xs[2],285);text(380,265,'2 · Atomic commit',17,280)
  else:box(130,250,210,105,'2 · Commit','Business + outcome retained.')
  if not mobile:
   arrow(xs[2],350,xs[1],350);text(385,330,'Store committed',16,250)
  mid=(xs[0]+xs[1])/2
  parts.append(f'<path d="M{xs[1]} 405 H{mid}" stroke="#203c35" stroke-width="2" stroke-dasharray="5 4"/><path d="M{mid-7} 398 L{mid+7} 412 M{mid+7} 398 L{mid-7} 412" stroke="#8b3d35" stroke-width="2"/>')
  text(25,385,'3 · Response lost ×',17,W-50)
  text(25,460,'Client knowledge: indeterminate. A timeout does not prove rollback.',17,W-50)
  arrow(xs[0],550,xs[1],550);text(25,530,'4 · Original-token lookup',17,W-50)
  arrow(xs[1],630,xs[0],630);text(25,610,'5 · Authorized original result',17,W-50)
  box(20,700,W-40,130,'Lookup never executes','Current permission gates the original result. Missing after uncertainty is not authorization to retry fresh.',True)
  height=870
 elif k=='visibility':
  for y,title,note,slots,prefix in [
   (110,'Committed write','Business + outcome + outbox',[('1','queued'),('2','queued')],'Receipt issued'),
   (370,'Delivery out of order','2 arrived; 1 is missing',[('1','missing'),('2','waiting')],'Applied prefix = 0 · pending'),
   (630,'Projection application','Apply 1 then 2; content + prefix atomic',[('1','applied'),('2','applied')],'Applied prefix = 2 · visible')]:
   box(20,y,W-40,225,title);text(35,y+55,note,16,W-70)
   for j,(num,status) in enumerate(slots):
    x=35+j*(W/2-20);box(x,y+90,W/2-35,70,'Position '+num,status)
   text(35,y+205,prefix,16,W-60,True)
   if y<630:arrow(W/2,y+225,W/2,y+258)
  box(20,905,W-40,180,'Receipt scope','Matching store + epoch + opaque version and correct projection content. Positions shown are internal, not receipt versions.',True)
  height=1120
 elif k=='handler':
  height=980
  box(20,110,W-40,165,'ISOLATED HANDLER','Only transaction capability messages. No raw SQL, database secrets or ambient network.')
  arrow(W/2,275,W/2,340);text(25,310,'Bounded authenticated RPC',17,W-50)
  parts.append(f'<rect x="15" y="340" width="{W-30}" height="450" rx="12" fill="#dce7d5" stroke="#53732e" stroke-width="2"/>')
  text(30,375,'TRUSTED CONSUMER HOST',17,W-60,True)
  box(35,405,W-70,125,'Capability gateway','Freeze aliases. Refuse outside-frame attempts before access.')
  arrow(W/2,530,W/2,565)
  box(35,565,W-70,180,'Native transaction boundary','Invariants + current policy + replay + outbox. Control reads are not handler grants.')
  text(25,840,'Verify before commit; failures roll back the attempted transaction.',17,W-50)
 elif k=='counterexample':
  height=900
  box(20,110,W-40,130,'Incomplete equation','post.stock = pre.stock − quantity')
  arrow(W/2,240,W/2,285)
  box(20,285,W-40,170,'Counterexample · passes equation','pre.stock = 2; quantity = 0. post.stock = 2; reservation absent. 2 = 2 − 0 is true.')
  text(35,485,'Business promise failed: no positive request and no reservation.',18,W-70,True)
  rule(550,'Correct the intent, not just the arithmetic')
  box(20,610,W-40,160,'Require all obligations','quantity > 0; correct reservation exists; exact stock relation; stock ≥ 0. The zero-quantity case now refuses.')
  text(25,810,'Bounded model example; native implementation evidence is separate.',17,W-50)
 desc=' '.join(p['title']+': '+p['text'] for p in f['panels'])
 return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {height}" role="img" aria-labelledby="title desc"><title id="title">{html.escape(f["figure"]+" · "+f["title"])}</title><desc id="desc">{html.escape(desc)}</desc><defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10Z" fill="#203c35"/></marker></defs><rect width="{W}" height="{height}" rx="16" fill="#e9edde"/><g fill="#203c35" font-family="Arial, sans-serif">'+''.join(parts)+'</g></svg>\n'
for f in figures:
 for mobile in [False,True]:
  p=root/(f['id']+('-mobile' if mobile else '')+'.svg');svg=diagram(f,mobile)
  if check:
   if not p.exists() or p.read_text()!=svg:raise RuntimeError('Stale diagram '+str(p))
  else:p.write_text(svg)
print('Checked' if check else 'Rendered','8 distinct diagrams, each with desktop/mobile layout')
