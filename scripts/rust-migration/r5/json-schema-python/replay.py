#!/usr/bin/env python3
"""Replay frozen R5 JSON Schema calls through an installed Python profile."""
from __future__ import annotations
import hashlib, json, sys
from pathlib import Path
SELFTEST = sys.argv[1:] == ["--self-test"]
if not SELFTEST and len(sys.argv) != 4: raise SystemExit("usage: replay.py predecessor.json output.json label | --self-test")
predecessor_path, output_path, label = (None, None, "self-test") if SELFTEST else (Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3])
from umf import rust_json_schema as api

def norm(v):
    if type(v) is api.ExactJsonNumber: return float(v.lexeme)
    if type(v) is dict: return {k:norm(x) for k,x in v.items()}
    if type(v) is list: return [norm(x) for x in v]
    return v

def json_safe(v):
    """Keep exact numeric carriers serializable without discarding their lexeme."""
    if type(v) is api.ExactJsonNumber:
        return {"$type":"ExactJsonNumber","lexeme":v.lexeme,"jsNumber":float(v.lexeme)}
    if type(v) is dict:return {k:json_safe(x) for k,x in v.items()}
    if type(v) is list:return [json_safe(x) for x in v]
    return v

def ordered(v):
    """Retain JavaScript-observable insertion order during structural comparison."""
    if type(v) is dict: return {"$object":[[k,ordered(x)] for k,x in v.items()]}
    if type(v) is list: return [ordered(x) for x in v]
    return v

def outcome(fn):
    try: return {"status":"returned", "value":fn()}
    except Exception as e: return {"status":"threw", "name":type(e).__name__, "code":getattr(e,"code",None), "message":str(e)}

def doc(i,cid):
    if "document" in i:return i["document"]
    o=i.get("options",{"id":f"urn:umf:r5:{cid}","baseUri":"https://schemas.example.test/root.json"});rs=o.get("resources",i.get("resources",[]))
    if isinstance(rs,list):rs=dict(rs)
    return api.import_json_schema(i.get("schema",i.get("source")),o.get("id",i.get("id")),o.get("baseUri",i.get("baseUri")),rs)

def replay(c):
    cid,i=c["id"],c.get("input",{})
    if cid.startswith("import."):
        o=i.get("options")
        if o is None:return outcome(lambda:api.import_json_schema(i["text"],i["id"],i["baseUri"],dict(i.get("resources",[]))))
        rs=o.get("resources",[]);return outcome(lambda:api.import_json_schema(i["text"],o["id"],o["baseUri"],dict(rs) if isinstance(rs,list) else rs))
    if cid=="inspect-escaped-surrogate-key-diagnostic":return outcome(lambda:api.inspect(api.import_json_schema(i["source"],"urn:umf:r5:surrogate-diagnostic","https://schemas.example.test/root.json")))
    if cid=="copy-isolation-get-bundle-walk":
        d=i["document"]
        def run():
            s={"getNode":api.get_node(d,"/properties/x"),"bundle":api.export_json_schema_bundle(d),"walk":api.walk(d)};before=norm(s)
            s["getNode"]["kind"]="null";s["bundle"]["source"]["id"]="mutated";s["bundle"]["resources"]["https://schemas.example.test/z.json"]="mutated"
            if len(s["walk"])>1:s["walk"][1]["node"]["kind"]="null"
            reread={"getNode":api.get_node(d,"/properties/x"),"bundle":api.export_json_schema_bundle(d),"walk":api.walk(d)}
            return {"preMutationSnapshot":before,"mutatedReturnedCopies":norm(s),"postMutationRereads":norm(reread)}
        return outcome(run)
    d=doc(i,cid)
    if cid.startswith("inspect"):return outcome(lambda:api.inspect(d))
    if cid.startswith("export.bundle"):return outcome(lambda:api.export_json_schema_bundle(d))
    if cid.startswith("export.resources"):return outcome(lambda:api.export_json_schema_resources(d))
    if cid.startswith("export"):return outcome(lambda:api.export_json_schema(d))
    if cid=="get-and-walk-exclude-resource-tree":return outcome(lambda:{"get":outcome(lambda:api.get_node(d,i["pointer"])),"walk":api.walk(d)})
    if cid.startswith("get"):return outcome(lambda:api.get_node(d,i["pointer"]))
    if cid.startswith("walk"):return outcome(lambda:api.walk(d))
    raise ValueError(f"unmapped case {cid}")

