----------------------------- MODULE Protocol -----------------------------
EXTENDS Naturals, Integers, FiniteSets, TLC
CONSTANTS N, Variant, FirstDisposition, Faults, Results, Responsive, LookupLimit, FaultProfile
Steps == 1..N
Invocations == 1..(2*N)
Dispositions == [s \in Steps |-> IF s = 1 THEN FirstDisposition ELSE "action"]
Terminal == {"committed", "rejected", "conflict", "failed", "refused"}
BusinessStops == {"rejected", "conflict", "failed"}
Automatic == {"queued", "running", "reconciling", "compensating"}
Finished == {"succeeded", "compensated", "cancelled", "closed"}
VARIABLE t
vars == <<t>>
Init == t = [phase |-> "queued", mode |-> "forward", submitted |-> FALSE,
 intent |-> 0, originalIntent |-> 0, definitionActive |-> TRUE,
 stage |-> [i \in Invocations |-> "idle"], known |-> [i \in Invocations |-> "idle"],
 outcome |-> [i \in Invocations |-> "none"],
 cache |-> [i \in Invocations |-> "none"], effects |-> [i \in Invocations |-> 0],
 deliveries |-> [i \in Invocations |-> 0], lookups |-> [i \in Invocations |-> 0],
 active |-> [i \in Invocations |-> TRUE], grant |-> [i \in Invocations |-> TRUE],
 issuedBy |-> [i \in Invocations |-> -1], issuedEpoch |-> [i \in Invocations |-> -1],
 admittedActive |-> [i \in Invocations |-> FALSE],
 admittedGrant |-> [i \in Invocations |-> FALSE],
 cause |-> "none", originalCause |-> "none", cancelRequested |-> FALSE,
 cancelCut |-> 0, stoppedCut |-> 0, stopped |-> FALSE, budget |-> 2, expiryCut |-> -1,
 epoch |-> 0, lease |-> TRUE, up |-> TRUE, crashes |-> 0,
 operatorGrant |-> TRUE, seq |-> 0, reviewAt |-> -1, reviewIssuer |-> "none",
 closedAt |-> -1, closeIssuer |-> "none", closeActor |-> "none",
 denial |-> "none", recovered |-> FALSE]
Issued == {i \in Invocations : t.stage[i] # "idle"}
ForwardIssued == {i \in Steps : t.stage[i] # "idle"}
Pending == {i \in Invocations : t.known[i] = "pending"}
Latch(c) == IF t.cause = "none" THEN c ELSE t.cause
Original(c) == IF t.originalCause = "none" THEN c ELSE t.originalCause
ReadyForward(s) == t.known[s] = "idle" /\ \A p \in 1..(s-1) : t.known[p] = "committed"
ReadyComp(s) == t.known[s] = "committed" /\ t.known[N+s] = "idle" /\
 \A p \in Steps : (p > s /\ t.known[p] = "committed") => t.known[N+p] \in {"committed","unnecessary"}
RecoveredPrefix == \A s \in Steps : t.known[s] = "committed" => t.known[N+s] \in {"committed","unnecessary"}

Submit(v) == /\ ~t.submitted /\ t.definitionActive /\ t.up
 /\ t' = [t EXCEPT !.submitted = TRUE, !.intent = v, !.originalIntent = v, !.seq = @+1]
(* Original submission equality is checked here; changed intent is refused by
   absence of a mutating transition. Saga.tla retains the two-submission census. *)
Resubmit(v) == /\ t.submitted /\ Variant = "changed-intent" /\ v # t.intent
 /\ t' = [t EXCEPT !.intent = v]
Issue(i, worker) ==
 /\ t.submitted /\ t.up /\ t.stage[i] = "idle"
 /\ (t.phase \in Automatic \/ (Variant = "budget-admit" /\ t.phase = "intervention-required" /\ t.budget = 0))
 /\ (t.budget > 0 \/ Variant = "budget-admit")
 /\ ((t.lease /\ worker = t.epoch) \/ Variant = "stale-owner")
 /\ (Pending = {} \/ Variant = "unknown-advance")
 /\ IF i <= N
       THEN /\ t.mode = "forward" /\ ~t.cancelRequested
            /\ IF Variant = "unknown-advance"
                  THEN t.known[i] = "idle" /\ \A p \in 1..(i-1) : t.stage[p] = "committed"
                  ELSE ReadyForward(i)
       ELSE /\ t.mode = "unwind" /\ Dispositions[i-N] = "action" /\ ReadyComp(i-N)
 /\ t' = [t EXCEPT !.stage[i] = "issued", !.known[i] = "pending",
      !.issuedBy[i] = worker, !.issuedEpoch[i] = t.epoch,
      !.phase = IF i <= N THEN "running" ELSE "compensating", !.seq = @+1]
NativeAdmit(i) ==
 /\ t.stage[i] = "issued" /\ (t.active[i] \/ Variant = "retired-admit") /\ t.grant[i]
 /\ t' = [t EXCEPT !.stage[i] = "admitted", !.deliveries[i] = @+1,
      !.admittedActive[i] = t.active[i], !.admittedGrant[i] = t.grant[i]]
