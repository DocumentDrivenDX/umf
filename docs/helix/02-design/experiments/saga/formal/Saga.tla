------------------------------- MODULE Saga -------------------------------
EXTENDS Naturals, FiniteSets, TLC
CONSTANTS StepCount, Variant, External
Steps == 1..StepCount
VARIABLES admitted, intent, originalIntent, attempts, replayed, conflicted, acknowledged,
          definitionActive, forwardActive, compensationActive,
          phase, known, provider, pending, compKnown, compProvider, compPending,
          effects, releases, cancelled, epoch, up, crashes, redelivered,
          badUnknown, badRetired, badOwner, badCancel, badOrder, badExternal, continued, crashPending, recovered
vars == <<admitted, intent, originalIntent, attempts, replayed, conflicted, acknowledged,
          definitionActive, forwardActive, compensationActive,
          phase, known, provider, pending, compKnown, compProvider, compPending,
          effects, releases, cancelled, epoch, up, crashes, redelivered,
          badUnknown, badRetired, badOwner, badCancel, badOrder, badExternal, continued, crashPending, recovered>>

Init ==
 /\ admitted = 0 /\ intent = "none" /\ originalIntent = "none" /\ attempts = 0
 /\ replayed = FALSE /\ conflicted = FALSE /\ acknowledged = FALSE
 /\ definitionActive = TRUE /\ forwardActive = Steps /\ compensationActive = Steps
 /\ phase = "running"
 /\ known = [s \in Steps |-> "idle"] /\ provider = [s \in Steps |-> "none"]
 /\ pending = {} /\ compKnown = [s \in Steps |-> "idle"]
 /\ compProvider = [s \in Steps |-> "none"] /\ compPending = {}
 /\ effects = [s \in Steps |-> 0] /\ releases = [s \in Steps |-> 0]
 /\ cancelled = FALSE /\ epoch = 0 /\ up = TRUE /\ crashes = 0
 /\ redelivered = FALSE
 /\ badUnknown = FALSE /\ badRetired = FALSE /\ badOwner = FALSE
 /\ badCancel = FALSE /\ badOrder = FALSE /\ badExternal = FALSE
 /\ continued = FALSE /\ crashPending = {} /\ recovered = FALSE

Submit(value) ==
 /\ up /\ attempts < 2
 /\ IF admitted = 0
       THEN /\ definitionActive /\ (~External \/ Variant = "external")
            /\ admitted' = 1 /\ intent' = value
       ELSE /\ admitted' = IF Variant = "duplicate-submit" /\ value = intent
                              THEN admitted + 1 ELSE admitted
            /\ intent' = IF Variant = "changed-intent" THEN value ELSE intent
 /\ originalIntent' = IF admitted = 0 THEN value ELSE originalIntent
 /\ attempts' = attempts + 1
 /\ replayed' = (replayed \/ (admitted > 0 /\ value = intent /\ ~acknowledged))
 /\ conflicted' = (conflicted \/ (admitted > 0 /\ value # intent))
 /\ badExternal' = (badExternal \/ External)
 /\ UNCHANGED <<acknowledged, definitionActive, forwardActive, compensationActive,
      phase, known, provider, pending, compKnown, compProvider, compPending,
      effects, releases, cancelled, epoch, up, crashes, redelivered,
      badUnknown, badRetired, badOwner, badCancel, badOrder>>
 /\ UNCHANGED <<continued, crashPending, recovered>>

AcknowledgeSubmission ==
 /\ up /\ admitted > 0 /\ ~acknowledged /\ acknowledged' = TRUE
 /\ UNCHANGED <<admitted, intent, originalIntent, attempts, replayed, conflicted,
      definitionActive, forwardActive, compensationActive, phase, known,
      provider, pending, compKnown, compProvider, compPending, effects,
      releases, cancelled, epoch, up, crashes, redelivered,
      badUnknown, badRetired, badOwner, badCancel, badOrder, badExternal>>
 /\ UNCHANGED <<continued, crashPending, recovered>>

