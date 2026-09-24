# GraphQL native object-field counterexample

`schema.graphql` has object-returning fields and inverse-looking names. SDL
does not reveal whether `Order.customer` is a stored association or a computed
field. The pinned GraphQL.js 17.0.2 and GraphQL-core 3.2.12 checks validate
only schema shape; the `umf.graphql` adapter retains source bytes and creates
no authored `module.relationships` assertion. `browser.json` checks the same
archive behavior in Chromium. No resolver or GraphQL operation is executed.
