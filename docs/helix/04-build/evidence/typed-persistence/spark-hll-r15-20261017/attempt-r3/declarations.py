from umf_access import query
from umf_access.dsl import approx_count_distinct
from spark_list_fixture.models import Metric
@query
def global_labels():
    return Metric.objects.select(approx_count_distinct(Metric.c.label)).all()
@query
def global_amounts():
    return Metric.objects.select(approx_count_distinct(Metric.c.amount)).all()
@query
def global_big():
    return Metric.objects.select(approx_count_distinct(Metric.c.big)).all()
@query
def only_null():
    return Metric.objects.filter(Metric.c.id == '00').select(approx_count_distinct(Metric.c.label)).all()
@query
def empty():
    return Metric.objects.filter(Metric.c.id == 'absent').select(approx_count_distinct(Metric.c.label)).all()
@query
def filtered():
    return Metric.objects.filter(Metric.c.big > 0).select(approx_count_distinct(Metric.c.label)).all()
@query
def grouped():
    return Metric.objects.group_by(Metric.c.active).select(Metric.c.active, approx_count_distinct(Metric.c.label)).order_by(Metric.c.active.asc()).limit(2).all()
