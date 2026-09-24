// Shared definitions remain distinct source files.
namespace Sales;
@pattern("^[A-Z]{3}$")
scalar CurrencyCode extends string;
model Money { amount: decimal; currency: CurrencyCode; }
model Entity<TId> { @key id: TId; }
model Page<T> { data: T[]; next?: string; }
enum OrderState { pending, shipped, cancelled }
@error model NotFound { message: string; }
