; benchmark generated from python API
(set-info :status unknown)
(declare-sort MetadataIdentity 0)
(declare-sort FullNativeValue 0)
(declare-fun identities_after () (Array MetadataIdentity Bool))
(declare-fun identities_before () (Array MetadataIdentity Bool))
(declare-fun substituted_identity () MetadataIdentity)
(declare-fun image_after () (Array MetadataIdentity FullNativeValue))
(declare-fun image_before () (Array MetadataIdentity FullNativeValue))
(assert
 (= identities_before identities_after))
(assert
 (let ((?x42 (select image_after substituted_identity)))
(let ((?x41 (select image_before substituted_identity)))
(and (distinct ?x41 ?x42) true))))
(check-sat)
