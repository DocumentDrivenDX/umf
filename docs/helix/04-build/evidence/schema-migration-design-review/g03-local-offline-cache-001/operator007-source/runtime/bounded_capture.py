#!/usr/bin/env python3
"""Small stdlib-only process capture helper for the table lane."""
from __future__ import annotations
import hashlib, os, pathlib, selectors, signal, stat, subprocess, time

OUTER_STREAM_LIMIT=128*1024
OUTER_CAPTURE_LIMIT=256*1024
TERM_GRACE_SECONDS=10
READ_CHUNK=65536

def _fail(message):
    raise RuntimeError(message)

def bounded_capture(proc:subprocess.Popen, log_dir:pathlib.Path, name:str, deadline:float,
                    prefix:str='docker', *, aggregate_remaining:int=OUTER_CAPTURE_LIMIT)->dict:
    """Capture a child with one shared byte cap and an absolute wall deadline.

    The deadline includes termination grace. SIGTERM begins at deadline minus
    ten seconds; at the absolute deadline the process group is killed and any
    remaining pipes are closed. Truncation, timeout, drain failure, or I/O
    errors are represented in the returned record and must fail the caller.
    """
    if type(aggregate_remaining) is not int or aggregate_remaining<=0:
        _fail('no aggregate outer-capture allowance remains')
    paths=[log_dir/(prefix+'.stdout.log'),log_dir/(prefix+'.stderr.log')]
    streams=[proc.stdout,proc.stderr]
    if any(s is None for s in streams): _fail('child process streams were not captured')
    files=[]; hashes=[hashlib.sha256(),hashlib.sha256()]
    retained=[0,0]; raw=[0,0]; truncated=[False,False]; eof=[False,False]
    selector=selectors.DefaultSelector(); errors=[]
    byte_cap=min(OUTER_CAPTURE_LIMIT,aggregate_remaining)
    stop_at=max(time.monotonic(),deadline-TERM_GRACE_SECONDS)
    timed_out=False; drain_expired=False; stop_sent=False
    kill_deadline=deadline
    try:
        for p in paths: files.append(p.open('xb'))
        for i,s in enumerate(streams):
            os.set_blocking(s.fileno(),False);selector.register(s,selectors.EVENT_READ,i)
        while selector.get_map() or proc.poll() is None:
            now=time.monotonic()
            if now>=stop_at and not stop_sent and proc.poll() is None:
                stop_sent=True;timed_out=True;kill_deadline=min(deadline,now+TERM_GRACE_SECONDS)
                try: os.killpg(proc.pid,signal.SIGTERM)
                except ProcessLookupError: pass
            if now>=kill_deadline:
                if not all(eof):drain_expired=True
                if proc.poll() is None:
                    drain_expired=True
                    try: os.killpg(proc.pid,signal.SIGKILL)
                    except ProcessLookupError: pass
                for key in list(selector.get_map().values()):
                    try: selector.unregister(key.fileobj);key.fileobj.close()
                    except (KeyError,OSError) as exc: errors.append('pipe-close '+type(exc).__name__)
                break
            for key,_ in selector.select(min(.2,max(.001,kill_deadline-now))):
                i=key.data
                try: data=os.read(key.fileobj.fileno(),min(READ_CHUNK,byte_cap-sum(retained)+1))
                except BlockingIOError: continue
                except OSError as exc:
                    errors.append('pipe-read '+type(exc).__name__);continue
                if not data:
                    eof[i]=True;selector.unregister(key.fileobj);key.fileobj.close();continue
                hashes[i].update(data);raw[i]+=len(data)
                allowance=max(0,min(OUTER_STREAM_LIMIT-retained[i],byte_cap-sum(retained)))
                if allowance:
                    keep=data[:allowance];files[i].write(keep);retained[i]+=len(keep)
                if len(data)>allowance:
                    truncated[i]=True
                    if not stop_sent and proc.poll() is None:
                        stop_sent=True;timed_out=True;kill_deadline=min(deadline,time.monotonic()+TERM_GRACE_SECONDS)
                        try: os.killpg(proc.pid,signal.SIGTERM)
                        except ProcessLookupError: pass
                    elif stop_sent:
                        kill_deadline=min(kill_deadline,deadline,time.monotonic()+TERM_GRACE_SECONDS)
        if proc.poll() is None:
            try: proc.wait(timeout=max(.001,min(1,deadline-time.monotonic())))
            except subprocess.TimeoutExpired:
                drain_expired=True
                try: os.killpg(proc.pid,signal.SIGKILL)
                except ProcessLookupError: pass
    except BaseException as exc:
        errors.append('capture '+type(exc).__name__+': '+str(exc)[:160])
        if not stop_sent:
            stop_sent=True;timed_out=True;kill_deadline=min(deadline,time.monotonic()+TERM_GRACE_SECONDS)
            try: os.killpg(proc.pid,signal.SIGTERM)
            except ProcessLookupError: pass
        if proc.poll() is None:
            try: proc.wait(timeout=max(.001,min(TERM_GRACE_SECONDS,kill_deadline-time.monotonic())))
            except subprocess.TimeoutExpired:
                try: os.killpg(proc.pid,signal.SIGKILL)
                except ProcessLookupError: pass
    finally:
        try: selector.close()
        except BaseException as exc: errors.append('selector-close '+type(exc).__name__)
        for i,s in enumerate(streams):
            try:
                if s is not None:s.close()
            except BaseException as exc: errors.append(f'stream-close[{i}] '+type(exc).__name__)
        for i,f in enumerate(files):
            for op in ('flush','fsync','close'):
                try:
                    if op=='flush':f.flush()
                    elif op=='fsync':os.fsync(f.fileno())
                    else:f.close()
                except BaseException as exc:errors.append(f'{op}[{i}] '+type(exc).__name__)
    return {'paths':[str(p) for p in paths],'retainedBytes':retained,'rawBytes':raw,
        'rawSha256':[h.hexdigest() for h in hashes],'truncated':truncated,'timedOut':timed_out,
        'drainExpired':drain_expired,'totalRetainedBytes':sum(retained),'streamsEOF':eof,
        'exitCode':proc.returncode,'deadlineMonotonic':deadline,'captureFailed':bool(errors),'captureErrors':errors}

