from datetime import datetime
from decimal import Decimal
from dsl import Param
from shop.models import Order, Customer, OrderPatch

def b1(): return Order.objects.filter(Order.c.amount > "10")                 # E1 wrong operand type
def b2(): return Order.objects.filter(Order.c.amount == "10")                # E2 wrong operand type via ==
def b3(): return Order.objects.filter(Customer.c.name == "x")                # E3 column from another record
def b4(): return Order.objects.filter(Order.c.ammount > Decimal(1))          # E4 misspelled column
def b5(): return Order.objects.update(amount="10")                           # E5 wrong update type
def b6(): return Order.objects.update(placed_at=datetime.now())              # E6 immutable/unknown update field
def b7(p: Param[str]): return Order.objects.filter(Order.c.placed_at >= p)   # E7 param type mismatch
def b8(): return Order.objects.select(Customer.c.name)                       # E8 select foreign column
b9 = OrderPatch(ammount=Decimal(1))                                          # E9 unknown patch field
