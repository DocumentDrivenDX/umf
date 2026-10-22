; benchmark generated from python API
(set-info :status unknown)
(declare-fun arbitrary_existing_token () Int)
(declare-fun initial_presence () (Array Int Bool))
(declare-fun plain0 () Int)
(declare-fun fixed_key_digest (Int) Int)
(declare-fun initial_vault () (Array Int Int))
(assert
 (select initial_presence arbitrary_existing_token))
(assert
 (or (not (select initial_presence (fixed_key_digest plain0))) (= (select initial_vault (fixed_key_digest plain0)) plain0)))
(assert
 (let ((?x27 (select initial_vault arbitrary_existing_token)))
(let ((?x7 (fixed_key_digest plain0)))
(let ((?x16 (store initial_vault ?x7 plain0)))
(let ((?x26 (select ?x16 arbitrary_existing_token)))
(and (distinct ?x26 ?x27) true))))))
(check-sat)