def ep(c,e):
    cid,v=c["id"],e.get("value")
    if e["status"]!="returned":return e
    js_parse=lambda text:json.loads(text,parse_int=float,parse_float=float)
    if cid=="copy-isolation-get-bundle-walk":return {"status":"returned","value":project_copy(v,js_parse)}
    if cid.startswith("export.bundle"):v={"root":js_parse(v["schema"]),"resources":{k:js_parse(x) for k,x in v["resources"].items()},"source":v["source"],"diagnostics":v["diagnostics"]}
    elif cid.startswith("export.resources"):v={k:js_parse(x) for k,x in v.items()}
    elif cid.startswith("export"):v=js_parse(v)
    return {"status":"returned","value":norm(v)}
def ap(c,a):
    if a["status"]!="returned":return a
    v=a["value"]
    if c["id"]=="copy-isolation-get-bundle-walk":return {"status":"returned","value":project_copy(v,lambda text:json.loads(text,parse_int=float,parse_float=float))}
    if c["id"].startswith("export.bundle"):v={"root":v["root"],"resources":v["resources"],"source":v["source"],"diagnostics":v["diagnostics"]}
    return {"status":"returned","value":norm(v)}

def project_copy(v,parse_native):
    def bundle(b):
        if "schema" in b:
            root=parse_native(b["schema"])
            resources={k:(parse_native(x) if isinstance(x,str) and x!="mutated" else x) for k,x in b["resources"].items()}
        else:root,resources=b["root"],b["resources"]
        return {"root":norm(root),"resources":norm(resources),"source":norm(b["source"]),"diagnostics":norm(b["diagnostics"])}
    result={}
    for key,value in v.items():
        if key in ("preMutationSnapshot","postMutationRereads","mutatedReturnedCopies"):
            result[key]={k:(bundle(x) if k=="bundle" else norm(x)) for k,x in value.items()}
        else:result[key]=norm(value)
    return result

def outcomes_match(expected,actual):
    """Compare refusal code/message independent of Python/TypeScript class names."""
    def host_neutral(v):
        if type(v) is dict and v.get("status")=="threw":
            return {"status":"threw","code":v.get("code"),"message":v.get("message")}
        if type(v) is dict:return {k:host_neutral(x) for k,x in v.items()}
        if type(v) is list:return [host_neutral(x) for x in v]
        return v
    return ordered(host_neutral(expected))==ordered(host_neutral(actual))

def error_class_observations(expected,actual,path="$",out=None):
    out=[] if out is None else out
    if type(actual) is dict and actual.get("status")=="threw":
        out.append({"path":path,"python":actual.get("name"),"predecessor":expected.get("name") if type(expected) is dict else None,"equivalence":"not asserted; host exception classes remain distinct"})
    elif type(actual) is dict and type(expected) is dict:
        for key,value in actual.items():
            if key in expected:error_class_observations(expected[key],value,f"{path}/{key}",out)
    elif type(actual) is list and type(expected) is list:
        for index,(left,right) in enumerate(zip(expected,actual)):
            error_class_observations(left,right,f"{path}/{index}",out)
    return out
def number_check(c,a):
    cid=c["id"]
    n={"get.exact-negative-zero":"-0.000","export.exact-negative-zero":"-0.000","inspect-unknown-keyword-and-exact-unsafe-number":"9007199254740993","export-unknown-keyword-retained":"9007199254740993"}.get(cid)
    if n is None:return None
    v=a.get("value")
    def carriers(x):
        if type(x) is api.ExactJsonNumber:return [x.lexeme]
        if type(x) is dict:return sum((carriers(y) for y in x.values()),[])
        if type(x) is list:return sum((carriers(y) for y in x),[])
        return []
    target=v
    if cid=="get.exact-negative-zero":
        node=v.get("value") if type(v) is dict and v.get("kind")=="number" else None
        exact=(node.lexeme if type(node) is api.ExactJsonNumber else None)
        dump=api.dump_native_json(v)
        return {"expectedLexeme":n,"nodeKind":v.get("kind") if type(v) is dict else None,"exactCarrierLexeme":exact,"nativeDump":dump,"passed":exact==n and n in dump}
    if cid=="inspect-unknown-keyword-and-exact-unsafe-number":
        target=api.export_json_schema(c["input"]["document"])
    dump=api.dump_native_json(target) if type(target) is not str else target
    found=carriers(target)
    return {"expectedLexeme":n,"exactCarrierLexemes":found,"nativeDump":dump,"passed":n in found and n in dump}

