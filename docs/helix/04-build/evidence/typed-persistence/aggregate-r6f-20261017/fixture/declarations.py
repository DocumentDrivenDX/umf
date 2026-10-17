from aggregate_shop import Order
from decimal import Decimal
from umf_access.dsl import Param,query,sum_,avg_,min_,max_,count,count_distinct
@query
def totals(group: Param[str]):
 return Order.objects.filter(Order.c.memo == group).select(sum_(Order.c.revision),sum_(Order.c.amount),avg_(Order.c.amount,scale=0),avg_(Order.c.amount,scale=1),avg_(Order.c.amount,scale=1000),count(),count_distinct(Order.c.amount),count_distinct(Order.c.memo)).all()
@query
def extrema(group: Param[str]):
 return Order.objects.filter(Order.c.memo == group).select(min_(Order.c.amount),max_(Order.c.amount)).all()
@query
def buckets():
 return Order.objects.filter(Order.c.memo == 'buckets').group_by(Order.c.revision.bucket_width(3)).select(Order.c.revision.bucket_width(3),sum_(Order.c.revision),count()).order_by(sum_(Order.c.revision).asc()).limit(20).all()
@query
def decimal_buckets():
 return Order.objects.filter(Order.c.memo == 'decimal-buckets').group_by(Order.c.amount.bucket_width(Decimal('0.25'))).select(Order.c.amount.bucket_width(Decimal('0.25')),sum_(Order.c.amount),count()).order_by(sum_(Order.c.amount).asc()).limit(20).all()
@query
def decimal_integer_width():
 return Order.objects.filter(Order.c.memo == 'decimal-buckets').group_by(Order.c.amount.bucket_width(1)).select(Order.c.amount.bucket_width(1),sum_(Order.c.amount),count()).order_by(sum_(Order.c.amount).asc()).limit(20).all()
@query
def integer_decimal_width():
 return Order.objects.filter(Order.c.memo == 'buckets').group_by(Order.c.revision.bucket_width(Decimal('2.5'))).select(Order.c.revision.bucket_width(Decimal('2.5')),sum_(Order.c.revision),count()).order_by(sum_(Order.c.revision).asc()).limit(20).all()
@query
def grouped_count():
 return Order.objects.filter(Order.c.memo == 'buckets').group_by(Order.c.revision.bucket_width(3)).limit(20).count()
@query
def integral_decimal_width():
 return Order.objects.filter(Order.c.memo == 'buckets').select(Order.c.revision.bucket_width(Decimal('3')),Order.c.revision.bucket_width(Decimal('1E+1'))).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def count_having(group: Param[str]):
 return Order.objects.filter(Order.c.memo == group).select(count()).having(count()>0).all()
@query
def combined_having(group: Param[str]):
 return Order.objects.filter(Order.c.memo == group).select(count(),sum_(Order.c.revision)).having((count()>0) & (sum_(Order.c.revision)>0)).all()
@query
def global_counts():
 return Order.objects.select(count(),count_distinct(Order.c.memo),count_distinct(Order.c.amount),count_distinct(Order.c.revision)).all()
@query
def having_positive():
 return Order.objects.filter(Order.c.memo == 'buckets').group_by(Order.c.revision.bucket_width(3)).having(sum_(Order.c.revision)>0).select(Order.c.revision.bucket_width(3),sum_(Order.c.revision)).order_by(sum_(Order.c.revision).desc()).limit(20).all()
