; benchmark generated from python API
(set-info :status unknown)
(declare-sort ExactIdentity 0)
(declare-datatypes ((QualifiedField 0)) (((field (document ExactIdentity) (module ExactIdentity) (element ExactIdentity)))))
(declare-fun selected () QualifiedField)
(declare-fun requested () QualifiedField)
(assert
 (= (element requested) (element selected)))
(assert
 (let ((?x17 (document selected)))
(let ((?x16 (document requested)))
(and (distinct ?x16 ?x17) true))))
(check-sat)
