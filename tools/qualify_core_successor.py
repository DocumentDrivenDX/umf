#!/usr/bin/env python3
"""Closed, default-off successor candidate preparation; never publishes.

Registry authority is the workflow's immutable main checkout. Producer and
execution-controller checkouts are separate. This profile cannot authorize a
release or import historical S receipts as successor qualification.
"""
from __future__ import annotations
import argparse
import types
from datetime import datetime
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import selectors
import shutil
import signal
import subprocess
import tarfile
import time
import urllib.request
import zipfile

PROFILE = 'umf.core-successor.candidate/2'
REGISTRY = 'umf.core-successor.registry/2'
DEEP = 'umf.core-successor.installed-inspection/3'
COUPLED = 'umf.core-successor.material-readiness/1'
COMMON_ROLES = ('source','core-sdist','codegen-wheel','codegen-sdist')
HOST_ROLES = ('core-wheel','standalone-cli','sdk','sdk-manifest')
SDK_CHECKS = ('build','package','browser-setup','bun-full','node-native','node-browser','bun-saga','chromium-saga')
OFFLINE = 'umf.core-successor.parent-context/1'
UPLOAD_STEP = 'Retain sanitized failures and original component custody'
CELLS = {kind+'-'+version:(kind,version) for kind in ('direct','rebuilt') for version in ('3.11.17','3.13.16')}
WORKFLOW = '.github/workflows/core-successor-qualification.yml'
REGISTRY_PATH = 'qualification-inputs/core-successor-admissions.json'
GATES = ('job-setup', 'source', 'common', 'wheel', 'sdk', 'rebuild', 'consumers', 'inspection', 'final-identity')
PLATFORMS = ('linux-x86_64', 'macos-arm64')
REPO = 'DocumentDrivenDX/umf'
MAX_SECONDS = 5400
MAX_BYTES = 67108864
RESOURCE_NAMES = ('coreSchema','referenceSchema','packageSchema','constraints','domainPolicy','tablesPackage','actionsPackage','bindingPackage','stableBindingPackage')

RESOURCE_SOURCES = dict(zip(RESOURCE_NAMES, (
    'spec/core/schema.json', 'spec/core/semantic-type-reference.schema.json',
    'spec/core/extension-package.schema.json', 'spec/metamodel/generated/core-constraints.json',
    'spec/metamodel/generated/domain-policy.json', 'spec/extensions/tables/package.json',
    'spec/extensions/actions/package.json', 'spec/extensions/binding/package.json',
    'spec/extensions/binding-stable/package.json')))
COMPAT_CENSUS = 'tests/qualification/fixtures/inspector-construction-batch.json'
CURRENT_RESOURCES = 'tests/qualification/fixtures/inspector-installed-current-resources.json'
CANDIDATE01010_RESOURCES = 'tests/qualification/fixtures/inspector-installed-candidate-01010-resources.json'
CANDIDATE01010_PROBE = 'tools/probe_inspector_installed_factory.py'
HISTORICAL_COLD = 'python/tests/test_retained_codegen_native.py::PublicRetainedFeasibilityTests::test_cold_constructor_and_each_17_vector_dispatch_list_tuple_call_fit_strict_1m'
COMPAT_PROFILE = 'umf.core-successor.named-compatibility/1'


# Prospective transport only. Legacy PROFILE/MAX_BYTES semantics are unchanged.
MULTIPART_CANDIDATE = 'umf.core-successor.candidate-multipart/1'
MULTIPART = 'umf.core-successor.multipart/1'
MULTIPART_MATERIAL = 'umf.core-successor.multipart-material/1'
MAX_PAYLOAD = 60 * 1024 * 1024
MAX_PARTS = 128
MAX_OBJECTS = 128
MAX_SOURCE_MEMBERS = 100000
MAX_SOURCE_PATH = 4096
MAX_PAX = 65536
BUFFER = 1048576
MAX_AGGREGATE = MAX_PARTS * MAX_BYTES  # support ceiling, NEVER an allowance


def bounded_integer(v, maximum, reason, minimum=0):
    insist(type(v) is int and minimum <= v <= maximum, reason)
    return v


def multipart_plan(t):
    closed(t, ('profile','payload_bytes','objects','budgets','source'))
    insist(t['profile']==MULTIPART,'unknown-multipart-profile')
    payload=bounded_integer(t['payload_bytes'],MAX_PAYLOAD,'multipart-payload',1)
    objects=t['objects'];insist(type(objects) is dict and 0<len(objects)<=MAX_OBJECTS,'multipart-object-count')
    budget=t['budgets'];closed(budget,('logical_bytes','transport_bytes','expanded_bytes','workspace_bytes','proof_bytes','seconds','role_bytes','control_bytes','external_workspace_bytes'))
    for k in ('logical_bytes','transport_bytes','expanded_bytes','workspace_bytes'):
        bounded_integer(budget[k],4*MAX_AGGREGATE,'multipart-aggregate-bound',1)
    bounded_integer(budget['external_workspace_bytes'],4*MAX_AGGREGATE,'multipart-external-workspace-bound')
    bounded_integer(budget['control_bytes'],(3*MAX_PARTS+4)*BUFFER,'multipart-control-budget',1)
    bounded_integer(budget['proof_bytes'],MAX_BYTES,'multipart-proof-bound',4096)
    bounded_integer(budget['seconds'],MAX_SECONDS,'multipart-time-bound',1)
    logical=0;role_bytes=0;count=0;roles=[]
    for name,obj in objects.items():
        path_name(name);insist(len(name.encode())<=MAX_SOURCE_PATH,'multipart-path-bound')
        closed(obj,('name','roles','mode','bytes','sha256','parts'))
        path_name(obj['name']);insist('/' not in obj['name'],'multipart-object-name')
        insist(type(obj['roles']) is list and 0<len(obj['roles'])<=12 and len(set(obj['roles']))==len(obj['roles'])
               and all(type(x) is str and 0<len(x)<=128 for x in obj['roles']),'multipart-object-roles')
        roles+=obj['roles'];insist(obj['mode'] in (0o644,0o755) and type(obj['mode']) is int,'multipart-object-mode')
        bounded_integer(obj['bytes'],MAX_AGGREGATE,'multipart-object-bytes',1);sha(obj['sha256'])
        parts=obj['parts'];insist(type(parts) is list and 0<len(parts)<=MAX_PARTS,'multipart-part-count')
        offset=0
        for ordinal,part in enumerate(parts):
            closed(part,('ordinal','offset','length','sha256'))
            insist(type(part['ordinal']) is int and part['ordinal']==ordinal and type(part['offset']) is int and part['offset']==offset,'multipart-order-gap-overlap')
            bounded_integer(part['length'],payload,'multipart-part-length',1);sha(part['sha256'])
            offset+=part['length'];count+=1
            insist(count<=MAX_PARTS and offset<=obj['bytes'],'multipart-count-or-overflow')
        insist(offset==obj['bytes'],'multipart-object-truncated');logical+=offset;role_bytes+=offset*len(obj['roles'])
    insist(len(roles)==len(set(roles)),'multipart-role-duplicate')
    # Three real retained copies: original logical output, upload payloads and
    # retained/reassembled input; original transport ZIPs coexist as a fourth.
    insist(logical==budget['logical_bytes'] and role_bytes==bounded_integer(budget['role_bytes'],12*MAX_AGGREGATE,'multipart-role-bytes',1) and budget['expanded_bytes']==logical+budget['proof_bytes']
           and logical+budget['proof_bytes']<=budget['transport_bytes']<=MAX_AGGREGATE
           and budget['control_bytes']>=(3*count+4)*BUFFER
           and budget['workspace_bytes']>=3*logical+budget['transport_bytes']+budget['proof_bytes']+budget['control_bytes']+budget['external_workspace_bytes'], 'multipart-derived-budget')
    src=t['source'];closed(src,('object','tar_bytes','tar_sha256','member_bytes','members','prefix'))
    insist(src['object'] in objects,'multipart-full-source-object');sha(src['tar_sha256'])
    bounded_integer(src['tar_bytes'],MAX_AGGREGATE,'multipart-source-tar',1024)
    bounded_integer(src['member_bytes'],src['tar_bytes'],'multipart-source-member-bytes')
    bounded_integer(src['members'],MAX_SOURCE_MEMBERS,'multipart-source-members',1)
    insist(budget['external_workspace_bytes']>=src['member_bytes'],'multipart-source-checkout-reserve')
    insist(type(src['prefix']) is str and src['prefix'].endswith('/'),'multipart-source-prefix');path_name(src['prefix'][:-1])
    insist('source' in objects[src['object']]['roles'],'multipart-source-role')
    return count


def multipart_material_shape(p):
    closed(p,('profile','source','controller','platform','kind','objects','envelopes','proof','proof_bytes','proof_expanded_bytes','totals'))
    insist(p['profile']==MULTIPART_MATERIAL and p['kind'] in ('common','continuation','qualified'),'multipart-material-profile')
    sha(p['source'],40);sha(p['controller'],40);insist(p['platform'] in PLATFORMS,'multipart-material-platform')
    insist(type(p['objects']) is dict and 0<len(p['objects'])<=MAX_OBJECTS,'multipart-material-objects')
    # Objects and offsets are the signed producer plan, never a selected subset.
    t={'profile':MULTIPART,'payload_bytes':MAX_PAYLOAD,'objects':p['objects'],
       'budgets':p['totals']['budgets'],'source':p['totals']['source']}
    closed(p['totals'],('budgets','source','transport_bytes','expanded_bytes'))
    count=multipart_plan(t)
    envelopes=p['envelopes'];insist(type(envelopes) is list and len(envelopes)==count,'multipart-envelope-count')
    coordinates=[(name,i) for name,obj in p['objects'].items() for i in range(len(obj['parts']))]
    transmitted=expanded=0;ids=set()
    for row,(name,i) in zip(envelopes,coordinates):
        closed(row,('object','ordinal','bytes','expanded_bytes','provenance'))
        insist(row['object']==name and type(row['ordinal']) is int and row['ordinal']==i,'multipart-envelope-order')
        bounded_integer(row['bytes'],MAX_BYTES,'multipart-envelope-compressed',1)
        bounded_integer(row['expanded_bytes'],MAX_BYTES,'multipart-envelope-expanded',1)
        q=row['provenance'];material_shape(q,multipart=True)
        part=p['objects'][name]['parts'][i]
        insist(q['source']==p['source'] and q['controller']==p['controller'] and q['platform']==p['platform']
               and q['kind']==p['kind'] and q.get('envelope')=='part-%03d'%len(ids) and q['members']=={'payload.bin':part['sha256']}
               and row['expanded_bytes']==part['length'],'multipart-envelope-custody')
        insist(q['artifact'] not in ids,'multipart-duplicate-artifact');ids.add(q['artifact'])
        transmitted+=row['bytes'];expanded+=row['expanded_bytes']
    insist(type(p['proof'].get('members')) is dict and 0<len(p['proof']['members'])<=1024,'multipart-proof-member-count')
    material_shape(p['proof'],multipart=True)
    insist(p['proof'].get('envelope')=='proof' and p['proof']['artifact'] not in ids and p['proof']['source']==p['source'] and p['proof']['controller']==p['controller']
           and p['proof']['platform']==p['platform'] and p['proof']['kind']==p['kind'],'multipart-proof-origin')
    bounded_integer(p['proof_bytes'],MAX_BYTES,'multipart-proof-compressed',1);bounded_integer(p['proof_expanded_bytes'],t['budgets']['proof_bytes'],'multipart-proof-expanded',1)
    transmitted+=p['proof_bytes'];expanded+=p['proof_expanded_bytes']
    insist(p['totals']['transport_bytes']==transmitted and p['totals']['expanded_bytes']==expanded
           and transmitted<=t['budgets']['transport_bytes'] and expanded<=t['budgets']['expanded_bytes'],'multipart-exact-actual-totals')


class OperationDeadline:
    """One monotonic operation lifetime; shared, including across CLI phases."""
    def __init__(self,seconds,clock=time.monotonic,started=None):
        bounded_integer(seconds,MAX_SECONDS,'multipart-deadline-bound',1)
        self.clock=clock;now=clock();self.started=now if started is None else started;self.seconds=seconds
        insist(type(self.started) in (int,float) and self.started>=0 and self.started<=now,'multipart-deadline-origin')
    def remaining(self):
        left=self.started+self.seconds-self.clock()
        insist(left>0,'multipart-deadline');return left
    def check(self):self.remaining()


def checkpoint(deadline):
    if deadline is not None:deadline.check()


def timed_read(stream,n,deadline):
    checkpoint(deadline);data=stream.read(n);checkpoint(deadline);return data


def timed_write(stream,data,deadline):
    checkpoint(deadline);result=stream.write(data);checkpoint(deadline);return result


def timed_copy(source,target,deadline):
    checkpoint(deadline)
    with Path(source).open('rb') as src,Path(target).open('xb') as out:
        while True:
            chunk=timed_read(src,BUFFER,deadline)
            if not chunk:break
            timed_write(out,chunk,deadline)
    checkpoint(deadline)


def operation_copy(source,target,deadline):
    return shutil.copyfile(source,target) if deadline is None else timed_copy(source,target,deadline)


def operation_copytree(source,target,deadline):
    if deadline is None:return shutil.copytree(source,target)
    checkpoint(deadline);target.mkdir(exist_ok=False)
    for path in source.rglob('*'):
        checkpoint(deadline);dest=target/path.relative_to(source)
        insist(not path.is_symlink(),'multipart-copytree-symlink')
        if path.is_dir():dest.mkdir(exist_ok=True)
        elif path.is_file():
            dest.parent.mkdir(parents=True,exist_ok=True);timed_copy(path,dest,deadline)
    checkpoint(deadline);return target


def timed_publish(path,data,deadline):
    checkpoint(deadline)
    with Path(path).open('wb') as out:timed_write(out,data,deadline)
    checkpoint(deadline)


class MultipartBudget:
    """Reservation precedes download/write; counters monotonic, no retry credit."""
    def __init__(self,plan,clock=time.monotonic,deadline=None):
        multipart_plan(plan);self.bounds=plan['budgets'];self.used={k:0 for k in ('transport_bytes','expanded_bytes','workspace_bytes','control_bytes')};self.metadata_actual_bytes=0;self.deadline=deadline if deadline is not None else OperationDeadline(self.bounds['seconds'],clock);self.clock=self.deadline.clock;self.started=self.deadline.started
    def reserve(self,kind,n):
        bounded_integer(n,MAX_AGGREGATE,'multipart-reservation')
        self.deadline.check()
        value=self.used[kind]+n;insist(value<=self.bounds[kind],'multipart-cumulative-'+kind)
        self.used[kind]=value


def network_read(response,n,deadline):
    checkpoint(deadline)
    if deadline is not None:
        socket=getattr(getattr(getattr(response,'fp',None),'raw',None),'_sock',None)
        if socket is not None:socket.settimeout(deadline.remaining())
    return timed_read(response,n,deadline)


def deadline_api(*args,deadline=None,**kwargs):
    return api(*args,**kwargs) if deadline is None else api(*args,deadline=deadline,**kwargs)


def multipart_api(path,budget):
    budget.reserve('control_bytes',BUFFER)
    raw=api(path,True,BUFFER,deadline=budget.deadline)
    budget.deadline.check()
    insist(type(raw) is bytes and len(raw)<=BUFFER,'multipart-api-control-bound')
    budget.metadata_actual_bytes+=len(raw)
    value=loads(raw.decode());budget.deadline.check();return value


class PartStream:
    """Logical stream across arbitrary part/header/UTF8/gzip boundaries, 1MiB RAM."""
    def __init__(self,paths,obj,deadline=None):
        self.deadline=deadline;checkpoint(deadline);self.paths=paths;self.obj=obj;self.index=0;self.file=None;self.part_used=0;self.part_hash=None;self.total=0;self.hash=hashlib.sha256()
    def read(self,n=-1):
        insist(type(n) is int and 0<=n<=BUFFER,'multipart-bounded-read')
        checkpoint(self.deadline);out=bytearray()
        while len(out)<n and self.index<len(self.paths):
            checkpoint(self.deadline);row=self.obj['parts'][self.index]
            if self.file is None:
                path=Path(self.paths[self.index]);insist(not path.is_symlink() and path.is_file() and path.stat().st_size==row['length'],'multipart-part-file')
                self.file=path.open('rb');self.part_hash=hashlib.sha256();self.part_used=0
            chunk=timed_read(self.file,min(n-len(out),row['length']-self.part_used),self.deadline)
            insist(chunk or self.part_used==row['length'],'multipart-read-truncation')
            self.part_used+=len(chunk);self.total+=len(chunk);self.part_hash.update(chunk);self.hash.update(chunk);out.extend(chunk)
            if self.part_used==row['length']:
                self.file.close();self.file=None
                insist(self.part_hash.hexdigest()==row['sha256'],'multipart-part-hash');self.index+=1
        checkpoint(self.deadline);return bytes(out)
    def finish(self):
        while self.read(BUFFER):pass
        checkpoint(self.deadline);insist(self.total==self.obj['bytes'] and self.hash.hexdigest()==self.obj['sha256'],'multipart-whole-object-hash')
    def close(self):
        if self.file:self.file.close();self.file=None


def reconstruct_parts(paths,obj,target,budget):
    budget.reserve('workspace_bytes',obj['bytes'])
    insist(not target.exists() and not target.is_symlink(),'multipart-stale-object')
    checkpoint(budget.deadline);target.parent.mkdir(parents=True,exist_ok=True);stream=PartStream(paths,obj,budget.deadline)
    try:
        with target.open('xb') as output:
            while chunk:=stream.read(BUFFER):timed_write(output,chunk,budget.deadline)
        stream.finish();checkpoint(budget.deadline);target.chmod(obj['mode']);checkpoint(budget.deadline)
    finally:stream.close()


def multipart_envelope(archive,target,row,part,budget):
    # Authenticate before ZIP parsing; budget before any extraction writes.
    insist(archive.stat().st_size==row['bytes']<=MAX_BYTES and digest(archive,budget.deadline)==row['provenance']['sha256'],'multipart-zip-bytes')
    budget.reserve('expanded_bytes',row['expanded_bytes']);budget.reserve('workspace_bytes',row['expanded_bytes'])
    with zipfile.ZipFile(archive) as z:
        checkpoint(budget.deadline)
        entries=z.infolist();insist(len(entries)==1,'multipart-envelope-roster')
        m=entries[0]
        insist(m.filename=='payload.bin' and not m.is_dir() and (m.external_attr>>16)&0o170000 in (0,0o100000)
               and not (m.external_attr>>16)&0o7000 and m.file_size==row['expanded_bytes']==part['length']<=MAX_PAYLOAD
               and m.compress_type in (zipfile.ZIP_STORED,zipfile.ZIP_DEFLATED),'multipart-envelope-member')
        checkpoint(budget.deadline);target.parent.mkdir(parents=True,exist_ok=True);h=hashlib.sha256();written=0
        with z.open(m) as src,target.open('xb') as out:
            while chunk:=timed_read(src,BUFFER,budget.deadline):
                written+=len(chunk);insist(written<=part['length'],'multipart-envelope-expansion');h.update(chunk);timed_write(out,chunk,budget.deadline)
        checkpoint(budget.deadline);insist(written==part['length'] and h.hexdigest()==part['sha256'],'multipart-envelope-payload-hash')


def stream_source_archive(stream,roster,commit,source,deadline=None):
    """Bound TAR headers/PAX before parser allocation; all blobs streamed incl >64M."""
    import gzip,posixpath
    deadline=deadline if deadline is not None else getattr(stream,'deadline',None);checkpoint(deadline)
    insist(0<len(roster)<=MAX_SOURCE_MEMBERS and len(roster)==source['members'],'multipart-git-roster-count')
    # Header sniff is replayed without seeking the logical parts stream.
    head=timed_read(stream,2,deadline)
    class Replay:
        def __init__(self):self.prefix=head
        def read(self,n=-1):
            insist(type(n) is int and 0<=n<=BUFFER,'multipart-source-read-bound')
            out=self.prefix[:n];self.prefix=self.prefix[len(out):];return out+timed_read(stream,n-len(out),deadline)
    raw=Replay();decoded=gzip.GzipFile(fileobj=raw,mode='rb') if head==b'\x1f\x8b' else raw
    h=hashlib.sha256();total=0;member_bytes=0;seen=set();global_pax={};local={};entries=0
    def read_exact(n):
        nonlocal total
        insist(0<=n<=BUFFER,'multipart-source-buffer');data=bytearray()
        while len(data)<n:
            chunk=timed_read(decoded,n-len(data),deadline);insist(chunk,'multipart-source-truncated');data.extend(chunk)
        total+=len(data);insist(total<=source['tar_bytes'],'multipart-source-decoded-bound');h.update(data);return bytes(data)
    def number(field):
        data=field.rstrip(b'\0 ').lstrip(b' ');insist(not data or all(48<=x<=55 for x in data),'multipart-tar-number');return int(data or b'0',8)
    while True:
        checkpoint(deadline);header=read_exact(512)
        if header==bytes(512):
            insist(not local,'multipart-orphan-pax');insist(read_exact(512)==bytes(512),'multipart-tar-end')
            while total<source['tar_bytes']:insist(not any(read_exact(min(BUFFER,source['tar_bytes']-total))),'multipart-trailing-payload')
            insist(not timed_read(decoded,1,deadline),'multipart-source-extra-decoded');break
        entries+=1;insist(entries<=3*MAX_SOURCE_MEMBERS,'multipart-source-header-count')
        checksum=number(header[148:156]);insist(sum(header[:148])+8*32+sum(header[156:])==checksum,'multipart-tar-checksum')
        size=number(header[124:136]);kind=header[156:157];mode=number(header[100:108])
        if kind in (b'x',b'g'):
            insist(0<size<=MAX_PAX,'multipart-pax-bound');body=read_exact(size);read_exact((-size)%512);fields={};pos=0
            while pos<len(body):
                checkpoint(deadline);end=body.find(b' ',pos);insist(end>pos and body[pos:end].isdigit(),'multipart-pax-record')
                length=int(body[pos:end]);insist(length>0 and pos+length<=len(body),'multipart-pax-length')
                record=body[end+1:pos+length];insist(record.endswith(b'\n') and b'=' in record,'multipart-pax-value');k,v=record[:-1].split(b'=',1)
                insist(k not in fields and k in (b'path',b'linkpath',b'size',b'mtime',b'comment'),'multipart-pax-key');fields[k]=v;pos+=length
            if kind==b'g':insist(set(fields)=={b'comment'} and not global_pax,'multipart-global-pax');global_pax=fields
            else:insist(not local,'multipart-consecutive-pax');local=fields
            continue
        name=header[:100].split(b'\0')[0];prefix=header[345:500].split(b'\0')[0]
        if prefix:name=prefix+b'/'+name
        name=local.get(b'path',name).decode('utf8','surrogateescape');link=local.get(b'linkpath',header[157:257].split(b'\0')[0]).decode('utf8','surrogateescape')
        if b'size' in local:
            insist(local[b'size'].isdigit(),'multipart-pax-size');size=int(local[b'size'])
        local={};insist(len(name.encode('utf8','surrogateescape'))<=MAX_SOURCE_PATH and name.startswith(source['prefix']),'multipart-source-name')
        short=name[len(source['prefix']):]
        if kind==b'5':
            dirname=short.rstrip('/');insist(size==0 and mode==0o775 and (not dirname or any(k.startswith(dirname+'/') for k in roster)),'multipart-source-directory');continue
        path_name(short);insist(short in roster and short not in seen,'multipart-source-extra-duplicate');seen.add(short);gitmode,oid=roster[short]
        if kind==b'2':
            insist(gitmode=='120000' and size==0 and mode==0o777 and len(link.encode('utf8','surrogateescape'))<=MAX_SOURCE_PATH,'multipart-source-symlink')
            resolved=posixpath.normpath(posixpath.join(posixpath.dirname(short),link));insist(not link.startswith('/') and resolved!='..' and not resolved.startswith('../'),'multipart-escaping-link')
            actual=git_blob(link.encode('utf8','surrogateescape'))
        else:
            insist(kind in (b'0',b'\0') and gitmode in ('100644','100755') and mode=={'100644':0o664,'100755':0o775}[gitmode],'multipart-source-type-mode')
            member_bytes+=size;insist(member_bytes<=source['member_bytes'],'multipart-source-member-total')
            bh=hashlib.sha1(b'blob '+str(size).encode()+b'\0');left=size
            while left:
                chunk=read_exact(min(BUFFER,left));bh.update(chunk);left-=len(chunk)
            actual=bh.hexdigest();read_exact((-size)%512)
        insist(actual==oid,'multipart-source-git-blob')
    checkpoint(deadline);insist(seen==set(roster) and member_bytes==source['member_bytes'] and global_pax.get(b'comment')==commit.encode()
           and h.hexdigest()==source['tar_sha256'],'multipart-complete-source-custody')
    if hasattr(stream,'finish'):stream.finish()
    checkpoint(deadline)
    return {'tar_bytes':total,'tar_sha256':h.hexdigest(),'member_bytes':member_bytes,'members':len(seen)}



def compatibility_contract(value):
    closed(value, ('census_sha256','early','later','historicalExcluded'))
    sha(value['census_sha256'])
    insist(value['historicalExcluded']==[HISTORICAL_COLD], 'only-historical-cold51-excluded')
    names=[]
    for group,count in (('early',18),('later',31)):
        rows=value[group]
        insist(type(rows) is list and len(rows)==count, 'named-compatibility-roster')
        for name in rows:
            insist(type(name) is str and re.fullmatch(r'python/tests/[A-Za-z0-9_]+\.py::(?:[A-Za-z0-9_]+::)?test_[A-Za-z0-9_]+',name), 'named-not-wildcard-selector')
        names+=rows
    insist(len(names)==len(set(names)) and HISTORICAL_COLD not in names, 'compatibility-overlap-or-historical-cold')