Uncertain == \E s \in Steps : known[s] = "unknown" \/ compKnown[s] = "unknown"
ForwardReady(s) == known[s] = "idle" /\ \A t \in 1..(s-1) : known[t] = "committed"
CompReady(s) ==
 /\ known[s] = "committed" /\ compKnown[s] = "idle"
 /\ \A t \in Steps : (t > s /\ known[t] = "committed") => compKnown[t] = "committed"

DispatchForward(s, fence) ==
 /\ up /\ admitted > 0 /\ phase = "running"
 /\ (~cancelled \/ Variant = "cancel")
 /\ (fence = epoch \/ Variant = "stale-owner")
 /\ (s \in forwardActive \/ Variant = "retired")
 /\ IF Variant = "unknown"
       THEN known[s] = "idle" /\ \A t \in 1..(s-1) : provider[t] = "committed"
       ELSE ForwardReady(s) /\ ~Uncertain
 /\ known' = [known EXCEPT ![s] = "unknown"] /\ pending' = pending \cup {s}
 /\ badUnknown' = (badUnknown \/ Uncertain)
 /\ badRetired' = (badRetired \/ (s \notin forwardActive))
 /\ badOwner' = (badOwner \/ (fence # epoch))
 /\ badCancel' = (badCancel \/ cancelled)
 /\ UNCHANGED <<admitted, intent, originalIntent, attempts, replayed, conflicted, acknowledged,
      definitionActive, forwardActive, compensationActive, phase, provider,
      compKnown, compProvider, compPending, effects, releases, cancelled,
      epoch, up, crashes, redelivered, badOrder, badExternal>>
 /\ continued' = (continued \/ ~definitionActive)
 /\ UNCHANGED <<crashPending, recovered>>

SettleForward(s, result) ==
 /\ s \in pending /\ provider[s] = "none"
 /\ provider' = [provider EXCEPT ![s] = result] /\ pending' = pending \ {s}
 /\ effects' = [effects EXCEPT ![s] = @ + IF result = "committed" THEN 1 ELSE 0]
 /\ UNCHANGED <<admitted, intent, originalIntent, attempts, replayed, conflicted, acknowledged,
      definitionActive, forwardActive, compensationActive, phase, known,
      compKnown, compProvider, compPending, releases, cancelled, epoch, up,
      crashes, redelivered, badUnknown, badRetired, badOwner, badCancel,
      badOrder, badExternal>>
 /\ UNCHANGED <<continued, crashPending, recovered>>

ObserveForward(s) ==
 /\ up /\ known[s] = "unknown" /\ provider[s] # "none"
 /\ known' = [known EXCEPT ![s] = provider[s]]
 /\ UNCHANGED <<admitted, intent, originalIntent, attempts, replayed, conflicted, acknowledged,
      definitionActive, forwardActive, compensationActive, phase, provider,
      pending, compKnown, compProvider, compPending, effects, releases,
      cancelled, epoch, up, crashes, redelivered, badUnknown, badRetired,
      badOwner, badCancel, badOrder, badExternal>>
 /\ recovered' = (recovered \/ (s \in crashPending))
 /\ UNCHANGED <<continued, crashPending>>

DispatchCompensation(s, fence) ==
 /\ up /\ admitted > 0 /\ phase = "unwinding" /\ ~Uncertain
 /\ (fence = epoch \/ Variant = "stale-owner")
 /\ (s \in compensationActive \/ Variant = "retired")
 /\ IF Variant = "order"
       THEN known[s] = "committed" /\ compKnown[s] = "idle"
       ELSE CompReady(s)
 /\ compKnown' = [compKnown EXCEPT ![s] = "unknown"]
 /\ compPending' = compPending \cup {s}
 /\ badRetired' = (badRetired \/ (s \notin compensationActive))
 /\ badOwner' = (badOwner \/ (fence # epoch))
 /\ badOrder' = (badOrder \/ ~CompReady(s))
 /\ UNCHANGED <<admitted, intent, originalIntent, attempts, replayed, conflicted, acknowledged,
      definitionActive, forwardActive, compensationActive, phase, known,
      provider, pending, compProvider, effects, releases, cancelled, epoch,
      up, crashes, redelivered, badUnknown, badCancel, badExternal>>
 /\ UNCHANGED <<continued, crashPending, recovered>>

