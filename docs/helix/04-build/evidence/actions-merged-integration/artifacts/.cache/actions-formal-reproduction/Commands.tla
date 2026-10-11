----------------------------- MODULE Commands -----------------------------
EXTENDS Naturals, Integers, FiniteSets, TLC
CONSTANTS SameKey, Variant
Clients == {1,2}
Slots == {1,2,3,4}
Key(c) == IF SameKey THEN 1 ELSE c
VARIABLES stock, pc, owner, ledger, counts, outbox, acked, authorized,
          deployment, rev, snapshot, crashed, retried, result, protected,
          watermark, applied, replayed
Slot(c) == IF Variant = "namespace" THEN 2*(Key(c)-1)+rev[c] ELSE Key(c)
vars == <<stock,pc,owner,ledger,counts,outbox,acked,authorized,deployment,
          rev,snapshot,crashed,retried,result,protected,watermark,applied,replayed>>
Empty == [revision |-> 0, version |-> 0, status |-> "empty"]
Init == /\ stock=2 /\ pc=[c \in Clients |-> "ready"] /\ owner=0
        /\ ledger=[k \in Slots |-> Empty] /\ counts=[k \in {1,2} |-> 0]
        /\ outbox={} /\ acked=[c \in Clients |-> FALSE] /\ authorized=TRUE
        /\ deployment=1 /\ rev=[c \in Clients |-> 1]
        /\ snapshot=[c \in Clients |-> 0] /\ crashed=[c \in Clients |-> FALSE]
        /\ retried=[c \in Clients |-> FALSE] /\ result=[c \in Clients |-> Empty]
        /\ protected=FALSE /\ watermark=0 /\ applied={} /\ replayed=[c \in Clients |-> FALSE]
Admit(c) == /\ pc[c]="ready"
            /\ pc'=[pc EXCEPT ![c]="admitted"]
            /\ UNCHANGED <<stock,owner,ledger,counts,outbox,acked,authorized,
                 deployment,rev,snapshot,crashed,retried,result,protected,watermark,applied,replayed>>
Lock(c) == /\ pc[c]="admitted" /\ (owner=0 \/ Variant="lostupdate")
           /\ owner'=c /\ pc'=[pc EXCEPT ![c]="locked"]
           /\ UNCHANGED <<stock,ledger,counts,outbox,acked,authorized,deployment,
                 rev,snapshot,crashed,retried,result,protected,watermark,applied,replayed>>
Decide(c) == /\ pc[c]="locked"
 /\ LET old == ledger[Slot(c)]
        denied == ~authorized /\ ~(Variant="auth" /\ old.status="success")
        replay == ~denied /\ old.status # "empty"
        stale == ~denied /\ ~replay /\ rev[c] # deployment
    IN /\ pc'=[pc EXCEPT ![c]= IF denied \/ replay \/ stale THEN "done" ELSE "prepared"]
       /\ owner'=IF denied \/ replay \/ stale THEN 0 ELSE owner
       /\ snapshot'=[snapshot EXCEPT ![c]=stock]
       /\ result'=[result EXCEPT ![c]= IF denied THEN [Empty EXCEPT !.status="denied"]
              ELSE IF replay THEN IF old.revision=rev[c] THEN old ELSE [Empty EXCEPT !.status="conflict"]
              ELSE IF stale THEN [Empty EXCEPT !.status="unsupported"] ELSE Empty]
       /\ replayed'=[replayed EXCEPT ![c]=replay /\ old.revision=rev[c] /\ old.status="success"]
       /\ protected'=(protected \/ (replay /\ ~authorized /\ old.status="success"))
       /\ UNCHANGED <<stock,ledger,counts,outbox,acked,authorized,deployment,rev,
                       crashed,retried,watermark,applied>>
Commit(c) == /\ pc[c]="prepared"
 /\ LET success == snapshot[c]>0
        version == Cardinality(outbox)+IF success THEN 1 ELSE 0
        outcome == [revision |-> rev[c],version |-> version,
                    status |-> IF success THEN "success" ELSE "rejected"]
    IN /\ stock'=IF success THEN snapshot[c]-1 ELSE stock
       /\ ledger'=IF Variant="split" /\ success THEN ledger ELSE [ledger EXCEPT ![Slot(c)]=outcome]
       /\ counts'=IF success THEN [counts EXCEPT ![Key(c)]=@+1] ELSE counts
       /\ outbox'=IF success THEN outbox \cup {version} ELSE outbox
       /\ result'=[result EXCEPT ![c]=outcome]
       /\ pc'=[pc EXCEPT ![c]="committed"] /\ owner'=0
       /\ UNCHANGED <<acked,authorized,deployment,rev,snapshot,crashed,retried,
                       protected,watermark,applied,replayed>>
