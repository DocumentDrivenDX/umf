"""Independent flatc decode comparison, preserving Python's exact JSON integers."""
from pathlib import Path
import json,subprocess,os,sys
base=Path('fixtures/arrow/metadata');out=Path('.cache/flatc/metadata');out.mkdir(parents=True,exist_ok=True)
exe=os.environ.get('UMF_FLATC_PATH','.cache/flatc/root/usr/bin/flatc');env=dict(os.environ,LD_LIBRARY_PATH=os.environ.get('UMF_FLATC_LIBRARY_PATH',str(Path('.cache/flatc/root/usr/lib/aarch64-linux-gnu').resolve())))
version=subprocess.check_output([exe,'--version'],env=env,text=True).strip();assert version=='flatc version 23.5.26'
decls={d['name']:d for d in json.loads(Path('spec/extensions/arrow/flatbuffer-inventory.json').read_text())['definitions']}
def logical(name,value):
    name=name.replace('org.apache.arrow.flatbuf.','').strip()
    if name.startswith('['):return [logical(name[1:-1].strip(),v) for v in value]
    if name=='long':return str(value)
    if name not in decls or decls[name]['kind']=='enum':return value
    result={}
    for field in decls[name]['fields']:
        key=field['name'];type=field['type'].replace('org.apache.arrow.flatbuf.','')
        if type in decls and decls[type]['kind']=='union':
            if key+'_type' not in value:continue
            tag=value[key+'_type'];result[key]={'type':tag}
            if tag!='NONE':result[key]['value']=logical(tag,value[key])
        elif key in value:result[key]=logical(type,value[key])
    return result
checked=[]
encoded='--encoded' in sys.argv
cases=json.loads((base/'manifest.json').read_text())['cases']
if encoded:cases += [{'file':'edited-schema.bin','rootType':'Schema'},{'file':'explicit-defaults.bin','rootType':'Message'}]
for case in cases:
    file=case['file']+('.encoded.bin' if encoded else '')
    fbs='File' if case['rootType']=='Footer' else case['rootType']
    subprocess.run([exe,'--json','--strict-json','--raw-binary','-I','spec/extensions/arrow/flatbuffers','-o',str(out),'spec/extensions/arrow/flatbuffers/'+fbs+'.fbs','--',str(base/file)],env=env,check=True,capture_output=True)
    native=json.loads((out/(Path(file).stem+'.json')).read_text())
    expected={'rootType':case['rootType'],'value':logical(case['rootType'],native)}
    actual=json.loads((base/(case['file']+'.umf.json')).read_text())
    assert actual==expected,(case['file'],actual,expected)
    checked.append(case['file'])
(base/('encoded-oracle-results.json' if encoded else 'oracle-results.json')).write_text(json.dumps({'oracle':version,'equalMetadataRoots':len(checked),'files':checked,'scope':'Known decoded metadata fields, present-field defaults, ordered metadata, exact int64 and unions. No complete binary verification or data semantic validation.'},indent=2)+'\n');print({'equalMetadataRoots':len(checked)})