SettleCompensation(s, result) ==
 /\ s \in compPending /\ compProvider[s] = "none"
 /\ compProvider' = [compProvider EXCEPT ![s] = result]
 /\ compPending' = compPending \ {s}
 /\ releases' = [releases EXCEPT ![s] = @ + IF result = "committed" THEN 1 ELSE 0]
 /\ UNCHANGED <<admitted, intent, originalIntent, attempts, replayed, conflicted, acknowledged,
      definitionActive, forwardActive, compensationActive, phase, known,
      provider, pending, compKnown, effects, cancelled, epoch, up, crashes,
      redelivered, badUnknown, badRetired, badOwner, badCancel, badOrder, badExternal>>
 /\ UNCHANGED <<continued, crashPending, recovered>>

ObserveCompensation(s) ==
 /\ up /\ compKnown[s] = "unknown" /\ compProvider[s] # "none"
 /\ compKnown' = [compKnown EXCEPT ![s] = compProvider[s]]
 /\ UNCHANGED <<admitted, intent, originalIntent, attempts, replayed, conflicted, acknowledged,
      definitionActive, forwardActive, compensationActive, phase, known,
      provider, pending, compProvider, compPending, effects, releases,
      cancelled, epoch, up, crashes, redelivered, badUnknown, badRetired,
      badOwner, badCancel, badOrder, badExternal>>
 /\ UNCHANGED <<continued, crashPending, recovered>>

MovePhase(next) ==
 /\ up /\ admitted > 0 /\ ~Uncertain
 /\ CASE next = "unwinding" -> phase = "running" /\
            (cancelled \/ \E s \in Steps : known[s] = "rejected")
      [] next = "success" -> phase = "running" /\ ~cancelled /\
            \A s \in Steps : known[s] = "committed"
      [] next = "compensated" -> phase = "unwinding" /\
            \A s \in Steps : known[s] = "committed" => compKnown[s] = "committed"
      [] next = "intervention" ->
            (phase = "running" /\ ~cancelled /\
              \E s \in Steps : ForwardReady(s) /\ s \notin forwardActive)
            \/ (phase = "unwinding" /\
              \E s \in Steps : (CompReady(s) /\ s \notin compensationActive)
                                  \/ compKnown[s] = "rejected")
 /\ phase' = next
 /\ UNCHANGED <<admitted, intent, originalIntent, attempts, replayed, conflicted, acknowledged,
      definitionActive, forwardActive, compensationActive, known, provider,
      pending, compKnown, compProvider, compPending, effects, releases,
      cancelled, epoch, up, crashes, redelivered, badUnknown, badRetired,
      badOwner, badCancel, badOrder, badExternal>>
 /\ UNCHANGED <<continued, crashPending, recovered>>

Environment(kind, s) ==
 /\ CASE kind = "retire-definition" -> definitionActive
      [] kind = "retire-forward" -> s \in forwardActive
      [] kind = "retire-compensation" -> s \in compensationActive
      [] kind = "cancel" -> admitted > 0 /\ ~cancelled /\ phase = "running"
      [] kind = "takeover" -> epoch = 0
      [] kind = "crash" -> up /\ crashes = 0
      [] kind = "restart" -> ~up
      [] kind = "redeliver" -> up /\ Uncertain /\ ~redelivered
 /\ definitionActive' = IF kind = "retire-definition" THEN FALSE ELSE definitionActive
 /\ forwardActive' = IF kind = "retire-forward" THEN forwardActive \ {s} ELSE forwardActive
 /\ compensationActive' = IF kind = "retire-compensation" THEN compensationActive \ {s} ELSE compensationActive
 /\ cancelled' = (cancelled \/ kind = "cancel")
 /\ epoch' = IF kind = "takeover" THEN 1 ELSE epoch
 /\ up' = IF kind = "crash" THEN FALSE ELSE IF kind = "restart" THEN TRUE ELSE up
 /\ crashes' = IF kind = "crash" THEN 1 ELSE crashes
 /\ redelivered' = (redelivered \/ kind = "redeliver")
 /\ UNCHANGED <<admitted, intent, originalIntent, attempts, replayed, conflicted, acknowledged,
      phase, known, provider, pending, compKnown, compProvider, compPending,
      effects, releases, badUnknown, badRetired, badOwner, badCancel, badOrder, badExternal>>
 /\ crashPending' = IF kind = "crash" THEN {t \in Steps : known[t] = "unknown" /\ provider[t] = "committed"} ELSE crashPending
 /\ UNCHANGED <<continued, recovered>>

