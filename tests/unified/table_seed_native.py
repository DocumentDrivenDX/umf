# SPDX-License-Identifier: MIT OR Apache-2.0
"""Local PG18 administrative typed seed lifecycle oracle; synthetic rows only."""
import argparse
import copy
import json
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg import sql
from umf_access.lifecycle import CatalogError, apply_table_migration
from umf_access.lifecycle.ledger_schema import HISTORY
from umf_access.lifecycle.seeds import _binding
from umf_codegen import compile_table_deployment, compile_table_migration
from weft import check_table_seed_json, compile_table_seed_json

parser=argparse.ArgumentParser()
parser.add_argument('--dsn',required=True)
parser.add_argument('--source',type=Path,required=True)
parser.add_argument('--report',type=Path,required=True)
parser.add_argument('--shapes-only',action='store_true')
args=parser.parse_args()
source=json.loads(args.source.read_text());prefix='seed_'+uuid4().hex[:12]+'_'
cfg={'module':'demo','schema':prefix+'schema','ownerRole':prefix+'owner',
     'personRole':prefix+'person','batchRole':prefix+'batch','groupRoles':{}}
alice=prefix+'alice';roles=[cfg['ownerRole'],cfg['personRole'],cfg['batchRole'],alice]
checks=[];trace=[];tx_times=[]

def check(name,condition):
    assert condition,name
    checks.append(name)


def row(key,owner):
    return {'table':'notes','values':[{'field':{'module':'demo','element':'id'},'value':{'string':key}},
                                     {'field':{'module':'demo','element':'owner'},'value':{'string':owner}}]}


def bundle(document):
    result=compile_table_deployment(json.dumps(document,separators=(',',':')),configuration=cfg)
    assert result['status']=='compiled',result
    return result['bundle']


def migration(identifier,previous,next_bundle,predecessor):
    result=compile_table_migration(migration_id=identifier,previous_bundle=previous,next_bundle=next_bundle,predecessor=predecessor)
    assert result['status']=='compiled',result
    return result['plan']


class TraceCursor(psycopg.Cursor):
    def execute(self,query,params=None,**kwargs):
        if isinstance(query,str) and query.startswith('WITH umf_seed_effects AS'):
            trace.append(query)
        return super().execute(query,params,**kwargs)


payload=source['modules'][0]['extensions']['umf.tables']
payload['seedSets']=[{'id':'bootstrap','conflict':'error','rows':[row(str(i),alice) for i in range(1005)]}]
first=bundle(source);plan=migration('001',None,first,None)
request={'version':'weft.table-seed/0.1','target':'postgresql18','module':'demo',
         'binding':_binding(first),'seedSets':['bootstrap']}
