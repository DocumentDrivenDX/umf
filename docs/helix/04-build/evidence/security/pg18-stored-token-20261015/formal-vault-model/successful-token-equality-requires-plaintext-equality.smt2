; benchmark generated from python API
(set-info :status unknown)
(declare-fun plain0 () Int)
(declare-fun fixed_key_digest (Int) Int)
(declare-fun initial_vault () (Array Int Int))
(declare-fun initial_presence () (Array Int Bool))
(declare-fun plain1 () Int)
(assert
 (or (not (select initial_presence (fixed_key_digest plain0))) (= (select initial_vault (fixed_key_digest plain0)) plain0)))
(assert
 (let ((?x8 (fixed_key_digest plain1)))
 (let ((?x7 (fixed_key_digest plain0)))
 (let ((?x16 (store initial_vault ?x7 plain0)))
 (let ((?x20 (select ?x16 ?x8)))
 (or (not (select (store initial_presence ?x7 true) ?x8)) (= ?x20 plain1)))))))
(assert
 (let ((?x8 (fixed_key_digest plain1)))
 (let ((?x7 (fixed_key_digest plain0)))
 (= ?x7 ?x8))))
(assert
 (and (distinct plain0 plain1) true))
(check-sat)
