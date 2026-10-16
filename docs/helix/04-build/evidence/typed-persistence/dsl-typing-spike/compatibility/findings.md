# B-TP-001 typing findings and disposition

## F1: covariance and if_present

The original signature `if_present(p: Param[T | MISSING], ...) -> Predicate[O]`
accepts `Param[str | None]` on both pinned checkers: covariance permits inference
of T=str|None. Merely mentioning MISSING in the accepted union does not require it.
The first installed-wheel replay retained this failed negative.

The coordinator requested an ordinary ordered-overload investigation. It passes:

1. A no-MISSING TypeVar bounded to supported carriers (including None, excluding
   the sentinel) selects an `InvalidOptionalFilter` return type.
2. The following `Param[T | MISSING]` overload returns `Predicate[O]`.
3. The nullable-only call fails at the enclosing `.filter(...)`, like wrong ==.
4. Both `Param[str | MISSING]` and `Param[str | None | MISSING]` positives pass.

Mypy 2.4.0 reports deliberate incompatible overlap in the runtime declaration;
one precise `type: ignore[overload-overlap]` is confined to that definition.
Pyright 1.1.414 strict accepts the definition without another suppression.
Generated/developer code uses no ignores and neither checker uses plugins.
The standalone unsuppressed probe is retained under attempts/.

The public syntax and covariant Param are preserved. CONTRACT-071/TD-082 wording
should describe invalid-marker rejection at the enclosing filter rather than
"no matching overload" for the direct if_present expression. The coordinator owns
that wording and the production DSL owner owns implementation. Runtime capture
must also reject a parameter whose declared type excludes MISSING; static typing
alone is never capture authorization. The fixture runtime does not implement capture.

## F2: generated-class sealing

The shared strict base must permit generated model construction. Each generated
leaf defines `__init_subclass__` to reject further subclassing, matching CONTRACT-068.
Sealing the shared base itself would prevent all generated subclasses. The
emitted fixture and seven presence tests demonstrate the leaf approach.

## F3: qualification boundary

Exact minimal wheel plus bounded emitted fixture qualifies the compatibility
spike only. No production generator/runtime, driver/platform, native target,
full codec golden-vector equivalence or consumer adoption is established here.