NativeRefuse(i) == /\ t.stage[i] = "issued" /\ (~t.active[i] \/ ~t.grant[i])
 /\ t' = [t EXCEPT !.stage[i] = "refused", !.outcome[i] = "refused"]
(* Effect and original outcome commit together at the qualified provider. A
   no-effect disposition assumes independently qualified attempted-access rules. *)
Settle(i, outcome) == /\ t.stage[i] = "admitted" /\ outcome \in Results
 /\ t' = [t EXCEPT !.stage[i] = outcome, !.outcome[i] = outcome,
      !.effects[i] = @ + IF outcome = "committed" /\
          (i > N \/ Dispositions[i] # "unnecessary") THEN 1 ELSE 0]
Redeliver(i) == /\ t.up /\ t.stage[i] \in Terminal /\ t.deliveries[i] < 2
 /\ Cardinality({j \in Invocations : t.deliveries[j] = 2}) = 0
 /\ t' = [t EXCEPT !.deliveries[i] = @+1,
      !.stage[i] = IF Variant = "failed-reinvoke" /\ t.outcome[i] = "failed" THEN "committed" ELSE @,
      !.effects[i] = @ + IF (Variant = "duplicate-effect" /\ t.stage[i] = "committed") \/
                           (Variant = "failed-reinvoke" /\ t.outcome[i] = "failed") THEN 1 ELSE 0]
Lookup(i) ==
 /\ t.up /\ t.phase \in Automatic /\ t.known[i] = "pending"
 /\ t.cache[i] = "none" /\ t.lookups[i] < LookupLimit /\ t.budget > 0
 /\ (~Responsive \/ t.stage[i] \in Terminal)
 /\ t' = [t EXCEPT !.lookups[i] = @+1,
      !.cache[i] = IF t.stage[i] \in Terminal THEN t.stage[i] ELSE "none",
      !.phase = IF t.stage[i] \in Terminal THEN t.phase ELSE "reconciling"]
NewMode(i, value) == IF i <= N /\ value \in BusinessStops /\ Variant # "rollback-running"
                         THEN "unwind" ELSE t.mode
NewCause(i, value) == IF value = "refused" \/ (i > N /\ value \in BusinessStops)
                       THEN Latch("intervention")
                       ELSE IF i <= N /\ value \in BusinessStops THEN Latch("failure") ELSE t.cause
NewOriginal(i, value) == IF value = "refused" \/ (i > N /\ value \in BusinessStops)
                       THEN Original("intervention")
                       ELSE IF i <= N /\ value \in BusinessStops THEN Original("failure") ELSE t.originalCause
NewPhase(i, value) ==
 IF t.phase \in {"intervention-required","closed"} THEN t.phase
 ELSE IF value = "refused" \/ (i > N /\ value \in BusinessStops) THEN "intervention-required"
 ELSE IF Pending \ {i} # {} THEN "reconciling"
 ELSE IF NewMode(i,value) = "unwind" THEN "compensating" ELSE "running"
Record(i, value) ==
 t' = [t EXCEPT !.known[i] = value, !.cache[i] = "none", !.seq = @+1,
      !.mode = NewMode(i,value), !.cause = NewCause(i,value), !.originalCause = NewOriginal(i,value),
      !.phase = NewPhase(i,value),
      !.stoppedCut = IF NewPhase(i,value) = "intervention-required" THEN Cardinality(Issued) ELSE t.stoppedCut,
      !.stopped = t.stopped \/ NewPhase(i,value) = "intervention-required",
      !.recovered = t.recovered \/ t.crashes = 1]
Persist(i) == /\ t.up /\ t.known[i] = "pending" /\ t.cache[i] \in Terminal
 /\ Record(i,t.cache[i])
Resolve(i, evidence) ==
 /\ t.up /\ t.phase = "intervention-required" /\ t.operatorGrant /\ t.known[i] = "pending"
 /\ IF evidence = "original" /\ t.stage[i] \in Terminal
       THEN Record(i,t.stage[i])
       ELSE /\ Variant = "fabricated-resolution" /\ Record(i,"committed")

