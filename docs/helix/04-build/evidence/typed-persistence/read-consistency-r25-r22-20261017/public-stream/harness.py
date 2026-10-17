"""Real installed public stream, SELECT-only actor, owned value-preserving rewrite."""
import importlib.util
import json
import shutil
from datetime import timedelta
from pathlib import Path
import psycopg
import weft as weft_sql
from umf_access.reviewed import ReviewedSQL
from umf_access.targets import PostgresTarget, PostgresConfiguration, binding_digest
from umf_access.types import StrictModel

spec = importlib.util.spec_from_file_location('mechanism', '/private/tmp/sdk-rr-read-consistency-prep/regression.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
class Empty(StrictModel):
    pass
class Identifier(StrictModel):
    id: str

class Cursor:
    def __init__(self, raw, owner): self.raw, self.owner = raw, owner
    def __enter__(self): self.raw.__enter__(); return self
    def __exit__(self, *args): return self.raw.__exit__(*args)
    def __getattr__(self, name): return getattr(self.raw, name)
    def execute(self, sql, params=None):
        self.owner.trace.append({'sql':sql,'params':params})
        if sql in self.owner.locks and not self.owner.injected:
            self.owner.injected = True
            self.owner.observation['readerXminBeforeLock'] = self.owner.fixture.execute(
                'SELECT backend_xmin::text FROM pg_catalog.pg_stat_activity WHERE pid=%s',
                (self.owner.raw.info.backend_pid,)).fetchone()
            self.owner.observation['nativeBefore'] = self.owner.fixture.execute(m.NATIVE).fetchone()
            self.owner.fixture.execute(m.REWRITE)
            self.owner.observation['nativeAfter'] = self.owner.fixture.execute(m.NATIVE).fetchone()
            self.owner.observation['independentRows'] = self.owner.fixture.execute(m.ORACLE).fetchall()
        return self.raw.execute(sql, params)
    def fetchone(self):
        row=self.raw.fetchone()
        self.owner.fetched.append(row)
        return row
class Connection:
    def __init__(self, raw, fixture, locks):
        self.raw,self.fixture,self.locks=raw,fixture,locks
        self.injected=False; self.trace=[]; self.fetched=[]; self.observation={}
    def __getattr__(self,name): return getattr(self.raw,name)
    def cursor(self): return Cursor(self.raw.cursor(),self)

def main():
    import sys
    out=Path(sys.argv[1]); out.mkdir(exist_ok=False); (out/'socket').mkdir()
    shutil.copyfile(__file__,out/'harness.py')
    request=json.loads(m.INPUT.read_text()); request['keyset']=True
    entry=ReviewedSQL(request['sql'],Empty,Identifier,row_cap=10,keyset=True).build(
        weft_sql,target='postgresql18',binding=request['binding'])
    artifact=entry.artifact()
    m.dump(out/'authored-request.json',request); m.dump(out/'original-artifact.json',artifact)
    started=False; fixture=None; cleanup={}
    try:
        m.command(m.PG/'initdb','-D',out/'data','-A','trust','--no-sync','-U','sdk_test')
        m.command(m.PG/'pg_ctl','-D',out/'data','-l',out/'server.log','-o',
          f"-F -k {out/'socket'} -c listen_addresses='' -p 55524",'-w','start'); started=True
        dsn=f"host={out/'socket'} port=55524 dbname=postgres"
        fixture=psycopg.connect(dsn+' user=sdk_test',autocommit=True)
        fixture.execute('CREATE ROLE erik LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION')
        fixture.execute('CREATE SCHEMA native_app')
        fixture.execute('CREATE TABLE native_app.orders(id text COLLATE pg_catalog."C" PRIMARY KEY,status text COLLATE pg_catalog."C",amount numeric(12,2))')
        m.restore_rows(fixture)
        fixture.execute('GRANT USAGE ON SCHEMA native_app TO erik')
        fixture.execute('GRANT SELECT ON native_app.orders TO erik')
        with psycopg.connect(dsn+' user=erik') as actor:
            flags=actor.execute(m._ROLE).fetchone(); actor.commit()
            assert flags==('erik','erik',False,False),flags
            conn=Connection(actor,fixture,artifact['lockSql'])
            target=PostgresTarget(conn,PostgresConfiguration('native_app',binding_digest(request['binding']),(180006,),timedelta(seconds=8)),(entry,))
            rows=[r.id for r in target.stream(entry,Empty(),max_rows=20)]
            assert conn.injected
            obs=conn.observation
            assert obs['nativeBefore'][1]!=obs['nativeAfter'][1]
            assert obs['independentRows']==m.KNOWN
            report={'rows':rows,'expected':[r[0] for r in m.KNOWN], 'actor':flags,
              'observation':obs,'trace':conn.trace,'fetchoneObservations':conn.fetched,
              'status':'PUBLIC_STREAM_ROW_LOSS_REPRODUCED' if not rows else 'ROWS_PRESERVED'}
            m.dump(out/'verification.json',report)
            return 1 if not rows else 0
    finally:
        if fixture:
            try: m.restore_rows(fixture); cleanup['fixtureRestored']=True
            finally: fixture.close()
        if started: m.command(m.PG/'pg_ctl','-D',out/'data','-m','fast','-w','stop')
        cleanup['ownedServerStopped']=True; m.dump(out/'cleanup.json',cleanup)
if __name__=='__main__': raise SystemExit(main())
