# Independent additive schema-mode review

No remaining findings in the scoped source hash recorded in review.json. The reviewer authored no production schema changes. This narrow R3 corrective exception uses the existing evaluator and live Context; an internal evaluation flag selects compiler diagnostic presentation. Artifact content does not set that flag. Ordinary and Python callers retain the original default traversal and aggregate behavior.

The review found and retained bounded controls for first-success oneOf annotations, custom equality keyword re-registration order, and contains child-error/item-annotation behavior. Root corrected those only in the opt-in mode. Six owner tests and two independent reviewer tests now pass, including late host-origin propagation and ordinary-versus-compiler phase controls. The primary predecessor is the actual configured createValidator in src/validation/schema.ts with pinned Ajv source, not the stock keyword registration list alone.

This source approval does not expand general schema support or establish final coherent R3/all-host qualification. Renew it if schema.rs changes.