if SELFTEST:
    expected={"status":"threw","name":"UmfError","code":"JSON_SCHEMA_POINTER","message":"missing"}
    actual={"status":"threw","name":"UmfCoreError","code":"JSON_SCHEMA_POINTER","message":"missing"}
    assert outcomes_match(expected,actual)
    assert not outcomes_match(expected,{**actual,"code":"OTHER"})
    assert not outcomes_match(expected,{**actual,"message":"different"})
    nested_expected={"status":"returned","value":{"get":expected,"walk":[]}}
    nested_actual={"status":"returned","value":{"get":actual,"walk":[]}}
    assert outcomes_match(nested_expected,nested_actual)
    assert not outcomes_match(nested_expected,{"status":"returned","value":{"get":{**actual,"code":"OTHER"},"walk":[]}})
    assert not outcomes_match(nested_expected,{"status":"returned","value":{"get":{**actual,"message":"different"},"walk":[]}})
    frozen=json.loads((Path(__file__).resolve().parents[4]/"docs/helix/04-build/evidence/rust-migration/r5-json-schema-bindings/predecessor.json").read_text())
    synthetic=[]
    for index,case in enumerate(frozen["cases"]):
        raw_actual=api.ExactJsonNumber("-0.000") if index==0 else case["outcome"]
        synthetic.append({"id":case["id"],"actual":json_safe(raw_actual)})
    encoded=json.dumps({"caseCount":len(synthetic),"results":synthetic},ensure_ascii=True)
    decoded=json.loads(encoded)
    assert decoded["caseCount"]==30 and len(decoded["results"])==30
    assert decoded["results"][0]["actual"]["lexeme"]=="-0.000"
    node_case={"id":"get.exact-negative-zero"}
    node_outcome={"status":"returned","value":{"kind":"number","value":api.ExactJsonNumber("-0.000")}}
    assert number_check(node_case,node_outcome)["passed"]
    bundle_source={"id":"source"};diagnostics=[]
    js_copy={"preMutationSnapshot":{"getNode":{"kind":"null"},"bundle":{"schema":"{\"x\":1}","resources":{"u":"true"},"source":bundle_source,"diagnostics":diagnostics},"walk":[]}}
    py_copy={"preMutationSnapshot":{"getNode":{"kind":"null"},"bundle":{"root":{"x":1},"resources":{"u":True},"source":bundle_source,"diagnostics":diagnostics},"walk":[]}}
    assert project_copy(js_copy,lambda text:json.loads(text,parse_int=float,parse_float=float))==project_copy(py_copy,lambda text:json.loads(text,parse_int=float,parse_float=float))
    print("Python replay self-tests passed: refusal code/message mismatch detection and 30-row exact-number-safe receipt serialization")
    raise SystemExit(0)

raw=predecessor_path.read_bytes();p=json.loads(raw);rows=[]
def receipt(status):
    return {"format":"umf-r5-json-schema-python-replay-v1","status":status,"parity":"matched" if status=="complete" and len(rows)==len(p["cases"]) and all(x["matched"] for x in rows) else ("non-parity" if status=="complete" and len(rows)==len(p["cases"]) else "incomplete"),"label":label,"runtime":{"python":sys.version.split()[0],"implementation":sys.implementation.name},"profile":api.profile_version(),"predecessorSha256":hashlib.sha256(raw).hexdigest(),"sourceArtifactProvenance":{"replayScript":str(Path(__file__).resolve()),"replayScriptSha256":hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),"pythonModule":str(Path(api.__file__).resolve()),"pythonModuleSha256":hashlib.sha256(Path(api.__file__).read_bytes()).hexdigest(),"nativeExtension":str(Path(api._rust._rust_core.__file__).resolve()),"nativeExtensionSha256":hashlib.sha256(Path(api._rust._rust_core.__file__).read_bytes()).hexdigest()},"caseCount":len(p["cases"]),"completedCaseCount":len(rows),"matched":sum(x["matched"] for x in rows),"results":rows}
partial_path=Path(str(output_path)+".partial.json")
output_path.parent.mkdir(parents=True,exist_ok=True)
for c in p["cases"]:
    print(f"{label}: case {len(rows)+1}/{len(p['cases'])} {c['id']}",file=sys.stderr,flush=True)
    a=replay(c);x,y=ep(c,c["outcome"]),ap(c,a)
    obs=error_class_observations(c["outcome"],a)
    exact_check=number_check(c,a)
    matched=outcomes_match(x,y) and (exact_check is None or exact_check["passed"])
    rows.append({"id":c["id"],"matched":matched,"expectedProjection":json_safe(x),"actualProjection":json_safe(y),"actual":json_safe(a),"errorClassObservation":obs,"exactNumberCheck":exact_check})
    partial_path.write_text(json.dumps(receipt("incomplete"),ensure_ascii=True,indent=2)+"\n")
r=receipt("complete")
output_path.write_text(json.dumps(r,ensure_ascii=True,indent=2)+"\n")
partial_path.unlink(missing_ok=True)
print(json.dumps({"label":label,"cases":len(rows),"matched":r["matched"],"profile":r["profile"],"predecessorSha256":r["predecessorSha256"]}))
