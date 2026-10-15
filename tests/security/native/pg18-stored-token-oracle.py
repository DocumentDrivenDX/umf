"""Independent standard-library HMAC and row/equality expectations for P08."""
import hashlib,hmac
ROWS=[('RA',"alpha'\\😀"),('RAB',"alpha'\\😀"),('RB','βeta\nprivate'),('RD','unassigned'),('RO','ownerless')]
ACTORS={'umf_sec_alice':['RA','RAB'],'umf_sec_bob':['RAB','RB'],'umf_sec_outsider':[]}
def token(value,key):return hmac.new(key,value.encode('utf8'),hashlib.sha256).hexdigest()
def expected_rows(actor,key):
 return [{'id':id,'cell':{'field':{'documentId':'domain','moduleId':'m','elementId':'token'},'disposition':'original','storageEffect':'stored-transformed','storageTransform':{'catalog':'stored','revision':'1','id':'vault','version':'1'},'value':{'string':token(value,key)}}} for id,value in ROWS if id in ACTORS[actor]]
def expected_pairs(actor):return [[a,b] for a,x in ROWS for b,y in ROWS if a in ACTORS[actor] and b in ACTORS[actor] and x==y]
OBLIGATIONS=['stored-custody',*['propagation']*5,'vault-write-action','reverse-action']
PROPAGATION={'history':'declared','snapshots':'declared','exports':'declared','feeds':'declared','caches':'declared','dump':'excluded admin copies include tokens and vault plaintext/key material','replica':'replicated token/vault/key homes require equivalent excluded custody; unverified'}
def ref(name):return {'documentId':'domain','moduleId':'m','elementId':name}
TRANSFORM={'id':'vault','version':'1','kind':'tokenize','inputDomain':ref('clear'),'outputDomain':ref('token'),'determinism':'keyed-deterministic','reversibility':'vault','reverseAction':'reverse','disclosureProfile':['equality'],'queryUse':{},'parameters':[],'custody':{'owner':'host','vaultRef':'vault','vaultWriteAction':'vault-write','formatPreserving':False,'storageEffect':'stored-transformed','propagation':{k:PROPAGATION[k] for k in ['history','snapshots','exports','feeds','caches']}}}
STORAGE={'type':ref('Resource'),'field':ref('token'),'storageEffect':'stored-transformed','storageTransform':{'id':'vault','version':'1'}}
def domain(name):return {'id':name,'kind':'field','scalarType':'string','cardinality':'one','nullability':'required','extensions':{}}