Cancel ==
 /\ t.up /\ t.submitted /\ t.phase \in Automatic /\ ~t.cancelRequested
 /\ (t.mode = "forward" \/ Variant = "late-cancel")
 /\ t' = [t EXCEPT !.cancelRequested = TRUE, !.cancelCut = Cardinality(ForwardIssued),
      !.cause = Latch("cancellation"), !.originalCause = Original("cancellation"),
      !.mode = "unwind", !.seq = @+1,
      !.phase = IF Pending = {} THEN "compensating" ELSE "reconciling"]
Disposition(s) ==
 /\ t.up /\ t.phase \in Automatic /\ t.mode = "unwind" /\ t.budget > 0
 /\ Pending = {} /\ ReadyComp(s) /\ Dispositions[s] # "action"
 /\ t' = [t EXCEPT !.known[N+s] = IF Dispositions[s] = "irreversible" /\ Variant # "skip-barrier"
                                     THEN "irreversible" ELSE "unnecessary",
      !.phase = IF Dispositions[s] = "irreversible" /\ Variant # "skip-barrier"
                                     THEN "intervention-required" ELSE "compensating",
      !.cause = IF Dispositions[s] = "irreversible" THEN Latch("intervention") ELSE t.cause,
      !.originalCause = IF Dispositions[s] = "irreversible" THEN Original("intervention") ELSE t.originalCause,
      !.stoppedCut = IF Dispositions[s] = "irreversible" THEN Cardinality(Issued) ELSE t.stoppedCut,
      !.stopped = t.stopped \/ (Dispositions[s] = "irreversible" /\ Variant # "skip-barrier"),
      !.seq = @+1]
Finish ==
 /\ t.up /\ t.submitted /\ t.phase \in Automatic /\ Pending = {} /\ t.budget > 0
 /\ IF t.mode = "forward"
       THEN /\ \A s \in Steps : t.known[s] = "committed"
            /\ t' = [t EXCEPT !.phase = "succeeded", !.seq = @+1]
       ELSE /\ RecoveredPrefix
            /\ t' = [t EXCEPT !.phase = IF t.cause = "cancellation" \/
                      (Variant = "late-cancel" /\ t.cancelRequested) THEN "cancelled" ELSE "compensated",
                      !.seq = @+1]
HaltLookup(i) ==
 /\ t.up /\ t.phase \in Automatic /\ t.known[i] = "pending"
 /\ t.lookups[i] = LookupLimit /\ t.cache[i] = "none"
 /\ t' = [t EXCEPT !.phase = "intervention-required", !.cause = Latch("intervention"),
      !.originalCause = Original("intervention"), !.stoppedCut = Cardinality(Issued), !.stopped = TRUE, !.seq = @+1]
Tick ==
 /\ t.submitted /\ t.budget > 0 /\ t.phase \in Automatic
 /\ t' = [t EXCEPT !.budget = @-1,
      !.expiryCut = IF t.budget = 1 THEN Cardinality(Issued) ELSE -1,
      !.phase = IF t.budget = 1 THEN "intervention-required" ELSE t.phase,
      !.stoppedCut = IF t.budget = 1 THEN Cardinality(Issued) ELSE t.stoppedCut,
      !.stopped = t.stopped \/ t.budget = 1,
      !.known = IF t.budget = 1 /\ Variant = "timeout-failure"
                  THEN [i \in Invocations |-> IF t.known[i] = "pending" THEN "failed" ELSE t.known[i]] ELSE t.known,
      !.cause = IF t.budget = 1 THEN Latch("intervention") ELSE t.cause,
      !.originalCause = IF t.budget = 1 THEN Original("intervention") ELSE t.originalCause,
      !.seq = IF t.budget = 1 THEN @+1 ELSE @]
(* Bound the crash to actual volatile observation loss. Pre-submit faults and
   irrelevant post-terminal control changes are outside this accepted-instance cut. *)
Crash == /\ t.up /\ t.crashes = 0 /\ \E i \in Invocations : t.cache[i] \in Terminal
 /\ t' = [t EXCEPT !.up = FALSE, !.crashes = 1, !.cache = [i \in Invocations |-> "none"]]
Restart == /\ ~t.up
 /\ t' = [t EXCEPT !.up = TRUE,
      !.phase = IF t.phase \in Automatic /\ Pending # {} THEN "reconciling" ELSE t.phase]
