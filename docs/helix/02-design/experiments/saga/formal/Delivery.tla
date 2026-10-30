----------------------------- MODULE Delivery -----------------------------
EXTENDS Naturals, TLC
CONSTANT BrokenDedup
VARIABLES provider, effects, deliveries, cached, known, up, crashes, recovered
vars == <<provider, effects, deliveries, cached, known, up, crashes, recovered>>
Init == /\ provider = "none" /\ effects = 0 /\ deliveries = 0
        /\ cached = "none" /\ known = "none" /\ up = TRUE
        /\ crashes = 0 /\ recovered = FALSE
(* Every delivery carries the same immutable ticket/key. The native atomic
   effect/outcome commit is an assumption; deduplication is checked separately. *)
Deliver == /\ up /\ deliveries < 2
           /\ deliveries' = deliveries + 1
           /\ provider' = "committed"
           /\ effects' = effects + IF provider = "none" \/ BrokenDedup THEN 1 ELSE 0
           /\ UNCHANGED <<cached, known, up, crashes, recovered>>
Observe == /\ up /\ provider = "committed" /\ cached = "none"
           /\ cached' = provider
           /\ UNCHANGED <<provider, effects, deliveries, known, up, crashes, recovered>>
Persist == /\ up /\ cached = "committed" /\ known = "none"
           /\ known' = cached /\ recovered' = (crashes = 1)
           /\ UNCHANGED <<provider, effects, deliveries, cached, up, crashes>>
(* Force the interesting crash: observed volatile response, not yet persisted. *)
Crash == /\ up /\ crashes = 0 /\ cached = "committed" /\ known = "none"
         /\ cached' = "none" /\ up' = FALSE /\ crashes' = 1
         /\ UNCHANGED <<provider, effects, deliveries, known, recovered>>
Restart == /\ ~up /\ up' = TRUE
           /\ UNCHANGED <<provider, effects, deliveries, cached, known, crashes, recovered>>
Next == Deliver \/ Observe \/ Persist \/ Crash \/ Restart
Spec == Init /\ [][Next]_vars
TypeOK == /\ provider \in {"none","committed"} /\ effects \in 0..2
          /\ deliveries \in 0..2 /\ cached \in {"none","committed"}
          /\ known \in {"none","committed"} /\ crashes \in 0..1
NoDuplicateEffects == effects <= 1
OutcomesSound == known = "committed" => provider = "committed" /\ effects > 0
NoRecoveryWitness == ~(recovered /\ deliveries = 2 /\ known = "committed")
=============================================================================
