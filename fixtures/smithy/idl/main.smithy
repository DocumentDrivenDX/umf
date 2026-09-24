$version: "2"
metadata exact = 9007199254740993
namespace sales
// Unicode and comments are preserved: café.
structure Order {
    @required
    id: OrderId
    children: Orders
}
list Orders { member: Order }