LeaseExpiry == /\ t.lease /\ t.epoch = 0 /\ t' = [t EXCEPT !.lease = FALSE]
Takeover == /\ t.epoch = 0 /\ ~t.lease /\ t' = [t EXCEPT !.epoch = 1, !.lease = TRUE]
Retire(i) == /\ t.stage[i] \notin Terminal /\ t.active[i] /\ Cardinality({j \in Invocations : ~t.active[j]}) = 0 /\ t' = [t EXCEPT !.active[i] = FALSE]
(* The selected tx/1 qualification serializes policy revocation with its native
   transaction. A concurrent revocation is ordered before admit or after settle. *)
Revoke(i) == /\ t.stage[i] \in {"idle","issued"} /\ t.grant[i] /\ Cardinality({j \in Invocations : ~t.grant[j]}) = 0 /\ t' = [t EXCEPT !.grant[i] = FALSE]
RetireDefinition == /\ t.definitionActive /\ t' = [t EXCEPT !.definitionActive = FALSE]
RevokeOperator == /\ t.operatorGrant /\ t' = [t EXCEPT !.operatorGrant = FALSE]
Review(issuer) == /\ t.phase = "intervention-required" /\ t.up
 /\ t' = [t EXCEPT !.reviewAt = t.seq, !.reviewIssuer = issuer]
Close ==
 /\ t.up /\ t.phase = "intervention-required"
 /\ (Pending = {} \/ Variant = "close-pending")
 /\ (t.reviewAt = t.seq \/ Variant = "close-stale")
 /\ (t.reviewIssuer = "original" \/ Variant = "close-foreign")
 /\ (t.operatorGrant \/ Variant = "close-outsider")
 /\ t' = [t EXCEPT !.phase = "closed", !.closedAt = t.seq+1,
      !.closeIssuer = t.reviewIssuer, !.closeActor = IF t.operatorGrant THEN "operator" ELSE "outsider",
      !.seq = @+1]

Worker == (\E v \in 1..2 : Submit(v)) \/ (\E i \in Invocations, w \in 0..t.epoch : Issue(i,w))
          \/ (\E s \in Steps : Disposition(s)) \/ Finish \/ (\E i \in Invocations : HaltLookup(i))
Gateway(i) == NativeAdmit(i) \/ NativeRefuse(i)
Settlement(i) == \E outcome \in Results : Settle(i,outcome)
Observation(i) == Lookup(i) \/ Persist(i)
AllFaults == Tick \/ Crash \/ Restart \/ LeaseExpiry \/ Takeover \/ Cancel
  \/ RetireDefinition \/ RevokeOperator \/ (\E i \in Invocations : Retire(i) \/ Revoke(i))
Environment == /\ t.submitted /\ t.phase \notin Finished
 /\ CASE FaultProfile = "crash" -> Crash \/ Restart
                    [] FaultProfile = "cancel" -> Cancel
                    [] FaultProfile = "budget" -> Tick
                    [] OTHER -> AllFaults
Resume == /\ Variant = "resume" /\ t.phase = "intervention-required"
 /\ t' = [t EXCEPT !.phase = IF t.mode = "forward" THEN "running" ELSE "compensating"]
Next == Worker \/ (\E i \in Invocations : Gateway(i) \/ Settlement(i) \/ Observation(i) \/ Redeliver(i))
  \/ (Faults /\ Environment)
  \/ (\E i \in Invocations, e \in {"original","foreign"} : Resolve(i,e))
  \/ (\E e \in {"original","foreign"} : Review(e)) \/ Close
  \/ (\E v \in 1..2 : Resubmit(v)) \/ Resume
Spec == Init /\ [][Next]_vars
(* Fairness is per worker, native gateway, provider settlement and observer,
   never fairness of the entire next-state relation. Stable cuts disable faults. *)
ProgressSpec == Spec /\ WF_vars(Worker) /\
 \A i \in Invocations : WF_vars(Gateway(i)) /\ WF_vars(Settlement(i)) /\ WF_vars(Observation(i))

TypeOK ==
 /\ t.phase \in Automatic \cup Finished \cup {"intervention-required"}
 /\ t.mode \in {"forward","unwind"} /\ t.cause \in {"none","failure","cancellation","intervention"}
 /\ t.originalCause \in {"none","failure","cancellation","intervention"}
 /\ t.stage \in [Invocations -> Terminal \cup {"idle","issued","admitted"}]
 /\ t.known \in [Invocations -> Terminal \cup {"idle","pending","unnecessary","irreversible"}]
 /\ t.cache \in [Invocations -> Terminal \cup {"none"}]
 /\ t.outcome \in [Invocations -> Terminal \cup {"none"}]
 /\ t.effects \in [Invocations -> 0..2] /\ t.lookups \in [Invocations -> 0..LookupLimit]
 /\ t.deliveries \in [Invocations -> 0..2] /\ t.budget \in 0..2
 /\ t.epoch \in 0..1 /\ t.crashes \in 0..1 /\ t.seq \in 0..64