def verify_outer_capture(captured:dict)->dict:
    paths=captured.get('paths',[]);retained=captured.get('retainedBytes',[])
    raw_hashes=captured.get('rawSha256',[]);truncated=captured.get('truncated',[])
    if not(len(paths)==len(retained)==len(raw_hashes)==len(truncated)==2):
        return {'verified':False,'files':[],'errors':['outer capture roster is incomplete']}
    rows=[];errors=[]
    for i,path_text in enumerate(paths):
        p=pathlib.Path(path_text)
        try:
            before=p.lstat()
            if not stat.S_ISREG(before.st_mode) or p.is_symlink() or before.st_size>OUTER_STREAM_LIMIT:
                _fail('outer capture file is unsafe or over its per-stream cap')
            h=hashlib.sha256();n=0
            with p.open('rb') as f:
                for block in iter(lambda:f.read(READ_CHUNK),b''):
                    n+=len(block)
                    if n>OUTER_STREAM_LIMIT:_fail('outer capture file grew past its physical bound')
                    h.update(block)
            after=p.lstat();digest=h.hexdigest()
            stable=(before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)==(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns)
            rows.append({'path':str(p),'sizeBytes':n,'sha256':digest})
            if not stable:errors.append(p.name+' changed during physical closure')
            if n!=retained[i]:errors.append(p.name+' physical size differs from retained-byte count')
            if not truncated[i] and digest!=raw_hashes[i]:errors.append(p.name+' physical digest differs from raw-stream digest')
        except BaseException as exc:errors.append(p.name+' closure '+type(exc).__name__+': '+str(exc)[:160])
    return {'verified':not errors,'files':rows,'errors':errors}
