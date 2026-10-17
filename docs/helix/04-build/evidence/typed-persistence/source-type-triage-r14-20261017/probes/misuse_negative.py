from umf_access.dsl._expressions import Column, RecordAlias, RequiredJoin
from decimal import Decimal
class Owner: pass
class Row: pass
class Foreign: pass
class Tag: pass
class Key: pass

def bad(join: RequiredJoin[Owner,Row,Key], foreign: RecordAlias[Foreign,Tag], integer: Column[Owner,int], decimal: Column[Owner,Decimal]) -> None:
    join.to_alias(foreign)
    integer.bucket_width('1')
    decimal.bucket_width(1.0)