Work == (\E s \in Steps, f \in 0..epoch : DispatchForward(s,f) \/ DispatchCompensation(s,f))
     \/ (\E s \in Steps, r \in {"committed","rejected"} : SettleForward(s,r) \/ SettleCompensation(s,r))
     \/ (\E s \in Steps : ObserveForward(s) \/ ObserveCompensation(s))
     \/ (\E p \in {"unwinding","success","compensated","intervention"} : MovePhase(p))
Next == (\E v \in {"a","b"} : Submit(v)) \/ AcknowledgeSubmission \/ Work
     \/ (\E k \in {"retire-definition","retire-forward","retire-compensation",
                    "cancel","takeover","crash","restart","redeliver"}, s \in Steps : Environment(k,s))
Spec == Init /\ [][Next]_vars

TypeOK ==
 /\ admitted \in 0..2 /\ attempts \in 0..2 /\ epoch \in 0..1 /\ crashes \in 0..1
 /\ intent \in {"none","a","b"} /\ originalIntent \in {"none","a","b"}
 /\ phase \in {"running","unwinding","success","compensated","intervention"}
 /\ known \in [Steps -> {"idle","unknown","committed","rejected"}]
 /\ compKnown \in [Steps -> {"idle","unknown","committed","rejected"}]
 /\ provider \in [Steps -> {"none","committed","rejected"}]
 /\ compProvider \in [Steps -> {"none","committed","rejected"}]
 /\ pending \subseteq Steps /\ compPending \subseteq Steps
 /\ effects \in [Steps -> 0..1] /\ releases \in [Steps -> 0..1]
 /\ forwardActive \subseteq Steps /\ compensationActive \subseteq Steps
OneSubmission == admitted <= 1
IntentPinned == admitted > 0 => intent = originalIntent
NoDuplicateEffects == \A s \in Steps : effects[s] <= 1 /\ releases[s] <= 1
NoUnknownAdvance == ~badUnknown
RetirementFence == ~badRetired
OwnershipFence == ~badOwner
CancellationFence == ~badCancel
ReverseCompensation == ~badOrder
ExternalEligibility == ~badExternal
OutcomesSound == \A s \in Steps :
 (known[s] = "committed" => provider[s] = "committed") /\
 (compKnown[s] = "committed" => compProvider[s] = "committed" /\ provider[s] = "committed")
HonestTermination ==
 /\ (phase = "success" => \A s \in Steps : known[s] = "committed")
 /\ (phase = "compensated" => \A s \in Steps :
      known[s] = "committed" => compKnown[s] = "committed")
 /\ (phase \in {"success","compensated"} => ~Uncertain)
NoSuccessWitness == phase # "success"
NoRecoveryWitness == ~(phase = "compensated" /\ recovered /\ replayed /\ redelivered)
NoInterventionWitness == phase # "intervention"
NoBlockedCompensationWitness == ~(phase = "intervention" /\
 \E s \in Steps : known[s] = "committed" /\ compKnown[s] = "idle" /\ s \notin compensationActive)
NoConflictWitness == ~conflicted
NoRetiredDefinitionContinuationWitness == ~(phase = "success" /\ continued)

(* Liveness cut: fixed accepted intent, active providers, no crashes/revocations.
   Fair Work requires progress, not success: rejection may end in compensation
   or intervention. No fairness or eventual-availability premise in Spec. *)
ProgressInit == Init /\ admitted = 0
ProgressNext == Submit("a") \/ Work
ProgressSpec == ProgressInit /\ [][ProgressNext]_vars /\ WF_vars(ProgressNext)
EventuallyTerminal == <>(phase \in {"success","compensated","intervention"})
=============================================================================
