# Sagas

A saga coordinates a finite, sequential set of independently committed actions. It declares cancellation and outcome recovery, and can specify compensation for completed steps.

The saga extension is umf.actions.saga 0.1.0, paired with UMF core 0.10.0 and actions 0.1.0. The sequential coordination profile is umf.actions.saga.sequential/1.

A trusted host maintains saga state, binds providers and executes the effects. Check host evidence for the exact action and store subset before relying on coordination or compensation.
