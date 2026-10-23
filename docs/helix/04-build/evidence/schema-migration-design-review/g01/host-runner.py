import runpy,sys
from uuid import uuid4
import psycopg
from psycopg import sql
root='/private/tmp/umf-g01-scoped-freeze-v2-20261022'
database='rv_g01_host_'+uuid4().hex[:10]
with psycopg.connect('dbname=postgres',autocommit=True) as admin:
    admin.execute(sql.SQL('CREATE DATABASE {} TEMPLATE template0').format(sql.Identifier(database)))
    try:
        sys.argv=[root+'/host-native.py','--dsn','dbname='+database,'--fixture',root+'/fixture.json','--report','/private/tmp/umf-g01-independent-host-native.json']
        runpy.run_path(root+'/host-native.py',run_name='__main__')
    finally:
        admin.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(database)))
