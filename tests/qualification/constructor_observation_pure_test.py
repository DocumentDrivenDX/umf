"""Pure synthetic controls. Never import UMF/native."""
import copy,hashlib,importlib.util,io,json,shutil,tempfile,types,unittest,zipfile
from unittest.mock import patch
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def load(name):
    p=ROOT/'tools'/name;s=importlib.util.spec_from_file_location(name,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
P=load('inspector_constructor_observation.py');PROBE=load('probe_inspector_constructor_prefix.py')
class PureConstructorObservationTests(unittest.TestCase):
    def sample(self):
        t=P.PrefixTrace(False,cap=2)
        for n in (4,0,7):t(n,'native-resource-conversion')
        r={**t.summary(),'completedHandle':False,'terminal':dict(P.TARGET['terminal'])}
        target={**{k:r[k] for k in ('total','eventCount','amountSequenceSHA256','terminal')},'deniedAmount':7,'deniedIndex':2}
        return t,r,target
    def test_fixed_slots_and_unknowns_refuse(self):
        self.assertEqual(len(P.SLOTS),124)
        for phase,root in [('ctor.madeup','core'),('ctor.preflight-root','foreign'),('ctor.preflight-root','conversion')]:
            with self.assertRaises(ValueError):P.slot_for(phase,root)
    def test_first_denial_and_no_event_history(self):
        t,r,target=self.sample();self.assertTrue(P.compare_prefix(r,target))
        self.assertFalse(hasattr(t,'history'));self.assertEqual(sum(t.events),3)
        with self.assertRaises(AssertionError):t(1,'native-resource-conversion')
        self.assertEqual(t.count,3)
    def test_label_only_digest_equivalence(self):
        a=P.PrefixTrace(False,2);b=P.PrefixTrace(True,2)
        for n in (4,0,7):a(n,'native-resource-compilation');b(n,'ctor.preflight-root','core')
        self.assertEqual(a.summary()['amountSequenceSHA256'],b.summary()['amountSequenceSHA256'])
    def test_every_original_comparison_refuses_drift(self):
        _,r,target=self.sample()
        for key,value in [('total',12),('eventCount',4),('amountSequenceSHA256','0'*64),('completedHandle',True),('afterDenial',1),('terminal',{})]:
            a=copy.deepcopy(r);a[key]=value
            with self.subTest(key=key),self.assertRaises(ValueError):P.compare_prefix(a,target)
        for key in ('firstDenial','lastEvent'):
            a=copy.deepcopy(r);a[key]['amount']=8
            with self.subTest(key=key),self.assertRaises(ValueError):P.compare_prefix(a,target)
    def test_slot_roster_and_reconciliation_refuse_drift(self):
        _,r,target=self.sample()
        for mutation in ('roster','work','events','negative'):
            a=copy.deepcopy(r)
            if mutation=='roster':a['slots'].pop()
            elif mutation=='negative':a['slots'][0]['work']=-1
            else:a['slots'][0][mutation]+=1
            with self.subTest(mutation=mutation),self.assertRaises(ValueError):P.compare_prefix(a,target)
    def test_protocol_and_cap_closed(self):
        for args in [(True,'native-resource-conversion'),(1,'ctor.visit'),(1,'native-resource-conversion','conversion')]:
            with self.assertRaises(ValueError):P.PrefixTrace(False)(*args)
        with self.assertRaises(ValueError):P.PrefixTrace(False,1000001)
    def fake(self,diverge=False):
        class UmfCoreError(Exception):
            def __init__(self,code,message,path):super().__init__(message);self.code=code;self.path=path
        def call(c,attributed):
            for n in (4,0,8 if attributed and diverge else 7):
                v=c(n,'ctor.visit','conversion') if attributed else c(n,'native-resource-conversion')
                if v:raise UmfCoreError(*v)
        return types.SimpleNamespace(create_codegen_resources=lambda r,c:call(c,False),create_codegen_resources_attributed=lambda r,c:call(c,True))
    def protocol(self):
        _,r,target=self.sample()
        return types.SimpleNamespace(TARGET=target,PrefixTrace=lambda attributed:P.PrefixTrace(attributed,2),compare_prefix=lambda r:P.compare_prefix(r,target))
    def test_complete_fake_run_two_fresh_inputs_and_receipt(self):
        seen=[]
        def resources():v={};seen.append(v);return v
        with tempfile.TemporaryDirectory() as d:
            out=Path(d)/'report.json'
            self.assertEqual(PROBE.observe(self.fake(),resources,self.protocol(),out,clock=lambda:0),0)
            self.assertIsNot(seen[0],seen[1])
            self.assertEqual(json.loads(out.read_text())['status'],'observed-matching-partial-refusals')
    def test_divergence_preserves_both_partial_receipts(self):
        with tempfile.TemporaryDirectory() as d:
            out=Path(d)/'report.json'
            with self.assertRaises(ValueError):PROBE.observe(self.fake(True),lambda:{},self.protocol(),out,clock=lambda:0)
            r=json.loads(out.read_text());self.assertEqual(set(r['prefixes']),{'ordinary','attributed'});self.assertIn('failure',r)
    def test_combined_deadline_never_resets(self):
        ticks=iter((0,0,0,0,0,301))
        with tempfile.TemporaryDirectory() as d:
            out=Path(d)/'report.json'
            with self.assertRaises(TimeoutError):PROBE.observe(self.fake(),lambda:{},self.protocol(),out,clock=lambda:next(ticks,302))
            r=json.loads(out.read_text());self.assertIn('ordinary',r['prefixes']);self.assertNotIn('attributed',r['prefixes'])
    def test_complete_mocked_original_intake_and_identity_refusals(self):
        driver=load('qualify_inspector_constructor_observation.py')
        origin={'run':41769192186,'source':'adbd76a85b78c077a23d39d9800b313e70cd6dd7','artifact':13296590740}
        receipt={'lifetimes':{'ordinary-construction':{'total':P.TARGET['total'],
                 'eventCount':P.TARGET['eventCount'],'amountSequenceSHA256':P.TARGET['amountSequenceSHA256'],
                 'phaseWork':{'native-resource-conversion':1208128,'native-resource-compilation':32847189},
                 'phaseEvents':{'native-resource-conversion':125749,'native-resource-compilation':874252},
                 'firstDenial':{'amount':1,'phase':'native-resource-compilation','cumulative':P.TARGET['total'],'index':1000000},
                 'lastEvent':{'amount':1,'phase':'native-resource-compilation','cumulative':P.TARGET['total'],'index':1000000}}},
                 'eventCapPerLifetime':1000000,'status':'partial',
                 'failure':{k:P.TARGET['terminal'][k] for k in ('type','code','message')}}
        raw=json.dumps(receipt).encode();zbytes=io.BytesIO()
        with zipfile.ZipFile(zbytes,'w') as z:z.writestr('work-attribution.json',raw)
        archive=zbytes.getvalue()
        origin.update(zipSHA256=hashlib.sha256(archive).hexdigest(),zipBytes=len(archive),receiptSHA256=hashlib.sha256(raw).hexdigest())
        for alteration in (None,'source','zip','receipt'):
            with self.subTest(alteration=alteration),tempfile.TemporaryDirectory() as d:
                root=Path(d);(root/'tools').mkdir();(root/'tests/qualification/fixtures').mkdir(parents=True);out=root/'out';out.mkdir()
                shutil.copyfile(ROOT/'tools/inspector_constructor_observation.py',root/'tools/inspector_constructor_observation.py')
                selected=copy.deepcopy(origin)
                if alteration=='receipt':selected['receiptSHA256']='0'*64
                (root/driver.FIXTURE).write_text(json.dumps({'original':selected}))
                meta={'expired':False,'workflow_run':{'id':41769192186,'head_sha':origin['source']},
                      'digest':'sha256:'+origin['zipSHA256'],'size_in_bytes':len(archive)}
                if alteration=='source':meta['workflow_run']['head_sha']='foreign'
                def api(argv,**kwargs):
                    return json.dumps(meta if '/artifacts/' in argv[-1] else
                        {'run_attempt':1,'head_sha':origin['source'],'conclusion':'failure'})
                def download(argv,stdout,**kwargs):stdout.write(archive+b'bad' if alteration=='zip' else archive)
                with patch.object(driver.subprocess,'check_output',side_effect=api),patch.object(driver.subprocess,'run',side_effect=download):
                    if alteration:
                        with self.assertRaises(ValueError):driver.intake(types.SimpleNamespace(root=root,out=out))
                    else:
                        driver.intake(types.SimpleNamespace(root=root,out=out))
                        self.assertFalse(json.loads((out/'authenticated-original-prefix.json').read_text())['originalNativeExecuted'])

if __name__=='__main__':unittest.main()
