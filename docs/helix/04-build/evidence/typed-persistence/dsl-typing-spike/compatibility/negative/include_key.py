from datetime import datetime
from decimal import Decimal
from pydantic import MISSING
from umf_access import Param, Page, Continuation, if_present, Actions, ReplayingActions, ActionExecutor
from models import Order, Customer, OrderSummary, CustomerSummary, OrderKey, CustomerKey, OrderPatch
from calls import orders, first_order, order_page, count_orders
key: OrderKey = Order.objects.include_keys(Order.c.customer, limit=5).all().value[0].keys.items[0]
