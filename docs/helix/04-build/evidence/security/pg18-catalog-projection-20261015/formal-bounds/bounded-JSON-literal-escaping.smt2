; benchmark generated from python API
(set-info :status unknown)
(declare-fun input_scalars () Int)
(assert
 (let (($x83 (<= input_scalars 512)))
(let (($x57 (>= input_scalars 0)))
(and $x57 $x83 (> (+ 13 (* 6 input_scalars)) 4096)))))
(check-sat)
