; benchmark generated from python API
(set-info :status unknown)
(declare-fun prefix () Int)
(declare-fun input_scalars () Int)
(assert
 (let ((?x63 (ite (< input_scalars prefix) input_scalars prefix)))
(let (($x58 (>= prefix 0)))
(let (($x57 (>= input_scalars 0)))
(and $x57 $x58 (or (< ?x63 0) (> ?x63 input_scalars) (> ?x63 prefix)))))))
(check-sat)
