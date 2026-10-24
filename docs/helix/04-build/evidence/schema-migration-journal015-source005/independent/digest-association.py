import copy,runpy,json,pathlib
ns=runpy.run_path(str(pathlib.Path(__file__).parent/'probe.py'))
codec,doc,kw=ns['codec'],ns['doc'],ns['kw']
out=[]
for field,value in [('registrationDigest','not-a-digest'),('registrationDigest','0'*64)]:
    changed=copy.deepcopy(doc);mapping={};previous=changed['anchorDigest']
    def remap(v):
        if isinstance(v,str):return mapping.get(v,v)
        if isinstance(v,list):return [remap(x) for x in v]
        if isinstance(v,dict):return {k:remap(x) for k,x in v.items()}
        return v
    for e in changed['events']:
        old=e['recordDigest'];e['payload']=remap(e['payload'])
        if e['kind']=='originals-store-creation-intent':
            payload=e['payload'];prior=payload['reservationDigest']
            payload['reservation']['targetCustody'][field]=value
            payload['reservationDigest']=codec.digest(payload['reservation'])
            mapping[prior]=payload['reservationDigest']
        e['previousDigest']=previous;e['recordDigest']=codec.digest({k:e[k] for k in ('sequence','kind','payload','previousDigest')});mapping[old]=e['recordDigest'];previous=e['recordDigest']
    changed['headDigest']=previous
    try:codec.validate_record(codec.canonical(changed),**kw);accepted=True;error=None
    except codec.SupervisorJournalCodecError as exc:accepted=False;error=exc.code
    out.append({'field':field,'value':value,'accepted':accepted,'error':error})
path=pathlib.Path(__file__).parent/'digest-association-results.json';path.write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out))