def compatibility_evidence(value,a,wheel,native):
    closed(value, ('profile','source','census_sha256','inputProfile','wheel_sha256','native_sha256','original','groups'))
    insist(value['profile']==COMPAT_PROFILE and value['source']==a['source'] and value['inputProfile']=='installed-canonical/1'
           and value['census_sha256']==a['compatibility']['census_sha256'] and value['wheel_sha256']==wheel
           and value['native_sha256']==native, 'compatibility-source-profile-wheel-native')
    # Artifact IDs/digests are authenticated by original_material after upload;
    # this producer receipt binds the original run/job/attempt/controller now.
    closed(value['original'], ('run','job','attempt','workflow_sha','controller_sha','platform','job_name','upload_step'))
    for k in ('run','job','attempt'):insist(type(value['original'][k]) is str and re.fullmatch('[1-9][0-9]*',value['original'][k]), 'compatibility-original-id')
    for k in ('workflow_sha','controller_sha'):sha(value['original'][k],40)
    insist(value['original']['controller_sha']==a['controller']['commit'] and value['original']['platform']==a['platform']
           and value['original']['job_name']==('linux' if a['platform']=='linux-x86_64' else 'macos')
           and value['original']['upload_step']==UPLOAD_STEP, 'compatibility-original-context')
    closed(value['groups'], ('early','later'))
    for group in ('early','later'):
        row=value['groups'][group];closed(row, ('cases','xml_sha256'))
        insist(type(row['cases']) is dict and list(row['cases'])==a['compatibility'][group]
               and all(v=='passed' for v in row['cases'].values()), 'required-named-compatibility-missing-failed-skipped')
        sha(row['xml_sha256'])


def named_junit(path,selectors):
    import xml.etree.ElementTree as ET
    expected=[]
    for selector in selectors:
        file,*parts=selector.split('::')
        expected.append(('.'.join([file[:-3].replace('/','.'),*parts[:-1]]),parts[-1]))
    rows=list(ET.parse(path).getroot().iter('testcase'))
    actual=[(x.get('classname'),x.get('name')) for x in rows]
    insist(len(actual)==len(set(actual)) and set(actual)==set(expected)
           and not any(x.find(k) is not None for x in rows for k in ('failure','error','skipped')), 'named-compatibility-xml-missing-failed-skipped')


def compatibility_material(root,d,a):
    evidence=d['compatibility'];compatibility_evidence(evidence,a,d['wheel_sha256'],d['native_sha256'])
    cell=d['runtime']['cell']
    insist(read(root/('compatibility-'+cell+'.json'))==evidence, 'compatibility-original-receipt')
    for group in ('early','later'):
        path=root/('compatibility-'+group+'-'+cell+'.xml')
        insist(digest(path)==evidence['groups'][group]['xml_sha256'], 'compatibility-original-member-hash')
        named_junit(path,a['compatibility'][group])


class Refusal(ValueError):
    pass


def insist(value, reason):
    if not value:
        raise Refusal(reason)


def closed(value, keys):
    insist(type(value) is dict and set(value) == set(keys), 'closed-fields-differ')


def sha(value, size=64):
    insist(type(value) is str and re.fullmatch('[0-9a-f]{%d}' % size, value) and set(value) != {'0'},
           'invalid-or-placeholder-identity')


def path_name(value):
    insist(type(value) is str and value and not value.startswith('/') and '\\' not in value
           and '..' not in PurePosixPath(value).parts and PurePosixPath(value).as_posix() == value,
           'unsafe-relative-path')


def pins(value):
    insist(type(value) is dict and bool(value), 'missing-pins')
    for name, digest in value.items():
        path_name(name); sha(digest)


def identity(value):
    closed(value, ('commit', 'tree'))
    for v in value.values():sha(v, 40)


def loads(text):
    def pairs(rows):
        result = {}
        for k, v in rows:
            insist(k not in result, 'duplicate-json-key'); result[k] = v
        return result
    return json.loads(text, object_pairs_hook=pairs,
                      parse_constant=lambda _: (_ for _ in ()).throw(Refusal('nonfinite-json')))


def read(path,deadline=None):
    checkpoint(deadline);insist(Path(path).stat().st_size<=MAX_BYTES,'control-object-size-bound')
    with Path(path).open('rb') as stream:raw=timed_read(stream,MAX_BYTES+1,deadline)
    insist(len(raw)<=MAX_BYTES,'control-object-size-bound');value=loads(raw.decode());checkpoint(deadline);return value
def digest(path,deadline=None):
    checkpoint(deadline)
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        while chunk := timed_read(f,1048576,deadline):h.update(chunk)
    checkpoint(deadline);return h.hexdigest()

def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args]).decode().strip()


# One separately authenticated original Inspector run. These known identities do
# not populate the EMPTY registry or assert that any wheel/gate has completed.
INSPECTOR_WORKFLOW = '.github/workflows/inspector-retained-attribution.yml'
INSPECTOR_WORKFLOW_ID = 406353585
INSPECTOR_UPLOAD = 'Retain all actual partial proofs original identities and genuine wheel bytes'
INSPECTOR_ARTIFACT_PREFIX = 'private-inspector-construction-batch'
INSPECTOR_RAW = 'umf_core-0.10.10-cp311-abi3-linux_x86_64.whl'


def initial_inspector_shape(p,a):
    closed(p,('workflow','workflow_id','run','attempt','job','ref','controller','source','tree',
              'artifact','artifact_name','sha256','members','wheel','census_sha256','fixture_sha256'))
    insist(a['version']=='0.10.10' and a['platform']=='linux-x86_64' and a['purpose']=='candidate-production'
        and a.get('continuation') is None, 'initial-inspector-scope-or-continuation')
    insist((p['workflow'],p['workflow_id'],p['attempt'])==
        (INSPECTOR_WORKFLOW,INSPECTOR_WORKFLOW_ID,1)
        and type(p['run']) is int and p['run']>0 and type(p['job']) is int and p['job']>0
        and type(p['ref']) is str and re.fullmatch(r'refs/heads/[A-Za-z0-9._/-]+',p['ref']) is not None
        and all(part not in ('','..') for part in p['ref'][len('refs/heads/'):].split('/')),
        'initial-inspector-original-workflow-run-job')
    identity(a['source']);sha(p['controller'],40);sha(p['source'],40);sha(p['tree'],40)
    insist(p['controller']==p['source']==a['source']['commit'] and p['tree']==a['source']['tree'],
           'initial-inspector-source-controller-join')
    insist(type(p['artifact']) is int and p['artifact']>0
        and p['artifact_name']==f'{INSPECTOR_ARTIFACT_PREFIX}-{p["run"]}-{p["attempt"]}',
           'initial-inspector-actual-artifact-pending')
    sha(p['sha256']);pins(p['members']);sha(p['census_sha256']);sha(p['fixture_sha256'])
    insist(p['census_sha256']==a['inputs'].get(COMPAT_CENSUS)
        and p['fixture_sha256']==a['inputs'].get(CANDIDATE01010_RESOURCES), 'initial-inspector-census-fixture-pins')
    closed(p['wheel'],('member','sha256','bytes','native_sha256'))
    insist(p['wheel']['member']=='wheels/'+INSPECTOR_RAW and type(p['wheel']['bytes']) is int
        and 0<p['wheel']['bytes']<=a['bounds']['artifact_bytes'], 'initial-inspector-raw-wheel-name-size')
    sha(p['wheel']['sha256']);sha(p['wheel']['native_sha256'])
    insist(p['members'].get(p['wheel']['member'])==p['wheel']['sha256'], 'initial-inspector-wheel-member-pin')


def initial_inspector_provenance(a,p,run,job,art):
    initial_inspector_shape(p,a)
    insist(run.get('id')==p['run'] and run.get('workflow_id')==INSPECTOR_WORKFLOW_ID
        and run.get('path')==INSPECTOR_WORKFLOW and run.get('run_attempt')==p['attempt']
        and run.get('event')=='workflow_dispatch' and 'refs/heads/'+str(run.get('head_branch'))==p['ref']
        and run.get('head_sha')==p['controller'] and run.get('status')=='completed' and run.get('conclusion')=='success'
        and run.get('repository',{}).get('full_name')==REPO and run['repository'].get('id')==1382276802
        and run['repository'].get('owner',{}).get('id')==273466046
        and run.get('head_repository',{}).get('id')==1382276802, 'initial-inspector-original-run-not-qualified')
    insist(job.get('id')==p['job'] and job.get('run_id')==p['run'] and job.get('run_attempt')==p['attempt']
        and job.get('head_sha')==p['controller'] and job.get('name')=='feasibility'
        and 'ubuntu-24.04' in job.get('labels',[]) and job.get('status')=='completed'
        and job.get('conclusion')=='success', 'initial-inspector-original-job-not-qualified')
    origin=art.get('workflow_run',{})
    insist(art.get('id')==p['artifact'] and art.get('name')==p['artifact_name'] and art.get('expired') is False
        and art.get('digest')=='sha256:'+p['sha256'] and origin.get('id')==p['run']
        and origin.get('head_sha')==p['controller'] and origin.get('repository_id')==1382276802
        and origin.get('head_repository_id')==1382276802, 'initial-inspector-original-artifact')
    upload=[step for step in job.get('steps',[]) if step.get('name')==INSPECTOR_UPLOAD]
    insist(len(upload)==1 and upload[0].get('status')=='completed' and upload[0].get('conclusion')=='success',
           'initial-inspector-original-upload')
    try:
        times=[datetime.fromisoformat(value.replace('Z','+00:00')) for value in
               (job['started_at'],art['created_at'],job['completed_at'])]
        insist(all(value.tzinfo is not None for value in times) and times[0]<=times[1]<=times[2],
               'initial-inspector-upload-window')
    except (KeyError,TypeError,ValueError):raise Refusal('initial-inspector-upload-window') from None


def _initial_junit(path,selectors):
    # Original probe's exact nonempty testcase/name/type/no-skip predicate.
    import xml.etree.ElementTree as ET
    expected=[]
    for selector in selectors:
        file,*parts=selector.split('::');insist(len(parts) in (1,2),'initial-inspector-named-selector')
        expected.append(('.'.join([file.removesuffix('.py').replace('/','.'),*parts[:-1]]),parts[-1]))
    cases=list(ET.parse(path).getroot().iter('testcase'));actual=[(row.get('classname'),row.get('name')) for row in cases]
    insist(expected and len(expected)==len(set(expected)) and len(actual)==len(set(actual))
        and set(actual)==set(expected) and not any(row.find(kind) is not None for row in cases
        for kind in ('failure','error','skipped')), 'initial-inspector-original-junit-failed-or-incomplete')


