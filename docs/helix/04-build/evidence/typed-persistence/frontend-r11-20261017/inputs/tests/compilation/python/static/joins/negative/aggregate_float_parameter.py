from decimal import Decimal
from umf_access.types import StrictModel
class Minimum(StrictModel):
    minimum: Decimal
wrong = Minimum(minimum=1.5)
