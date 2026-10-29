#!/usr/bin/env python3
"""Verify the accepted acquisition's closed cache evidence, then safely unpack its tar into a fresh Cargo home."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import tarfile
import time

ARCHIVE_CAP=64*1024*1024
CONTENT_CAP=64*1024*1024
ROW_CAP=100000
FILE_CAP=64*1024*1024
CHUNK_CAP=5*1024*1024
PUBLIC_CAP=1024*1024
EXPECTED_PROFILE='g03.locked-cargo-cache-guest/1'
INDEX_PROFILE='g03.locked-cargo-cache-inventory-index/1'
CHUNK_PROFILE='g03.locked-cargo-cache-inventory-chunk/1'

def fail(message):
    raise RuntimeError(message)

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def read_regular(path,cap):
    p=Path(path)
    st=p.lstat()
    if not stat.S_ISREG(st.st_mode) or p.is_symlink() or st.st_size>cap:
        fail('unsafe or oversized cache input: '+str(p))
    out=bytearray()
    with p.open('rb') as stream:
        while True:
            block=stream.read(min(65536,cap+1-len(out)))
            if not block:break
            out.extend(block)
            if len(out)>cap:fail('cache input grew beyond read cap')
    after=p.lstat()
    if len(out)!=st.st_size or (st.st_dev,st.st_ino,st.st_size,st.st_mtime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns):
        fail('cache input changed during bounded read')
    return bytes(out)

def safe_rel(value):
    if not isinstance(value,str) or not value or '\\' in value or '\x00' in value:return False
    p=PurePosixPath(value)
    return not p.is_absolute() and p.as_posix()==value and all(part not in ('','.','..') for part in p.parts) and not any(ord(c)<32 or ord(c)==127 for c in value)

def load_inventory(evidence,expected_index_sha,expected_rows_sha,expected_chunk_bytes,expected_row_count):
    evidence=Path(evidence)
    report_raw=read_regular(evidence/'acquisition-guest-report.json',PUBLIC_CAP)
    report=json.loads(report_raw)
    if report.get('profile')!=EXPECTED_PROFILE or report.get('status')!='LOCKED_CARGO_FETCH_PASS' or report.get('executionPerformed') is not True:
        fail('acquisition guest report is not a completed pass')
    inv=report.get('inventory',{})
    index_raw=read_regular(evidence/'inventory-index.json',PUBLIC_CAP)
    if digest(index_raw)!=expected_index_sha or digest(index_raw)!=inv.get('indexSha256'):
        fail('acquisition inventory index SHA-256 differs from packet/report')
    index=json.loads(index_raw)
    if inv.get('indexPath')!='evidence/inventory-index.json' or index.get('profile')!=INDEX_PROFILE or index.get('encoding')!='chunked-compact-json-v1' or index.get('chunkRows')!=1000:
        fail('acquisition inventory index profile/schema mismatch')
    chunks=index.get('chunks')
    if not isinstance(chunks,list) or not chunks or len(chunks)>100:
        fail('acquisition inventory chunk roster is empty or oversized')
    rows=[];chunk_bytes=0
    for i,chunk in enumerate(chunks):
        if set(chunk)!={'path','rowCount','sizeBytes','sha256'} or chunk.get('path')!=f'evidence/inventory-chunks/inventory-{i:04d}.json':
            fail('acquisition inventory chunk roster/path mismatch')
        if type(chunk.get('sizeBytes')) is not int or not 0<chunk['sizeBytes']<=PUBLIC_CAP:
            fail('acquisition inventory chunk size invalid')
        raw=read_regular(evidence.parent/chunk['path'],PUBLIC_CAP)
        if (len(raw),digest(raw))!=(chunk['sizeBytes'],chunk['sha256']):fail('acquisition inventory chunk hash/size mismatch')
        doc=json.loads(raw);batch=doc.get('rows')
        if (doc.get('profile')!=CHUNK_PROFILE or doc.get('chunkIndex')!=i or not isinstance(batch,list) or
            len(batch)!=chunk.get('rowCount') or not 0<len(batch)<=1000 or
            doc.get('firstPath')!=batch[0].get('path') or doc.get('lastPath')!=batch[-1].get('path')):
            fail('acquisition inventory chunk schema/boundary mismatch')
        rows.extend(batch);chunk_bytes+=len(raw)
        if chunk_bytes>CHUNK_CAP:fail('acquisition inventory chunks exceed evidence cap')
    compact=json.dumps(rows,separators=(',',':'),ensure_ascii=False).encode('utf-8')
    if (chunk_bytes!=expected_chunk_bytes or chunk_bytes!=index.get('totalChunkBytes') or len(rows)!=expected_row_count or
        len(rows)!=index.get('rowCount') or len(rows)>ROW_CAP or digest(compact)!=index.get('rowsSha256') or digest(compact)!=expected_rows_sha or
        digest(compact)!=inv.get('rowsSha256') or inv.get('rowCount')!=len(rows)):
        fail('acquisition inventory aggregate count/hash mismatch')
    if rows!=sorted(rows,key=lambda r:r.get('path','')) or len({r.get('path') for r in rows})!=len(rows):
        fail('acquisition inventory paths are not sorted unique')
    roots={'registry/cache','registry/index'}
    for row in rows:
        if set(row)!={'path','kind','sizeBytes','sha256','mode'} or not safe_rel(row['path']):fail('inventory row violates fixed safe schema')
        path=row['path'];root='/'.join(path.split('/')[:2]);is_root=path in roots
        if root not in roots or (not is_root and not path.startswith(root+'/')):fail('inventory row escapes closed registry roots')
        if type(row['mode']) is not int or row['mode']&0o022:fail('unsafe inventory mode')
        if row['kind']=='directory':
            if row['sizeBytes']!=0 or row['sha256'] is not None:fail('directory inventory row malformed')
        elif row['kind']=='file':
            if is_root or type(row['sizeBytes']) is not int or not 0<=row['sizeBytes']<=FILE_CAP or not re.fullmatch('[0-9a-f]{64}',row['sha256'] or ''):
                fail('file inventory row malformed')
        else:fail('unknown inventory row kind')
    if {r['path'] for r in rows if r['path'] in roots and r['kind']=='directory'}!=roots:fail('exact cache/index root rows missing')
    content=sum(r['sizeBytes'] for r in rows if r['kind']=='file')
    if content!=inv.get('fileContentBytes') or content!=report.get('inventory',{}).get('fileContentBytes') or content>CONTENT_CAP:
        fail('registry content bytes differ or exceed cap')
    archive=inv.get('archive',{})
    if archive.get('path')!='software/cargo-registry.tar' or type(archive.get('sizeBytes')) is not int or not 0<archive['sizeBytes']<=ARCHIVE_CAP or not re.fullmatch('[0-9a-f]{64}',archive.get('sha256','')):
        fail('acquisition archive descriptor differs from fixed contract')
    checks=report.get('lockedCrateChecks');witnesses=report.get('sparseIndexWitnesses')
    if report.get('lockedCrateCount')!=115 or not isinstance(checks,list) or len(checks)!=115 or report.get('sparseIndexWitnessCount')!=115 or not isinstance(witnesses,list) or len(witnesses)!=115:
        fail('acquisition locked-crate/index witness count is not 115')
    return report,rows,archive,content

def write_file(src, dest, row):
    flags=os.O_WRONLY|os.O_CREAT|os.O_EXCL
    if hasattr(os,'O_NOFOLLOW'):flags|=os.O_NOFOLLOW
    fd=os.open(str(dest),flags,row['mode'])
    h=hashlib.sha256();n=0
    try:
        with os.fdopen(fd,'wb',closefd=True) as out:
            while True:
                block=src.read(65536)
                if not block:break
                n+=len(block)
                if n>row['sizeBytes'] or n>FILE_CAP:fail('tar member exceeded inventory/file cap')
                h.update(block);out.write(block)
            out.flush();os.fsync(out.fileno())
        os.chmod(dest,row['mode'],follow_symlinks=False)
    except BaseException:
        try:dest.unlink()
        except OSError:pass
        raise
    if (n,h.hexdigest())!=(row['sizeBytes'],row['sha256']):fail('extracted file differs from acquisition inventory: '+row['path'])

def extract(archive_path,destination,expected_sha,expected_size,rows):
    archive=Path(archive_path);dst=Path(destination)
    before=archive.lstat()
    if not stat.S_ISREG(before.st_mode) or archive.is_symlink() or before.st_size!=expected_size or before.st_size>ARCHIVE_CAP:
        fail('software archive is unsafe or differs from pinned size')
    h=hashlib.sha256();n=0
    with archive.open('rb') as stream:
        while True:
            block=stream.read(65536)
            if not block:break
            n+=len(block)
            if n>ARCHIVE_CAP:fail('software archive exceeded cap')
            h.update(block)
    after=archive.lstat()
    if (h.hexdigest(),n)!=(expected_sha,expected_size) or (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns):
        fail('software archive bytes do not match reviewed physical pin')
    if dst.exists() or dst.is_symlink():fail('fresh Cargo registry destination is not empty')
    parent=dst.parent
    pst=parent.lstat()
    if parent.is_symlink() or not stat.S_ISDIR(pst.st_mode):fail('owned Cargo home is not a real directory')
    dst.mkdir(mode=0o700)
    row_by_path={r['path']:r for r in rows}
    seen=[];expanded=0
    try:
        with tarfile.open(archive,'r:') as tf:
            for member in tf:
                if len(seen)>=ROW_CAP:fail('archive member count exceeded hard bound')
                path=member.name.rstrip('/')
                if not safe_rel(path) or path not in row_by_path or path in seen:fail('archive member path is unlisted/unsafe/duplicate')
                row=row_by_path[path]
                if member.name not in (path,path+'/') or member.pax_headers or member.linkname or (member.uid,member.gid,member.mtime)!=(0,0,0) or member.uname not in ('',None) or member.gname not in ('',None) or stat.S_IMODE(member.mode)!=row['mode']:
                    fail('archive member normalized metadata differs from inventory')
                target=dst.parent/path
                if row['kind']=='directory':
                    if member.type!=tarfile.DIRTYPE or not member.isdir() or member.size not in (0,None):fail('non-directory archive member for directory row')
                    target.mkdir(mode=0o700,parents=False,exist_ok=False)
                    os.chmod(target,row['mode'],follow_symlinks=False)
                else:
                    if member.type!=tarfile.REGTYPE or not member.isfile() or member.size!=row['sizeBytes']:fail('archive member type/size differs from inventory')
                    expanded+=member.size
                    if expanded>CONTENT_CAP:fail('archive expanded content exceeds cap')
                    source=tf.extractfile(member)
                    if source is None:fail('archive file member has no data stream')
                    write_file(source,target,row)
                seen.append(path)
        if seen!=[r['path'] for r in rows]:fail('archive member roster/order differs from acquisition inventory')
        # Rewalk the result to ensure no extra entries and exact physical modes and bytes.
        actual=[]
        for base,dirs,files in os.walk(dst.parent/'registry',followlinks=False):
            bp=Path(base)
            for name in dirs:
                p=bp/name
                if p.is_symlink() or not p.is_dir():fail('extracted registry contains unsafe directory')
                rel=p.relative_to(dst.parent).as_posix();actual.append({'path':rel,'kind':'directory','sizeBytes':0,'sha256':None,'mode':stat.S_IMODE(p.lstat().st_mode)})
            for name in files:
                p=bp/name
                if p.is_symlink() or not p.is_file():fail('extracted registry contains unsafe file')
                hh=hashlib.sha256();sz=0
                with p.open('rb') as f:
                    for block in iter(lambda:f.read(65536),b''):hh.update(block);sz+=len(block)
                rel=p.relative_to(dst.parent).as_posix();actual.append({'path':rel,'kind':'file','sizeBytes':sz,'sha256':hh.hexdigest(),'mode':stat.S_IMODE(p.lstat().st_mode)})
        actual.sort(key=lambda r:r['path'])
        if actual!=rows:fail('complete physical extracted inventory differs from acquisition rows')
        final_stat=archive.lstat();final_hash=hashlib.sha256();final_size=0
        with archive.open('rb') as stream:
            for block in iter(lambda:stream.read(65536),b''):
                final_size+=len(block)
                if final_size>ARCHIVE_CAP:fail('archive grew beyond cap during extraction')
                final_hash.update(block)
        if (final_hash.hexdigest(),final_size)!=(expected_sha,expected_size) or (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)!=(final_stat.st_dev,final_stat.st_ino,final_stat.st_size,final_stat.st_mtime_ns):
            fail('archive changed during extraction')
    except BaseException:
        # Destination is an owned volume path and the guest exits on failure; no recursive cleanup of other paths.
        raise
    return {'profile':'umf.g03-cargo-cache-extraction/1','status':'PASS','archiveSha256':expected_sha,'archiveBytes':expected_size,'inventoryRowCount':len(rows),'inventoryFileCount':sum(1 for r in rows if r['kind']=='file'),'inventoryDirectoryCount':sum(1 for r in rows if r['kind']=='directory'),'cacheContentBytes':expanded,'inventoryRowsSha256':hashlib.sha256(json.dumps(rows,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()}

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--evidence',required=True);ap.add_argument('--archive',required=True);ap.add_argument('--destination',required=True);ap.add_argument('--archive-sha256',required=True);ap.add_argument('--acquisition-packet-sha256',required=True);ap.add_argument('--archive-bytes',required=True,type=int);ap.add_argument('--index-sha256',required=True);ap.add_argument('--rows-sha256',required=True);ap.add_argument('--chunk-bytes',required=True,type=int);ap.add_argument('--row-count',required=True,type=int);ap.add_argument('--receipt',required=True)
    a=ap.parse_args()
    report,rows,archive,content=load_inventory(a.evidence,a.index_sha256,a.rows_sha256,a.chunk_bytes,a.row_count)
    if (archive.get('sha256'),archive.get('sizeBytes'))!=(a.archive_sha256,a.archive_bytes):fail('archive descriptor and reviewed packet pin differ')
    if not hasattr(a,'acquisition_packet_sha256'):fail('acquisition packet pin argument missing')
    if report.get('packetSha256')!=a.acquisition_packet_sha256:fail('acquisition guest report is not bound to pinned acquisition packet')
    actual_mode=stat.S_IMODE(Path(a.archive).lstat().st_mode)
    if actual_mode!=archive.get('mode'):fail('archive physical mode differs from acquisition report')
    result=extract(a.archive,a.destination,a.archive_sha256,a.archive_bytes,rows)
    result.update(inventoryIndexSha256=a.index_sha256,inventoryChunkBytes=a.chunk_bytes,reportProfile=report['profile'],lockedCrateCount=report['lockedCrateCount'],sparseIndexWitnessCount=report['sparseIndexWitnessCount'])
    raw=(json.dumps(result,sort_keys=True,separators=(',',':'))+'\n').encode()
    if len(raw)>PUBLIC_CAP:fail('cache extraction receipt exceeds public file cap')
    receipt=Path(a.receipt);flags=os.O_WRONLY|os.O_CREAT|os.O_EXCL
    if hasattr(os,'O_NOFOLLOW'):flags|=os.O_NOFOLLOW
    fd=os.open(str(receipt),flags,0o600)
    with os.fdopen(fd,'wb',closefd=True) as stream:stream.write(raw);stream.flush();os.fsync(stream.fileno())
    print(json.dumps({'status':'PASS','archiveSha256':a.archive_sha256,'inventoryRowCount':len(rows),'cacheContentBytes':content},sort_keys=True))
    return 0

if __name__=='__main__':raise SystemExit(main())