def initial_inspector_reports(a,p,source,root,deadline=None):
    """Read ORIGINAL producer schemas; no result synthesis or native processes.

    source_check has authenticated the clean immutable S, full input hashes and
    Jason's exact source-bound raw9/DATA/G0 adapter before this is called.
    """
    from email.parser import BytesParser
    measure=lambda path:digest(path,deadline)
    get=lambda name:read(root/name,deadline)
    census=read(source/COMPAT_CENSUS,deadline)['installedFactory']
    insist(measure(source/COMPAT_CENSUS)==p['census_sha256'] and
        measure(source/CANDIDATE01010_RESOURCES)==p['fixture_sha256'], 'initial-inspector-source-census-fixture')
    fixture=read(source/CANDIDATE01010_RESOURCES,deadline)
    producer=get('producer.json');payload=get('source-and-payload.json');wheel=root/p['wheel']['member']
    insist(producer.get('profile')=='umf.private-construction-batch-producer/1'
        and payload.get('profile')=='umf.private-construction-batch-source/1'
        and producer.get('source')==payload.get('source')==p['source'] and payload.get('tree')==p['tree']
        and producer.get('inputProfile')==payload.get('inputProfile')=='installed-canonical/1'
        and producer.get('censusSHA256')==payload.get('censusSHA256')==p['census_sha256']
        and producer.get('resourcePinsSHA256')==payload.get('resourcePinsSHA256')==p['fixture_sha256']
        and payload.get('limits')=={'construction':1000000,'perCall':1000000}
        and payload.get('oldNativePassesReused') is False, 'initial-inspector-original-producer-source')
    identity=producer.get('currentInputIdentity')
    insist(type(identity) is dict and identity==payload.get('currentInputIdentity') and
        identity.get('resourceFixture')==CANDIDATE01010_RESOURCES and identity.get('resourceFixtureSHA256')==p['fixture_sha256']
        and identity.get('candidateArtifactVersion')=='0.10.10'
        and identity.get('literalDataSHA256')==fixture['literalData']['sha256']
        and identity.get('generation')==fixture['generation'], 'initial-inspector-current-input-identity')
    for record in (producer,payload):
        insist(record.get('publishable') is False and record.get('readyForEnrollment') is False,
               'initial-inspector-component-not-publication')
    insist(producer.get('wheel',{}).get('sha256')==p['wheel']['sha256'] and
        producer['wheel'].get('bytes')==p['wheel']['bytes'] and wheel.stat().st_size==p['wheel']['bytes']
        and measure(wheel)==p['wheel']['sha256'] and Path(producer['wheel'].get('path','')).name==INSPECTOR_RAW,
        'initial-inspector-original-wheel')
    insist(producer.get('nativeMember')=={'path':'umf/_rust_core.abi3.so','sha256':p['wheel']['native_sha256']},
           'initial-inspector-original-native')
    for name,key in (('cargo-metadata.json','cargoMetadataSHA256'),('producer-cargo-features.txt','featureGraphSHA256')):
        insist(measure(root/name)==producer.get(key),'initial-inspector-original-feature-graph')
    insist(producer.get('cargoLockSHA256')==payload.get('cargoLockSHA256')==measure(source/'Cargo.lock')
        and producer.get('testSHA256')==payload.get('testSHA256')==measure(source/'python/tests/test_retained_codegen_native.py'),
        'initial-inspector-original-lock-loader')
    # Original source-input tar must describe exactly the frozen census closure.
    expected={COMPAT_CENSUS:p['census_sha256'],**census['sourceFiles']}
    with tarfile.open(root/'source-inputs.tar','r:') as archive:
        rows=[row for row in archive.getmembers() if not row.isdir()]
        insist(len(rows)==len(expected) and {row.name for row in rows}==set(expected)
            and sum(row.size for row in rows)<=a['bounds']['artifact_bytes'], 'initial-inspector-source-tar-roster')
        for row in rows:
            insist(row.isfile() and row.size<=a['bounds']['artifact_bytes'],'initial-inspector-source-tar-kind')
            raw=archive.extractfile(row).read();insist(hashlib.sha256(raw).hexdigest()==expected[row.name]
                and raw==(source/row.name).read_bytes(),'initial-inspector-source-tar-bytes')
    with zipfile.ZipFile(wheel) as archive:
        rows=archive.infolist();insist(len(rows)==len({row.filename for row in rows})
            and sum(row.file_size for row in rows)<=a['bounds']['artifact_bytes'],'initial-inspector-wheel-roster-bound')
        members={}
        for row in rows:
            path_name(row.filename);insist(not row.is_dir() and (row.external_attr>>16)&0o170000!=0o120000,
                                          'initial-inspector-wheel-member-kind')
            raw=archive.read(row);members[row.filename]={'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
        insist(members==producer.get('members') and members.get('umf/_rust_core.abi3.so',{}).get('sha256')==p['wheel']['native_sha256'],
               'initial-inspector-wheel-payload-native')
        metadata=[name for name in members if name.endswith('.dist-info/METADATA')]
        insist(len(metadata)==1,'initial-inspector-wheel-metadata')
        meta=BytesParser().parsebytes(archive.read(metadata[0]));insist(meta['Name']=='umf-core' and meta['Version']=='0.10.10','initial-inspector-wheel-version')
        # Exact RECORD coverage/hashes, including embedded CLI; no imported owner.
        import csv,base64
        records=list(csv.reader(io.StringIO(archive.read('umf_core-0.10.10.dist-info/RECORD').decode())))
        insist(len(records)==len(members) and {row[0] for row in records}==set(members),'initial-inspector-wheel-record-roster')
        for row in records:
            insist(len(row)==3,'initial-inspector-wheel-record-row')
            if row[0].endswith('.dist-info/RECORD'):insist(row[1:]==['',''],'initial-inspector-record-self');continue
            raw=archive.read(row[0]);encoded=base64.urlsafe_b64encode(hashlib.sha256(raw).digest()).rstrip(b'=').decode()
            insist(row[1:] == ['sha256='+encoded,str(len(raw))],'initial-inspector-wheel-record-hash')
    aggregate=get('aggregate.json');cost=get('cost-gate.json');measurement=get('measurement.json')
    for record in (aggregate,cost):
        insist(record.get('artifactSource')==record.get('controllerSource')==p['source']
            and record.get('wheelSHA256')==p['wheel']['sha256'] and record.get('run')==str(p['run'])
            and record.get('attempt')=='1' and record.get('currentInputIdentity')==identity,
            'initial-inspector-original-run-wheel-identity')
    insist(cost.get('profile')=='umf.private-retained-cost-gate/1' and cost.get('status')=='cost-gate-passed'
        and cost.get('inputProfile')=='installed-canonical/1' and cost.get('nativeSHA256')==p['wheel']['native_sha256']
        and cost.get('censusSHA256')==p['census_sha256'] and cost.get('publicControlsExecution')=='COMPLETED'
        and all(cost.get(key) is True for key in ('identityBeforePassed','identityAfterPassed','publicProbePassed','publicControlsPassed','expensiveTestCompilationAdmitted')),
        'initial-inspector-original-cost-gate')
    for name,row in cost.get('members',{}).items():
        path_name(name);insist(row=={'bytes':(root/name).stat().st_size,'sha256':measure(root/name)},'initial-inspector-cost-companion')
    insist(set(cost.get('members',{}))=={'measurement.json','public-controls.xml',*[kind+'-cost-'+when+'.json' for kind in ('identity','installed-record') for when in ('before','after')]},'initial-inspector-cost-companion-roster')
    # Reuse the original pure complete()/manifest()/junit() functions verbatim
    # from the exact S-owned probe. No CLI/run/native entry point is invoked.
    helper_path=source/CANDIDATE01010_PROBE
    insist(measure(helper_path)==a['inputs'].get(CANDIDATE01010_PROBE)==census['sourceFiles'].get(CANDIDATE01010_PROBE),
           'initial-inspector-original-pure-probe-source')
    spec=importlib.util.spec_from_file_location('_original_c1_pure_receipts',helper_path)
    helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
    corpus=read(source/'tests/rust-core/fixtures/access-inspection/cases.json',deadline)['cases']
    pairs=[(row['id'],carrier,hashlib.sha256(json.dumps({'ok':True,'result':row['expected']} if carrier=='dispatcher' else row['expected'],sort_keys=True,separators=(',',':'),ensure_ascii=True,allow_nan=False).encode()).hexdigest()) for row in corpus for carrier in ('dispatcher','list','tuple')]
    helper.complete(measurement,p['source'],p['wheel']['sha256'],helper.expected_manifest(fixture),pairs)
    insist(measurement.get('nativeSHA256')==p['wheel']['native_sha256'] and measurement.get('closureSHA256')==census['closureSHA256']
        and measurement.get('currentInputIdentity')==identity,'initial-inspector-measurement-source-native')
    helper.junit(root/'public-controls.xml',census['publicControls'])
    # Exact original compiled+executed named roster and raw per-case logs.
    compiled=get('compiled-census.json');rust=get('rust-census-result.json')
    expected_cases=[(group['package'],group['target'],row['name']) for group in census['rust'] for row in group['cases']]
    actual=[(row.get('package'),row.get('target'),row.get('name')) for row in rust.get('results',[])]
    insist(len(expected_cases)==477 and len(set(expected_cases))==477 and len(actual)==477 and set(actual)==set(expected_cases)
        and rust.get('source')==p['source'] and rust.get('status')=='passed' and rust.get('cases')==rust.get('passed')==477
        and rust.get('censusSHA256')==p['census_sha256'] and rust.get('compiledCensusSHA256')==measure(root/'compiled-census.json')
        and compiled.get('source')==p['source'] and compiled.get('status')=='authenticated-before-test-execution'
        and compiled.get('selectedCases')==477 and compiled.get('censusSHA256')==p['census_sha256'], 'initial-inspector-original-rust477')
    targets={(row['package'],row['target']):row for row in compiled.get('targets',[])}
    insist(len(targets)==len(compiled.get('targets',[])) and set(targets)=={row[:2] for row in expected_cases},'initial-inspector-compiled-targets')
    for package,target,name in expected_cases:insist(targets[(package,target)].get('caseNames',[]).count(name)==1,'initial-inspector-compiled-name')
    for index,row in enumerate(rust['results']):
        log=root/'rust-cases'/(str(index)+'-case.log');text=log.read_text(errors='replace')
        insist(row.get('passed') is True and type(row.get('exit')) is int and row['exit']==0
            and measure(log)==row.get('logSHA256') and '1 passed; 0 failed' in text and '1 ignored' not in text,'initial-inspector-rust-log')
    insist(aggregate.get('profile')=='umf.private-installed-factory-semantics/1' and aggregate.get('inputProfile')=='installed-canonical/1'
        and all(aggregate.get(key) is True for key in ('costGateAuthenticated','rustPassed','sagaPassed','finalIdentityPassed','requiredQualificationPassed'))
        and len(aggregate.get('pythonGroups',[]))==len(census['python']), 'initial-inspector-original-aggregate')
    later=0
    for index,(group,result) in enumerate(zip(census['python'],aggregate['pythonGroups'])):
        insist(result.get('group')==group['group'] and result.get('cases')==group['cases'] and result.get('passed') is True
            and measure(root/('factory-group-'+str(index)+'.xml'))==result.get('xmlSHA256'), 'initial-inspector-original-python-group')
        helper.junit(root/('factory-group-'+str(index)+'.xml'),group['cases']);later+=len(group['cases'])
        insist((root/('factory-group-'+str(index)+'.log')).is_file(),'initial-inspector-python-raw-log')
    insist(len(census['publicControls'])==18 and later==31,'initial-inspector-original-python18-31')
    saga=get('public-saga19.json');binding=saga.get('installedBinding',{})
    insist(saga.get('profile')=='umf.saga.portable-host-receipt/2' and saga.get('cases')==saga.get('passed')==19
        and saga.get('hostId')=='python' and saga.get('runtime')=={'python':'3.11.17','platform':'Linux','arch':'x86_64'}
        and len(saga.get('results',[]))==19 and len({row.get('id') for row in saga['results']})==19 and all(row.get('passed') is True for row in saga['results'])
        and binding.get('status')=='passed' and binding.get('wheelSha256')==p['wheel']['sha256']
        and binding.get('beforeNativeSha256')==binding.get('afterNativeSha256')==p['wheel']['native_sha256'], 'initial-inspector-original-saga19')
    custody=(source/'scripts/saga-portable/custody.ts').read_text();roster=custody.split('export const SAGA_QUALIFICATION_INPUTS=[',1)[1].split('] as const;',1)[0]
    expected_saga=set(re.findall(r"'([^']+)'",roster))
    insist(saga.get('corpusSha256')==measure(source/'fixtures/saga/portable.json') and expected_saga
        and saga.get('qualificationInputs')=={name:measure(source/name) for name in expected_saga},'initial-inspector-saga-source-corpus')
    lifecycle=get('saga-lifecycle2-result.json');cases=['python/tests/test_saga_lifecycle.py::InstalledSagaLifecycle::test_author_declare_edit_exchange_and_assess','python/tests/test_saga_lifecycle.py::InstalledSagaLifecycle::test_unknown_recovery_meaning_refuses_edit']
    insist(lifecycle.get('profile')=='umf.private-installed-saga-lifecycle2/1' and lifecycle.get('status')=='passed'
        and lifecycle.get('passed') is True and lifecycle.get('source')==p['source'] and lifecycle.get('run')==str(p['run'])
        and lifecycle.get('attempt')=='1' and lifecycle.get('cases')==cases and lifecycle.get('currentInputIdentity')==identity
        and lifecycle.get('wheel')==producer['wheel'] and lifecycle.get('nativeMember')==producer['nativeMember']
        and lifecycle.get('processExitCode')==0 and lifecycle.get('execution')=='same-job-after-cost-and-required-semantics', 'initial-inspector-original-lifecycle2')
    helper.junit(root/'saga-lifecycle2.xml',cases)
    for label in ('log','junit','identityBefore','identityAfter'):
        ref=lifecycle.get(label);insist(type(ref) is dict,'initial-inspector-lifecycle-companion')
        path_name(ref['path']);insist(measure(root/ref['path'])==ref['sha256'],'initial-inspector-lifecycle-companion-hash')
    suffixes=['cost-before','cost-after','producer-before-rust','initial','final','lifecycle2-before','lifecycle2-after']
    suffixes += ['factory-group-'+str(i)+'-'+when for i in range(len(census['python'])) for when in ('before','after')]
    for suffix in suffixes:
        state=get('identity-'+suffix+'.json');record=get('installed-record-'+suffix+'.json')
        insist(state.get('profile')=='umf.private-retained-installed-identity/1' and state.get('artifactSource')==state.get('controllerSource')==p['source']
            and state.get('wheelSHA256')==p['wheel']['sha256'] and state.get('currentInputIdentity')==identity
            and state.get('distributionOwnershipVerified') is True and state.get('completeWheelAndInstalledRecordVerified') is True
            and len(state.get('loadedModules',{}))==4 and state['loadedModules'].get('umf/_rust_core.abi3.so',{}).get('sha256')==p['wheel']['native_sha256']
            and record.get('status')=='passed' and record.get('wheel_sha256')==p['wheel']['sha256'] and record.get('native_sha256')==p['wheel']['native_sha256'], 'initial-inspector-original-installed-identity')
    # These are the original workflow's actual retained names. The early
    # resource-limited run has only producer/cost logs and no later-stage files;
    # success intake requires every stage's actual companions.
    for name in ('public-probe.log','cost-driver.log','public-saga19.log','lanes-driver.log','saga-lifecycle2.log'):
        insist((root/name).is_file(),'initial-inspector-original-required-raw-log')
    insist((root/'rust-cases').is_dir() and any((root/'rust-cases').glob('*-case.log')),
           'initial-inspector-original-rust-raw-logs')
    return wheel


def initial_inspector_material(a,source,destination,deadline=None,workspace_limit=None,workspace_roots=()):
    p=a['initialInspector'];initial_inspector_shape(p,a)
    if workspace_limit is None and 'transportObservation' in a:
        workspace_limit=transport_budgets(a)['workspace_bytes'];workspace_roots=external_workspace_roots(source)
    fetch=lambda *args,**kwargs:deadline_api(*args,deadline=deadline,**kwargs)
    run=fetch('actions/runs/'+str(p['run'])+'/attempts/1');job=fetch('actions/jobs/'+str(p['job']));art=fetch('actions/artifacts/'+str(p['artifact']))
    initial_inspector_provenance(a,p,run,job,art)
    limit=a['bounds']['artifact_bytes'];insist(type(art.get('size_in_bytes')) is int and 0<art['size_in_bytes']<=limit,'initial-inspector-artifact-bound')
    if workspace_limit is not None:
        root=destination.parent.parent
        if 'transportObservation' in a:external_workspace_size(workspace_roots,transport_budgets(a)['external_workspace_bytes'],deadline)
        insist(workspace_bound(root,workspace_limit,workspace_roots,deadline=deadline)+art['size_in_bytes']<=workspace_limit,'initial-inspector-workspace-before-download')
    destination.mkdir(parents=True,exist_ok=False);transport=destination.parent/(destination.name+'.transport.zip')
    count=fetch('actions/artifacts/'+str(p['artifact'])+'/zip',True,limit,sink=transport)
    insist(count==art['size_in_bytes'] and digest(transport,deadline)==p['sha256'],'initial-inspector-artifact-bytes')
    with zipfile.ZipFile(transport) as archive:
        rows=archive.infolist();insist(len(rows)==len(p['members']) and {row.filename for row in rows}==set(p['members'])
            and sum(row.file_size for row in rows)<=limit,'initial-inspector-original-member-roster-bound')
        if workspace_limit is not None:
            insist(workspace_bound(root,workspace_limit,workspace_roots,deadline=deadline)+sum(row.file_size for row in rows)<=workspace_limit,'initial-inspector-workspace-before-extract')
        for row in rows:
            path_name(row.filename);insist(not row.is_dir() and (row.external_attr>>16)&0o170000 in (0,0o100000), 'initial-inspector-original-member-kind')
            target=destination/row.filename;target.parent.mkdir(parents=True,exist_ok=True)
            with archive.open(row) as src,target.open('xb') as dst:
                state=hashlib.sha256();written=0
                while block:=timed_read(src,min(1048576,limit-written+1),deadline):
                    written+=len(block);insist(written<=row.file_size and written<=limit,'initial-inspector-member-bound');state.update(block);timed_write(dst,block,deadline)
            insist(written==row.file_size and state.hexdigest()==p['members'][row.filename], 'initial-inspector-original-member-bytes')
    inventory(destination,p['members'],deadline)
    return initial_inspector_reports(a,p,source,destination,deadline)


def initial_or_produced_raw(a,source,rawdir,command,initial=None,deadline=None,copy=None):
    if initial is None:
        command(['python3','-m','build','--no-isolation','--wheel','--outdir',str(rawdir),'python'])
    else:
        insist(a.get('initialInspector') is not None and digest(initial,deadline)==a['initialInspector']['wheel']['sha256'],
               'initial-inspector-reuse-original-byte-identity')
        rawdir.mkdir(parents=True,exist_ok=False)
        if copy is None:
            target=rawdir/initial.name
            if a.get('profile')==MULTIPART_CANDIDATE:
                multipart_stage_accounting(rawdir.parents[1],a,deadline,[(initial,target)],complete=False,source_root=source)
            operation_copy(initial,target,deadline)
            if a.get('profile')==MULTIPART_CANDIDATE:target.chmod(initial.stat().st_mode&0o777)
        else:copy(initial,rawdir/initial.name)
    return one(rawdir,'*.whl')


def standalone_cli_source(a,work,command):
    """Return the owned CLI; initial Linux wheel reuse builds it from source."""
    target=Path(work)/'target'/('aarch64-apple-darwin/release/umf' if a['platform']=='macos-arm64' else 'release/umf')
    if 'initialInspector' in a and a['platform']=='linux-x86_64':
        command(['cargo','build','--locked','--release','--manifest-path','Cargo.toml',
                 '-p','umf-cli','--features','umf-cli/native-postgresql'])
    insist(target.is_file() and not target.is_symlink(),'standalone-cli-missing')
    return target


def material_shape(p,multipart=False):
    if multipart and type(p) is dict and p.get('profile')==MULTIPART_MATERIAL:
        return multipart_material_shape(p)
    extension=multipart and type(p) is dict and 'envelope' in p
    closed(p, ('kind','run','job','attempt','artifact','workflow','workflow_sha','controller','source','platform','job_name','upload_step','sha256','members') + (('envelope',) if extension else ()))
    step=UPLOAD_STEP
    if extension:
        insist(type(p['envelope']) is str and re.fullmatch(r'(proof|part-[0-9]{3})',p['envelope']),'multipart-envelope-label')
        step=UPLOAD_STEP if p['envelope']=='proof' else UPLOAD_STEP+' / '+p['envelope']
    for k in ('run','job','attempt','artifact'):
        insist(type(p[k]) is int and p[k]>0,'invalid-material-provenance')
    insist(p['kind'] in ('common','continuation','qualified'),'unknown-material-kind')
    insist(p['workflow']==WORKFLOW,'wrong-material-workflow');sha(p['workflow_sha'],40)
    insist(p['platform'] in PLATFORMS and p['job_name']==('linux' if p['platform']=='linux-x86_64' else 'macos') and p['upload_step']==step,'material-job-platform-or-step')
    sha(p['controller'],40);sha(p['source'],40);sha(p['sha256']);pins(p['members'])


OBSERVE_GATES = GATES[:6]
SDK_FULL_CUSTODY = 'sdk-full139-custody.json'
SDK_SAGA_CUSTODY = 'sdk-saga-custody.json'


def transport_budgets(a):
    return a['transportObservation']['budgets'] if 'transportObservation' in a else a['transport']['budgets']


def continuation_working_members(members,completed_rebuild):
    """Exact admitted member paths copied back to recipe-consumer locations."""
    return {member for member in members
            if member.startswith(('common/','raw/','selected/'))
            or (completed_rebuild and (member.startswith('rebuilt/') or member in ('core-artifact.json','rebuild.json')))
            or member in ('wheel.json','pair.json','standalone-umf','sdk.json',SDK_FULL_CUSTODY,SDK_SAGA_CUSTODY)
            or member.startswith(('inspection-','interpreter-','install-','freeze-','record-','native-','saga-','compatibility-','factory-origin-'))}


def restore_continuation_working_members(material,retained,completed_rebuild,copy_current):
    material=Path(material);retained=Path(retained)
    files={p.relative_to(material).as_posix() for p in material.rglob('*') if p.is_file()}
    working=continuation_working_members(files,completed_rebuild)
    if 'sdk.json' in working:
        sdk=read(material/'sdk.json')
        if 'custody' in sdk:
            closed(sdk,('archive_sha256','manifest_sha256','platform','checks','custody'))
            custody=sdk['custody'];closed(custody,('full139','saga'))
            required={SDK_FULL_CUSTODY,SDK_SAGA_CUSTODY}
            for key,filename in (('full139',SDK_FULL_CUSTODY),('saga',SDK_SAGA_CUSTODY)):
                row=custody[key];closed(row,('path','sha256','bytes','mode'));sha(row['sha256'])
                insist(row['path']==filename and type(row['bytes']) is int and row['bytes']>0
                       and type(row['mode']) is int and row['mode'] in (0o644,0o755),'continuation-sdk-custody-identity')
                source=material/filename
                insist(filename in files and source.is_file() and not source.is_symlink()
                       and source.stat().st_size==row['bytes'] and source.stat().st_mode&0o777==row['mode']
                       and digest(source)==row['sha256'],'continuation-sdk-custody-member-mismatch')
            insist(required<=files,'continuation-sdk-custody-members-missing')
    for name in sorted(working):
        source=material/name;insist(source.is_file() and not source.is_symlink(),'continuation-working-member-missing')
        target=retained/name;target.parent.mkdir(parents=True,exist_ok=True);copy_current(source,target)
    return working


def observation_config(value, a):
    """P supplies finite slots/roles, never guessed future lengths or hashes."""
    closed(value, ('payload_bytes','objects','source','budgets'))
    payload=bounded_integer(value['payload_bytes'],MAX_PAYLOAD,'observation-payload',1)
    objects=value['objects'];insist(type(objects) is dict and 0<len(objects)<=MAX_OBJECTS,'observation-object-count')
    budget=value['budgets'];closed(budget,('logical_bytes','role_bytes','transport_bytes','expanded_bytes','workspace_bytes','proof_bytes','seconds','control_bytes','external_workspace_bytes'))
    for key in ('logical_bytes','role_bytes','transport_bytes','expanded_bytes','workspace_bytes','control_bytes','external_workspace_bytes'):
        bounded_integer(budget[key],(12 if key=='role_bytes' else 4)*MAX_AGGREGATE,'observation-'+key,1)
    bounded_integer(budget['control_bytes'],(3*MAX_PARTS+4)*BUFFER,'observation-control-budget',1)
    bounded_integer(budget['logical_bytes'],MAX_AGGREGATE,'observation-logical',1)
    bounded_integer(budget['transport_bytes'],MAX_AGGREGATE,'observation-transport',1)
    bounded_integer(budget['proof_bytes'],MAX_BYTES,'observation-proof',4096)
    bounded_integer(budget['seconds'],MAX_SECONDS,'observation-seconds',1)
    names=set();roles=set();logical=role_bytes=parts=0
    required=set(COMMON_ROLES)|{'linux-x86_64/'+r for r in HOST_ROLES}|{'raw-wheel','rebuilt-wheel','initial-input:'+a['initialInspector']['wheel']['member']}
    allowed=required|{'initial-input:'+name for name in a['initialInspector']['members']}
    for path,obj in objects.items():
        path_name(path);insist(len(path.encode())<=MAX_SOURCE_PATH,'observation-object-path')
        closed(obj,('roles','mode','maximum_bytes'))
        insist(path not in names,'observation-name-collision');names.add(path)
        insist(type(obj['mode']) is int and obj['mode'] in (0o644,0o755),'observation-object-mode')
        n=bounded_integer(obj['maximum_bytes'],MAX_AGGREGATE,'observation-object-bytes',1)
        rr=obj['roles'];insist(type(rr) is list and len(rr)==1 and rr[0]==path and path in allowed
                              and path not in roles,'observation-object-roles');roles.add(path)
        logical+=n;role_bytes+=n*len(rr);parts+=(n+payload-1)//payload
        insist(not any(path.startswith(other+'/') or other.startswith(path+'/') for other in objects if other!=path),'observation-path-overlap')
    insist(required<=roles and parts<=MAX_PARTS,'observation-complete-roles-or-parts')
    insist(logical<=budget['logical_bytes'] and role_bytes<=budget['role_bytes']
           and logical+budget['proof_bytes']<=budget['expanded_bytes']
           and logical+budget['proof_bytes']<=budget['transport_bytes']
           and budget['control_bytes']>=(3*parts+4)*BUFFER
           and budget['workspace_bytes']>=3*logical+budget['transport_bytes']+budget['proof_bytes']+budget['control_bytes']+budget['external_workspace_bytes'],
           'observation-derived-budget')
    src=value['source'];closed(src,('object','prefix','commit','tree','maximum_tar_bytes','maximum_member_bytes','maximum_members'))
    insist(src['object']=='source' and src['object'] in objects and src['prefix']=='umf-v'+a['version']+'/'
           and src['commit']==a['source']['commit'] and src['tree']==a['source']['tree'],'observation-source-identity')
    bounded_integer(src['maximum_tar_bytes'],MAX_AGGREGATE,'observation-source-tar',1024)
    bounded_integer(src['maximum_member_bytes'],src['maximum_tar_bytes'],'observation-source-members')
    bounded_integer(src['maximum_members'],MAX_SOURCE_MEMBERS,'observation-source-count',1)
    insist(budget['external_workspace_bytes']>=src['maximum_member_bytes'],'observation-source-workspace')
    return value


def require_operation(a, operation):
    if 'transportObservation' in a:
        insist(type(a) is dict and all(k in a for k in ('purpose','profile','platform','version','common','continuation')),'observation-admission-fields')
        insist(operation=='observe','observation-only-operation')
        insist(a['purpose']=='candidate-production' and a['profile']==MULTIPART_CANDIDATE
               and a['platform']=='linux-x86_64' and a['version']=='0.10.10'
               and a['common'] is None and a['continuation'] is None and 'initialInspector' in a,'observation-first-linux-only')
    else:insist(operation!='observe','observe-requires-observation-config')


def observation_object_path(role,a,retained):
    """Resolve a fixed admitted role to its one original producer path."""
    retained=Path(retained);version=a['version']
    fixed={
        'source':retained/'source.tar.gz',
        'core-sdist':retained/'common'/('umf_core-'+version+'.tar.gz'),
        'codegen-wheel':retained/'common'/('umf_codegen-'+version+'-py3-none-any.whl'),
        'codegen-sdist':retained/'common'/('umf_codegen-'+version+'.tar.gz'),
        'linux-x86_64/standalone-cli':retained/'standalone-umf',
        'linux-x86_64/sdk':retained/'umf-sdk-linux-x86_64.tgz',
        'linux-x86_64/sdk-manifest':retained/'sdk-manifest.json',
    }
    if role in fixed:return fixed[role]
    if role in ('linux-x86_64/core-wheel','raw-wheel','rebuilt-wheel'):
        folder={'linux-x86_64/core-wheel':'selected','raw-wheel':'raw','rebuilt-wheel':'rebuilt'}[role]
        directory=retained/folder
        found=list(directory.glob('*.whl')) if directory.exists() else []
        if not found:
            owned_directory=retained.parent/'owned'/'multipart-originals'/folder
            owned_found=list(owned_directory.glob('*.whl')) if owned_directory.exists() else []
            if owned_found:directory=owned_directory;found=owned_found
        insist(len(found)<=1 and all(p.is_file() and not p.is_symlink() for p in found),'observation-nonunique-wheel')
        if found and not found[0].is_relative_to(retained):return retained/folder/found[0].name
        return found[0] if found else retained/folder/('__missing-'+folder+'-'+version+'.whl')
    if role.startswith('initial-input:'):
        member=role.removeprefix('initial-input:');path_name(member)
        return retained/'initial-inspector'/member
    raise Refusal('observation-unknown-role')


def observation_role_for_path(name):
    """Map only the controller's fixed producer locations to admitted roles."""
    if name in ('source.tar.gz','standalone-umf','umf-sdk-linux-x86_64.tgz','sdk-manifest.json'):
        return {'source.tar.gz':'source','standalone-umf':'linux-x86_64/standalone-cli',
                'umf-sdk-linux-x86_64.tgz':'linux-x86_64/sdk','sdk-manifest.json':'linux-x86_64/sdk-manifest'}[name]
    common={
        'common/umf_core-0.10.10.tar.gz':'core-sdist',
        'common/umf_codegen-0.10.10-py3-none-any.whl':'codegen-wheel',
        'common/umf_codegen-0.10.10.tar.gz':'codegen-sdist',
    }
    if name in common:return common[name]
    if name.startswith('selected/') and name.endswith('.whl'):return 'linux-x86_64/core-wheel'
    if name.startswith('raw/') and name.endswith('.whl'):return 'raw-wheel'
    if name.startswith('rebuilt/') and name.endswith('.whl'):return 'rebuilt-wheel'
    if name.startswith('initial-inspector/'):
        return 'initial-input:'+name.removeprefix('initial-inspector/')
    return None


def observed_source(path, a, source_root, deadline):
    """Measure hosted bytes, then execute the unchanged complete source reader."""
    import gzip
    cfg=a['transportObservation'];src=cfg['source'];obj=cfg['objects'][src['object']]
    insist(path.is_file() and not path.is_symlink() and 0<path.stat().st_size<=obj['maximum_bytes'],'observation-source-compressed-bound')
    # Both passes are streaming and share the SAME operation clock. Sizes from
    # Git's immutable blob roster are authority, not caller TAR claims.
    roster=complete_git_roster(source_root,a['source']['commit'],deadline,bounded=True)
    raw=bounded_check_output(['git','-C',str(source_root),'ls-tree','-r','-l','-z',a['source']['commit']],MAX_BYTES,cwd=source_root,deadline=deadline)
    sized={};member_bytes=0
    for row in raw.split(b'\0'):
        if not row:continue
        header,name=row.split(b'\t',1);mode,kind,oid,size=header.decode().split();name=name.decode('utf8','surrogateescape')
        insist(kind=='blob' and size.isdecimal() and name not in sized,'observation-source-roster')
        sized[name]=(mode,oid)
        if mode!='120000':member_bytes+=int(size)
    insist(sized==roster and len(roster)<=src['maximum_members'] and member_bytes<=src['maximum_member_bytes'],'observation-source-member-bound')
    h=hashlib.sha256();count=0
    with gzip.open(path,'rb') as stream:
        while chunk:=timed_read(stream,BUFFER,deadline):
            count+=len(chunk);insist(count<=src['maximum_tar_bytes'],'observation-decoded-source-bound');h.update(chunk)
    facts={'object':'source.tar.gz','prefix':src['prefix'],'members':len(roster),'member_bytes':member_bytes,'tar_bytes':count,'tar_sha256':h.hexdigest()}
    with path.open('rb') as stream:stream_source_archive(stream,roster,a['source']['commit'],facts,deadline)
    checkpoint(deadline);return facts


def bounded_check_output(argv,maximum,cwd=None,deadline=None):
    """Capture bounded metadata without unbounded communicate/check_output."""
    bounded_integer(maximum,MAX_BYTES,'metadata-output-bound',1)
    checkpoint(deadline)
    proc=subprocess.Popen(argv,cwd=cwd,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
    selector=selectors.DefaultSelector();selector.register(proc.stdout,selectors.EVENT_READ);chunks=[];size=0
    try:
        while True:
            checkpoint(deadline)
            timeout=min(0.25,deadline.remaining()) if deadline is not None else 0.25
            ready=selector.select(timeout)
            if ready:
                block=proc.stdout.read1(BUFFER)
                if block:
                    size+=len(block);insist(size<=maximum,'metadata-output-bound');chunks.append(block)
                elif proc.poll() is not None:break
            elif proc.poll() is not None:
                block=proc.stdout.read1(BUFFER)
                if not block:break
                size+=len(block);insist(size<=maximum,'metadata-output-bound');chunks.append(block)
        code=proc.wait(timeout=deadline.remaining() if deadline is not None else None)
        insist(code==0,'metadata-command-failed')
        checkpoint(deadline);return b''.join(chunks)
    finally:
        selector.close()
        proc.stdout.close()
        if proc.poll() is None:proc.kill();proc.wait()


def external_workspace_size(roots,limit,deadline=None):
    total=0;count=0
    for root in roots:
        insist(not root.is_symlink(),'observation-external-root-symlink')
        for path in root.rglob('*'):
            checkpoint(deadline)
            if path.is_symlink():continue
            if path.is_file():
                total+=path.stat().st_size;count+=1
                insist(count<=4*MAX_SOURCE_MEMBERS and total<=limit,'observation-external-workspace-bound')
    return total


def multipart_stage_accounting(output,a,deadline=None,pending=(),complete=True,source_root=None):
    """No directory exemptions; every physical copy consumes its own bytes."""
    budget=transport_budgets(a);retained=output/'retained'
    objects=a['transportObservation']['objects'] if 'transportObservation' in a else a['transport']['objects']
    rows={}
    if retained.exists():
        for path in retained.rglob('*'):
            checkpoint(deadline);insist(not path.is_symlink(),'multipart-retained-symlink')
            if path.is_file():rows[path.relative_to(retained).as_posix()]=(path.stat().st_size,path.stat().st_mode&0o777,path)
    for src,dst in pending:
        checkpoint(deadline);insist(src.is_file() and not src.is_symlink(),'multipart-copy-source')
        insist(dst.is_relative_to(retained) and not dst.exists(),'multipart-copy-destination')
        for parent in dst.parents:
            insist(not parent.is_symlink(),'multipart-copy-parent-symlink')
        name=dst.relative_to(retained).as_posix();path_name(name)
        insist(name not in rows,'multipart-copy-alias');rows[name]=(src.stat().st_size,src.stat().st_mode&0o777,src)
    continuation_paths={};continuation_expected=set();continuation_limit=0
    cont=a.get('continuation')
    if cont is not None:
        origin=cont['proof'] if cont.get('profile')==MULTIPART_MATERIAL else cont
        members=origin['members']
        namespace=Path('original/%s-%s-%s'%(origin['run'],origin['attempt'],origin['artifact']))
        continuation_limit=(cont['proof_expanded_bytes'] if cont.get('profile')==MULTIPART_MATERIAL else a['bounds']['artifact_bytes'])
        completed_rebuild=False
        component_path=retained/(namespace/'component.json')
        if component_path.is_file() and not component_path.is_symlink():
            try:completed_rebuild=read(component_path,deadline).get('steps',{}).get('rebuild',{}).get('status')=='passed'
            except (ValueError,OSError):completed_rebuild=False
        continuation_expected=continuation_working_members(members,completed_rebuild)
        for member,expected_hash in members.items():
            path_name(member)
            continuation_paths[(namespace/member).as_posix()]=expected_hash
            if member in continuation_expected:continuation_paths[member]=expected_hash
        for member in continuation_expected:
            original=rows.get((namespace/member).as_posix());working=rows.get(member)
            if working is not None:
                insist(original is not None and (working[0],working[1])==(original[0],original[1]),'multipart-continuation-copy-mode-or-size')
    logical=proof=roles=custody=0
    for name,(size,mode,path) in rows.items():
        path_name(name)
        if name in continuation_paths:
            insist(digest(path,deadline)==continuation_paths[name],'multipart-continuation-copy-hash')
            custody+=size
            continue
        if 'transportObservation' in a:
            role=observation_role_for_path(name);obj=objects.get(role) if role is not None else None
        else:obj=objects.get(name)
        if obj is None:proof+=size;continue
        maximum=obj.get('maximum_bytes',obj.get('bytes'))
        insist(size<=maximum and mode==obj['mode'],'multipart-logical-size-mode')
        if complete and 'maximum_bytes' not in obj:insist(size==obj['bytes'] and digest(path,deadline)==obj['sha256'],'multipart-logical-hash')
        logical+=size;roles+=size*len(obj['roles'])
    insist(logical<=budget['logical_bytes'] and roles<=budget['role_bytes'] and proof<=budget['proof_bytes'],'multipart-logical-or-proof-bound')
    insist(custody<=2*continuation_limit,'multipart-continuation-copy-bound')
    if complete and cont is not None:
        expected_members=cont['proof']['members'] if cont.get('profile')==MULTIPART_MATERIAL else cont['members']
        expected_paths={(namespace/member).as_posix() for member in expected_members}|continuation_expected
        insist(expected_paths<=set(rows),'multipart-continuation-copy-missing')
    roots=external_workspace_roots(source_root) if source_root is not None else ()
    if 'transportObservation' in a and roots:external_workspace_size(roots,budget['external_workspace_bytes'],deadline)
    used=workspace_bound(output,budget['workspace_bytes'],roots,deadline=deadline)
    # Copies, not hashes, are counted: pending sources may already occupy owned
    # workspace. Their destination bytes need an additional reservation.
    insist(used+sum(src.stat().st_size for src,_ in pending)<=budget['workspace_bytes'],'multipart-copy-workspace-before-write')
    return {'logical_bytes':logical,'proof_bytes':proof,'continuation_copy_bytes':custody,'workspace_bytes':used}


def retain_sdk_custody(out, retained, deadline, copy_current):
    rows={}
    for directory,profile,name,full in [('sdk-consumer-full','umf.sdk-installed-archive-custody/2',SDK_FULL_CUSTODY,True),
                                       ('sdk-consumer-saga','umf.sdk-installed-saga-custody/1',SDK_SAGA_CUSTODY,False)]:
        src=out/directory/'g03-sdk-install-custody.json'
        insist(src.is_file() and not src.is_symlink() and src.stat().st_size<=MAX_BYTES,'sdk-custody-original-missing')
        value=read(src,deadline)
        insist(value.get('profile')==profile and value.get('existing139ConsumerChecks')==('passed' if full else 'not-run-in-saga-phase')
               and value.get('sagaResult',{}).get('cases')==19 and value['sagaResult'].get('passed')==19,'sdk-custody-original-profile-or-outcome')
        copy_current(src,retained/name)
        insist(digest(src,deadline)==digest(retained/name,deadline),'sdk-custody-byte-copy')
        mode=retained/name
        insist(mode.stat().st_mode&0o777 in (0o644,0o755),'sdk-custody-mode')
        rows['full139' if full else 'saga']={'path':name,'sha256':digest(mode,deadline),'bytes':mode.stat().st_size,'mode':mode.stat().st_mode&0o777}
    return rows


def orchestrate_observation(a,ctx,execute,deadline):
    require_operation(a,'observe');r=empty_receipt(a,ctx)
    try:
        for gate in OBSERVE_GATES:
            deadline.check()
            r['steps'][gate]={'status':'unobserved'}
            item=execute(gate);insist(item.get('status')=='passed' and type(item.get('evidence')) is dict and bool(item['evidence']),'required-step-failed')
            r['steps'][gate]=item
        r['status']='producer-observed'
    except Exception as error:
        r['status']='failed';r['failure']=str(error) if isinstance(error,Refusal) else 'unexpected-exception-withheld'
        if gate in r['steps']:r['steps'][gate]['status']='failed'
    return r


def observed_transport(output,a,source_root,deadline,require_complete=False):
    """Actual post-production identities under P's unchanged finite ceilings."""
    cfg=observation_config(a['transportObservation'],a);retained=output/'retained';owned=output/'owned'/'multipart-originals'
    objects={};parts=0;seen_paths=set()
    for role,slot in cfg['objects'].items():
        checkpoint(deadline);path=observation_object_path(role,a,retained)
        insist(path.is_relative_to(retained) and path not in seen_paths,'observation-object-path-collision');seen_paths.add(path)
        old=owned/path.relative_to(retained);live=path
        insist(not (live.exists() and old.exists()),'observation-duplicate-logical-copy')
        if not live.exists() and old.exists():path=old
        if not path.exists():
            insist(not require_complete and role!='source','observation-object-missing')
            continue
        insist(path.is_file() and not path.is_symlink() and 0<path.stat().st_size<=slot['maximum_bytes'] and path.stat().st_mode&0o777==slot['mode'],'observation-object-size-mode')
        storage_root=retained if path.is_relative_to(retained) else owned
        insist(not storage_root.is_symlink(),'observation-storage-root-symlink')
        for parent in path.parents:
            if not parent.is_relative_to(storage_root):break
            insist(not parent.is_symlink(),'observation-object-parent-symlink')
        name=path.relative_to(retained if path.is_relative_to(retained) else owned).as_posix()
        whole=hashlib.sha256();rows=[];offset=0
        with path.open('rb') as src:
            while offset<path.stat().st_size:
                h=hashlib.sha256();length=min(cfg['payload_bytes'],path.stat().st_size-offset);left=length
                while left:
                    chunk=timed_read(src,min(BUFFER,left),deadline);insist(chunk,'observation-short-object');h.update(chunk);whole.update(chunk);left-=len(chunk)
                rows.append({'ordinal':len(rows),'offset':offset,'length':length,'sha256':h.hexdigest()});offset+=length;parts+=1
                insist(parts<=MAX_PARTS,'observation-part-count')
        objects[name]={'name':Path(name).name,'roles':[role],'mode':slot['mode'],'bytes':offset,'sha256':whole.hexdigest(),'parts':rows}
    insist('source.tar.gz' in objects,'observation-source-not-observed')
    source_path=observation_object_path('source',a,retained)
    if not source_path.exists() and (owned/'source.tar.gz').exists():source_path=owned/'source.tar.gz'
    source=observed_source(source_path,a,source_root,deadline)
    source['object']=next(name for name,row in objects.items() if 'source' in row['roles'])
    budget=dict(cfg['budgets']);logical=sum(row['bytes'] for row in objects.values());role_bytes=sum(row['bytes']*len(row['roles']) for row in objects.values())
    budget['logical_bytes']=logical;budget['role_bytes']=role_bytes;budget['expanded_bytes']=logical+budget['proof_bytes']
    exact={'profile':MULTIPART,'payload_bytes':cfg['payload_bytes'],'objects':objects,'source':source,'budgets':budget}
    multipart_plan(exact);return exact


def observation_stage_reservation(output,a,source_root,roles,deadline):
    """Reserve each stage's possible logical outputs plus remaining external/proof capacity."""
    cfg=observation_config(a['transportObservation'],a);budget=cfg['budgets'];retained=output/'retained'
    used=multipart_stage_accounting(output,a,deadline,complete=False,source_root=source_root)
    roots=external_workspace_roots(source_root);external=external_workspace_size(roots,budget['external_workspace_bytes'],deadline)
    reserve=0
    for role in roles:
        slot=cfg['objects'][role];path=observation_object_path(role,a,retained)
        owned=output/'owned'/'multipart-originals'/path.relative_to(retained)
        if not path.exists() and not owned.exists():reserve+=slot['maximum_bytes']
    insist(used['logical_bytes']+reserve<=budget['logical_bytes'] and used['proof_bytes']<=budget['proof_bytes'],'observation-stage-logical-reservation')
    remaining_external=budget['external_workspace_bytes']-external
    remaining_proof=budget['proof_bytes']-used['proof_bytes']
    total=workspace_bound(output,budget['workspace_bytes'],roots,deadline=deadline)
    insist(total+remaining_external+reserve+remaining_proof<=budget['workspace_bytes'],'observation-stage-workspace-before-write')
    return {'logicalBytesReserved':reserve,'externalWorkspaceRemaining':remaining_external,'proofBytesRemaining':remaining_proof}

def validate(a):
    multi=type(a) is dict and a.get('profile')==MULTIPART_CANDIDATE
    observing=type(a) is dict and 'transportObservation' in a
    if observing:
        insist(multi and 'transport' not in a,'observation-exclusive-profile');require_operation(a,'observe')
        observation_config(a['transportObservation'],a)
    elif multi:multipart_plan(a['transport'])
    if type(a) is dict and a.get('purpose')=='candidate-aggregate':
        return validate_coupled_admission(a)
    closed(a, ('id','profile','purpose','version','source','controller','platform','bounds',
               'resources','protocols','inputs','recipes','common','continuation','compatibility') + (('transportObservation',) if observing else ('transport',) if multi else ()) + (('initialInspector',) if 'initialInspector' in a else ()))
    insist(type(a['id']) is str and re.fullmatch('[a-z0-9][a-z0-9-]{0,63}', a['id']), 'invalid-admission-id')
    insist(a['profile'] in (PROFILE,MULTIPART_CANDIDATE) and a['purpose'] == 'candidate-production', 'unknown-profile-or-purpose')
    insist(type(a['version']) is str and re.fullmatch(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)',a['version'])
           and a['version'] not in {'0.0.0','0.10.7','0.10.8','0.10.9'}, 'unallocated-or-reserved-version')
    identity(a['source'])
    ctrl=a['controller'];closed(ctrl,('commit','tree','workflow_sha256','script_sha256'))
    for k,v in ctrl.items():sha(v,40 if k in ('commit','tree') else 64)
    insist(a['source']['commit'] != ctrl['commit'], 'source-controller-not-distinct')
    insist(a['platform'] in PLATFORMS, 'unsupported-platform')
    closed(a['bounds'],('workers','seconds','log_bytes','artifact_bytes'))
    for k,maximum in [('workers',1),('seconds',MAX_SECONDS),('log_bytes',1048576),('artifact_bytes',MAX_BYTES)]:
        insist(type(a['bounds'][k]) is int and (4096 if k=='artifact_bytes' else 1) <= a['bounds'][k] <= maximum, 'invalid-worker-time-or-byte-bound')
    pins(a['resources']);pins(a['inputs']);pins(a['recipes'])
    compatibility_contract(a['compatibility'])
    insist(a['inputs'].get(COMPAT_CENSUS)==a['compatibility']['census_sha256'], 'compatibility-census-source-pin')
    insist(all(a['inputs'].get(RESOURCE_SOURCES[n])==a['resources'].get('action_runtime_resources/'+n+'.json') for n in RESOURCE_NAMES), 'canonical-installed-resource-source-pins')
    insist(set(a['resources'])=={'action_runtime_resources/'+n+'.json' for n in RESOURCE_NAMES}, 'exact-nine-resource-pins')
    closed(a['protocols'],('semantic','engine','codegen'))
    insist(a['protocols']=={'semantic':'0.10.0','engine':'umf-core-r2','codegen':'umf-codegen-r3-seven-ops-nine-resources/1'}, 'protocols-differ')
    for k in ('common','continuation'):
        if a[k] is not None:
            material_shape(a[k],multipart=multi);insist(a[k]['kind']==k,'wrong-material-kind');insist(a[k]['source']==a['source']['commit'], 'cross-source-material')
    insist(a['platform']!='macos-arm64' or a['common'] is not None, 'mac-common-material-missing')
    if 'initialInspector' in a:initial_inspector_shape(a['initialInspector'],a)
    if multi:
        required=set(COMMON_ROLES)|{a['platform']+'/'+r for r in HOST_ROLES}
        roles={role for obj in (a['transportObservation'] if observing else a['transport'])['objects'].values() for role in obj['roles']}
        insist(required<=roles,'multipart-complete-logical-roles')


def admit(registry, admission_id, ctx):
    closed(ctx,('repository','repository_id','owner_id','event','ref','workflow','workflow_sha','run','attempt','platform','controller','admitted','job_name','upload_step','job'))
    closed(registry,('profile','admissions'))
    insist(registry['profile']==REGISTRY and type(registry['admissions']) is list, 'unknown-registry')
    ids=[]
    for a in registry['admissions']:validate(a);ids.append(a['id'])
    insist(len(ids)==len(set(ids)), 'duplicate-admission')
    matches=[a for a in registry['admissions'] if a['id']==admission_id]
    insist(len(matches)==1, 'unregistered-binding')
    a=matches[0]
    insist(ctx['admitted'] is True and ctx['repository']==REPO and ctx['repository_id']=='1382276802'
           and ctx['owner_id']=='273466046' and ctx['event']=='workflow_dispatch'
           and ctx['ref']=='refs/heads/main'
           and ctx['workflow']==REPO+'/'+WORKFLOW+'@refs/heads/main', 'untrusted-workflow-context')
    sha(ctx['workflow_sha'],40)
    for k in ('run','job','attempt'):
        insist(type(ctx[k]) is str and re.fullmatch('[1-9][0-9]*',ctx[k]), 'invalid-run-context')
    insist(ctx['attempt']=='1','rerun-requires-fresh-reviewed-continuation-admission')
    insist(ctx['job_name']==('linux' if a['platform']=='linux-x86_64' else 'macos') and ctx['upload_step']==UPLOAD_STEP,'unregistered-job-or-upload-step')
    insist(ctx['platform']==a['platform'] and ctx['controller']==a['controller'], 'unregistered-controller-or-platform')
    return a


def inventory(root, expected,deadline=None):
    pins(expected);root=Path(root)
    checkpoint(deadline);actual={}
    for p in root.rglob('*'):
        checkpoint(deadline)
        insist(not p.is_symlink(), 'symlink-material')
        if p.is_file():actual[p.relative_to(root).as_posix()]=digest(p,deadline)
    checkpoint(deadline);insist(actual==expected, 'missing-extra-or-changed-material')
    return actual


def provenance(p, run, job, artifact, a):
    material_shape(p,multipart=a.get('profile')==MULTIPART_CANDIDATE)
    insist(all(type(obj.get(k)) is int for obj,keys in [(run,('id','run_attempt')),(job,('id','run_id','run_attempt')),(artifact,('id',))] for k in keys),'original-api-identity-type')
    insist(run.get('id')==p['run'] and run.get('run_attempt')==p['attempt']
           and run.get('head_sha')==p['workflow_sha'] and run.get('path')==p['workflow']
           and run.get('event')=='workflow_dispatch' and run.get('repository',{}).get('full_name')==REPO
           and run.get('repository',{}).get('id')==1382276802 and run.get('repository',{}).get('owner',{}).get('id')==273466046
           and run.get('status')=='completed' and run.get('conclusion') in (('success','failure') if p['kind']=='continuation' else ('success',)), 'original-run-differs')
    insist(job.get('id')==p['job'] and job.get('run_id')==p['run'] and job.get('run_attempt')==p['attempt']
           and job.get('status')=='completed' and job.get('conclusion') in (('success','failure') if p['kind']=='continuation' else ('success',)), 'original-job-attempt-differs')
    insist(artifact.get('id')==p['artifact'] and artifact.get('expired') is False
           and artifact.get('name')=='core-successor-'+('linux' if p['kind']=='common' or a['platform']=='linux-x86_64' else 'macos')+'-'+str(p['run'])+'-'+str(p['attempt'])+('-'+p['envelope'] if 'envelope' in p else '')
           and artifact.get('digest')=='sha256:'+p['sha256']
           and artifact.get('workflow_run',{}).get('id')==p['run']
           and artifact.get('workflow_run',{}).get('head_sha')==p['workflow_sha'], 'original-artifact-differs')
    insist(p['source']==a['source']['commit'] and p['controller']==a['controller']['commit'], 'cross-source-or-controller-material')
    insist(p['platform']==('linux-x86_64' if p['kind']=='common' else a['platform']),'material-platform-differs')
    host={'linux-x86_64':'ubuntu-24.04','macos-arm64':'macos-15'}[p['platform']]
    insist(job.get('name')==p['job_name'] and job.get('head_sha')==p['workflow_sha'] and host in job.get('labels',[]),'original-job-platform-differs')
    steps=[v for v in job.get('steps',[]) if v.get('name')==p['upload_step']]
    insist(len(steps)==1 and steps[0].get('status')=='completed' and steps[0].get('conclusion')=='success','original-upload-step-not-successful')
    try:
        created=datetime.fromisoformat(artifact['created_at'].replace('Z','+00:00'))
        begin=datetime.fromisoformat(job['started_at'].replace('Z','+00:00'))
        end=datetime.fromisoformat(job['completed_at'].replace('Z','+00:00'))
        upload_begin=datetime.fromisoformat(steps[0]['started_at'].replace('Z','+00:00'))
        upload_end=datetime.fromisoformat(steps[0]['completed_at'].replace('Z','+00:00'))
    except (KeyError,TypeError,ValueError):raise Refusal('missing-original-upload-time') from None
    insist(begin<=upload_begin<=created<=upload_end<=end,'artifact-outside-original-upload-step')


def git_blob(body):return hashlib.sha1(b'blob '+str(len(body)).encode()+b'\0'+body).hexdigest()


def archive_correspondence(stream, roster, commit, prefix):
    seen=set()
    with tarfile.open(fileobj=stream,mode='r|*') as archive:
        for member in archive:
            insist(member.name.startswith(prefix), 'archive-prefix')
            name=member.name[len(prefix):]
            if member.isdir():
                dirname=name.rstrip('/')
                insist(member.mode==0o775 and (not dirname or any(k.startswith(dirname+'/') for k in roster)), 'archive-extra-directory')
                continue
            insist(name in roster and name not in seen, 'archive-extra-duplicate');seen.add(name)
            mode,oid=roster[name]
            if mode=='120000':
                insist(member.issym() and member.mode==0o777, 'archive-link-mode');raw=member.linkname.encode('utf8','surrogateescape');actual=git_blob(raw)
            else:
                insist(member.isfile() and mode in ('100644','100755') and member.mode=={'100644':0o664,'100755':0o775}[mode], 'archive-file-mode')
                h=hashlib.sha1(b'blob '+str(member.size).encode()+b'\0');f=archive.extractfile(member)
                while chunk:=f.read(1048576):h.update(chunk)
                actual=h.hexdigest()
            insist(actual==oid, 'archive-blob-bytes')
        insist(archive.pax_headers.get('comment')==commit, 'archive-source-comment')
    insist(seen==set(roster), 'archive-missing-members')


def validate_coupled_admission(a):
    base={k:v for k,v in a.items() if k not in ('components','roster')}
    base['purpose']='candidate-production';validate(base)
    insist(a['platform']=='linux-x86_64' and a['common'] is None and a['continuation'] is None,'aggregate-not-platform-producer')
    closed(a['components'],PLATFORMS)
    for platform,binding in a['components'].items():
        closed(binding,('admission_id','material'))
        insist(type(binding['admission_id']) is str and binding['admission_id']!=a['id'],'aggregate-component-id')
        material_shape(binding['material'],multipart=a.get('profile')==MULTIPART_CANDIDATE)
        insist(binding['material']['kind']=='qualified' and binding['material']['platform']==platform,'aggregate-material-platform')
    roles=set(COMMON_ROLES)|{p+'/'+r for p in PLATFORMS for r in HOST_ROLES}
    closed(a['roster'],roles)
    names=set();members=set()
    for role,row in a['roster'].items():
        closed(row,('name','platform','member','sha256','bytes','mode'))
        path_name(row['name']);path_name(row['member']);sha(row['sha256'])
        insist('/' not in row['name'] and row['name'] not in names,'asset-name-collision');names.add(row['name'])
        expected=role.split('/')[0] if '/' in role else 'linux-x86_64'
        insist(row['platform']==expected,'asset-platform')
        insist(type(row['bytes']) is int and 0<row['bytes']<=(a['transport']['budgets']['logical_bytes'] if a.get('profile')==MULTIPART_CANDIDATE else a['bounds']['artifact_bytes']),'asset-size-pending-review')
        insist(type(row['mode']) is int and row['mode']==(0o755 if role.endswith('/standalone-cli') else 0o644),'asset-mode')
        key=(row['platform'],row['member']);insist(key not in members,'renamed-conflicting-member');members.add(key)


def coupled_materials(a,registry,output,source_root=None,deadline=None):
    """Only authenticated ORIGINAL complete components can enter this operation.

    Output is a closed material-readiness envelope. It NEVER authorizes a tag,
    release, upload or upgrades the component's false qualification booleans.
    Archive sizes remain refused at the unchanged64MiB per-component bound.
    """
    checkpoint(deadline);validate_coupled_admission(a)
    measure=lambda path,d=deadline:digest(path) if d is None else digest(path,d)
    read_value=lambda path,d=deadline:read(path) if d is None else read(path,d)
    loaded={};originals={};inventory_rows={};total=0;start=time.monotonic()
    checkpoint(deadline)
    for platform,binding in a['components'].items():
        matches=[item for item in registry['admissions'] if item['id']==binding['admission_id']]
        insist(len(matches)==1,'missing-component-admission');component=matches[0];validate(component)
        insist(component['purpose']=='candidate-production' and component['platform']==platform,'foreign-component-purpose')
        for key in ('version','source','resources','inputs','recipes','protocols'):
            insist(component[key]==a[key],'coupled-'+key+'-differs')
        insist(time.monotonic()-start<a['bounds']['seconds'],'aggregate-deadline')
        checkpoint(deadline);root=output/platform
        receipt=(original_material(component,binding['material'],root,source_root=source_root,deadline=deadline) if binding['material'].get('profile')==MULTIPART_MATERIAL else original_material(component,binding['material'],root))
        insist(receipt['status']=='passed','partial-component')
        aggregate(receipt,component)
        for step in receipt['steps'].values():
            evidence=step['evidence'];path_name(evidence['path'])
            insist(measure(root/evidence['path'])==evidence['sha256'],'component-gate-hash')
        loaded[platform]=(root,receipt);originals[platform]=binding['material']
    for role,row in a['roster'].items():
        checkpoint(deadline)
        insist(time.monotonic()-start<a['bounds']['seconds'],'aggregate-deadline')
        root,component=loaded[row['platform']];p=root/row['member']
        insist(p.is_file() and not p.is_symlink() and p.stat().st_size==row['bytes'] and measure(p)==row['sha256'],'aggregate-asset-custody')
        total+=row['bytes'];insist(total<=(a['transport']['budgets']['role_bytes'] if a.get('profile')==MULTIPART_CANDIDATE else a['bounds']['artifact_bytes']),'aggregate-size-pending-review')
        inventory_rows[role]=dict(row)
    # Both consumers must have used the SAME original common archives, even
    # though common generation ran only on Linux and was authenticated by Mac.
    for platform,(root,receipt) in loaded.items():
        checkpoint(deadline)
        comp=next(x for x in registry['admissions'] if x['id']==a['components'][platform]['admission_id'])
        for role in ('core-sdist','codegen-wheel','codegen-sdist'):
            row=a['roster'][role];insist(measure(root/'common'/row['name'])==row['sha256'],'common-original-differs')
        wheel_receipt=read_value(root/'wheel.json')
        insist(wheel_receipt.get('wheel')==a['roster'][platform+'/core-wheel']['sha256'] and wheel_receipt.get('standaloneCLI')==a['roster'][platform+'/standalone-cli']['sha256'],'selected-wheel-or-cli-differs')
        sdk=read_value(root/'sdk.json');sdkrow=a['roster'][platform+'/sdk'];mrow=a['roster'][platform+'/sdk-manifest']
        closed(sdk,('archive_sha256','manifest_sha256','platform','checks')+(('custody',) if 'custody' in sdk else ()))
        insist(sdk['platform']==platform,'sdk-native-platform')
        insist(sdk['archive_sha256']==sdkrow['sha256'] and sdk['manifest_sha256']==mrow['sha256'],'sdk-platform-material')
        closed(sdk['checks'],SDK_CHECKS)
        insist(all(v is True for v in sdk['checks'].values()),'sdk-native-wasm-browser-missing')
        if a.get('profile')==MULTIPART_CANDIDATE:insist('custody' in sdk,'sdk-custody-proof-missing')
        if 'custody' in sdk:
            custody=sdk['custody'];closed(custody,('full139','saga'))
            custody_specs=(('full139',SDK_FULL_CUSTODY,'umf.sdk-installed-archive-custody/2','passed'),
                           ('saga',SDK_SAGA_CUSTODY,'umf.sdk-installed-saga-custody/1','not-run-in-saga-phase'))
            for key,filename,profile,existing in custody_specs:
                row=custody[key];closed(row,('path','sha256','bytes')+(('mode',) if 'mode' in row else ()));sha(row['sha256'])
                insist(row['path']==filename and type(row['bytes']) is int and row['bytes']>0,'sdk-custody-path-or-size')
                path=root/filename
                insist(path.is_file() and not path.is_symlink() and path.stat().st_size==row['bytes'] and measure(path)==row['sha256'],'sdk-custody-member-identity')
                if a.get('profile')==MULTIPART_CANDIDATE:insist(type(row.get('mode')) is int and row['mode'] in (0o644,0o755),'sdk-custody-mode-missing')
                if 'mode' in row:insist(path.stat().st_mode&0o777==row['mode'],'sdk-custody-mode-differs')
                value=read_value(path)
                insist(value.get('profile')==profile and value.get('existing139ConsumerChecks')==existing
                       and value.get('sagaResult',{}).get('cases')==19 and value['sagaResult'].get('passed')==19,'sdk-custody-member-result')
        source=read_value(root/receipt['steps']['source']['evidence']['path'])
        insist(source.get('allModesSymlinksAndBlobBytesMatch') is True and source.get('archive_sha256' if a.get('profile')==MULTIPART_CANDIDATE else 'tar_sha256')==a['roster']['source']['sha256'],'full-source-material')
        consumers=read_value(root/'consumers.json')
        insist(consumers.get('normalResolverCells')==list(CELLS),'normal-resolver-proof-missing')
        closed(consumers['cells'],CELLS)
        for cell in CELLS:
            checkpoint(deadline)
            evidence=consumers['cells'][cell]
            closed(evidence,('interpreter','install','freeze','record','postRecord','inspection','native','saga'))
            for kind,prefix,suffix in [('interpreter','interpreter-','.json'),('install','install-','.json'),('freeze','freeze-','.txt'),('record','record-','.json'),('postRecord','record-post-','.json'),('inspection','inspection-','.json'),('native','native-','.xml'),('saga','saga-','.json')]:
                insist(measure(root/(prefix+cell+suffix))==evidence[kind],'consumer-original-material-hash')
            deep=receipt['inspection'][cell]
            insist(read_value(root/('inspection-'+cell+'.json'))==deep,'consumer-inspection-material')
            compatibility_material(root,deep,comp)
            for label in ('record-','record-post-'):
                record=read_value(root/(label+cell+'.json'))
                insist(record.get('status')=='passed' and record.get('distribution_version')==a['version']
                       and record.get('wheel_sha256')==deep['wheel_sha256'] and record.get('native_sha256')==deep['native_sha256'],'consumer-record-material')
            report=read_value(root/('install-'+cell+'.json'));packages={}
            for item in report.get('install',[]):
                name=item['metadata']['name'].lower().replace('_','-')
                insist(name not in packages,'resolver-duplicate-distribution');packages[name]=item
            for name,expected in [('umf-core',deep['wheel_sha256']),('umf-codegen',a['roster']['codegen-wheel']['sha256'])]:
                item=packages.get(name,{})
                insist(item.get('metadata',{}).get('version')==a['version']
                       and item.get('download_info',{}).get('archive_info',{}).get('hashes',{}).get('sha256')==expected,'consumer-normal-resolver-material')
        cli=read_value(root/consumers['embeddedCLI19']['path'])
        insist(measure(root/consumers['embeddedCLI19']['path'])==consumers['embeddedCLI19']['sha256'],'cli-report-hash')
        wheel=root/a['roster'][platform+'/core-wheel']['member']
        with zipfile.ZipFile(wheel) as archive:
            info=archive.getinfo('umf/_bin/umf');insist(info.file_size<=MAX_BYTES and (info.external_attr>>16)&0o170000==0o100000 and (info.external_attr>>16)&0o111!=0 and not (info.external_attr>>16)&0o7000,'embedded-cli-bound-type-mode')
            state=hashlib.sha256()
            with archive.open(info) as stream:
                while chunk:=timed_read(stream,1048576,deadline):state.update(chunk)
        insist(type(cli.get('cases')) is int and cli['cases']==19 and type(cli.get('passed')) is int and cli['passed']==19
               and cli.get('host')=='cli' and cli.get('artifacts',{}).get('cliBinary',{}).get('sha256')==state.hexdigest(),'embedded-cli19-material')
        # A standalone CLI has independent bytes. Its original19 cannot be
        # inferred from the embedded CLI even when they share producer source.
        standalone=read_value(root/consumers['standaloneCLI19']['path'])
        insist(measure(root/consumers['standaloneCLI19']['path'])==consumers['standaloneCLI19']['sha256'],'standalone-report-hash')
        insist(type(standalone.get('cases')) is int and standalone['cases']==19 and type(standalone.get('passed')) is int and standalone['passed']==19
               and standalone.get('host')=='cli' and standalone.get('artifacts',{}).get('cliBinary',{}).get('sha256')==a['roster'][platform+'/standalone-cli']['sha256'],'standalone-cli19-material')
    insist(time.monotonic()-start<a['bounds']['seconds'],'aggregate-deadline')
    checkpoint(deadline)
    return {'profile':COUPLED,'source':a['source'],'version':a['version'],'controller':a['controller'],
            'resources':a['resources'],'inputs':a['inputs'],'protocols':a['protocols'],'originals':originals,
            'assets':inventory_rows,'inventoriedAssetBytes':total,'status':'material-gates-passed',
            'releaseQualified':False,'nativeReleaseQualified':False,'coupledQualified':False,'publicationAuthorized':False}


def execute_coupled(a,ctx,args):
    deadline=getattr(args,'multipart_deadline',None)
    if a.get('profile')==MULTIPART_CANDIDATE and deadline is None:deadline=OperationDeadline(min(a['bounds']['seconds'],a['transport']['budgets']['seconds']))
    checkpoint(deadline)
    start=time.monotonic()
    measure=lambda path,d=deadline:digest(path) if d is None else digest(path,d)
    read_value=lambda path,d=deadline:read(path) if d is None else read(path,d)
    retained=args.output/'retained';retained.mkdir(exist_ok=True)
    insist(not any(retained.iterdir()),'output-not-fresh')
    source_check(a,args.source) if deadline is None else source_check(a,args.source,deadline=deadline);checkout_identity(args.controller,a['controller'])
    work=args.output/'owned';work.mkdir(exist_ok=False)
    value=(coupled_materials(a,read_value(args.root/REGISTRY_PATH),work,args.source,deadline=deadline) if a.get('profile')==MULTIPART_CANDIDATE else coupled_materials(a,read_value(args.root/REGISTRY_PATH),work))
    # Derived metadata includes no invented run or asset identity; the actual
    # original component custody remains explicit and checksum-bound.
    documents={'source-manifest.json':{'source':a['source'],'inputs':a['inputs'],'resources':a['resources']},
               'build-manifest.json':{'originals':value['originals'],'controller':a['controller'],'recipes':a['recipes']},
               'qualification-manifest.json':value,'release-pins.json':{'version':a['version'],'source':a['source'],'protocols':a['protocols'],'resources':a['resources']}}
    if a.get('profile')==MULTIPART_CANDIDATE:
        for name,obj in a['transport']['objects'].items():
            checkpoint(deadline)
            matches=[a['roster'][role] for role in obj['roles'] if role in a['roster']]
            insist(matches and all(row['name']==obj['name'] and row['bytes']==obj['bytes'] and row['sha256']==obj['sha256'] and row['mode']==obj['mode'] for row in matches),'multipart-coupled-object-roles')
            row=matches[0];original=work/row['platform']/row['member'];target=retained/name
            insist(workspace_bound(args.output,a['transport']['budgets']['workspace_bytes'])+obj['bytes']<=a['transport']['budgets']['workspace_bytes'],'multipart-coupled-before-copy')
            target.parent.mkdir(parents=True,exist_ok=True);operation_copy(original,target,deadline);target.chmod(obj['mode'])
    names={row['name'] for row in a['roster'].values()}
    insist(not names.intersection(set(documents)|{'SHA256SUMS'}),'manifest-name-collision')
    sums={row['name']:row['sha256'] for row in a['roster'].values()}
    for name,body in documents.items():
        checkpoint(deadline)
        path=retained/name
        with path.open('x') as stream:timed_write(stream,json.dumps(body,indent=2)+'\n',deadline)
        sums[name]=measure(path)
    with (retained/'SHA256SUMS').open('x') as stream:
        timed_write(stream,''.join(sums[name]+'  '+name+'\n' for name in sorted(sums)),deadline)
    source_check(a,args.source) if deadline is None else source_check(a,args.source,deadline=deadline);checkout_identity(args.controller,a['controller'])
    seal_multipart(args.output,a,deadline=deadline) if a.get('profile')==MULTIPART_CANDIDATE else finalize_retention(args.output,a['bounds']['artifact_bytes'])
    checkpoint(deadline);return 0


def empty_receipt(a,ctx):
    return {'profile':a['profile'],'status':'unobserved','source':dict(a['source']),'version':a['version'],
            'platform':a['platform'],'controller':dict(a['controller']),'inputs':dict(a['inputs']),
            'resources':dict(a['resources']),'protocols':dict(a['protocols']),
            'original':original_context(ctx),'steps':{},'inspection':None,
            'releaseQualified':False,'nativeReleaseQualified':False,'coupledQualified':False,'failure':None}


def validate_deep(d,a,cell):
    closed(d,('profile','source','version','resources','protocols','maximumWork','cases','calls','coldConstructors',
              'coldPerCall','runtime','constructorPassed','custodyPreserved','installedFilesUnchanged','loadedOwnershipVerified',
              'recordVerified','embeddedCLIVerified','normalResolver','resourceSuccess','budgetRefusalVerified',
              'wheel_sha256','native_sha256','resource_manifest_sha256','inputProfile','data_sha256','factory_manifest_sha256','compatibility','paidManifestReports'))
    insist(d['profile']==DEEP and d['source']==a['source'] and d['version']==a['version']
           and d['resources']==a['resources'] and d['protocols']==a['protocols'],'deep-identity-differs')
    for k,n in [('maximumWork',1000000),('cases',17),('calls',51),('coldConstructors',51)]:
        insist(type(d[k]) is int and d[k]==n,'deep-count-or-budget-differs')
    for k in ('coldPerCall','constructorPassed','custodyPreserved','installedFilesUnchanged','loadedOwnershipVerified',
              'recordVerified','embeddedCLIVerified','normalResolver','resourceSuccess','budgetRefusalVerified'):
        insist(d[k] is True,'deep-flag-not-true')
    closed(d['runtime'],('cell','python','implementation','executable_sha256'))
    insist(cell in CELLS and d['runtime']['cell']==cell and d['runtime']['python']==CELLS[cell][1]
           and d['runtime']['implementation']=='cpython','actual-runtime-differs')
    sha(d['runtime']['executable_sha256'])
    for k in ('wheel_sha256','native_sha256','resource_manifest_sha256','data_sha256','factory_manifest_sha256'):sha(d[k])
    insist(type(d['paidManifestReports']) is int and d['paidManifestReports']==51,'paid-manifest-report-count')
    insist(d['inputProfile']=='installed-canonical/1','wrong-factory-input-profile')
    insist(d['data_sha256']==a['inputs']['crates/umf-core/src/canonical_codegen_literals.rs'],'factory-data-source')
    compatibility_evidence(d['compatibility'],a,d['wheel_sha256'],d['native_sha256'])


def inspection_cases(corpus,resources_factory,engine_factory):
    """One fresh resource tree and cold owner constructor for EACH call."""
    insist(len(corpus)==17,'inspection-corpus')
    counts={'cases':17,'calls':0,'coldConstructors':0}
    for row in corpus:
        for carrier in ('dispatcher','list','tuple'):
            resources=resources_factory()
            engine=engine_factory(resources,max_work=1000000,resource_mode='retained-native/1')
            counts['coldConstructors']+=1
            request=loads(json.dumps(row['request'],ensure_ascii=True))
            before=json.dumps(request,sort_keys=True,ensure_ascii=True)
            if carrier=='dispatcher':
                result=engine.call('inspectAccessViews',request);insist(result=={'ok':True,'result':row['expected']},'inspection-result')
            else:
                bindings=list(request.get('bindings',())) if carrier=='list' else tuple(request.get('bindings',()))
                result=engine.inspect_access_views(request['document'],request['selected'],bindings,request.get('sourceId','logical'))
                insist(result==row['expected'],'inspection-result')
            insist(json.dumps(request,sort_keys=True,ensure_ascii=True)==before,'request-custody')
            counts['calls']+=1
    return counts


def installed_inspection_cases(corpus,engine_type,manifest_check):
    """No caller resources/profile selector; receiver reports its paid native origin."""
    insist(len(corpus)==17,'inspection-corpus')
    counts={'cases':17,'calls':0,'coldConstructors':0}
    for row in corpus:
        for carrier in ('dispatcher','list','tuple'):
            engine=engine_type.from_installed(max_work=1000000)
            counts['coldConstructors']+=1
            request=loads(json.dumps(row['request'],ensure_ascii=True))
            before=json.dumps(request,sort_keys=True,ensure_ascii=True)
            if carrier=='dispatcher':
                result=engine.call('inspectAccessViews',request)
                insist(result=={'ok':True,'result':row['expected']},'inspection-result')
            else:
                bindings=list(request.get('bindings',())) if carrier=='list' else tuple(request.get('bindings',()))
                result=engine.inspect_access_views(request['document'],request['selected'],bindings,request.get('sourceId','logical'))
                insist(result==row['expected'],'inspection-result')
            insist(json.dumps(request,sort_keys=True,ensure_ascii=True)==before,'request-custody')
            counts['calls']+=1
            # Manifest is a separate paid lifetime, strictly AFTER cold call.
            manifest_check(engine.resource_source_manifest())
    return counts


def factory_report_bytes(manifest):
    # Serialize the authentic typed report itself; no path/type normalization.
    return json.dumps(manifest,ensure_ascii=True,allow_nan=False).encode()


def factory_manifest(manifest,a,package):
    closed(manifest,('profile','inputProfile','resources'))
    insist(manifest['profile']=='umf.codegen.installed-source-manifest/1' and manifest['inputProfile']=='installed-canonical/1','factory-origin-profile')
    insist(type(manifest['resources']) is list and len(manifest['resources'])==9,'factory-resource-count')
    for name,row in zip(RESOURCE_NAMES,manifest['resources']):
        closed(row,('name','path','bytes','sha256'))
        path='action_runtime_resources/'+name+'.json'
        insist(row['name']==name and row['path']==RESOURCE_SOURCES[name] and row['sha256']==a['resources'][path]
               and row['sha256']==a['inputs'][RESOURCE_SOURCES[name]],'factory-source-custody')
        insist(type(row['bytes']) is float and row['bytes'].is_integer() and 0<row['bytes']<=2**53-1
               and row['bytes']==(package/path).stat().st_size,'factory-resource-size')
        insist(digest(package/path)==row['sha256'],'factory-installed-resource')
    return hashlib.sha256(factory_report_bytes(manifest)).hexdigest()


def aggregate(r,a):
    insist('transportObservation' not in a and r.get('status')!='producer-observed','observation-not-qualified')
    insist(r['source']==a['source'] and r['version']==a['version'] and r['platform']==a['platform']
           and r['inputs']==a['inputs'] and r['resources']==a['resources'] and r['protocols']==a['protocols']
           and r['controller']==a['controller'], 'receipt-final-identity')
    insist(set(r['steps'])==set(GATES) and all(s.get('status')=='passed' for s in r['steps'].values()), 'required-gates-failed-or-missing')
    for step in r['steps'].values():
        evidence=step.get('evidence');closed(evidence,('sha256','path'));sha(evidence['sha256']);path_name(evidence['path'])
    closed(r['inspection'],CELLS)
    for cell,d in r['inspection'].items():
        validate_deep(d,a,cell)
        insist(d['compatibility']['original']==r['original'],'compatibility-original-producer')
    insist(r['releaseQualified'] is False and r['nativeReleaseQualified'] is False and r['coupledQualified'] is False, 'candidate-not-release-proof')


def orchestrate(a,ctx,execute,finish,prior=None,clock=time.monotonic):
    r=empty_receipt(a,ctx);start=clock()
    if prior is not None:
        if prior.get('status')=='producer-observed':
            insist(set(prior['steps'])==set(OBSERVE_GATES) and prior.get('inspection') is None and all(row.get('status')=='passed' for row in prior['steps'].values()),'observed-continuation-first-six-only')
        insist(all(prior.get(k)==r[k] for k in ('profile','source','version','platform','controller','inputs','resources','protocols')), 'continuation-inputs-differ')
        for gate,item in prior['steps'].items():
            insist(gate in GATES, 'unknown-continuation-gate')
            if item.get('status')=='passed' and gate not in ('job-setup','final-identity'):
                insist(type(item.get('evidence')) is dict and bool(item['evidence']), 'continuation-evidence-missing')
                r['steps'][gate]={**item,'original':item.get('original',prior['original'])}
    try:
        for gate in GATES:
            insist(clock()-start < a['bounds']['seconds'], 'budget-exhausted')
            if gate in r['steps']:continue
            r['steps'][gate]={'status':'unobserved'}
            try:
                item=execute(gate)
                insist(item.get('status')=='passed' and type(item.get('evidence')) is dict and bool(item['evidence']), 'required-step-failed')
                r['steps'][gate]=item
            except Exception:
                r['steps'][gate]['status']='failed';raise
        insist(finish(r) is True,'required-aggregate-failed');insist(clock()-start<a['bounds']['seconds'],'budget-exhausted');r['status']='passed'
    except Exception as error:
        r['status']='failed';r['failure']=str(error) if isinstance(error,Refusal) else 'unexpected-exception-withheld'
    return r


def saga_environment(cell,python,wheel,sdist,report):
    kind,_=CELLS[cell]
    result={'UMF_SAGA_PYTHON':str(python),'UMF_SAGA_PYTHON_WHEEL':str(wheel),
            'UMF_SAGA_HOST_ID':'python' if kind=='direct' else 'python-rebuilt',
            'UMF_SAGA_RESULT_PATH':str(report)}
    if kind=='rebuilt':result['UMF_SAGA_PYTHON_SOURCE_ARCHIVE']=str(sdist)
    return result


def sdk_recipe(out):
    """Original full139 and Saga19 interfaces have DISTINCT custody profiles."""
    full=out/'sdk-consumer-full';saga=out/'sdk-consumer-saga'
    return [(['bun','run','build:sdk'],{}),
            (['python3','scripts/test-sdk-package.py'],{}),
            (['bunx','playwright','install','--with-deps','chromium'],{}),
            (['bun','scripts/test-sdk-install.ts'],{'UMF_SDK_INSTALL_PHASE':'full','UMF_SDK_INSTALL_RETAIN_DIR':str(full)}),
            (['node','scripts/test-native-sdk-install.mjs',str(full/'node_modules/@umf/core')],{}),
            (['node','scripts/test-native-sdk-install.mjs',str(full/'node_modules/@umf/core'),'--browser'],{}),
            (['bun','scripts/test-sdk-install.ts'],{'UMF_SDK_INSTALL_PHASE':'saga','UMF_SDK_INSTALL_RETAIN_DIR':str(saga)}),
            (['bun','scripts/saga-portable/installed-browser.ts'],{'UMF_SDK_INSTALL_RETAIN_DIR':str(saga)})]


def recipe_commands(a,source,out):
    """Fixed argv, no caller-supplied shell, build policy or dependency bypass."""
    py='python3';version=a['version'];raw=str(out/'raw');sdk=str(out/'sdk-consumer')
    return {
        'source':[[py,'tools/generate_codegen_resource_literals.py','--check'],[py,'scripts/check-release-versions.py'],['bun','scripts/metamodel/build.ts','--check'],[py,'scripts/build-saga-package.py','--check']],
        'common':([[py,'-m','build','--no-isolation','--sdist','--outdir',str(out/'common'),'python'],[py,'-m','build','--no-isolation','--wheel','--sdist','--outdir',str(out/'common'),'python/umf_codegen']] if a['platform']=='linux-x86_64' else []),
        'sdk':[argv for argv,_ in sdk_recipe(out)]
    }


def run_bounded(argv,cwd,env,seconds,log,maximum,audit=None,op_deadline=None):
    """One owned process group; bounded logs and deadline. No shared signals."""
    checkpoint(op_deadline)
    if op_deadline is not None:seconds=min(seconds,op_deadline.remaining())
    with Path(log).open('xb') as sink:
        if audit is not None:audit()
        checkpoint(op_deadline)
        child=subprocess.Popen(argv,cwd=cwd,env=env,stdout=sink,stderr=subprocess.STDOUT,start_new_session=True)
        deadline=time.monotonic()+seconds
        try:
            while child.poll() is None:
                checkpoint(op_deadline)
                if audit is not None:audit()
                insist(time.monotonic()<deadline, 'command-deadline')
                insist(sink.tell()<=maximum and Path(log).stat().st_size<=maximum, 'command-log-bound')
                time.sleep(.05)
            if audit is not None:audit()
            checkpoint(op_deadline)
            insist(child.returncode==0, 'command-nonzero')
            insist(Path(log).stat().st_size<=maximum, 'command-log-bound')
            checkpoint(op_deadline)
        finally:
            if child.poll() is None:
                os.killpg(child.pid,signal.SIGTERM)
                try:child.wait(timeout=2)
                except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);child.wait()


def checkout_identity(root,expected):
    insist(git(root,'rev-parse','HEAD')==expected['commit'] and git(root,'rev-parse','HEAD^{tree}')==expected['tree'], 'checkout-identity')
    insist(not git(root,'status','--porcelain','--untracked-files=no'), 'tracked-source-dirty')


def no_replay(admission_id,ctx,deadline=None):
    insist(ctx['attempt']=='1','rerun-requires-fresh-reviewed-continuation-admission')
    title='core-successor:'+admission_id+':'+ctx['platform']
    for page in range(1,11):
        checkpoint(deadline)
        rows=deadline_api('actions/workflows/core-successor-qualification.yml/runs?event=workflow_dispatch&per_page=100&page='+str(page),deadline=deadline)['workflow_runs']
        insist(not any(str(r['id'])!=ctx['run'] and r.get('display_title')==title for r in rows), 'admission-already-attempted-use-reviewed-continuation')
        if len(rows)<100:return
    raise Refusal('run-history-bound-incomplete')


def original_context(ctx):
    return {k:ctx[k] for k in ('run','job','attempt','workflow_sha','platform','job_name','upload_step')} | {'controller_sha':ctx['controller']['commit']}


def authority_binding(args):
    """Re-read immutable P registry and frozen Q bytes; no online decisions."""
    root=args.root.resolve();control=args.controller.resolve()
    p=os.environ.get('GITHUB_WORKFLOW_SHA')
    insist(git(root,'rev-parse','HEAD')==p,'registry-not-workflow-main')
    insist(not git(root,'status','--porcelain','--untracked-files=no'),'dirty-authority-checkout')
    committed=subprocess.check_output(['git','-C',str(root),'show','HEAD:'+REGISTRY_PATH])
    insist(hashlib.sha256(committed).hexdigest()==digest(root/REGISTRY_PATH),'external-registry-cannot-authorize')
    ctrl={'commit':git(control,'rev-parse','HEAD'),'tree':git(control,'rev-parse','HEAD^{tree}'),
          'workflow_sha256':digest(control/WORKFLOW),'script_sha256':digest(control/'tools/qualify_core_successor.py')}
    checkout_identity(control,ctrl)
    insist(digest(root/WORKFLOW)==ctrl['workflow_sha256'] and digest(root/'tools/qualify_core_successor.py')==ctrl['script_sha256'],'authority-code-differs')
    ctx={'repository':os.environ.get('GITHUB_REPOSITORY'),'repository_id':os.environ.get('GITHUB_REPOSITORY_ID'),
         'owner_id':os.environ.get('GITHUB_REPOSITORY_OWNER_ID'),'event':os.environ.get('GITHUB_EVENT_NAME'),
         'ref':os.environ.get('GITHUB_REF'),'workflow':os.environ.get('GITHUB_WORKFLOW_REF'),
         'workflow_sha':p,'run':os.environ.get('GITHUB_RUN_ID'),'attempt':os.environ.get('GITHUB_RUN_ATTEMPT'),
         'platform':args.platform,'controller':ctrl,'admitted':os.environ.get('SUCCESSOR_ADMITTED')=='true',
         'job_name':os.environ.get('SUCCESSOR_JOB_NAME'),'upload_step':UPLOAD_STEP}
    authority={'commit':p,'tree':git(root,'rev-parse','HEAD^{tree}'),'registry_sha256':digest(root/REGISTRY_PATH)}
    return authority,ctx


def authorize(args):
    deadline=getattr(args,'multipart_deadline',None);checkpoint(deadline)
    fetch=lambda *a,**k:deadline_api(*a,deadline=deadline,**k)
    authority,ctx=authority_binding(args)
    checkpoint(deadline)
    for k in ('run','attempt'):insist(type(ctx[k]) is str and re.fullmatch('[1-9][0-9]*',ctx[k]),'invalid-actions-context')
    run=fetch('actions/runs/'+ctx['run']+'/attempts/'+ctx['attempt'])
    insist(run.get('id')==int(ctx['run']) and run.get('run_attempt')==int(ctx['attempt'])
           and run.get('head_sha')==authority['commit'] and run.get('path')==WORKFLOW
           and run.get('event')=='workflow_dispatch'
           and run.get('repository',{}).get('id')==1382276802
           and run.get('repository',{}).get('owner',{}).get('id')==273466046,'current-workflow-P-differs')
    jobs=fetch('actions/runs/'+ctx['run']+'/attempts/'+ctx['attempt']+'/jobs')['jobs']
    matching=[j for j in jobs if j['name']==ctx['job_name'] and j['run_attempt']==int(ctx['attempt'])]
    insist(len(matching)==1,'current-job-identity');job=matching[0]
    host={'linux-x86_64':'ubuntu-24.04','macos-arm64':'macos-15'}.get(ctx['platform'])
    insist(job.get('run_id')==int(ctx['run']) and job.get('head_sha')==authority['commit'] and host in job.get('labels',[]),'current-job-platform-differs')
    ctx['job']=str(job['id'])
    a=admit(read(args.root/REGISTRY_PATH),args.id,ctx)
    operation=os.environ.get('SUCCESSOR_OPERATION','run')
    insist(operation in ('run','aggregate','observe') and (a['purpose']=='candidate-aggregate')==(operation=='aggregate'),'operation-admission-differs')
    require_operation(a,operation)
    no_replay(args.id,ctx,deadline=deadline)
    checkpoint(deadline)
    return a,ctx


def offline_envelope(a,ctx,args):
    authority,_=authority_binding(args)
    return {'profile':OFFLINE,'authority':authority,'context':ctx,'admission_sha256':hashlib.sha256(json.dumps(a,sort_keys=True,separators=(',',':')).encode()).hexdigest(),'source':a['source'],'controller':a['controller']}


def authorize_offline(args):
    # Only a trusted parent creates this hash-bound invocation after API checks.
    # The envelope never authorizes itself: registry/Git/P/Q/C are rechecked.
    insist(not any(os.environ.get(k) for k in ('GH_TOKEN','GITHUB_TOKEN','ACTIONS_RUNTIME_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN','ACTIONS_ID_TOKEN_REQUEST_URL')),'child-must-be-tokenless')
    insist(args.offline_context is not None and args.offline_context_sha256 is not None,'missing-parent-context')
    sha(args.offline_context_sha256)
    insist(digest(args.offline_context)==args.offline_context_sha256,'parent-context-hash')
    envelope=read(args.offline_context)
    closed(envelope,('profile','authority','context','admission_sha256','source','controller','cell','files'))
    authority,ctx=authority_binding(args);parent=envelope['context']
    insist(envelope['profile']==OFFLINE and envelope['authority']==authority,'offline-authority-P-differs')
    insist(all(parent.get(k)==v for k,v in ctx.items()),'offline-environment-differs')
    ctx['job']=parent['job']
    a=admit(read(args.root/REGISTRY_PATH),args.id,ctx)
    expected=hashlib.sha256(json.dumps(a,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    insist(envelope['admission_sha256']==expected and envelope['source']==a['source'] and envelope['controller']==a['controller'],'offline-Q-C-binding-differs')
    insist(envelope['cell']==args.cell and args.cell in CELLS,'offline-cell-differs')
    pins(envelope['files'])
    expected_files=cell_files(args,args.cell)
    insist(set(envelope['files'])==set(expected_files),'offline-file-roster')
    insist(all(digest(args.output/'retained'/name)==h for name,h in envelope['files'].items()),'offline-artifact-hash')
    source_check(a,args.source)
    return a,ctx


def api(path, binary=False, limit=MAX_BYTES, sink=None,deadline=None):
    checkpoint(deadline)
    insist(path.startswith('actions/'), 'unselected-api-family')
    class RedactedRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,req,fp,code,msg,headers,newurl):
            insist(newurl.startswith('https://'),'insecure-artifact-redirect')
            target=super().redirect_request(req,fp,code,msg,headers,newurl)
            target.remove_header('Authorization')
            return target
    req=urllib.request.Request('https://api.github.com/repos/'+REPO+'/'+path,
          headers={'Authorization':'Bearer '+os.environ.get('GH_TOKEN',''), 'Accept':'application/vnd.github+json'})
    try:
        with urllib.request.build_opener(RedactedRedirect()).open(req,timeout=min(30,deadline.remaining()) if deadline is not None else 30) as response:
            checkpoint(deadline)
            if sink is not None:
                total=0
                with Path(sink).open('xb') as target:
                    while True:
                        chunk=network_read(response,min(1048576,limit-total+1),deadline)
                        if not chunk:break
                        total+=len(chunk);insist(total<=limit,'api-size-bound')
                        timed_write(target,chunk,deadline)
                checkpoint(deadline);raw=total
            else:
                raw=network_read(response,limit+1,deadline)
                insist(len(raw)<=limit,'api-size-bound')
    except Refusal:raise
    except Exception as error:
        checkpoint(deadline)
        # Do not retain exception URLs, headers, response bodies or tokens.
        code=getattr(error,'code',None)
        raise Refusal('github-read-failed-'+str(code if type(code) is int else 'transport')) from None
    checkpoint(deadline);value=raw if sink is not None or binary else loads(raw.decode());checkpoint(deadline);return value


def original_material(a,p,destination,proof_dir=None,source_root=None,budget=None,deadline=None):
    deadline=budget.deadline if budget is not None else deadline;checkpoint(deadline)
    fetch=lambda *args,**kwargs:deadline_api(*args,deadline=deadline,**kwargs)
    measure=lambda path,d=deadline:digest(path) if d is None else digest(path,d)
    read_value=lambda path,d=deadline:read(path) if d is None else read(path,d)
    material_shape(p,multipart=a.get('profile')==MULTIPART_CANDIDATE)
    if p.get('profile')==MULTIPART_MATERIAL:return original_multipart_material(a,p,destination,proof_dir,source_root,deadline=deadline)
    metadata=lambda endpoint:multipart_api(endpoint,budget) if budget is not None else fetch(endpoint)
    run=metadata('actions/runs/'+str(p['run'])+'/attempts/'+str(p['attempt']))
    job=metadata('actions/jobs/'+str(p['job']))
    art=metadata('actions/artifacts/'+str(p['artifact']))
    provenance(p,run,job,art,a)
    destination.mkdir(parents=True,exist_ok=False)
    transport=destination.parent/(destination.name+'.transport.zip')
    if p['kind']=='qualified':insist('size_in_bytes' in art,'artifact-size-unknown')
    if 'size_in_bytes' in art:
        insist(type(art['size_in_bytes']) is int and 0<art['size_in_bytes']<=a['bounds']['artifact_bytes'],'artifact-size-pending-review')
    archive_bytes=fetch('actions/artifacts/'+str(p['artifact'])+'/zip',True,a['bounds']['artifact_bytes'],sink=transport)
    insist(measure(transport,deadline)==p['sha256'],'material-zip-hash')
    if 'size_in_bytes' in art:insist(archive_bytes==art['size_in_bytes'],'artifact-api-size-differs')
    with zipfile.ZipFile(transport) as z:
        metadata=z.infolist()
        size_inventory={'archiveBytes':archive_bytes,'expandedBytes':sum(m.file_size for m in metadata),'members':len(metadata),'maximumMemberBytes':max((m.file_size for m in metadata),default=0),'limitBytes':a['bounds']['artifact_bytes']}
        timed_publish(destination.parent/(destination.name+'.sizes.json'),(json.dumps(size_inventory)+'\n').encode(),deadline)
        insist(size_inventory['expandedBytes']<=a['bounds']['artifact_bytes'],'material-expanded-bound')
        insist(len(z.infolist())==len(p['members']), 'material-member-count')
        seen=set();total=0
        for m in z.infolist():
            checkpoint(deadline)
            path_name(m.filename);insist(m.filename not in seen and not m.is_dir() and m.filename in p['members'],'material-extra-or-duplicate');seen.add(m.filename)
            insist((m.external_attr>>16)&0o170000 in (0,0o100000) and not (m.external_attr>>16)&0o7000,'material-file-type')
            total+=m.file_size;insist(total<=a['bounds']['artifact_bytes'],'material-expanded-bound')
            target=destination/m.filename;target.parent.mkdir(parents=True,exist_ok=True)
            state=hashlib.sha256();written=0
            with z.open(m) as source, target.open('xb') as output:
                while chunk:=timed_read(source,1048576,deadline):
                    written+=len(chunk);insist(written<=m.file_size,'material-member-size')
                    state.update(chunk);timed_write(output,chunk,deadline)
            insist(written==m.file_size and state.hexdigest()==p['members'][m.filename],'material-member-hash')
    inventory(destination,p['members'],deadline)
    if proof_dir is not None:
        proof_dir.mkdir(parents=True,exist_ok=True)
        timed_publish(proof_dir/('original-provenance-'+str(p['artifact'])+'.json'),(json.dumps({'binding':p,'run':run,'job':job,'artifact':art},indent=2)+'\n').encode(),deadline)
        timed_copy(destination/'component.json',proof_dir/('original-component-'+str(p['run'])+'-'+str(p['attempt'])+'.json'),deadline)
    manifest=read_value(destination/'component.json',deadline)
    insist(manifest['source']==a['source'] and manifest['version']==a['version']
           and manifest['inputs']==a['inputs'] and manifest['resources']==a['resources']
           and manifest['protocols']==a['protocols'] and manifest['original']=={
               'run':str(p['run']),'job':str(p['job']),'attempt':str(p['attempt']),
               'workflow_sha':p['workflow_sha'],'controller_sha':p['controller'],'platform':p['platform'],
               'job_name':p['job_name'],'upload_step':p['upload_step']} and manifest['controller']==a['controller'], 'material-component-identity')
    insist(manifest.get('profile')==a['profile'] and manifest.get('releaseQualified') is False and manifest.get('nativeReleaseQualified') is False and manifest.get('coupledQualified') is False,'material-scope-not-candidate')
    if p['kind']=='common':insist(manifest.get('platform')=='linux-x86_64' and manifest['steps'].get('common',{}).get('status')=='passed','common-producer-not-passed')
    checkpoint(deadline);return manifest


def complete_git_roster(root,commit,deadline=None,bounded=False):
    checkpoint(deadline)
    command=['git','-C',str(root),'ls-tree','-r','-z',commit]
    raw=bounded_check_output(command,MAX_BYTES,cwd=root,deadline=deadline) if bounded else subprocess.check_output(command,**({'timeout':deadline.remaining()} if deadline is not None else {}))
    checkpoint(deadline)
    insist(len(raw)<=MAX_BYTES,'multipart-git-metadata-bound');rows={}
    for row in raw.split(b'\0'):
        checkpoint(deadline)
        if not row:continue
        head,name=row.split(b'\t',1);mode,kind,oid=head.decode().split();name=name.decode('utf8','surrogateescape')
        insist(kind=='blob' and mode in ('100644','100755','120000') and name not in rows,'multipart-git-entry')
        path_name(name);insist(len(name.encode('utf8','surrogateescape'))<=MAX_SOURCE_PATH,'multipart-git-path')
        rows[name]=(mode,oid);insist(len(rows)<=MAX_SOURCE_MEMBERS,'multipart-git-member-bound')
    checkpoint(deadline);return rows


def original_multipart_material(a,p,destination,proof_dir=None,source_root=None,deadline=None):
    deadline=deadline if deadline is not None else OperationDeadline(min(a['bounds']['seconds'],a['transport']['budgets']['seconds']));checkpoint(deadline)
    multipart_material_shape(p);multipart_plan(a['transport'])
    insist(p['source']==a['source']['commit'] and p['controller']==a['controller']['commit'] and p['platform']==('linux-x86_64' if p['kind']=='common' else a['platform']),'multipart-material-owner')
    insist(source_root is not None,'multipart-source-checkout-required')
    checkout_identity(source_root,a['source']);roster=complete_git_roster(source_root,a['source']['commit'],deadline)
    incoming={'profile':MULTIPART,'payload_bytes':MAX_PAYLOAD,'objects':p['objects'],'budgets':p['totals']['budgets'],'source':p['totals']['source']}
    workspace_bound(destination.parent,a['transport']['budgets']['workspace_bytes'],external_workspace_roots(source_root),deadline=deadline)
    destination.mkdir(parents=True,exist_ok=False);budget=MultipartBudget(incoming,deadline=deadline);paths={name:[] for name in p['objects']};actual=[]
    try:
        for index,row in enumerate(p['envelopes']):
            checkpoint(deadline)
            q=row['provenance'];part=p['objects'][row['object']]['parts'][row['ordinal']]
            run=multipart_api('actions/runs/'+str(q['run'])+'/attempts/'+str(q['attempt']),budget);job=multipart_api('actions/jobs/'+str(q['job']),budget);artifact=multipart_api('actions/artifacts/'+str(q['artifact']),budget)
            provenance(q,run,job,artifact,a)
            insist(artifact.get('size_in_bytes')==row['bytes'],'multipart-original-size')
            workspace_bound(destination.parent,a['transport']['budgets']['workspace_bytes'],external_workspace_roots(source_root),deadline=deadline)
            budget.reserve('transport_bytes',row['bytes']);budget.reserve('workspace_bytes',row['bytes'])
            archive=destination.parent/(destination.name+'-part-%03d.zip'%index)
            count=api('actions/artifacts/'+str(q['artifact'])+'/zip',True,MAX_BYTES,sink=archive,deadline=deadline)
            insist(count==row['bytes'],'multipart-download-size')
            target=destination.parent/(destination.name+'-parts')/('%03d'%index)/'payload.bin'
            multipart_envelope(archive,target,row,part,budget);paths[row['object']].append(target)
            actual.append({'binding':row,'run':run,'job':job,'artifact':artifact})
        # Proof is an independently bounded original artifact, never hidden in
        # a payload or given a larger legacy extraction allowance.
        proof=destination.parent/(destination.name+'-proof')
        proof_art=multipart_api('actions/artifacts/'+str(p['proof']['artifact']),budget)
        insist(proof_art.get('size_in_bytes')==p['proof_bytes'],'multipart-proof-original-size')
        budget.reserve('transport_bytes',p['proof_bytes']);budget.reserve('expanded_bytes',p['proof_expanded_bytes'])
        budget.reserve('workspace_bytes',p['proof_bytes']+p['proof_expanded_bytes'])
        manifest=original_material(a,p['proof'],proof,proof_dir,budget=budget)
        insist(retention_size(proof,deadline)==p['proof_expanded_bytes'],'multipart-proof-actual-expanded')
        insist(verify_retention(proof,incoming['budgets']['proof_bytes'],retained_root=proof,deadline=deadline) and read(proof/'retention.json')['fullRetention'] is True,'multipart-original-proof-omitted')
        src=p['totals']['source'];stream=PartStream(paths[src['object']],p['objects'][src['object']],deadline)
        try:stream_source_archive(stream,roster,a['source']['commit'],src,deadline)
        finally:stream.close()
        for name,obj in p['objects'].items():reconstruct_parts(paths[name],obj,destination/name,budget)
        for file in proof.rglob('*'):
            checkpoint(deadline)
            if file.is_file():
                rel=file.relative_to(proof);insist(not (destination/rel).exists(),'multipart-proof-object-collision')
                budget.reserve('workspace_bytes',file.stat().st_size);(destination/rel).parent.mkdir(parents=True,exist_ok=True);timed_copy(file,destination/rel,deadline)
        if proof_dir is not None:
            receipt={'profile':MULTIPART_MATERIAL,'objects':p['objects'],'originalEnvelopes':actual,'proof':p['proof'],'totals':p['totals'],'used':budget.used,'actualControlBytes':budget.metadata_actual_bytes,'qualified':False}
            raw=(json.dumps(receipt,indent=2)+'\n').encode();insist(len(raw)<=MAX_BYTES,'multipart-proof-index-bound')
            timed_publish(proof_dir/('multipart-original-'+str(p['proof']['artifact'])+'.json'),raw,deadline)
        checkpoint(deadline);return manifest
    except Exception:
        partial={'profile':MULTIPART_MATERIAL,'completedEnvelopes':len(actual),'requiredEnvelopes':len(p['envelopes']),'fullRetention':False,'qualified':False,'used':budget.used}
        (destination/'multipart-partial.json').write_text(json.dumps(partial)+'\n');raise


def seal_multipart(output,a,record=None,deadline=None):
    """Preserve logical bytes; produce separate <=60MiB payload directories.

    No previous ZIP is renamed or projected. Original uploads are independent
    future artifact identities, authenticated only after actual GH readback.
    """
    deadline=deadline if deadline is not None else OperationDeadline(min(a['bounds']['seconds'],a['transport']['budgets']['seconds']));checkpoint(deadline)
    t=a['transport'];multipart_plan(t);workspace_bound(output,t['budgets']['workspace_bytes'],deadline=deadline);retained=output/'retained';payloads=output/'multipart-payloads'
    insist(not payloads.exists(),'multipart-stale-seal');payloads.mkdir()
    index=[];complete=True;total=0
    planned=t['budgets']['logical_bytes'];insist(workspace_bound(output,t['budgets']['workspace_bytes'],deadline=deadline)+planned<=t['budgets']['workspace_bytes'],'multipart-seal-before-write')
    for name,obj in t['objects'].items():
        checkpoint(deadline)
        path=retained/name;row={'path':name,'object':obj,'parts':[],'complete':False}
        index.append(row)
        if not path.is_file() or path.is_symlink() or path.stat().st_size!=obj['bytes'] or digest(path,deadline)!=obj['sha256']:
            complete=False;row['refusal']='missing-or-changed-logical-object';continue
        insist(path.stat().st_mode&0o777==obj['mode'],'multipart-logical-mode')
        with path.open('rb') as src:
            for part in obj['parts']:
                checkpoint(deadline)
                slot=sum(len(x['parts']) for x in index);directory=payloads/('%03d'%slot);directory.mkdir();target=directory/'payload.bin'
                h=hashlib.sha256();left=part['length']
                with target.open('xb') as dst:
                    while left:
                        chunk=timed_read(src,min(BUFFER,left),deadline);insist(chunk,'multipart-seal-truncated');h.update(chunk);timed_write(dst,chunk,deadline);left-=len(chunk)
                insist(h.hexdigest()==part['sha256'],'multipart-seal-part-hash')
                row['parts'].append({'slot':slot,**part,'relativePath':str(target.relative_to(output))});total+=part['length']
        checkpoint(deadline);row['complete']=True
    # Move the original byte-identical logical outputs to OWNED custody only
    # after each part has been sealed; not an unrecorded omission/quarantine.
    owned=output/'owned'/'multipart-originals';owned.mkdir(parents=True,exist_ok=False)
    for row in index:
        checkpoint(deadline)
        if row['complete']:
            name=row['path'];target=owned/name;target.parent.mkdir(parents=True,exist_ok=True);(retained/name).rename(target)
    if not complete and record is not None:
        record['status']='failed';record['failure']=record.get('failure') or 'multipart-incomplete'
        timed_publish(retained/'component.json',(json.dumps(record,indent=2)+'\n').encode(),deadline)
    value={'profile':MULTIPART,'source':a['source'],'controller':a['controller'],'objects':index,'plannedBudgets':t['budgets'],'payloadBytes':total,
           'fullRetention':complete,'qualified':False,'uploadReadbackAuthenticated':False,'originalArtifactIDs':'UNOBSERVED until Actions upload/readback; never guessed'}
    raw=(json.dumps(value,indent=2)+'\n').encode();insist(len(raw)<=t['budgets']['proof_bytes'],'multipart-proof-index-size')
    timed_publish(retained/'multipart-index.json',raw,deadline)
    # Existing proof envelopes still obey exactly the original bound. Any
    # omitted proof is an explicit failure, never complete multipart retention.
    proof=finalize_retention(output,t['budgets']['proof_bytes'],record,deadline=deadline)
    insist(proof['fullRetention'],'multipart-proof-incomplete')
    checkpoint(deadline);return value


def multipart_upload_outputs(output,admission,deadline=None):
    """Validate LOCAL bounded payloads only; GH digest/provenance is unobserved."""
    checkpoint(deadline)
    multipart_plan(admission['transport']);retained=output/'retained';index=read(retained/'multipart-index.json')
    insist(index['profile']==MULTIPART and index['source']==admission['source'] and index['controller']==admission['controller']
           and index['plannedBudgets']==admission['transport']['budgets'] and index['qualified'] is False
           and index['uploadReadbackAuthenticated'] is False,'multipart-local-index-binding')
    insist(len(index['objects'])==len(admission['transport']['objects']),'multipart-local-object-count')
    files=set();slots=[]
    for row,(name,obj) in zip(index['objects'],admission['transport']['objects'].items()):
        checkpoint(deadline)
        insist(row['path']==name and row['object']==obj and type(row['complete']) is bool,'multipart-local-object')
        insist(len(row['parts'])<=len(obj['parts']),'multipart-local-extra-part')
        for part,expected in zip(row['parts'],obj['parts']):
            checkpoint(deadline)
            slot=part['slot'];bounded_integer(slot,MAX_PARTS-1,'multipart-local-slot')
            insist({k:part[k] for k in expected}==expected and part['relativePath']=='multipart-payloads/%03d/payload.bin'%slot,'multipart-local-part')
            path=output/part['relativePath'];insist(path.is_file() and not path.is_symlink() and path.stat().st_size==part['length']<=MAX_PAYLOAD and digest(path,deadline)==part['sha256'],'multipart-local-payload')
            files.add(path.relative_to(output/'multipart-payloads').as_posix());slots.append(slot)
        if row['complete']:insist(len(row['parts'])==len(obj['parts']),'multipart-local-incomplete')
    insist(slots==list(range(len(slots))),'multipart-local-slot-order')
    actual=set()
    for p in (output/'multipart-payloads').rglob('*'):
        checkpoint(deadline)
        insist(not p.is_symlink(),'multipart-local-symlink')
        if p.is_file():actual.add(p.relative_to(output/'multipart-payloads').as_posix())
    insist(actual==files and verify_retention(output,admission['transport']['budgets']['proof_bytes'],deadline=deadline),'multipart-local-roster-proof')
    if index['fullRetention']:insist(read(retained/'retention.json')['fullRetention'] is True,'multipart-local-proof-omitted')
    checkpoint(deadline);return slots


def operation_deadline(output,a,clock=time.monotonic):
    """Persist one origin once; later run/inspect/seal never grants a new span."""
    seconds=min(a['bounds']['seconds'],transport_budgets(a)['seconds'])
    path=output/'multipart-mode.json'
    identity_fields={'id':a['id'],'source':a['source'],'controller':a['controller']}
    if 'transportObservation' in a:
        identity_fields['observationConfigSHA256']=hashlib.sha256(json.dumps(a['transportObservation'],sort_keys=True,separators=(',',':')).encode()).hexdigest()
    if path.exists():
        mode=read(path);closed(mode,tuple(identity_fields)+('deadline',))
        insist(all(mode[k]==v for k,v in identity_fields.items()),'multipart-mode-changed')
        closed(mode['deadline'],('startedMonotonic','seconds'))
        insist(type(mode['deadline']['seconds']) is int and mode['deadline']['seconds']==seconds,'multipart-deadline-span-changed')
        deadline=OperationDeadline(seconds,clock,started=mode['deadline']['startedMonotonic'])
    else:
        deadline=OperationDeadline(seconds,clock)
        value={**identity_fields,'deadline':{'startedMonotonic':deadline.started,'seconds':seconds}}
        timed_publish(path,(json.dumps(value)+'\n').encode(),deadline)
    deadline.check();return deadline


def authorized_observation_admission(output,root,controller=None,source=None):
    """Authenticate unchanged observation authority before producer outputs exist."""
    mode=read(output/'multipart-mode.json');closed(mode,('id','source','controller','deadline')+(('observationConfigSHA256',) if 'observationConfigSHA256' in mode else ()))
    registry=read(root/REGISTRY_PATH);closed(registry,('profile','admissions'));insist(registry['profile']==REGISTRY,'multipart-seal-registry')
    matched=[a for a in registry['admissions'] if a['id']==mode['id']];insist(len(matched)==1,'multipart-seal-not-admitted')
    a=matched[0];validate(a)
    insist(a['profile']==MULTIPART_CANDIDATE and a['source']==mode['source'] and a['controller']==mode['controller'],'multipart-seal-authority')
    insist('transportObservation' in a and controller is not None and source is not None,'observation-seal-source-controller-required')
    config_hash=hashlib.sha256(json.dumps(a['transportObservation'],sort_keys=True,separators=(',',':')).encode()).hexdigest()
    insist(mode.get('observationConfigSHA256')==config_hash,'observation-seal-config-changed')
    # Re-authenticate immutable actual P checkout and frozen Q, not a local
    # generated result or producer readiness flag. Startup needs no future
    # component or output-plan files; those are derived only at final seal.
    authority,ctx=authority_binding(types.SimpleNamespace(root=root,controller=controller,platform=a['platform']))
    insist(ctx['controller']==a['controller'] and ctx['admitted'] is True and os.environ.get('SUCCESSOR_OPERATION')=='observe','observation-seal-Q-context')
    require_operation(a,'observe');checkout_identity(source,a['source'])
    return a,operation_deadline(output,a)


def authorized_seal(output,root,controller=None,source=None):
    mode=read(output/'multipart-mode.json')
    closed(mode,('id','source','controller','deadline')+(('observationConfigSHA256',) if 'observationConfigSHA256' in mode else ()))
    registry=read(root/REGISTRY_PATH);closed(registry,('profile','admissions'));insist(registry['profile']==REGISTRY,'multipart-seal-registry')
    matched=[a for a in registry['admissions'] if a.get('id')==mode.get('id')]
    insist(len(matched)==1,'multipart-seal-not-admitted')
    original=matched[0]
    if 'transportObservation' in original:
        a,deadline=authorized_observation_admission(output,root,controller,source)
        component=read(output/'retained/component.json',deadline)
        insist(component.get('status') in ('producer-observed','failed'),'observation-component-state')
        exact=observed_transport(output,a,source,deadline,require_complete=component['status']=='producer-observed')
        claimed=read(output/'observed-transport.json',deadline)
        insist(claimed==exact,'observation-local-plan-substitution')
        a={k:v for k,v in a.items() if k!='transportObservation'};a['transport']=exact
    else:
        a=original
        validate(a)
        insist('observationConfigSHA256' not in mode,'multipart-mode-observation-config-unexpected')
        insist(a['profile']==MULTIPART_CANDIDATE and a['source']==mode['source'] and a['controller']==mode['controller'],'multipart-seal-authority')
    return a


def one(root,pattern):
    found=list(Path(root).glob(pattern));insist(len(found)==1 and found[0].is_file() and not found[0].is_symlink(),'nonunique-required-artifact')
    return found[0]


def selected_current_resources(a, source, census, deadline=None):
    """Closed new candidate selection; never relabel the historical 0.10.9 file.

    The pinned production-source pure helper owns the exact raw9/DATA/G0 schema.
    Unknown/pending helpers refuse; the SDK controller invents no owner receipt.
    """
    if a['version'] != '0.10.10':
        return CURRENT_RESOURCES
    selected = census.get('currentInputs')
    closed(selected, ('fixturePath','fixtureSHA256','metadataVersion'))
    insist(selected['fixturePath'] == CANDIDATE01010_RESOURCES and selected['metadataVersion'] == '0.10.10',
           '01010-fixed-candidate-fixture-version')
    sha(selected['fixtureSHA256'])
    files = census.get('sourceFiles')
    insist(type(files) is dict, '01010-committed-source-closure-missing')
    for name in (CANDIDATE01010_RESOURCES, CANDIDATE01010_PROBE):
        expected = a['inputs'].get(name)
        insist(expected is not None and files.get(name) == expected, '01010-source-census-input-pin')
        sha(expected)
        path = source / name
        insist(path.is_file() and not path.is_symlink() and digest(path, deadline) == expected,
               '01010-source-candidate-input-hash')
    insist(a['inputs'][CANDIDATE01010_RESOURCES] == selected['fixtureSHA256'], '01010-selected-fixture-hash')
    # This is the existing stdlib-only, source-reviewed owner adapter, authenticated
    # by S's census AND the P admission. No CLI/env path or ambient import fallback.
    path = source / CANDIDATE01010_PROBE
    spec = importlib.util.spec_from_file_location('successor_source_candidate_inputs', path)
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    insist(callable(getattr(helper, 'current_inputs', None)) and
           callable(getattr(helper, 'input_metadata_version', None)), '01010-reviewed-owner-adapter-pending')
    current, identity = helper.current_inputs(source, census)
    insist(helper.input_metadata_version(identity) == '0.10.10', '01010-owner-identity-version')
    # current_inputs is the actual owner's strict source-bound profile validator:
    # candidateArtifactVersion, installed-canonical/1, 1M, raw9/DATA/G0 provenance.
    # Read the file again below only after that validator, never infer its validity.
    checkpoint(deadline)
    return CANDIDATE01010_RESOURCES


def source_check(a,source,deadline=None):
    checkpoint(deadline)
    checkout_identity(source,a['source'])
    for mapping in ('inputs','recipes'):
        for name,h in a[mapping].items():
            checkpoint(deadline)
            p=source/name;insist(p.is_file() and not p.is_symlink() and digest(p,deadline)==h,'source-input-or-recipe-hash')
    required={'python/hatch_build.py','python/umf_codegen/hatch_build.py','tools/verify_python_artifacts.py',
              'tools/qualify_python_release_wheel.py','scripts/package-sdk-rust-default.ts',
              'scripts/package-sdk.py','scripts/test-sdk-install.ts','scripts/saga-portable/installed-browser.ts',
              'scripts/test-native-sdk-install.mjs','tools/generate_codegen_resource_literals.py'}
    insist(required<=set(a['recipes']),'incomplete-canonical-recipe-roster')
    census=read(source/COMPAT_CENSUS)['installedFactory']
    current_path=selected_current_resources(a,source,census,deadline)
    insist({'Cargo.lock','bun.lock','spec/release.json','tests/rust-core/fixtures/access-inspection/cases.json','python/src/umf/action_runtime_resource_manifest.json',COMPAT_CENSUS,current_path,'crates/umf-core/src/canonical_codegen_literals.rs'}<=set(a['inputs']),'missing-lock-version-or-resource-authority')
    expected={'census_sha256':a['inputs'][COMPAT_CENSUS], 'early':census['publicControls'],
              'later':[name for group in census['python'] for name in group['cases']],
              'historicalExcluded':census['legacyDisposition']['historicalOnly']}
    insist(a['compatibility']==expected, 'reviewed-named-selector-disposition')
    current=read(source/current_path)
    insist(current['literalData']['sha256']==a['inputs']['crates/umf-core/src/canonical_codegen_literals.rs'], 'current-native-data-source')
    for name in RESOURCE_NAMES:
        checkpoint(deadline)
        row=current['resources'][name]
        insist(row['path']==RESOURCE_SOURCES[name] and row['sha256']==a['inputs'][RESOURCE_SOURCES[name]], 'current-canonical-role-source')
        insist((source/row['path']).stat().st_size==row['bytes'], 'current-canonical-resource-size')
    release=read(source/'spec/release.json')
    insist(all(release[k]==a['version'] for k in ('sdkVersion','pythonVersion','rustVersion','nodeVersion','codegenVersion')),'coupled-authority-differs')

    checkpoint(deadline)


def cell_files(args,cell):
    deadline=getattr(args,'multipart_deadline',None);checkpoint(deadline)
    measure=lambda path:digest(path) if deadline is None else digest(path,deadline)
    read_value=lambda path:read(path) if deadline is None else read(path,deadline)
    kind,_=CELLS[cell];retained=args.output/'retained'
    wheel=one(retained/('selected' if kind=='direct' else 'rebuilt'),'*.whl')
    paths=[wheel,one(retained/'common','umf_codegen-*.whl'),*[retained/(prefix+cell+suffix) for prefix,suffix in
           [('install-','.json'),('record-','.json'),('interpreter-','.json'),('freeze-','.txt'),('compatibility-','.json'),('compatibility-early-','.xml'),('compatibility-later-','.xml')]]]
    value={p.relative_to(retained).as_posix():measure(p) for p in paths};checkpoint(deadline);return value


def write_parent_context(a,ctx,args,cell):
    deadline=getattr(args,'multipart_deadline',None);checkpoint(deadline)
    measure=lambda path:digest(path) if deadline is None else digest(path,deadline)
    read_value=lambda path:read(path) if deadline is None else read(path,deadline)
    envelope=offline_envelope(a,ctx,args);envelope['cell']=cell;envelope['files']=cell_files(args,cell)
    kind,_=CELLS[cell];retained=args.output/'retained'
    expected=(read_value(retained/'wheel.json')['wheel'] if kind=='direct' else
              read_value(retained/'core-artifact.json')['artifacts']['sdist_rebuilt']['sha256'])
    actual=measure(one(retained/('selected' if kind=='direct' else 'rebuilt'),'*.whl'))
    insist(expected==actual,'parent-wheel-custody')
    path=args.output/'owned'/('parent-context-'+cell+'.json')
    timed_publish(path,(json.dumps(envelope,sort_keys=True)+'\n').encode(),deadline);checkpoint(deadline);return path,measure(path)


def consume_cells(a,ctx,args,command):
    """All four installed cells share two wheels; no rebuild per runtime."""
    deadline=getattr(args,'multipart_deadline',None);checkpoint(deadline)
    measure=lambda path:digest(path) if deadline is None else digest(path,deadline)
    read_value=lambda path:read(path) if deadline is None else read(path,deadline)
    source=args.source;out=args.output;retained=out/'retained';work=out/'owned'
    companion=one(retained/'common','umf_codegen-*.whl')
    for cell,(kind,version) in CELLS.items():
        wheel=one(retained/('selected' if kind=='direct' else 'rebuilt'),'*.whl')
        consumer=work/cell;command(['uv','venv','--seed','--python',version,str(consumer)])
        python=str(consumer/'bin/python')
        # Assert/retain the RUNNING interpreter, not the requested uv selector.
        runtime_code=("import sys,platform,json,hashlib;from pathlib import Path;"
          "assert sys.implementation.name=='cpython' and platform.python_version()==sys.argv[2];"
          "Path(sys.argv[1]).write_text(json.dumps({'cell':sys.argv[3],'python':platform.python_version(),"
          "'implementation':sys.implementation.name,'executable_sha256':hashlib.sha256(Path(sys.executable).resolve().read_bytes()).hexdigest()})+'\\n')")
        command([python,'-I','-B','-c',runtime_code,str(retained/('interpreter-'+cell+'.json')),version,cell])
        command([python,'-m','pip','--isolated','install','--no-compile','--no-cache-dir','--index-url','https://pypi.org/simple',
            '--report',str(retained/('install-'+cell+'.json')),str(wheel),str(companion),'pytest==8.4.2'])
        command([python,'-m','pip','--isolated','check'])
        freeze_log=command([python,'-m','pip','--isolated','freeze','--all'])
        operation_copy(freeze_log,retained/('freeze-'+cell+'.txt'),deadline)
        verifier=[python,'-I','-B','tools/verify_python_artifacts.py','--wheel',str(wheel),
                  '--expected-version',a['version'],'--verify-installed-wheel']
        command(verifier+['--receipt',str(retained/('record-'+cell+'.json'))])
        compat={'profile':COMPAT_PROFILE,'source':a['source'],'inputProfile':'installed-canonical/1',
                'census_sha256':a['compatibility']['census_sha256'],'wheel_sha256':measure(wheel),
                'native_sha256':read_value(retained/('record-'+cell+'.json'))['native_sha256'],
                'original':original_context(ctx),'groups':{}}
        for group in ('early','later'):
            xml=retained/('compatibility-'+group+'-'+cell+'.xml')
            command([python,'-I','-B','-m','pytest','--rootdir='+str(source),'-q','--junitxml='+str(xml),
                     *[str(source/name) for name in a['compatibility'][group]]])
            named_junit(xml,a['compatibility'][group])
            compat['groups'][group]={'cases':dict.fromkeys(a['compatibility'][group],'passed'),'xml_sha256':measure(xml)}
        compatibility_evidence(compat,a,measure(wheel),compat['native_sha256'])
        timed_publish(retained/('compatibility-'+cell+'.json'),(json.dumps(compat,indent=2)+'\n').encode(),deadline)
        parent_context,parent_hash=write_parent_context(a,ctx,args,cell)
        command([python,'-I','-B',str(args.root/'tools/qualify_core_successor.py'),'inspect',
            '--root',str(args.root),'--controller',str(args.controller),'--source',str(source),'--id',a['id'],
            '--platform',a['platform'],'--output',str(out),'--cell',cell,
            '--offline-context',str(parent_context),'--offline-context-sha256',parent_hash])
        # Preserve the existing installed native/Core/action and codegen groups.
        tests=['test_action_runtime_generated_client.py','test_action_runtime_resources.py','test_action_fixture_vectors.py',
               'test_core.py','test_rust_core.py','test_extension_kinds.py','test_rust_codegen.py']
        command([python,'-I','-B','-m','pytest','-q','--junitxml='+str(retained/('native-'+cell+'.xml')),
                 *[str(source/'python/tests'/name) for name in tests]])
        command(['bun','scripts/saga-portable/other-hosts.ts','python'],override=saga_environment(
            cell,python,wheel,one(retained/'common','umf_core-*.tar.gz'),retained/('saga-'+cell+'.json')))
        command([python,'-I','-B','python/tests/test_saga_lifecycle.py'])
        command(verifier+['--receipt',str(retained/('record-post-'+cell+'.json'))])
    return {cell:{k:measure(retained/(prefix+cell+suffix)) for k,prefix,suffix in [
        ('interpreter','interpreter-','.json'),('install','install-','.json'),('freeze','freeze-','.txt'),
        ('record','record-','.json'),('postRecord','record-post-','.json'),('inspection','inspection-','.json'),
        ('native','native-','.xml'),('saga','saga-','.json')]} for cell in CELLS}


def rebuild_identity(retained):
    receipt=retained/'core-artifact.json'
    value={'raw_sha256':digest(one(retained/'raw','*.whl')),
           'sdist_sha256':digest(one(retained/'common','umf_core-*.tar.gz')),
           'rebuilt_sha256':digest(one(retained/'rebuilt','*.whl')),
           'receipt_sha256':digest(receipt)}
    insist(read(receipt)['artifacts']['sdist_rebuilt']['sha256']==value['rebuilt_sha256'],
           'rebuild-receipt-wheel-differs')
    return value


def validate_rebuild(retained,value):
    closed(value,('raw_sha256','sdist_sha256','rebuilt_sha256','receipt_sha256'))
    for v in value.values():sha(v)
    insist(value==rebuild_identity(retained),'completed-rebuild-inputs-differ')


def execute_candidate(a,ctx,args):
    import platform
    observing='transportObservation' in a
    require_operation(a,getattr(args,'operation','run'))
    deadline=getattr(args,'multipart_deadline',None)
    if a.get('profile')==MULTIPART_CANDIDATE and deadline is None:deadline=OperationDeadline(min(a['bounds']['seconds'],transport_budgets(a)['seconds']))
    elif 'initialInspector' in a and deadline is None:deadline=OperationDeadline(a['bounds']['seconds'])
    checkpoint(deadline)
    start=deadline.started if deadline is not None else time.monotonic()
    measure=lambda path,d=deadline:digest(path) if d is None else digest(path,d)
    read_value=lambda path,d=deadline:read(path) if d is None else read(path,d)
    insist((platform.system(),platform.machine().lower())==({'linux-x86_64':('Linux','x86_64'),'macos-arm64':('Darwin','arm64')}[a['platform']]),'actual-platform-differs')
    source=args.source.resolve();out=args.output.resolve();retained=out/'retained'
    retained.mkdir(exist_ok=True);insist(not any(retained.iterdir()),'output-not-fresh');source_check(a,source) if deadline is None else source_check(a,source,deadline=deadline)
    work=out/'owned';work.mkdir(exist_ok=False)
    initial_raw=initial_inspector_material(a,source,retained/'initial-inspector',deadline) if 'initialInspector' in a else None
    env={k:v for k,v in os.environ.items() if k not in ('GH_TOKEN','GITHUB_TOKEN','ACTIONS_RUNTIME_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN','ACTIONS_ID_TOKEN_REQUEST_URL')}
    env['SUCCESSOR_JOB_ID']=ctx['job']
    env.update({'CARGO_BUILD_JOBS':'1','NUM_JOBS':'1','CMAKE_BUILD_PARALLEL_LEVEL':'1',
        'PYTHONDONTWRITEBYTECODE':'1','PYO3_PYTHON':os.environ.get('PY','python3'),
        'CARGO_TARGET_DIR':str(work/'target'),'UMF_SDK_CARGO_TARGET':str(work/'sdk-target'),
        'UMF_SDK_INSTALL_RETAIN_DIR':str(out/'sdk-consumer'),'UMF_TEMPORAL_OUTPUT':str(retained)})
    def copy_current(src,dst):
        if a.get('profile')==MULTIPART_CANDIDATE:
            if dst.is_relative_to(retained):multipart_stage_accounting(out,a,deadline,[(src,dst)],complete=False,source_root=source)
            else:insist(workspace_bound(out,transport_budgets(a)['workspace_bytes'],external_workspace_roots(source) if observing else (),deadline=deadline)+src.stat().st_size<=transport_budgets(a)['workspace_bytes'],'multipart-copy-workspace-before-write')
        operation_copy(src,dst,deadline)
        if a.get('profile')==MULTIPART_CANDIDATE:dst.chmod(src.stat().st_mode&0o777)
    def copytree_current(src,dst):
        if a.get('profile')!=MULTIPART_CANDIDATE:return operation_copytree(src,dst,deadline)
        pending=[(p,dst/p.relative_to(src)) for p in src.rglob('*') if p.is_file()]
        insist(not any(p.is_symlink() for p in src.rglob('*')),'multipart-copytree-symlink')
        multipart_stage_accounting(out,a,deadline,pending,complete=False,source_root=source)
        dst.mkdir(exist_ok=False)
        for old,new in pending:
            new.parent.mkdir(parents=True,exist_ok=True);copy_current(old,new)
        return dst
    logs=retained/'current'/(ctx['run']+'-'+ctx['attempt']);logs.mkdir(parents=True,exist_ok=False)
    counter=[0]
    def command(argv,cwd=source,override=None):
        remaining=a['bounds']['seconds']-(time.monotonic()-start)
        if deadline is not None:remaining=min(remaining,deadline.remaining())
        insist(remaining>0,'budget-exhausted');counter[0]+=1
        argv=[os.environ.get('PY','python3') if i==0 and x=='python3' else x for i,x in enumerate(argv)]
        log=logs/('%03d.log'%counter[0])
        if a.get('profile')==MULTIPART_CANDIDATE:
            run_bounded(argv,cwd,{**env,**(override or {})},remaining,log,a['bounds']['log_bytes'],audit=lambda:multipart_stage_accounting(out,a,deadline,complete=False,source_root=source),op_deadline=deadline)
        elif deadline is not None:run_bounded(argv,cwd,{**env,**(override or {})},remaining,log,a['bounds']['log_bytes'],op_deadline=deadline)
        else:run_bounded(argv,cwd,{**env,**(override or {})},remaining,log,a['bounds']['log_bytes'])
        return log
    def save(name,value):
        p=retained/name;data=(json.dumps(value,indent=2)+'\n').encode()
        if observing:
            used=multipart_stage_accounting(out,a,deadline,complete=False,source_root=source)
            insist(used['proof_bytes']+len(data)<=transport_budgets(a)['proof_bytes'],'observation-proof-reservation')
            insist(workspace_bound(out,transport_budgets(a)['workspace_bytes'],external_workspace_roots(source),deadline=deadline)+len(data)<=transport_budgets(a)['workspace_bytes'],'observation-proof-workspace-before-write')
        timed_publish(p,data,deadline);return {'sha256':measure(p),'path':name}
    def stage(gate):
        result={}
        if observing:
            stage_roles={
                'job-setup':(), 'source':('source',),
                'common':('core-sdist','codegen-wheel','codegen-sdist'),
                'wheel':('raw-wheel','linux-x86_64/core-wheel','linux-x86_64/standalone-cli'),
                'sdk':('linux-x86_64/sdk','linux-x86_64/sdk-manifest'),
                'rebuild':('rebuilt-wheel',),
            }
            observation_stage_reservation(out,a,source,stage_roles[gate],deadline)
        if gate=='job-setup':
            # Per-JOB prerequisites are never reusable qualification evidence.
            # Every fresh runner acquires its own dependencies, even when source,
            # wheel or SDK qualification was accepted on the original runner.
            command(['bun','install','--frozen-lockfile'])
            command(['cargo','fetch','--locked'])
            command(['cargo','install','wasm-bindgen-cli','--version','0.2.100','--locked'])
            command(['python3','-m','pip','--isolated','install','build==1.3.0','hatchling==1.27.0'])
            result={'acquiredThisJob':True,'run':ctx['run'],'attempt':ctx['attempt']}
        elif gate=='source':
            for row in recipe_commands(a,source,retained)['source']:command(row)
            # Stream the FULL Git tar and compare every blob/mode. No partial tar
            # and no S-specific verifier. The large source stream is not bundled
            # into the bounded component evidence artifact.
            roster_command=['git','ls-tree','-r','-z',a['source']['commit']]
            raw=(bounded_check_output(roster_command,MAX_BYTES,cwd=source,deadline=deadline) if observing else
                 subprocess.check_output(roster_command,**({'timeout':deadline.remaining()} if deadline is not None else {})))
            roster={}
            for row in raw.split(b'\0'):
                checkpoint(deadline)
                if not row:continue
                header,name=row.split(b'\t',1);mode,kind,oid=header.decode().split();insist(kind=='blob','unsupported-git-member');roster[name.decode('utf8','surrogateescape')]=(mode,oid)
            archive=work/'full-source.tar';prefix='umf-v'+a['version']+'/'
            if a.get('profile')==MULTIPART_CANDIDATE:
                if observing:
                    cfg=a['transportObservation'];slot=cfg['objects'][cfg['source']['object']];archive=observation_object_path(cfg['source']['object'],a,retained);archive.parent.mkdir(parents=True,exist_ok=True)
                    insist(len(roster)<=cfg['source']['maximum_members'] and workspace_bound(out,cfg['budgets']['workspace_bytes'],external_workspace_roots(source),deadline=deadline)+slot['maximum_bytes']<=cfg['budgets']['workspace_bytes'],'observation-source-before-write')
                    command(['git','archive','--format=tar.gz','--prefix='+prefix,'--output='+str(archive),a['source']['commit']])
                    facts=observed_source(archive,a,source,deadline)
                    result={'members':facts['members'],'git_roster_sha256':hashlib.sha256(raw).hexdigest(),'tar_sha256':facts['tar_sha256'],
                            'archive_sha256':measure(archive),'archive_bytes':archive.stat().st_size,'tar_bytes':facts['tar_bytes'],
                            'member_bytes':facts['member_bytes'],'allModesSymlinksAndBlobBytesMatch':True,'archiveRetainedInOwnedWorkspaceUntilCleanup':True}
                else:
                    t=a['transport'];src=t['source'];insist(len(roster)==src['members'],'multipart-source-roster-before-write')
                    obj=t['objects'][src['object']];archive=retained/src['object'];archive.parent.mkdir(parents=True,exist_ok=True)
                    insist(obj['bytes']+src['tar_bytes']<=t['budgets']['workspace_bytes'],'multipart-source-before-write')
                    command(['git','archive','--format=tar.gz','--prefix='+prefix,'--output='+str(archive),a['source']['commit']])
                    insist(archive.stat().st_size==obj['bytes'] and measure(archive)==obj['sha256'],'multipart-source-original-compressed')
                    with archive.open('rb') as stream:stream_source_archive(stream,roster,a['source']['commit'],src,deadline)
                    result={'members':len(roster),'git_roster_sha256':hashlib.sha256(raw).hexdigest(),'tar_sha256':src['tar_sha256'],
                            'archive_sha256':obj['sha256'],'archive_bytes':obj['bytes'],'tar_bytes':src['tar_bytes'],
                            'member_bytes':src['member_bytes'],'allModesSymlinksAndBlobBytesMatch':True,'archiveRetainedInOwnedWorkspaceUntilCleanup':True}
            else:
                command(['git','archive','--format=tar','--prefix='+prefix,'--output='+str(archive),a['source']['commit']])
                with archive.open('rb') as stream:archive_correspondence(stream,roster,a['source']['commit'],prefix)
                save('source-transport-size.json',{'bytes':archive.stat().st_size,'sha256':measure(archive),'limitBytes':a['bounds']['artifact_bytes']})
                insist(archive.stat().st_size<=a['bounds']['artifact_bytes'],'source-transport-size-pending-review')
                result={'members':len(roster),'git_roster_sha256':hashlib.sha256(raw).hexdigest(),'tar_sha256':measure(archive),'allModesSymlinksAndBlobBytesMatch':True,'archiveRetainedInOwnedWorkspaceUntilCleanup':True}
        elif gate=='common':
            if a['platform']=='linux-x86_64':
                for row in recipe_commands(a,source,retained)['common']:command(row)
            else:
                material=out/'common-original'
                if a['common'].get('profile')==MULTIPART_MATERIAL:original_material(a,a['common'],material,retained,source_root=source,deadline=deadline)
                else:original_material(a,a['common'],material,retained)
                common=retained/'common';common.mkdir()
                for name in ('umf_core-'+a['version']+'.tar.gz','umf_codegen-'+a['version']+'-py3-none-any.whl','umf_codegen-'+a['version']+'.tar.gz'):
                    original=one(material,'**/'+name);copy_current(original,common/name)
            result={'files':{p.name:measure(p) for p in (retained/'common').iterdir()}}
            insist(set(result['files'])=={'umf_core-'+a['version']+'.tar.gz','umf_codegen-'+a['version']+'-py3-none-any.whl','umf_codegen-'+a['version']+'.tar.gz'},'common-missing-extra')
        elif gate=='wheel':
            common=retained/'common';sdist=one(common,'umf_core-*.tar.gz');rawdir=retained/'raw'
            if a['platform']=='linux-x86_64':
                rawwheel=initial_or_produced_raw(a,source,rawdir,command,initial_raw,deadline)
                # Tool acquisition is exactly the existing frozen owner recipe.
                tools=retained/'repair-tools';lock='qualification-inputs/core-0.10.3-wheel-input-lock.json'
                insist(lock in a['inputs'],'repair-lock-not-pinned')
                command(['python3','tools/core_python_qualification_runner.py','fetch-wheels','--lock',lock,'--profile','repair','--cell','linux-x86_64-py311','--output',str(tools)])
                command(['python3','-m','pip','--isolated','install','--no-index','--only-binary=:all:',*map(str,sorted(tools.glob('*.whl')))])
                def capture(argv,name):
                    # Output still passes the same deadline/byte-bounded runner.
                    command(argv)
                    log=logs/('%03d.log'%counter[0]);copy_current(log,retained/name)
                capture(['auditwheel','--version'],'auditwheel-version.txt');capture(['patchelf','--version'],'patchelf-version.txt')
                capture(['auditwheel','show','--json',str(rawwheel)],'auditwheel-before.json')
                command(['auditwheel','repair','--plat','auto','--only-plat','--wheel-dir',str(retained/'repaired'),str(rawwheel)])
                selected=one(retained/'repaired','*.whl');capture(['auditwheel','show','--json',str(selected)],'auditwheel-after.json')
                command(['python3','tools/qualify_python_release_wheel.py','--version',a['version'],'--platform','linux','--source-wheel',str(rawwheel),'--selected-wheel',str(selected),
                    '--before-report',str(retained/'auditwheel-before.json'),'--after-report',str(retained/'auditwheel-after.json'),'--tool-artifacts',str(tools),'--tool-lock',lock,
                    '--auditwheel-version',str(retained/'auditwheel-version.txt'),'--patchelf-version',str(retained/'patchelf-version.txt'),'--sdist',str(sdist),'--output-wheel-directory',str(retained/'selected'),'--receipt',str(retained/'selection.json')])
            else:
                command(['uv','build','--wheel','--out-dir',str(rawdir),str(sdist)],override={'CARGO_NET_OFFLINE':'true'})
                selected=one(rawdir,'*.whl');operation_copytree(rawdir,retained/'selected',deadline)
                # No second direct-source Mac wheel. The actual sdist build is
                # distinct from the mandatory independent rebuild proof below.
                command(['python3','tools/qualify_python_release_wheel.py','--version',a['version'],'--platform','macos','--source-wheel',str(selected),'--sdist',str(sdist),'--output-wheel-directory',str(retained/'mac-selected'),'--receipt',str(retained/'selection.json')])
            standalone=standalone_cli_source(a,work,command)
            copy_current(standalone,retained/'standalone-umf');(retained/'standalone-umf').chmod(0o755)
            result={**result,'rawWheel':measure(rawwheel) if a['platform']=='linux-x86_64' else measure(selected),
                'wheel':measure(one(retained/'selected','*.whl')),'sdist':measure(sdist),'standaloneCLI':measure(retained/'standalone-umf')}
            if initial_raw is not None:result['originalInspectorWheel']=measure(initial_raw)
        elif gate=='sdk':
            # Build and install only ONCE for this platform; current source closure
            # is authenticated before and after all installed consumers.
            for argv,override in sdk_recipe(out):command(argv,override=override)
            sdk=source/'.cache/sdk-distribution';archive=one(sdk,'umf-sdk.tgz')
            copy_current(archive,retained/('umf-sdk-'+a['platform']+'.tgz'))
            for name in ('manifest.json','receipt.json'):copy_current(sdk/name,retained/('sdk-'+name))
            result={'archive_sha256':measure(archive),'manifest_sha256':measure(sdk/'manifest.json'),'platform':a['platform'],'checks':{name:True for name in SDK_CHECKS}}
            if a.get('profile')==MULTIPART_CANDIDATE:
                result['custody']=retain_sdk_custody(out,retained,deadline,copy_current)
        elif gate=='rebuild':
            # One independent sdist rebuild and its native/RECORD/source proof;
            # do not multiply this by runtime. Existing verifier owns semantics.
            nojs=work/'no-js';nojs.mkdir()
            for name in ('node','bun','npm','npx'):
                shim=nojs/name;shim.write_text('#!/bin/sh\nexit 97\n');shim.chmod(0o755)
            command(['python3','tools/verify_python_artifacts.py','--wheel',str(one(retained/'raw','*.whl')),'--sdist',str(one(retained/'common','umf_core-*.tar.gz')),'--repository',str(source),'--expected-version',a['version'],'--expected-platform','linux_x86_64' if a['platform']=='linux-x86_64' else 'macos_arm64','--rebuilt-wheel-directory',str(retained/'rebuilt'),'--receipt',str(retained/'core-artifact.json')],override={'CARGO_NET_OFFLINE':'true','PATH':str(nojs)+os.pathsep+env['PATH']})
            result=rebuild_identity(retained)
        elif gate=='consumers':
            # A completed rebuild is a separate authenticated component. Never
            # invoke the frozen empty-directory-only helper on its retained wheel.
            validate_rebuild(retained,read_value(retained/'rebuild.json'))
            cells=consume_cells(a,ctx,args,command)
            cli=work/'embedded-cli'
            with zipfile.ZipFile(one(retained/'selected','*.whl')) as archive:
                if deadline is None:cli.write_bytes(archive.read('umf/_bin/umf'))
                else:
                    checkpoint(deadline)
                    with archive.open('umf/_bin/umf') as src,cli.open('wb') as dst:
                        while chunk:=timed_read(src,BUFFER,deadline):timed_write(dst,chunk,deadline)
                    checkpoint(deadline)
            cli.chmod(0o755)
            command([str(cli),'--version'])
            command(['bun','scripts/saga-portable/other-hosts.ts','cli'],override={'UMF_SAGA_CLI':str(cli),'UMF_SAGA_RESULT_PATH':str(retained/'embedded-cli19.json')})
            standalone=work/'target'/('aarch64-apple-darwin/release/umf' if a['platform']=='macos-arm64' else 'release/umf')
            if not (retained/'standalone-umf').exists():
                insist(standalone.is_file() and not standalone.is_symlink(),'standalone-cli-missing')
                copy_current(standalone,retained/'standalone-umf');(retained/'standalone-umf').chmod(0o755)
            command(['bun','scripts/saga-portable/other-hosts.ts','cli'],override={'UMF_SAGA_CLI':str(retained/'standalone-umf'),'UMF_SAGA_RESULT_PATH':str(retained/'standalone-cli19.json')})
            pair=work/'pair';pair.mkdir()
            for p in [one(retained/'raw','*.whl'),*list((retained/'common').iterdir())]:copy_current(p,pair/p.name)
            command(['python3','tools/verify_python_release_pair.py','--repository',str(source),'--artifacts',str(pair),'--core-receipt',str(retained/'core-artifact.json'),'--receipt',str(retained/'pair.json')],override={'GITHUB_SHA':a['source']['commit']})
            result={'cells':cells,'normalResolverCells':list(CELLS),'embeddedCLI19':{'path':'embedded-cli19.json','sha256':measure(retained/'embedded-cli19.json')},'standaloneCLI19':{'path':'standalone-cli19.json','sha256':measure(retained/'standalone-cli19.json')},'pairInputScope':'raw-pre-repair-source-pair; selected wheel independently installed', 'core_artifact_sha256':measure(retained/'core-artifact.json'),'pair_sha256':measure(retained/'pair.json')}
        elif gate=='inspection':
            reports={}
            for cell in CELLS:
                path=retained/('inspection-'+cell+'.json');validate_deep(read_value(path),a,cell);reports[cell]=measure(path)
            result={'reports':reports}
        elif gate=='final-identity':
            source_check(a,source) if deadline is None else source_check(a,source,deadline=deadline);checkout_identity(args.controller,a['controller'])
            result={'sourceUnchanged':True,'controllerUnchanged':True}
        if a.get('profile')==MULTIPART_CANDIDATE:multipart_stage_accounting(out,a,deadline,source_root=source)
        else:insist(sum(p.stat().st_size for p in retained.rglob('*') if p.is_file())<=a['bounds']['artifact_bytes'],'retention-byte-bound')
        return {'status':'passed','evidence':save(gate+'.json',result)}
    prior=None
    if a['continuation'] is not None:
        material=out/'continuation-original'
        if a['continuation'].get('profile')==MULTIPART_MATERIAL:original_material(a,a['continuation'],material,retained,source_root=source,deadline=deadline)
        else:original_material(a,a['continuation'],material,retained)
        prior=read_value(material/'component.json')
        # Every reused gate references exact retained bytes. Restore only files
        # from authenticated ZIP; no caller-provided receipt can skip a gate.
        for step in prior['steps'].values():
            if step.get('status')=='passed':
                p=material/step['evidence']['path'];insist(measure(p)==step['evidence']['sha256'],'continuation-gate-hash')
        origin=a['continuation']['proof'] if a['continuation'].get('profile')==MULTIPART_MATERIAL else a['continuation']
        namespace=Path('original')/(str(origin['run'])+'-'+str(origin['attempt'])+'-'+str(origin['artifact']))
        copytree_current(material,retained/namespace)
        for step in prior['steps'].values():
            if step.get('status')=='passed':step['evidence']={**step['evidence'],'path':(namespace/step['evidence']['path']).as_posix()}
        completed_rebuild=prior['steps'].get('rebuild',{}).get('status')=='passed'
        restore_continuation_working_members(material,retained,completed_rebuild,copy_current)
        if completed_rebuild:
            # Admission pins the authentic original ZIP/member hashes. Also bind
            # this component to the restored raw wheel/sdist/receipt/wheel tuple;
            # re-signing a semantically inconsistent member cannot authorize reuse.
            value=read_value(retained/prior['steps']['rebuild']['evidence']['path'])
            validate_rebuild(retained,value)
            insist(read_value(retained/'rebuild.json')==value,'rebuild-working-evidence-differs')
    def finish(r):
        insist(time.monotonic()-start<a['bounds']['seconds'],'budget-exhausted')
        r['inspection']={cell:read_value(retained/('inspection-'+cell+'.json')) for cell in CELLS};aggregate(r,a)
        full_source=work/'full-source.tar'
        if full_source.exists():
            save('source-transport-size.json',{'bytes':full_source.stat().st_size,'sha256':measure(full_source),'limitBytes':a['bounds']['artifact_bytes']})
            insist(full_source.stat().st_size+retention_size(retained)<=a['bounds']['artifact_bytes'],'source-transport-size-pending-review')
            copy_current(full_source,retained/'full-source.tar')
        for step in r['steps'].values():
            evidence=step['evidence'];insist(measure(retained/evidence['path'])==evidence['sha256'],'final-gate-evidence-hash')
        return True
    r=orchestrate_observation(a,ctx,stage,deadline) if observing else orchestrate(a,ctx,stage,finish,prior)
    component_bytes=(json.dumps(r,indent=2)+'\n').encode()
    if observing:
        used=multipart_stage_accounting(out,a,deadline,complete=False,source_root=source)
        insist(used['proof_bytes']+len(component_bytes)<=transport_budgets(a)['proof_bytes'],'observation-component-proof-reservation')
        insist(workspace_bound(out,transport_budgets(a)['workspace_bytes'],external_workspace_roots(source),deadline=deadline)+len(component_bytes)<=transport_budgets(a)['workspace_bytes'],'observation-component-workspace-before-write')
    timed_publish(retained/'component.json',component_bytes,deadline)
    if observing:
        try:
            exact=observed_transport(out,a,source,deadline,require_complete=r['status']=='producer-observed')
        except Refusal:
            if r['status']=='producer-observed':raise
        else:
            for target in (out/'observed-transport.json',retained/'observed-transport.json'):
                data=(json.dumps(exact,indent=2)+'\n').encode()
                insist(workspace_bound(out,transport_budgets(a)['workspace_bytes'],external_workspace_roots(source),deadline=deadline)+len(data)<=transport_budgets(a)['workspace_bytes'],'observation-plan-workspace-before-write')
                timed_publish(target,data,deadline)
        checkpoint(deadline);return 0 if r['status']=='producer-observed' else 2
    seal_multipart(out,a,r,deadline=deadline) if a.get('profile')==MULTIPART_CANDIDATE else finalize_retention(out,a['bounds']['artifact_bytes'],r)
    checkpoint(deadline);return 0 if r['status']=='passed' else 2


def external_workspace_roots(source):
    roots=[Path(source)]
    for env,default in [('CARGO_HOME',Path.home()/'.cargo'),('RUSTUP_HOME',Path.home()/'.rustup'),('UV_CACHE_DIR',Path.home()/'.cache/uv'),('BUN_INSTALL_CACHE_DIR',Path.home()/'.bun/install/cache')]:
        p=Path(os.environ.get(env,str(default)))
        if p.exists():
            insist(not p.is_symlink(),'multipart-external-root-symlink')
            if p not in roots:roots.append(p)
    return tuple(roots)


def workspace_bound(root,limit,extra_roots=(),deadline=None):
    bounded_integer(limit,4*MAX_AGGREGATE,'multipart-workspace-limit',1)
    total=0;count=0
    for p in (p for base in (root,*extra_roots) if base.exists() for p in base.rglob('*')):
        checkpoint(deadline)
        if p.is_symlink():continue  # aliases not followed; actual target path counted separately
        if p.is_file():
            total+=p.stat().st_size;count+=1
            insist(count<=4*MAX_SOURCE_MEMBERS and total<=limit,'multipart-workspace-exceeded')
    checkpoint(deadline);return total


def retention_size(root,deadline=None):
    total=0
    for p in root.rglob('*'):
        checkpoint(deadline)
        if p.is_file() and not p.is_symlink():total+=p.stat().st_size
    checkpoint(deadline);return total


def finalize_retention(output,limit=MAX_BYTES,record=None,deadline=None):
    """Seal ALL extensions and metadata inside one hard final byte ceiling.

    Omitted files are moved intact to an owned, NON-UPLOADED quarantine. Their
    hashes remain explicit; an oversized omission index is itself hash-addressed
    and explicitly NOT retained. The marker excludes itself from its hash roster
    but includes its complete bytes in finalRetainedBytes (no self-hash claim).
    """
    insist(type(limit) is int and 4096<=limit<=MAX_BYTES,'invalid-retention-bound')
    retained=output/'retained';retained.mkdir(parents=True,exist_ok=True)
    insist(not retained.is_symlink() and not (output/'owned').is_symlink(),'unsafe-retention-root')
    marker=retained/'retention.json'
    if marker.exists() and verify_retention(output,limit,deadline=deadline):return read(marker,deadline)
    quarantine=output/'owned'/'retention-quarantine';quarantine.mkdir(parents=True,exist_ok=True)
    index={};omitted=[];original_failure=record.get('failure') if record else None
    for p in sorted(retained.rglob('*')):
        checkpoint(deadline)
        if p==marker:continue
        name=p.relative_to(retained).as_posix()
        if p.is_symlink():
            body=os.readlink(p).encode();omitted.append({'path':name,'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest(),'kind':'symlink-target-text'})
            target=quarantine/name;target.parent.mkdir(parents=True,exist_ok=True);insist(not target.exists(),'quarantine-collision');p.rename(target)
        elif p.is_file():index[name]={'bytes':p.stat().st_size,'sha256':digest(p,deadline)}
    def mark_failed():
        if record is not None and record['status']!='failed':
            record['status']='failed';record['failure']=record.get('failure') or 'retention-byte-bound'
            component=retained/'component.json';timed_publish(component,(json.dumps(record,indent=2)+'\n').encode(),deadline)
            index['component.json']={'bytes':component.stat().st_size,'sha256':digest(component,deadline)}
    if omitted:mark_failed()
    while True:
        checkpoint(deadline)
        value={'profile':'umf.core-successor.retention/1','bounded':True,'limitBytes':limit,
               'fullRetention':not omitted,'retained':index,'omitted':omitted,
               'markerExcludedFromHashRoster':True,'markerIncludedInByteCount':True,
               'previousFailure':original_failure,'finalRetainedBytes':0}
        for _ in range(12):
            checkpoint(deadline)
            body=(json.dumps(value,sort_keys=True,separators=(',',':'))+'\n').encode()
            size=sum(row['bytes'] for row in index.values())+len(body)
            if size==value['finalRetainedBytes']:break
            value['finalRetainedBytes']=size
        if size<=limit:break
        mark_failed()
        if index:
            name=max(index,key=lambda n:(index[n]['bytes'],n));row=index.pop(name)
            target=quarantine/name;target.parent.mkdir(parents=True,exist_ok=True);insist(not target.exists(),'quarantine-collision')
            (retained/name).rename(target);omitted.append({'path':name,**row,'kind':'file'})
            continue
        # Even the complete omission roster may be larger than the bound. Keep
        # its exact digest/count, never label that unuploaded roster as retained.
        index_dir=output/'owned'/'retention-index';index_dir.mkdir(exist_ok=True)
        omission_index=index_dir/'omission-index.jsonl'
        timed_publish(omission_index,''.join(json.dumps(row,sort_keys=True)+'\n' for row in omitted).encode(),deadline)
        value['omitted']=[];value['omissionIndex']={'count':len(omitted),'bytes':omission_index.stat().st_size,
            'sha256':digest(omission_index,deadline),'retained':False}
        value['fullRetention']=False;value['finalRetainedBytes']=0
        for _ in range(12):
            checkpoint(deadline)
            body=(json.dumps(value,sort_keys=True,separators=(',',':'))+'\n').encode()
            if value['finalRetainedBytes']==len(body):break
            value['finalRetainedBytes']=len(body)
        insist(len(body)<=limit,'retention-metadata-cannot-fit');break
    timed_publish(marker,body,deadline)
    insist(retention_size(retained,deadline)==value['finalRetainedBytes']<=limit,'final-retention-byte-bound')
    insist(verify_retention(output,limit,deadline=deadline),'final-retention-verification')
    checkpoint(deadline);return value


def verify_retention(output,limit=MAX_BYTES,retained_root=None,deadline=None):
    checkpoint(deadline)
    retained=retained_root if retained_root is not None else output/'retained';marker=retained/'retention.json'
    if not marker.is_file() or marker.is_symlink():return False
    try:value=read(marker,deadline)
    except (ValueError,OSError):
        checkpoint(deadline);return False
    checkpoint(deadline)
    if type(value) is not dict:return False
    if value.get('fullRetention') is not (not value.get('omitted') and 'omissionIndex' not in value):return False
    if value.get('markerExcludedFromHashRoster') is not True or value.get('markerIncludedInByteCount') is not True:return False
    if 'omissionIndex' in value and value['omissionIndex'].get('retained') is not False:return False
    if value.get('profile')!='umf.core-successor.retention/1' or value.get('bounded') is not True:return False
    if type(value.get('limitBytes')) is not int or not 4096<=value['limitBytes']<=limit:return False
    actual={}
    for p in retained.rglob('*'):
        checkpoint(deadline)
        if p.is_symlink():return False
        if p.is_file() and p!=marker:actual[p.relative_to(retained).as_posix()]={'bytes':p.stat().st_size,'sha256':digest(p,deadline)}
    checkpoint(deadline)
    return (actual==value.get('retained') and retention_size(retained,deadline)==value.get('finalRetainedBytes')
            and value['finalRetainedBytes']<=value['limitBytes'])


def loaded_ownership(package,purelib,native,compiler):
    package=Path(package);purelib=Path(purelib)
    insist(package.is_relative_to(purelib) and not package.is_symlink()
           and Path(native).parent==package and Path(compiler)==package/'rust_codegen.py'
           and not Path(native).is_symlink() and not Path(compiler).is_symlink(), 'loaded-owner')


def resolver_identity(report,archives,version):
    from urllib.parse import urlparse,unquote
    rows={}
    for r in report['install']:
        name=r['metadata']['name'].lower().replace('_','-')
        insist(name not in rows,'resolver-duplicate-distribution');rows[name]=r
    for name,archive in archives.items():
        row=rows.get(name,{})
        insist(row.get('metadata',{}).get('version')==version,'resolver-version')
        info=row.get('download_info',{});url=urlparse(info.get('url',''))
        insist(url.scheme=='file' and url.netloc=='' and Path(unquote(url.path)).resolve()==Path(archive).resolve()
               and info.get('archive_info',{}).get('hashes',{}).get('sha256')==digest(archive),'candidate-resolver-origin')


def inspect_installed(a,ctx,args):
    """Thin installed-owner probe; all semantic decisions remain in UMF."""
    deadline=getattr(args,'multipart_deadline',None);checkpoint(deadline)
    measure=lambda path:digest(path) if deadline is None else digest(path,deadline)
    read_value=lambda path:read(path) if deadline is None else read(path,deadline)
    import importlib.metadata
    import sys
    import sysconfig
    insist(sys.flags.isolated and sys.dont_write_bytecode,'isolated-inspection-required')
    import umf
    import umf._rust_core as native
    import umf.rust_codegen as compiler
    import umf._rust as shim
    dist=importlib.metadata.distribution('umf-core');package=Path(umf.__file__).resolve().parent
    insist(dist.version==umf.__version__==a['version'],'installed-version')
    insist(package.is_relative_to(Path(sysconfig.get_path('purelib')).resolve()) and dist.read_text('direct_url.json') is not None,'installed-ownership')
    # Private normal resolver installs exact authenticated local archives. Public
    # publication is a later, different route; direct_url is expected here.
    insist(args.cell in CELLS,'missing-runtime-cell')
    kind,version=CELLS[args.cell]
    import platform
    insist(platform.python_version()==version and sys.implementation.name=='cpython','actual-interpreter-version')
    wheel=one(args.output/('retained/selected' if kind=='direct' else 'retained/rebuilt'),'*.whl')
    with zipfile.ZipFile(wheel) as z:
        expected={n[4:]:hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist() if n.startswith('umf/') and not n.endswith('/')}
    actual={p.relative_to(package).as_posix():measure(p) for p in package.rglob('*') if p.is_file()}
    insist(expected==actual and all(not p.is_symlink() for p in package.rglob('*')),'installed-package-custody')
    npath=Path(native.__file__).resolve()
    insist(Path(shim.__file__).resolve()==package/'_rust.py','loaded-rust-shim-owner')
    owned={Path(dist.locate_file(row)).resolve() for row in (dist.files or ())}
    insist(all(p in owned for p in (Path(umf.__file__).resolve(),npath,Path(compiler.__file__).resolve(),Path(shim.__file__).resolve())),'distribution-loaded-ownership')
    loaded_ownership(package,Path(sysconfig.get_path('purelib')).resolve(),npath,Path(compiler.__file__).resolve())
    insist(umf.current_core_version()==a['protocols']['semantic'],'semantic-core-version')
    insist(measure(package/'action_runtime_resource_manifest.json')==a['inputs']['python/src/umf/action_runtime_resource_manifest.json'],'resource-manifest-identity')
    insist(native.engine_version()==a['protocols']['engine'] and native.codegen_protocol_version()==a['protocols']['codegen'],'installed-protocol')
    # Exact canonical source fixture; same 17 vectors / three public carriers.
    corpus=read_value(args.source/'tests/rust-core/fixtures/access-inspection/cases.json')['cases'];insist(len(corpus)==17,'inspection-corpus')
    original={p:measure(p) for p in package.rglob('*') if p.is_file()}
    manifest_hashes=[]
    def check_manifest(value):
        h=factory_manifest(value,a,package)
        path=args.output/'retained'/('factory-origin-'+args.cell+'-'+str(len(manifest_hashes))+'.json')
        with path.open('xb') as f:f.write(factory_report_bytes(value))
        insist(measure(path)==h,'authentic-origin-report-bytes')
        manifest_hashes.append(h)
    counts=installed_inspection_cases(corpus,compiler.CodegenEngine,check_manifest)
    insist(len(set(manifest_hashes))==1,'factory-manifest-changed')
    compat=read_value(args.output/'retained'/('compatibility-'+args.cell+'.json'))
    compatibility_evidence(compat,a,measure(wheel),measure(npath))
    insist(compat['original']==original_context(ctx),'compatibility-original-producer')
    engine=compiler.CodegenEngine.from_installed(max_work=1000000)
    try:engine.call('inspectAccessViews',{'document':{'oversize':'x'*500001},'selected':[]})
    except compiler.UmfCoreError as error:insist(error.code=='RESOURCE_LIMIT','budget-refusal-class')
    else:raise Refusal('budget-refusal-missing')
    insist(original=={p:measure(p) for p in package.rglob('*') if p.is_file()},'installed-mutated')
    d={'profile':DEEP,'source':a['source'],'version':a['version'],'resources':a['resources'],'protocols':a['protocols'],
       'maximumWork':1000000,**counts,'inputProfile':'installed-canonical/1','factory_manifest_sha256':manifest_hashes[0],'paidManifestReports':len(manifest_hashes),
       'data_sha256':a['inputs']['crates/umf-core/src/canonical_codegen_literals.rs'],'compatibility':compat,'coldPerCall':True,'runtime':{'cell':args.cell,'python':platform.python_version(),'implementation':sys.implementation.name,'executable_sha256':measure(Path(sys.executable).resolve())},'budgetRefusalVerified':True,'constructorPassed':True,'custodyPreserved':True,
       'installedFilesUnchanged':True,'loadedOwnershipVerified':True,'recordVerified':True,'embeddedCLIVerified':True,
       'normalResolver':True,'resourceSuccess':True,'wheel_sha256':measure(wheel),'native_sha256':measure(npath),
       'resource_manifest_sha256':measure(package/'action_runtime_resource_manifest.json')}
    # RECORD helper must have passed before this child; these are independently
    # observable files, not a caller boolean. Bind normal resolver's actual file.
    record=read_value(args.output/'retained'/('record-'+args.cell+'.json'))
    insist(record.get('status')=='passed' and record.get('distribution_version')==a['version']
           and record.get('wheel_sha256')==measure(wheel) and record.get('native_sha256')==measure(npath)
           and record.get('all_files_inside_platlib') is True,'record-proof-missing')
    report=read_value(args.output/'retained'/('install-'+args.cell+'.json'))
    resolver_identity(report,{'umf-core':wheel,'umf-codegen':one(args.output/'retained/common','umf_codegen-*.whl')},a['version'])
    cli=package/'_bin/umf';insist(cli.is_file() and measure(cli)==expected['_bin/umf'],'embedded-cli-custody')
    source_check(a,args.source)
    runtime=read_value(args.output/'retained'/('interpreter-'+args.cell+'.json'))
    insist(runtime==d['runtime'],'interpreter-proof-differs')
    insist((args.output/'retained'/('freeze-'+args.cell+'.txt')).is_file(),'pip-freeze-missing')
    validate_deep(d,a,args.cell)
    compatibility_material(args.output/'retained',d,a)
    timed_publish(args.output/'retained'/('inspection-'+args.cell+'.json'),(json.dumps(d,indent=2)+'\n').encode(),deadline)
    checkpoint(deadline);return 0


def cleanup(output):
    output=output.resolve();expected=Path(os.environ.get('RUNNER_TEMP','/not-a-runner')).resolve()/'successor-proof'
    insist(output==expected and not output.is_symlink(),'cleanup-owned-path')
    for name in ('owned','sdk-consumer','sdk-consumer-full','sdk-consumer-saga'):
        p=output/name
        insist(not p.is_symlink(),'cleanup-owned-symlink')
        if p.exists():shutil.rmtree(p)
    (output/'cleanup.json').write_text(json.dumps({'profile':PROFILE,'ownedPathsAbsent':True,'sharedLedgerChanged':False,'foreignSignalsSent':False})+'\n')
    return 0


def parser():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('operation',choices=('authorize','run','observe','inspect','aggregate','cleanup','seal'))
    for name in ('root','output'):p.add_argument('--'+name,type=Path,required=True)
    p.add_argument('--controller',type=Path);p.add_argument('--source',type=Path)
    p.add_argument('--offline-context',type=Path);p.add_argument('--offline-context-sha256')
    p.add_argument('--cell',choices=tuple(CELLS))
    p.add_argument('--id');p.add_argument('--platform',choices=PLATFORMS)
    return p


def expired_multipart_diagnostic(output,reason):
    """After expiry retain ONLY bounded refusal metadata, never hash payloads.

    One rename preserves the original namespace in owned custody until the
    existing cleanup. Unknown payload hashes/counts stay explicitly unobserved.
    """
    retained=output/'retained';unretained=output/'owned'/'expired-unretained'
    insist(not retained.is_symlink() and not unretained.exists(),'expired-diagnostic-owned-path')
    unretained.parent.mkdir(parents=True,exist_ok=True)
    if retained.exists():retained.rename(unretained)
    retained.mkdir()
    value={'profile':'umf.core-successor.multipart-expired/1','status':'refused','reason':reason[:512],
           'fullRetention':False,'qualified':False,'releaseQualified':False,'payloadHashesObserved':False,
           'unretainedNamespace':'owned/expired-unretained','payloadCount':'UNOBSERVED',
           'diagnosticFinalization':'bounded metadata after operation refusal; not multipart completion'}
    raw=(json.dumps(value,sort_keys=True)+'\n').encode();insist(len(raw)<=4096,'expired-diagnostic-bound')
    (retained/'expired-diagnostic.json').write_bytes(raw)
    return value


def main():
    args=parser().parse_args()
    for key in ('root','controller','source','output'):
        if getattr(args,key,None) is not None:setattr(args,key,getattr(args,key).resolve())
    args.output.mkdir(parents=True,exist_ok=True)
    active_bound=MAX_BYTES
    try:
        if args.operation=='cleanup':return cleanup(args.output)
        if (args.output/'multipart-mode.json').exists():
            mode=read(args.output/'multipart-mode.json')
            if 'observationConfigSHA256' in mode:
                registered,args.multipart_deadline=authorized_observation_admission(args.output,args.root,args.controller,args.source)
            else:
                registered=authorized_seal(args.output,args.root,args.controller,args.source)
                args.multipart_deadline=operation_deadline(args.output,registered)
        if args.operation=='seal' and (args.output/'multipart-mode.json').exists():
            a=authorized_seal(args.output,args.root,args.controller,args.source)
            if not (args.output/'retained/multipart-index.json').exists():seal_multipart(args.output,a,deadline=args.multipart_deadline)
            slots=multipart_upload_outputs(args.output,a,deadline=args.multipart_deadline)
            with Path(os.environ['GITHUB_OUTPUT']).open('a') as f:
                f.write('bounded=true\nmultipart=true\n')
                for slot in slots:f.write('part_%03d=true\n'%slot)
            return 0
        if args.operation=='seal':
            marker=args.output/'retained/retention.json'
            bound=read(marker)['limitBytes'] if marker.exists() else MAX_BYTES
            finalize_retention(args.output,bound)
            insist(verify_retention(args.output,bound),'upload-retention-bound')
            with Path(os.environ['GITHUB_OUTPUT']).open('a') as f:f.write('bounded=true\n')
            return 0
        insist(args.controller is not None and args.id and args.platform, 'missing-binding-inputs')
        a,ctx=authorize_offline(args) if args.operation=='inspect' else authorize(args)
        active_bound=a['bounds']['artifact_bytes']
        if a.get('profile')==MULTIPART_CANDIDATE:
            args.multipart_deadline=operation_deadline(args.output,a)
        if args.operation=='authorize':
            checkpoint(getattr(args,'multipart_deadline',None))
            with Path(os.environ['GITHUB_OUTPUT']).open('a') as f:f.write('source='+a['source']['commit']+'\n')
            return 0
        insist(args.source is not None,'missing-producer-source')
        if args.operation=='aggregate':
            insist(a['purpose']=='candidate-aggregate','wrong-aggregate-admission')
            return execute_coupled(a,ctx,args)
        insist(a['purpose']=='candidate-production','aggregate-cannot-produce')
        if args.operation=='inspect':
            require_operation(a,'run');return inspect_installed(a,ctx,args)
        return execute_candidate(a,ctx,args)
    except Exception as error:
        record={'profile':PROFILE,'status':'refused','releaseQualified':False,
                'diagnosticFinalization':'after refusal only; never multipart completion','reason':str(error) if isinstance(error,Refusal) else 'unexpected-exception-withheld'}
        (args.output/'retained').mkdir(exist_ok=True)
        (args.output/'retained/failure.json').write_text(json.dumps(record,indent=2)+'\n')
        if args.operation=='seal' and (args.output/'multipart-mode.json').exists():
            deadline=getattr(args,'multipart_deadline',None)
            try:
                insist(deadline is not None,'multipart-operation-clock-unavailable')
                deadline.check();finalize_retention(args.output,active_bound,deadline=deadline)
            except Refusal:
                expired_multipart_diagnostic(args.output,record['reason'])
            with Path(os.environ['GITHUB_OUTPUT']).open('a') as f:f.write('bounded=true\nmultipart=false\n')
        elif args.operation!='inspect' and not (args.output/'multipart-mode.json').exists():
            finalize_retention(args.output,active_bound)
        return 2


if __name__=='__main__':raise SystemExit(main())
