; benchmark generated from python API
(set-info :status unknown)
(declare-sort OriginalBytes 0)
(declare-sort MetadataIdentity 0)
(declare-sort FullNativeValue 0)
(declare-fun generation_after () Int)
(declare-fun generation_before () Int)
(declare-fun writer_after () Int)
(declare-fun writer_before () Int)
(declare-fun ordinal_after () Int)
(declare-fun ordinal_before () Int)
(declare-fun revision_after () Int)
(declare-fun revision_before () Int)
(declare-fun input_after () OriginalBytes)
(declare-fun input_before () OriginalBytes)
(declare-fun binding_after () OriginalBytes)
(declare-fun binding_before () OriginalBytes)
(declare-fun documents_after () OriginalBytes)
(declare-fun documents_before () OriginalBytes)
(declare-fun identities_after () (Array MetadataIdentity Bool))
(declare-fun identities_before () (Array MetadataIdentity Bool))
(declare-fun image_after () (Array MetadataIdentity FullNativeValue))
(declare-fun image_before () (Array MetadataIdentity FullNativeValue))
(declare-fun remaining_operation_members_after () OriginalBytes)
(declare-fun remaining_operation_members_before () OriginalBytes)
(assert
 (= generation_before generation_after))
(assert
 (= writer_before writer_after))
(assert
 (= ordinal_before ordinal_after))
(assert
 (= revision_before revision_after))
(assert
 (= input_before input_after))
(assert
 (= binding_before binding_after))
(assert
 (= documents_before documents_after))
(assert
 (= identities_before identities_after))
(assert
 (forall ((selected_identity MetadataIdentity) )(let (($x34 (= (select image_before selected_identity) (select image_after selected_identity))))
 (let (($x35 (select identities_before selected_identity)))
 (=> $x35 $x34))))
 )
(assert
 (and (distinct remaining_operation_members_before remaining_operation_members_after) true))
(check-sat)
