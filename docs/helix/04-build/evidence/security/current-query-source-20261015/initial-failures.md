# Harness correction

The initial host correspondence replay reached field-free COUNT and raised
TypeError while reading a nonexistent plan.scans property. The actual original
Application Plan has source.occurrence/source.record and outputs[].expression.
The harness now checks those original fields and the separate derived scan
population. No producer, source fixture, query, expected result or owner policy
was changed to make the replay pass. This was a harness shape assumption, not
a compiler or enforcement failure.
