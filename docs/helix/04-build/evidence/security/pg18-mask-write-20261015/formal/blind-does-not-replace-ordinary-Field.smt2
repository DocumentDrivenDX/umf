; benchmark generated from python API
(set-info :status unknown)
(declare-fun blind_granted () Bool)
(declare-fun blind_declared () Bool)
(declare-fun effective_original_read () Bool)
(declare-fun ordinary_Field () Bool)
(declare-fun ordinary_update () Bool)
(assert
 (let (($x15 (and ordinary_update ordinary_Field (or effective_original_read (and blind_declared blind_granted)))))
(and ordinary_update (not ordinary_Field) blind_declared blind_granted (= (ite $x15 1 0) 1))))
(check-sat)
