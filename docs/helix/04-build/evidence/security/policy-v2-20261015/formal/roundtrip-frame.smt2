; benchmark generated from python API
(set-info :status unknown)
(declare-sort JsonValue 0)
(declare-fun other_key () Int)
(declare-fun source () (Array Int JsonValue))
(declare-fun r3 () JsonValue)
(declare-fun v1 () JsonValue)
(declare-fun r2 () JsonValue)
(declare-fun v2 () JsonValue)
(assert
 (and (distinct other_key 0) true))
(assert
 (and (distinct other_key 1) true))
(assert
 (let ((?x21 (select source other_key)))
(let ((?x16 (store (store (store (store source 0 v2) 1 r2) 0 v1) 1 r3)))
(and (distinct (select ?x16 other_key) ?x21) true))))
(check-sat)