IntentPinned == t.intent = t.originalIntent
OutcomesSound == \A i \in Invocations : t.known[i] \in Terminal => t.known[i] = t.outcome[i]
ProviderFinality == \A i \in Invocations : t.outcome[i] \in Terminal => t.stage[i] = t.outcome[i]
NoncommitHasNoEffect == \A i \in Invocations : t.outcome[i] \in {"failed","refused","rejected","conflict"} => t.effects[i] = 0
NoDuplicateEffects == \A i \in Invocations : t.effects[i] <= 1
ForwardOrdered == \A s \in Steps : t.stage[s] # "idle" => \A p \in 1..(s-1) : t.known[p] = "committed"
ReverseRecovery == \A s \in Steps : t.stage[N+s] # "idle" =>
 t.known[s] = "committed" /\ (\A p \in Steps : t.known[p] # "pending") /\
 (\A p \in Steps : p > s /\ t.known[p] = "committed" => t.known[N+p] \in {"committed","unnecessary"})
FailureStartsUnwind == (\E s \in Steps : t.known[s] \in BusinessStops) => t.mode = "unwind"
CausePinned == t.cause = t.originalCause
StopCausePresent == t.phase \in {"intervention-required","closed","compensating","compensated","cancelled"} => t.cause # "none"
CancelledCause == t.phase = "cancelled" => t.originalCause = "cancellation"
CancelCut == t.cancelRequested => Cardinality(ForwardIssued) <= t.cancelCut
ExpiryCut == t.expiryCut >= 0 => Cardinality(Issued) <= t.expiryCut
NoAutomaticResume == t.stopped => t.phase \in {"intervention-required","closed"}
StoppedAdmission == t.phase \in {"intervention-required","closed"} => Cardinality(Issued) <= t.stoppedCut
TicketOwnership == \A i \in Issued : t.issuedBy[i] = t.issuedEpoch[i]
NativeAdmission == \A i \in Invocations : t.stage[i] \in {"admitted","committed","rejected","conflict","failed"} => t.admittedActive[i] /\ t.admittedGrant[i]
HonestTermination ==
 /\ (t.phase = "succeeded" => \A s \in Steps : t.known[s] = "committed")
 /\ (t.phase \in {"compensated","cancelled"} => RecoveredPrefix)
 /\ (t.phase \in Finished => Pending = {})
NoFalseRestoration == t.phase \in {"compensated","cancelled"} =>
 \A s \in Steps : Dispositions[s] = "irreversible" => t.known[s] # "committed"
ClosedSettled == t.phase = "closed" => Pending = {}
ClosedEvidence == t.phase = "closed" => t.closeIssuer = "original" /\ t.closeActor = "operator" /\ t.reviewAt = t.closedAt-1
EventuallyStopped == <>(t.phase \in Finished \cup {"intervention-required"})
EventuallySucceeded == <>(t.phase = "succeeded")
NoPhaseWitness(p) == ~(t.submitted /\ t.phase = p)
NoQueuedWitness == NoPhaseWitness("queued")
NoRunningWitness == NoPhaseWitness("running")
NoReconcilingWitness == NoPhaseWitness("reconciling")
NoCompensatingWitness == NoPhaseWitness("compensating")
NoSucceededWitness == NoPhaseWitness("succeeded")
NoCompensatedWitness == NoPhaseWitness("compensated")
NoCancelledWitness == NoPhaseWitness("cancelled")
NoInterventionWitness == NoPhaseWitness("intervention-required")
NoClosedWitness == NoPhaseWitness("closed")
NoNoncommitUnwindWitness == ~(t.phase = "compensated" /\ \E s \in Steps : t.known[s] = "failed")
NoUnknownInterventionWitness == ~(t.phase = "intervention-required" /\ Pending # {} /\ t.budget = 0)
NoCrashRecoveryWitness == ~(t.recovered /\ t.phase = "succeeded")
NoResidualClosureWitness == ~(t.phase = "closed" /\ ~RecoveredPrefix)
NoBarrierWitness == ~(t.phase = "intervention-required" /\ \E s \in Steps : t.known[N+s] = "irreversible")
NoLateFailedReplayWitness == ~(t.phase = "compensated" /\ \E s \in Steps :
 t.outcome[s] = "failed" /\ t.deliveries[s] = 2 /\ t.effects[s] = 0)
NoNoEffectWitness == ~(t.phase = "compensated" /\ \E s \in Steps : t.known[N+s] = "unnecessary")
=============================================================================
