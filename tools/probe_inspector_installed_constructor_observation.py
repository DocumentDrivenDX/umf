#!/usr/bin/env python3
"""One bounded observation of the unchanged installed C2 constructor. Never qualify."""
import argparse
import bisect
from collections import deque
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import time

LIMIT=1000000
PROFILE='umf.private-installed-constructor-observation/1'
_ACTIVE=set()

class ObservationFailure(RuntimeError):pass

def require(value,message):
    if not value:raise ObservationFailure(message)


def error_fields(error):
    # No user __str__, formatting hook, Core callback or error re-encoding.
    fields=vars(error) if hasattr(error,'__dict__') else {}
    result={'type':type(error).__name__}
    for name in ('code','path'):
        value=fields.get(name)
        if type(value) is str:result[name]=value[:1024]
    if error.args and type(error.args[0]) is str:result['message']=error.args[0][:1024]
    return result


def encoded(value):return json.dumps(value,ensure_ascii=True,sort_keys=True,separators=(',',':')).encode('ascii')


class Recorder:
    """Fixed slots, bounded tail, streaming begin-order digest; no event history."""
    def __init__(self,bounds,phases,clock=time.monotonic,progress=None):
        require(len(phases)<=128 and len(set(phases))==len(phases) and 'unknown-metadata' in phases,'phase roster')
        self.bounds=bounds;self.clock=clock;self.start=None;self.events=0;self.progress=progress
        self.tail=deque(maxlen=bounds['tail']);self.digest=hashlib.sha256();self.first=None;self.last=None
        self.failure=None
        try:self.start=clock()
        except BaseException:self.failure='observer-clock-setup'
        self.terminal=False;self.denied=None;self.denied_native=None;self.stack={'status':'not-attempted'};self.stack_attempted=False
        self.streams={k:dict(count=0,positive=0,zero=0,attemptedWork=0,acceptedWork=0,acceptedCount=0) for k in ('host','native')}
        self.phases={p:dict(count=0,attemptedWork=0,acceptedWork=0) for p in phases}
    def fail(self,message):
        if self.failure is None:self.failure=message
    def begin(self,stream,args,kwargs):
        if self.terminal:
            self.fail('callback-after-first-denial')
            raise ObservationFailure('callback-after-first-denial')
        try:return self._begin(stream,args,kwargs)
        except BaseException:
            self.fail('observer-metadata-failure');return None
    def _begin(self,stream,args,kwargs):
        if self.terminal:
            self.fail('callback-after-first-denial')
            raise ObservationFailure('callback-after-first-denial')
        if self.failure is not None:return None
        if self.clock()-self.start>=self.bounds['seconds']:self.fail('observer-time-bound');return None
        if self.events>=self.bounds['events']:self.fail('observer-event-bound');return None
        if not args or type(args[0]) is not int or args[0]<0 or args[0]>2**32-1:
            self.fail('observer-invalid-amount');return None
        amount=args[0];phase=args[1] if stream=='native' and len(args)>1 else ('host' if stream=='host' else None)
        # Original arguments are NEVER modified; only this diagnostic label is bucketed.
        label=phase if type(phase) is str and phase in self.phases else 'unknown-metadata'
        self.events+=1;counter=self.streams[stream];counter['count']+=1
        counter['positive' if amount else 'zero']+=1;counter['attemptedWork']+=amount
        if stream=='native':self.phases[label]['count']+=1;self.phases[label]['attemptedWork']+=amount
        if phase is not None and (type(phase) is not str or len(phase)>256):self.fail('observer-phase-shape')
        row={'event':self.events,'stream':stream,'amount':amount,'phase':label,'phaseMetadata':phase if phase is None or type(phase)is str and len(phase)<=256 else None}
        self.digest.update(encoded(row)+b'\n');self.tail.append(row)
        if self.first is None:self.first=dict(row)
        self.last=dict(row)
        if self.progress is not None and self.events%16384==0:
            try:self.progress(self.receipt())
            except BaseException:self.fail('observer-partial-storage')
        return row
    def accepted(self,row):
        if row is None:return
        counter=self.streams[row['stream']];counter['acceptedWork']+=row['amount'];counter['acceptedCount']+=1
        if row['stream']=='native':self.phases[row['phase']]['acceptedWork']+=row['amount']
    def refused(self,row,error):
        if not self.terminal:
            self.terminal=True;self.denied={'event':row,'error':error_fields(error)}
    def receipt(self):
        return {'events':self.events,'streams':self.streams,'phaseTotals':self.phases,
                'orderedBeginStreamSHA256':self.digest.hexdigest(),'eventSerialization':'sorted ASCII JSON + LF; BEGIN order, native encloses host; returns tracked in counters only',
                'first':self.first,'last':self.last,'denied':self.denied,'deniedNative':self.denied_native,'tail':list(self.tail),
                'observerFailure':self.failure,'countersComplete':self.failure is None,'stack':self.stack}