Ack(c) == /\ pc[c]="committed" \/ (Variant="earlyack" /\ pc[c]="prepared")
          /\ acked'=[acked EXCEPT ![c]= result[c].status="success" \/ Variant="earlyack"]
          /\ pc'=[pc EXCEPT ![c]="done"] /\ owner'=IF owner=c THEN 0 ELSE owner
          /\ UNCHANGED <<stock,ledger,counts,outbox,authorized,deployment,rev,snapshot,
                         crashed,retried,result,protected,watermark,applied,replayed>>
Crash(c) == /\ pc[c] \in {"locked","prepared","committed"} /\ ~crashed[c]
            /\ pc'=[pc EXCEPT ![c]="crashed"] /\ crashed'=[crashed EXCEPT ![c]=TRUE]
            /\ owner'=IF owner=c THEN 0 ELSE owner
            /\ result'=[result EXCEPT ![c]=Empty]
            /\ UNCHANGED <<stock,ledger,counts,outbox,acked,authorized,deployment,rev,
                           snapshot,retried,protected,watermark,applied,replayed>>
Retry(c,r) == /\ pc[c]="crashed" /\ ~retried[c] /\ r \in {1,2}
              /\ pc'=[pc EXCEPT ![c]="ready"] /\ rev'=[rev EXCEPT ![c]=r]
              /\ retried'=[retried EXCEPT ![c]=TRUE]
              /\ UNCHANGED <<stock,owner,ledger,counts,outbox,acked,authorized,deployment,
                             snapshot,crashed,result,protected,watermark,applied,replayed>>
Deploy == /\ deployment=1 /\ deployment'=2
          /\ UNCHANGED <<stock,pc,owner,ledger,counts,outbox,acked,authorized,rev,snapshot,
                         crashed,retried,result,protected,watermark,applied,replayed>>
Revoke == /\ authorized /\ owner=0 /\ authorized'=FALSE
          /\ UNCHANGED <<stock,pc,owner,ledger,counts,outbox,acked,deployment,rev,snapshot,
                         crashed,retried,result,protected,watermark,applied,replayed>>
Prefix(a) == IF {1,2} \subseteq a THEN 2 ELSE IF 1 \in a THEN 1 ELSE 0
Apply(v) == /\ v \in outbox \ applied
            /\ applied'=applied \cup {v}
            /\ watermark'=IF Variant="gapvisible" THEN v
                           ELSE IF Variant="lagwatermark" THEN IF v=watermark+1 THEN v ELSE watermark
                           ELSE Prefix(applied \cup {v})
            /\ UNCHANGED <<stock,pc,owner,ledger,counts,outbox,acked,authorized,deployment,
                           rev,snapshot,crashed,retried,result,protected,replayed>>
Next == (\E c \in Clients: Admit(c) \/ Lock(c) \/ Decide(c) \/ Commit(c) \/ Ack(c) \/ Crash(c))
        \/ (\E c \in Clients,r \in {1,2}: Retry(c,r)) \/ Deploy \/ Revoke
        \/ (\E v \in {1,2}: Apply(v))
Spec == Init /\ [][Next]_vars
AtMostOnce == \A k \in {1,2}: counts[k]<=1
Conservation == stock + counts[1]+counts[2]=2 /\ stock>=0
AtomicEvidence == counts[1]+counts[2] = Cardinality({k \in Slots: ledger[k].status="success"})
AckDurable == \A c \in Clients: acked[c] => ledger[Slot(c)].status="success"
NoProtectedDisclosure == ~protected
VisiblePrefix == \A v \in 1..watermark: v \in applied
ClientStep(c) == Admit(c) \/ Lock(c) \/ Decide(c) \/ Commit(c) \/ Ack(c)
ProgressNext == (\E c \in Clients: ClientStep(c)) \/ (\E v \in {1,2}: Apply(v))
ProgressSpec == Init /\ [][ProgressNext]_vars /\ (\A c \in Clients: WF_vars(ClientStep(c))) /\ (\A v \in {1,2}: WF_vars(Apply(v)))
EventuallyDone == <> (\A c \in Clients: pc[c]="done")
WatermarkComplete == watermark=Prefix(applied)
EventuallyProjected == <> ((\A c \in Clients: pc[c]="done") /\ applied=outbox /\ watermark=Cardinality(outbox))
NoSuccessReachable == counts[1]+counts[2]=0
NoAcknowledgementReachable == ~ (\E c \in Clients: acked[c])
NoRecoveredReplayReachable == ~ (\E c \in Clients: crashed[c] /\ retried[c] /\ pc[c]="done" /\ replayed[c] /\ result[c].status="success")
=============================================================================
