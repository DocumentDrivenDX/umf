from decimal import Decimal
from umf_access import Param, query
from spark_numeric_fixture.models import Metric
from spark_numeric_fixture.keys import MetricKey
@query
def amount_eq(value: Param[Decimal | None]):
    return Metric.objects.filter(Metric.c.amount == value).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()
@query
def amount_ne(value: Param[Decimal | None]):
    return Metric.objects.filter(Metric.c.amount != value).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()
@query
def amount_lt(value: Param[Decimal | None]):
    return Metric.objects.filter(Metric.c.amount < value).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()
@query
def amount_le(value: Param[Decimal | None]):
    return Metric.objects.filter(Metric.c.amount <= value).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()
@query
def amount_gt(value: Param[Decimal | None]):
    return Metric.objects.filter(Metric.c.amount > value).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()
@query
def amount_ge(value: Param[Decimal | None]):
    return Metric.objects.filter(Metric.c.amount >= value).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()
@query
def big_eq(value: Param[int]):
    return Metric.objects.filter(Metric.c.big == value).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()
@query
def big_ne(value: Param[int]):
    return Metric.objects.filter(Metric.c.big != value).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()
@query
def big_lt(value: Param[int]):
    return Metric.objects.filter(Metric.c.big < value).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()
@query
def big_le(value: Param[int]):
    return Metric.objects.filter(Metric.c.big <= value).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()
@query
def big_gt(value: Param[int]):
    return Metric.objects.filter(Metric.c.big > value).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()
@query
def big_ge(value: Param[int]):
    return Metric.objects.filter(Metric.c.big >= value).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()
@query
def amount_page(value: Param[Decimal | None], after: Param[MetricKey | None]):
    return Metric.objects.filter(Metric.c.amount >= value).select(Metric.c.id).order_by(Metric.c.id.asc()).page(size=7, after=after, snapshot=True)
@query
def amount_in():
    return Metric.objects.filter(Metric.c.amount.isin((None, Decimal("-12.000000000"), Decimal("1.000000001")))).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()
@query
def amount_not_in():
    return Metric.objects.filter(~Metric.c.amount.isin((None, Decimal("-12.000000000"), Decimal("1.000000001")))).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()
@query
def amount_empty():
    return Metric.objects.filter(Metric.c.amount.isin(())).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()
@query
def amount_not_empty():
    return Metric.objects.filter(~Metric.c.amount.isin(())).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()
