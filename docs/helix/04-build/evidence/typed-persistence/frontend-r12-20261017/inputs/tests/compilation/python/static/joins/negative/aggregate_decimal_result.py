from decimal import Decimal
from umf_access.types import StrictModel
class Totals(StrictModel):
    total: Decimal | None

def wrong(row: Totals) -> float:
    return row.total
