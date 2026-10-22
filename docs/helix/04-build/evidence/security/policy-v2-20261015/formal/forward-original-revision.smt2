; benchmark generated from python API
(set-info :status unknown)
(declare-sort JsonValue 0)
(declare-fun r2 () JsonValue)
(declare-fun v1 () JsonValue)
(declare-fun v2 () JsonValue)
(declare-fun source () (Array Int JsonValue))
(assert
 (let ((?x14 (store (store source 0 v2) 1 r2)))
(let ((?x15 (store ?x14 0 v1)))
(and (distinct (select ?x15 1) r2) true))))
(check-sat)
