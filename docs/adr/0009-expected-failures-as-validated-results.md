# Expected failures as validated Results

Expected, recoverable production failures use operation-specific Better Result
values. Programmer defects, impossible states, framework control flow, and
unknown infrastructure failures continue to throw. Existing procedures keep
their wire behavior while additive `v2` procedures return serialized Results.
A legacy adapter maps an expected `Err` back to the existing tRPC code and
message during migration.

Public failure contracts are plain, strict Valibot records with a literal
`_tag`. They contain only JSON/SuperJSON-safe values and safe recovery metadata.
They do not contain Error instances, stacks, causes, provider bodies, tokens,
phone numbers, addresses, fingerprints, or credentials. RPC consumers validate
the outer Result envelope and its nested value or error before hydration.
Malformed data is a transport failure, not an expected domain failure.

Better Result `match` handles the binary `Ok`/`Err` container. A discriminated
state or closed union with three or more variants uses exhaustive
`match(value, discriminant)` from `dismatch`. If handlers are asynchronous, it
uses exhaustive `matchAsync(value, discriminant)` from `dismatch/async`. Closed
production unions do not use a default branch. Two-way decisions can remain an
`if`, conditional expression, two-case `switch`, or Better Result `match`.

Logs use an allowlisted projection. Expected failures identify the operation,
layer, and safe `_tag` metadata. Unexpected failures use a correlation ID and a
panic marker. Public localized copy and arbitrary error fields are not copied
to logs by the Result foundation.