program=json.loads(compile_table_seed_json(json.dumps(request,separators=(',',':'))))
check('seed-compiler-admits-original-source',program['status']=='compiled')
check('seed-compiler-bounds-chunks',[s['maxEffects'] for s in program['steps']]==[1000,5])
check('seed-checker-source-recompiles',json.loads(check_table_seed_json(json.dumps(program)))['status']=='checked')
forged=copy.deepcopy(program);forged['steps'][0]['dbapiSql']='DROP SCHEMA public'
check('seed-forged-sql-refuses',json.loads(check_table_seed_json(json.dumps(forged)))['status']=='blocked')
with psycopg.connect(args.dsn,autocommit=True,cursor_factory=TraceCursor) as admin:
    created=[];schema_created=False
    try:
        for role in roles:
            admin.execute(sql.SQL('CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION').format(sql.Identifier(role)));created.append(role)
        admin.execute(sql.SQL('GRANT {} TO {} WITH INHERIT TRUE,SET FALSE').format(sql.Identifier(cfg['personRole']),sql.Identifier(alice)))
        admin.execute(sql.SQL('CREATE SCHEMA {} AUTHORIZATION {}').format(sql.Identifier(cfg['schema']),sql.Identifier(cfg['ownerRole'])));schema_created=True
        def apply(current,head):
            with admin.transaction():
                admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(cfg['ownerRole'])))
                admin.execute('SET LOCAL search_path=pg_catalog')
                admin.execute("SET LOCAL TIME ZONE 'America/Los_Angeles'")
                tx_times.append(admin.execute('SELECT transaction_timestamp()').fetchone()[0])
                return apply_table_migration(admin,current,approved_digest=current['digest'],expected_head=head,person_roles=(alice,))
        relation=sql.Identifier(cfg['schema'],'notes')
        if not args.shapes_only:
            applied=apply(plan,None)
            check('seed-1005-rows-use-two-mutations',len(trace)==2)
            relation=sql.Identifier(cfg['schema'],'notes')
            check('seed-all-rows-committed',admin.execute(sql.SQL('SELECT count(*) FROM {}').format(relation)).fetchone()==(1005,))
            check('seed-caller-role-restored',admin.execute('SELECT current_user').fetchone()[0] not in roles)
            before=len(trace);again=apply(plan,None)
            check('seed-replay-has-no-mutations',len(trace)==before and again['status']=='already-applied')
            payload['seedSets'].append({'id':'later','conflict':'ignore','rows':[row('0','ignored'),row('new',alice),row('new','ignored')]})
            second=bundle(source);next_plan=migration('002',first,second,{'id':plan['id'],'digest':plan['digest']})
            before=len(trace);second_applied=apply(next_plan,applied['headDigest'])
            check('seed-forward-selects-only-new-set',len(trace)-before==1)
            check('seed-primary-ignore-retains-first-authored-value',admin.execute(sql.SQL("SELECT owner FROM {} WHERE id='new'").format(relation)).fetchone()==(alice,))
            check('seed-existing-row-is-not-overwritten',admin.execute(sql.SQL("SELECT owner FROM {} WHERE id='0'").format(relation)).fetchone()==(alice,))
            payload['seedSets'].append({'id':'failed','conflict':'error','rows':[row('rollback_'+str(i),alice) for i in range(1000)]+[row('0',alice)]})
            failed_bundle=bundle(source);failed=migration('003',second,failed_bundle,{'id':next_plan['id'],'digest':next_plan['digest']})
            before=len(trace)
            try:apply(failed,second_applied['headDigest'])
            except CatalogError:check('seed-conflict-error-rolls-back',True)
            else:raise AssertionError('conflicting seed accepted')
            check('seed-cross-chunk-failure-rolls-back-first-chunk',len(trace)-before==2 and admin.execute(sql.SQL("SELECT count(*) FROM {} WHERE id LIKE 'rollback_%%'").format(relation)).fetchone()==(0,))
            check('seed-failed-migration-has-no-ledger-entry',admin.execute(sql.SQL('SELECT count(*) FROM {}').format(sql.Identifier(cfg['schema'],HISTORY))).fetchone()==(2,))
            flags=admin.execute('SELECT relrowsecurity,relforcerowsecurity FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=%s AND c.relname=%s',(cfg['schema'],'notes')).fetchone()
            check('seed-forced-rls-restored-after-success-and-failure',flags==(True,True))
            with admin.transaction():
                admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(alice)))
                check('seed-person-sees-owned-rows',admin.execute(sql.SQL('SELECT count(*) FROM {}').format(relation)).fetchone()==(1006,))
        # Separate fresh synthetic installs qualify exact codecs/defaults and
        # immediate self-FK row order without changing the preceding seed set.
        def reset_schema():
            admin.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(cfg['schema'])))
            admin.execute(sql.SQL('CREATE SCHEMA {} AUTHORIZATION {}').format(sql.Identifier(cfg['schema']),sql.Identifier(cfg['ownerRole'])))
        reset_schema()
        typed=json.loads(args.source.read_text());typed_module=typed['modules'][0];typed_payload=typed_module['extensions']['umf.tables'];table=typed_payload['tables'][0];typed_payload['commands']=[]
        specs=[('wide','integer',{'kind':'int8'},{'integerToken':'9223372036854775807'}),
               ('exact','decimal',{'kind':'numeric','precision':14,'scale':4},{'decimalToken':'9999999999.9999'}),
               ('day','date',{'kind':'date'},{'date':'2000-02-29'}),
               ('instant','timestamp',{'kind':'timestamptz'},{'timestamp':'2026-01-01T01:02:03.123456+01:00'}),
               ('token','uuid',{'kind':'uuid'},{'uuid':'12345678-1234-5678-9abc-0123456789ab'}),
               ('enabled','boolean',{'kind':'boolean'},{'boolean':False}),
               ('memo','string',{'kind':'text'},None),
               ('clock','timestamp',{'kind':'timestamptz'},None)]
        typed_row=row('typed',alice)
        for name,carrier,native,value in specs:
            ref={'module':'demo','element':name}
            field={'id':name,'kind':'field','scalarType':carrier,'cardinality':'one',
                   'nullability':'absent-allowed' if name=='memo' else 'required','extensions':{}}
            if carrier=='decimal':field['facets']={'precision':14,'scale':4}
            typed_module['elements'].append(field)
            next(e for e in typed_module['elements'] if e['kind']=='record')['members'].append(ref)
            column={'field':ref,'name':name,'nativeType':native}
            if name=='clock':column['default']={'kind':'currentTimestamp'}
            else:typed_row['values'].append({'field':ref,'value':value})
            table['columns'].append(column)
        typed_payload['seedSets']=[{'id':'typed','conflict':'error','rows':[typed_row]}]
        typed_bundle=bundle(typed);typed_plan=migration('typed',None,typed_bundle,None);apply(typed_plan,None)
        actual=admin.execute(sql.SQL('SELECT wide,exact,day,instant,token,enabled,memo,clock FROM {}').format(relation)).fetchone()
        check('seed-exact-wide-integer-and-decimal',actual[0]==9223372036854775807 and actual[1]==Decimal('9999999999.9999'))
        check('seed-exact-date-instant',str(actual[2])=='2000-02-29' and actual[3]==datetime.fromisoformat('2026-01-01T00:02:03.123456+00:00'))
        check('seed-uuid-boolean-null',str(actual[4])=='12345678-1234-5678-9abc-0123456789ab' and actual[5] is False and actual[6] is None)
        check('seed-omitted-clock-is-native-transaction-time',actual[7]==tx_times[-1])
        reset_schema()
        linked=json.loads(args.source.read_text());lm=linked['modules'][0];lp=lm['extensions']['umf.tables'];lt=lp['tables'][0]
        parent={'module':'demo','element':'parent'}
        lm['elements'].append({'id':'parent','kind':'field','scalarType':'string','cardinality':'one','nullability':'absent-allowed','extensions':{}})
        next(e for e in lm['elements'] if e['kind']=='record')['members'].append(parent)
        lt['columns'].append({'field':parent,'name':'parent','nativeType':{'kind':'text'}})
        lt['foreignKeys'].append({'id':'parent_fk','name':'parent_fk','fields':[parent],
            'target':{'record':{'module':'demo','element':'Note'},'key':'primary'},'onUpdate':'noAction','onDelete':'noAction','deferrable':False})
        child=row('child',alice);child['values'].append({'field':parent,'value':{'string':'root'}})
        root=row('root',alice);root['values'].append({'field':parent,'value':None})
        lp['seedSets']=[{'id':'ordered','conflict':'error','rows':[child,root]}]
        linked_bundle=bundle(linked);linked_plan=migration('ordered',None,linked_bundle,None)
        request.update(binding=_binding(linked_bundle),seedSets=['ordered'])
        linked_program=json.loads(compile_table_seed_json(json.dumps(request,separators=(',',':'))))
        check('seed-self-fk-retains-row-statements',linked_program['status']=='compiled' and [s['maxEffects'] for s in linked_program['steps']]==[1,1])
        before=len(trace)
        try:apply(linked_plan,None)
        except CatalogError:check('seed-self-fk-authored-forward-reference-refuses',True)
        else:raise AssertionError('self-FK order changed by batching')
        check('seed-self-fk-stops-on-first-authored-row',len(trace)-before==1)
        check('seed-initial-failure-removes-ddl-and-ledger',admin.execute('SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=%s',(cfg['schema'],)).fetchone()==(0,))
        lp['seedSets'][0]['rows'].reverse()
        accepted_bundle=bundle(linked);accepted_plan=migration('ordered-accepted',None,accepted_bundle,None)
        before=len(trace);apply(accepted_plan,None)
        check('seed-self-fk-parent-first-succeeds-in-two-statements',len(trace)-before==2)
        check('seed-self-fk-parent-and-child-persist',admin.execute(sql.SQL('SELECT count(*) FROM {}').format(relation)).fetchone()==(2,))
        report={'scope':'local macOS PostgreSQL18 typed administrative seed component','postgresql':admin.info.server_version,'assertions':checks,'mutationStatements':len(trace),'bulkSeedRows':0 if args.shapes_only else 1008,'sourceDigests':{'bulk':first['sourceDigest'],'typed':typed_bundle['sourceDigest'],'selfFk':linked_bundle['sourceDigest'],'selfFkAccepted':accepted_bundle['sourceDigest']},'fullPraxisAcceptance':False}
    finally:
        if schema_created:admin.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(cfg['schema'])))
        for role in reversed(created):admin.execute(sql.SQL('DROP ROLE {}').format(sql.Identifier(role)))
args.report.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'assertions':len(checks),'mutationStatements':len(trace)}))
