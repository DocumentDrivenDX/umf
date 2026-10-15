; benchmark generated from python API
(set-info :status unknown)
(declare-fun blind_granted () Bool)
(declare-fun blind_declared () Bool)
(declare-fun effective_original_read () Bool)
(declare-fun ordinary_Field () Bool)
(declare-fun ordinary_update () Bool)
(assert
 (let (($x15 (and ordinary_update ordinary_Field (or effective_original_read (and blind_declared blind_granted)))))
(let ((?x20 (ite $x15 1 0)))
(let (($x18 (and ordinary_update ordinary_Field (not effective_original_read) (not blind_granted))))
(and $x18 (and (distinct ?x20 ?x20) true))))))
(check-sat)
