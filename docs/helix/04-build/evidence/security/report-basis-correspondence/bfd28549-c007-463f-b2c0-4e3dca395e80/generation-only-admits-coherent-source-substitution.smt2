; benchmark generated from python API
(set-info :status unknown)
(declare-sort MetadataIdentity 0)
(declare-sort FullNativeValue 0)
(declare-sort OriginalBytes 0)
(declare-fun generation_after () Int)
(declare-fun generation_before () Int)
(declare-fun image_after () (Array MetadataIdentity FullNativeValue))
(declare-fun image_before () (Array MetadataIdentity FullNativeValue))
(declare-fun identities_after () (Array MetadataIdentity Bool))
(declare-fun identities_before () (Array MetadataIdentity Bool))
(declare-fun binding_after () OriginalBytes)
(declare-fun binding_before () OriginalBytes)
(declare-fun input_after () OriginalBytes)
(declare-fun input_before () OriginalBytes)
(assert
 (= generation_before generation_after))
(assert
 (= image_before image_after))
(assert
 (= identities_before identities_after))
(assert
 (let (($x38 (and (distinct binding_before binding_after) true)))
(let (($x37 (and (distinct input_before input_after) true)))
(and $x37 $x38))))
(check-sat)
