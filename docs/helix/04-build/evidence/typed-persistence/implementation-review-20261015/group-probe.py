import sys,json
sys.path.insert(0,'/Users/erik/.codex/worktrees/20bc/umf/python/umf_access/src')
from umf_access.dsl import Column,FieldRef,RecordRef,Query,query
from umf_access.capture import capture,render_logical
class Row:pass
id=FieldRef('m','Row','id',logical_name='id')
value=Column[Row,str](id)
objects=Query[Row,Row,str](RecordRef('m','Row',(id,),logical_namespace='ns',logical_name='Rows'))
@query
def grouped():return objects.group_by(value).count()
print(json.dumps({'sql':render_logical(capture(grouped).variants[0])}))
