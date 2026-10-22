; benchmark generated from python API
(set-info :status unknown)
(declare-sort ExactIdentity 0)
(declare-datatypes ((QualifiedField 0)) (((field (document ExactIdentity) (module ExactIdentity) (element ExactIdentity)))))
(declare-fun selected () QualifiedField)
(declare-fun requested () QualifiedField)
(declare-fun original_definition (QualifiedField) Int)
(assert
 (= requested selected))
(assert
 (let ((?x58 (original_definition selected)))
(let ((?x22 (original_definition requested)))
(and (distinct ?x22 ?x58) true))))
(check-sat)
