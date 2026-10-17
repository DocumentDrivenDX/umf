from decimal import Decimal
from umf_access import Param, query
from spark_list_fixture.models import Metric
from spark_list_fixture.keys import MetricKey
@query
def big_in(values: Param[list[int | None]]):
    return Metric.objects.filter(Metric.c.big.is_in(values)).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()
@query
def big_not_in(values: Param[list[int | None]]):
    return Metric.objects.filter(~Metric.c.big.is_in(values)).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()
@query
def amount_in(values: Param[list[Decimal | None]]):
    return Metric.objects.filter(Metric.c.amount.is_in(values)).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()
@query
def amount_not_in(values: Param[list[Decimal | None]]):
    return Metric.objects.filter(~Metric.c.amount.is_in(values)).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()
@query
def label_in(values: Param[list[str | None]]):
    return Metric.objects.filter(Metric.c.label.is_in(values)).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()
@query
def label_not_in(values: Param[list[str | None]]):
    return Metric.objects.filter(~Metric.c.label.is_in(values)).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()
@query
def active_in(values: Param[list[bool | None]]):
    return Metric.objects.filter(Metric.c.active.is_in(values)).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()
@query
def active_not_in(values: Param[list[bool | None]]):
    return Metric.objects.filter(~Metric.c.active.is_in(values)).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()
@query
def mixed_numeric(values: Param[list[int | None]], threshold: Param[Decimal | None]):
    return Metric.objects.filter(Metric.c.big.is_in(values) & (Metric.c.amount < threshold)).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()
@query
def label_page(values: Param[list[str | None]], after: Param[MetricKey | None]):
    return Metric.objects.filter(~Metric.c.label.is_in(values)).select(Metric.c.id).order_by(Metric.c.id.asc()).page(size=3, after=after, snapshot=True)
