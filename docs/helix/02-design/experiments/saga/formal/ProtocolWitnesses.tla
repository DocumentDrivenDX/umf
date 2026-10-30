------------------------- MODULE ProtocolWitnesses -------------------------
EXTENDS Protocol
(* These are stronger non-vacuity queries over the unchanged combined model.
   No transition, initial condition, state variable or assumption is replaced. *)
NoCommittedPrefixRollbackRecovery == ~(t.phase = "compensated" /\
 \E s \in Steps : t.known[s] = "failed" /\
   \E p \in 1..(s-1) : t.known[p] = "committed" /\
       t.known[N+p] = "committed" /\ t.effects[p] = 1 /\ t.effects[N+p] = 1)
NoFailedCompensationClosure == ~(t.phase = "closed" /\ ~RecoveredPrefix /\
 \E s \in Steps : t.known[s] = "committed" /\ t.outcome[N+s] = "failed")
NoCancelledCommittedPrefix == ~(t.phase = "cancelled" /\ t.cancelCut > 0 /\
 \E s \in Steps : t.effects[s] = 1 /\ t.effects[N+s] = 1 /\
                  t.known[N+s] = "committed")
=============================================================================
