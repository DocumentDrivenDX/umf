---------------------------- MODULE Admission ----------------------------
EXTENDS Naturals
CONSTANT Variant
VARIABLES stage, epoch, cancelled, active, badTicket, badNative,
          cancelledInFlight, retiredAfterAdmission
vars == <<stage, epoch, cancelled, active, badTicket, badNative,
          cancelledInFlight, retiredAfterAdmission>>
Init == /\ stage = "idle" /\ epoch = 0 /\ cancelled = FALSE /\ active = TRUE
        /\ badTicket = FALSE /\ badNative = FALSE
        /\ cancelledInFlight = FALSE /\ retiredAfterAdmission = FALSE
Issue(f) ==
 /\ stage = "idle"
 /\ (~cancelled \/ Variant = "cancel")
 /\ (f = epoch \/ Variant = "owner")
 /\ stage' = "issued"
 /\ badTicket' = (badTicket \/ cancelled \/ f # epoch)
 /\ UNCHANGED <<epoch, cancelled, active, badNative, cancelledInFlight, retiredAfterAdmission>>
NativeAdmission ==
 /\ stage = "issued" /\ (active \/ Variant = "retired")
 /\ stage' = "admitted" /\ badNative' = (badNative \/ ~active)
 /\ UNCHANGED <<epoch, cancelled, active, badTicket, cancelledInFlight, retiredAfterAdmission>>
NativeRefusal ==
 /\ stage = "issued" /\ ~active /\ stage' = "refused"
 /\ UNCHANGED <<epoch, cancelled, active, badTicket, badNative, cancelledInFlight, retiredAfterAdmission>>
Commit ==
 /\ stage = "admitted" /\ stage' = "committed"
 /\ UNCHANGED <<epoch, cancelled, active, badTicket, badNative, cancelledInFlight, retiredAfterAdmission>>
Cancel ==
 /\ ~cancelled /\ cancelled' = TRUE
 /\ cancelledInFlight' = (stage = "issued")
 /\ UNCHANGED <<stage, epoch, active, badTicket, badNative, retiredAfterAdmission>>
Takeover ==
 /\ epoch = 0 /\ epoch' = 1
 /\ UNCHANGED <<stage, cancelled, active, badTicket, badNative, cancelledInFlight, retiredAfterAdmission>>
Retire ==
 /\ active /\ active' = FALSE
 /\ retiredAfterAdmission' = (stage = "admitted")
 /\ UNCHANGED <<stage, epoch, cancelled, badTicket, badNative, cancelledInFlight>>
Next == (\E f \in 0..epoch : Issue(f)) \/ NativeAdmission \/ NativeRefusal
        \/ Commit \/ Cancel \/ Takeover \/ Retire
Spec == Init /\ [][Next]_vars
TypeOK == stage \in {"idle","issued","admitted","committed","refused"}
          /\ epoch \in 0..1
TicketFence == ~badTicket
NativeRetirementFence == ~badNative
NoInflightCancelWitness == ~(stage = "committed" /\ cancelledInFlight)
NoAdmittedRetirementWitness == ~(stage = "committed" /\ retiredAfterAdmission)
NoQueuedRetirementWitness == stage # "refused"
=============================================================================