class ELFImage:
    """Bounded ELF64LE read-only symtab, no DWARF, executable loading or guesses."""
    def __init__(self,path,expected_hash,expected_bytes,expected_entries):
        self.path=Path(path).resolve();require(self.path.stat().st_size==expected_bytes,'ELF size')
        state=hashlib.sha256()
        with self.path.open('rb') as f:
            while block:=f.read(1048576):state.update(block)
        require(state.hexdigest()==expected_hash,'ELF hash')
        self.loads=[];self.symbols=[]
        with self.path.open('rb') as f:
            def read(offset,length):
                require(type(offset)is int and type(length)is int and 0<=offset<=expected_bytes and 0<=length<=16777216 and offset+length<=expected_bytes,'ELF read range')
                f.seek(offset);data=f.read(length);require(len(data)==length,'ELF truncated');return data
            head=read(0,64);require(head[:7]==b'\x7fELF\x02\x01\x01','ELF format')
            fields=struct.unpack('<HHIQQQIHHHHHH',head[16:]);typ,machine=fields[:2]
            require((typ,machine)==(3,62),'ELF owner platform')
            phoff,shoff=fields[4:6];phsize,phcount,shsize,shcount=fields[8:12]
            require(phsize==56 and phcount<=128 and shsize==64 and shcount<=256,'ELF table bounds')
            for i in range(phcount):
                item=struct.unpack('<IIQQQQQQ',read(phoff+i*phsize,56))
                if item[0]==1:
                    _,flags,offset,vaddr,_,filesz,memsz,_=item
                    require(filesz<=memsz and offset+filesz<=expected_bytes and vaddr+memsz<2**64,'ELF load bounds')
                    self.loads.append((offset,vaddr,filesz,memsz,flags))
            sections=[struct.unpack('<IIQQQQIIQQ',read(shoff+i*shsize,64)) for i in range(shcount)]
            tables=[x for x in sections if x[1]==2];require(len(tables)==1,'ELF static symtab')
            table=tables[0];require(table[9]==24 and table[5]//24==expected_entries and table[5]%24==0 and table[6]<len(sections),'ELF symtab shape')
            strings=sections[table[6]];require(strings[1]==3,'ELF string table type')
            names=read(strings[4],strings[5]);symbols=read(table[4],table[5])
            for i in range(expected_entries):
                name,info,_,section,value,size=struct.unpack_from('<IBBHQQ',symbols,i*24)
                if section and (info&15)==2 and value and name<len(names):
                    end=names.find(b'\0',name,min(len(names),name+1025))
                    if end<0:continue
                    self.symbols.append((value,size,names[name:end].decode('utf-8','replace')))
        self.symbols.sort();self.addresses=[row[0] for row in self.symbols]
    def map_pc(self,pc,maps):
        require(type(pc)is int and 0<=pc<2**64,'PC range')
        matches=[];stat=self.path.stat()
        for line in maps.splitlines():
            cells=line.split(maxsplit=5)
            if len(cells)!=6 or cells[5]!=str(self.path):continue
            span,permissions,offset,device,inode,_=cells;start,end=(int(v,16) for v in span.split('-'))
            major,minor=(int(v,16) for v in device.split(':'))
            import os
            require(int(inode)==stat.st_ino and (major,minor)==(os.major(stat.st_dev),os.minor(stat.st_dev)),'ELF mapped owner inode')
            if start<=pc<end and 'x' in permissions:
                fileoffset=pc-start+int(offset,16)
                for origin,virtual,filesz,_,flags in self.loads:
                    if flags&1 and origin<=fileoffset<origin+filesz:matches.append(fileoffset-origin+virtual)
        if len(matches)!=1:return {'pc':hex(pc),'status':'unknown-image-or-segment'}
        address=matches[0];i=bisect.bisect_right(self.addresses,address)-1
        if i<0:return {'pc':hex(pc),'nativeVirtualAddress':hex(address),'status':'unknown-symbol'}
        value,size,name=self.symbols[i]
        return {'pc':hex(pc),'nativeVirtualAddress':hex(address),'nearestSymbol':name,'symbolOffset':address-value,
                'withinSymbolExtent':size>0 and address-value<size,'status':'nearest-symbol-only','sourceLine':'UNKNOWN','inlinedFrames':'UNKNOWN'}


class StackSnapshot:
    def __init__(self,image,backtrace,buffer,limit,read_maps):
        self.image=image;self.backtrace=backtrace;self.buffer=buffer;self.limit=limit;self.read_maps=read_maps;self.attempted=False
    @classmethod
    def prepare(cls,native_path,pins):
        # Called ONLY in the admitted hosted observation, never at import/test time.
        import ctypes
        image=ELFImage(native_path,pins['nativeMember']['sha256'],pins['stack']['nativeBytes'],pins['stack']['symtabEntries'])
        library=ctypes.CDLL(None)
        function=library.backtrace;function.argtypes=[ctypes.POINTER(ctypes.c_void_p),ctypes.c_int];function.restype=ctypes.c_int
        buffer=(ctypes.c_void_p*64)()
        def maps():
            with Path('/proc/self/maps').open('r') as stream:value=stream.read(1048577)
            require(len(value.encode())<=1048576 and len(value.splitlines())<=4096,'ELF maps bound');return value
        obj=cls(image,function,buffer,64,maps);obj.library=library;return obj
    def capture(self):
        require(not self.attempted,'second-stack-attempt');self.attempted=True
        count=self.backtrace(self.buffer,self.limit)
        require(type(count)is int and 0<count<=self.limit,'stack-return-bound')
        pcs=[self.buffer[i] for i in range(count)];maps=self.read_maps()
        return {'status':'captured','pcs':pcs,'frames':[self.image.map_pc(pc,maps) for pc in pcs],
                'possiblyTruncated':count==self.limit,'mapping':'authenticated ELF static symbols, no DWARF or source lines'}


def observe_once(compiler,native,pins,stack=None,clock=time.monotonic,progress=None):
    """Diagnostics cannot replace any original delegated return or exception."""
    record=Recorder(pins['bounds'],pins['phaseNames'],clock,progress)
    old_host=compiler._host_work;old_export=native.create_installed_codegen_resources
    original_control=compiler._native_control
    counts={'hostFactories':0,'nativeExports':0,'constructorCalls':0};original_error=None;completed=False
    observer_failure=[None];terminal_error=[None]
    def latch(label):
        # Independent fixed storage; never call another fallible diagnostic to
        # report the first diagnostic failure, especially while raising Core's error.
        if observer_failure[0] is None:observer_failure[0]=label
    def diagnostic(label,action,*args):
        try:return action(*args)
        except BaseException:latch(label);return None
    def before(stream,items,named):
        if terminal_error[0] is not None:
            latch('callback-after-first-denial')
            raise terminal_error[0]
        return diagnostic('observer-begin-'+stream,record.begin,stream,items,named)
    def refusal(row,error,native_event=False):
        record.refused(row,error)
        if native_event and record.denied_native is None:
            record.denied_native={'event':row,'error':error_fields(error)}
    def stack_before(row):
        if row is not None and not record.stack_attempted and row['amount']+record.streams['host']['acceptedWork']>LIMIT:
            record.stack_attempted=True
            try:record.stack=stack.capture() if stack is not None else {'status':'unavailable-no-stack-backend'}
            except BaseException as error:record.stack={'status':'unavailable','errorType':type(error).__name__}
    def native_completion(row,delegate):
        if delegate.failure is None:record.accepted(row)
        elif record.denied_native is None:record.denied_native={'event':row,'error':error_fields(delegate.failure)}
    def host_factory(*args,**kwargs):
        counts['hostFactories']+=1;require(counts['hostFactories']==1,'second-host-work-factory')
        require(args==(LIMIT,None,None,None,None) and not kwargs,'changed-public-defaults')
        delegate=old_host(*args,**kwargs)
        def work(*items,**named):
            row=before('host',items,named)
            try:result=delegate(*items,**named)
            except BaseException as error:
                if terminal_error[0] is None:terminal_error[0]=error
                diagnostic('observer-refused-host',refusal,row,error)
                raise
            diagnostic('observer-accepted-host',record.accepted,row)
            return result
        return work
    def export(*args,**kwargs):
        counts['nativeExports']+=1;require(counts['nativeExports']==1 and len(args)==1 and not kwargs,'native-export-protocol')
        delegate=args[0]
        class Forward:
            @property
            def failure(self):return delegate.failure
            def __call__(self,*items,**named):
                row=before('native',items,named)
                diagnostic('observer-stack-metadata',stack_before,row)
                try:result=delegate(*items,**named)
                except BaseException as error:
                    if terminal_error[0] is None:terminal_error[0]=error
                    diagnostic('observer-refused-native',refusal,row,error,True)
                    raise
                diagnostic('observer-completed-native',native_completion,row,delegate)
                # Exact original result/failure, even if any preceding diagnostic
                # failed. No tuple/error normalization and no second delegate.
                return result
        return old_export(Forward())
    require(id(compiler) not in _ACTIVE,'observer-reentry')
    _ACTIVE.add(id(compiler))
    try:
        compiler._host_work=host_factory;native.create_installed_codegen_resources=export
        counts['constructorCalls']+=1
        compiler.CodegenEngine.from_installed(max_work=LIMIT)
        completed=True
    except BaseException as error:
        original_error=error
        if isinstance(error,ObservationFailure):latch('observer-protocol')
    finally:
        compiler._host_work=old_host;native.create_installed_codegen_resources=old_export
        _ACTIVE.remove(id(compiler))
    if compiler._native_control is not original_control:latch('original-native-control-replaced')
    if counts!={'hostFactories':1,'nativeExports':1,'constructorCalls':1}:latch('constructor-protocol-counts')
    value=diagnostic('observer-receipt',record.receipt)
    if value is None:
        # No fabricated counters/digest when even the diagnostic snapshot failed.
        value={'events':None,'streams':None,'phaseTotals':None,'orderedBeginStreamSHA256':None,
               'first':None,'last':None,'denied':None,'deniedNative':None,'tail':[],
               'observerFailure':None,'countersComplete':False,'stack':{'status':'unknown-diagnostic-failure'}}
    summary=diagnostic('observer-error-summary',error_fields,original_error) if original_error is not None else None
    if original_error is not None and summary is None:summary={'type':type(original_error).__name__,'summaryUnavailable':True}
    def comparison():
        baseline=pins['baseline'];host=value['streams']['host'];denied=value['denied']
        amount=denied['event']['amount'] if denied and denied['event'] else None
        return host['acceptedWork']==baseline['acceptedHostWork'] and host['attemptedWork']==baseline['attemptedHostWork'] and amount==baseline['refusedCharge']
    matches=diagnostic('observer-baseline-comparison',comparison) if value['streams'] is not None else False
    if value.get('observerFailure') is not None:latch(value['observerFailure'])
    failure=observer_failure[0]
    value.update(profile=PROFILE,inputProfile='installed-canonical/1',maximumWork=LIMIT,
        counts=counts,constructorCompleted=completed,error=summary,observerFailure=failure,
        countersComplete=value['countersComplete'] and failure is None,
        status='failed-observation' if failure is not None else ('constructor-completed-unqualified' if completed else 'constructor-refused'),
        hostAuthoritative=True,nativeSubsetNotAdditive=True,publishable=False,readyForEnrollment=False,
        baselineComparison={'totalsMatch':failure is None and matches is True,
            'originalPhaseSequenceCounts':'UNRECORDED; no equality claim','newRunOnlyDigest':True})
    return value


def write_receipt(path,value,limit):
    data=encoded(value)+b'\n';require(len(data)<=limit,'observation-receipt-bound')
    with path.open('xb') as f:f.write(data)


def run(args):
    spec=importlib.util.spec_from_file_location('observation_intake',args.controller/'tools/intake_inspector_installed_observation.py')
    intake=importlib.util.module_from_spec(spec);spec.loader.exec_module(intake)
    pins=intake.fixture(args.controller);intake.identity(args,'before')
    try:
        import umf.rust_codegen as compiler
        import umf._rust_core as native
        stack=None;setup={'status':'disabled'}
        if pins['stack']['enabled']:
            try:stack=StackSnapshot.prepare(Path(native.__file__),pins);setup={'status':'ready'}
            except Exception as error:setup={'status':'unavailable','errorType':type(error).__name__}
        def partial(value):
            value={'profile':PROFILE,'status':'incomplete-observation','runtimeSource':pins['runtimeSource'],'observerController':args.controller_sha,'partial':value}
            data=encoded(value)+b'\n';require(len(data)<=pins['bounds']['receiptBytes'],'partial receipt size')
            temporary=args.out/'observation.partial.tmp'
            with temporary.open('xb') as stream:stream.write(data)
            temporary.replace(args.out/'observation.partial.json')
        partial({'started':True,'constructorCalls':0})
        report=observe_once(compiler,native,pins,stack,progress=partial)
        report.update(runtimeSource=pins['runtimeSource'],observerController=args.controller_sha,
                      originalProducer=pins['parent'],observerRun=args.observer_run,observerAttempt=args.observer_attempt,
                      stackSetup=setup,diagnosticFinalization='after constructor unwind; no Core callbacks')
        write_receipt(args.out/'observation.json',report,pins['bounds']['receiptBytes'])
        return 0 if report['status']!='failed-observation' else 1
    finally:
        intake.identity(args,'after')
        write_receipt(args.out/'identity-pair.json',{'runtimeSource':pins['runtimeSource'],'observerController':args.controller_sha,
            'beforeSHA256':intake.sha(args.out/'identity-before.json'),'afterSHA256':intake.sha(args.out/'identity-after.json'),
            'recordsBeforeSHA256':intake.sha(args.out/'installed-record-before.json'),'recordsAfterSHA256':intake.sha(args.out/'installed-record-after.json'),
            'publishable':False,'readyForEnrollment':False},pins['bounds']['receiptBytes'])


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    for name in ('controller','owner','wheel','out'):parser.add_argument('--'+name,type=Path,required=True)
    for name in ('controller-sha','observer-run','observer-attempt'):parser.add_argument('--'+name,required=True)
    raise SystemExit(run(parser.parse_args()))
