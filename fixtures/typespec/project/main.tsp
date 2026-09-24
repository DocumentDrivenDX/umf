import "./common.tsp";
namespace Sales;
/** An order with recursive related orders and exact native literals. */
@doc("Customer order — preserves Unicode and comments")
model Order extends Entity<string> {
  state: OrderState;
  total: int32 = 42;
  cost: Money;
  related?: Order[];
  externalId?: 9007199254740993;
}
alias OrdersPage = Page<Order>;
union OrderResult { found: Order, absent: NotFound }
interface Orders {
  read(id: string): OrderResult;
  list(): OrdersPage;
}
const retryCount = 3;
