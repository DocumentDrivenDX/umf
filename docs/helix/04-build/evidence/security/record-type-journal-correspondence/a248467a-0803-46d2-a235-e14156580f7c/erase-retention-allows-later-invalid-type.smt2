; benchmark generated from python API
(set-info :status unknown)
(declare-fun event_count () Int)
(declare-fun base_complete_model () Int)
(declare-fun event_complete_sources () (Array Int Int))
(declare-fun event_complete_targets () (Array Int Int))
(declare-fun event_recomputed_with_owner () (Array Int Bool))
(declare-fun current_complete_model () Int)
(declare-fun authenticated_issuer () Bool)
(declare-fun native_enforcement () Bool)
(declare-fun event_is_type () (Array Int Bool))
(declare-fun event_exact_type_link_still_valid_in_current () (Array Int Bool))
(assert
 (let (($x19 (<= event_count 32)))
 (let (($x17 (>= event_count 1)))
 (and $x17 $x19))))
(assert
 (= (select event_complete_sources 0) base_complete_model))
(assert
 (let (($x27 (= (select event_complete_sources 1) (select event_complete_targets 0))))
 (let (($x24 (> event_count 1)))
 (=> $x24 $x27))))
(assert
 (let (($x33 (= (select event_complete_sources 2) (select event_complete_targets 1))))
 (let (($x30 (> event_count 2)))
 (=> $x30 $x33))))
(assert
 (let (($x39 (= (select event_complete_sources 3) (select event_complete_targets 2))))
 (let (($x36 (> event_count 3)))
 (=> $x36 $x39))))
(assert
 (let (($x45 (= (select event_complete_sources 4) (select event_complete_targets 3))))
 (let (($x42 (> event_count 4)))
 (=> $x42 $x45))))
(assert
 (let (($x51 (= (select event_complete_sources 5) (select event_complete_targets 4))))
 (let (($x48 (> event_count 5)))
 (=> $x48 $x51))))
(assert
 (let (($x57 (= (select event_complete_sources 6) (select event_complete_targets 5))))
 (let (($x54 (> event_count 6)))
 (=> $x54 $x57))))
(assert
 (let (($x63 (= (select event_complete_sources 7) (select event_complete_targets 6))))
 (let (($x60 (> event_count 7)))
 (=> $x60 $x63))))
(assert
 (let (($x69 (= (select event_complete_sources 8) (select event_complete_targets 7))))
 (let (($x66 (> event_count 8)))
 (=> $x66 $x69))))
(assert
 (let (($x75 (= (select event_complete_sources 9) (select event_complete_targets 8))))
 (let (($x72 (> event_count 9)))
 (=> $x72 $x75))))
(assert
 (let (($x81 (= (select event_complete_sources 10) (select event_complete_targets 9))))
 (let (($x78 (> event_count 10)))
 (=> $x78 $x81))))
(assert
 (let (($x87 (= (select event_complete_sources 11) (select event_complete_targets 10))))
 (let (($x84 (> event_count 11)))
 (=> $x84 $x87))))
(assert
 (let (($x93 (= (select event_complete_sources 12) (select event_complete_targets 11))))
 (let (($x90 (> event_count 12)))
 (=> $x90 $x93))))
(assert
 (let (($x99 (= (select event_complete_sources 13) (select event_complete_targets 12))))
 (let (($x96 (> event_count 13)))
 (=> $x96 $x99))))
(assert
 (let (($x105 (= (select event_complete_sources 14) (select event_complete_targets 13))))
 (let (($x102 (> event_count 14)))
 (=> $x102 $x105))))
(assert
 (let (($x111 (= (select event_complete_sources 15) (select event_complete_targets 14))))
 (let (($x108 (> event_count 15)))
 (=> $x108 $x111))))
(assert
 (let (($x117 (= (select event_complete_sources 16) (select event_complete_targets 15))))
 (let (($x114 (> event_count 16)))
 (=> $x114 $x117))))
(assert
 (let (($x123 (= (select event_complete_sources 17) (select event_complete_targets 16))))
 (let (($x120 (> event_count 17)))
 (=> $x120 $x123))))
(assert
 (let (($x129 (= (select event_complete_sources 18) (select event_complete_targets 17))))
 (let (($x126 (> event_count 18)))
 (=> $x126 $x129))))
(assert
 (let (($x135 (= (select event_complete_sources 19) (select event_complete_targets 18))))
 (let (($x132 (> event_count 19)))
 (=> $x132 $x135))))
(assert
 (let (($x141 (= (select event_complete_sources 20) (select event_complete_targets 19))))
 (let (($x138 (> event_count 20)))
 (=> $x138 $x141))))
(assert
 (let (($x147 (= (select event_complete_sources 21) (select event_complete_targets 20))))
 (let (($x144 (> event_count 21)))
 (=> $x144 $x147))))
(assert
 (let (($x153 (= (select event_complete_sources 22) (select event_complete_targets 21))))
 (let (($x150 (> event_count 22)))
 (=> $x150 $x153))))
(assert
 (let (($x159 (= (select event_complete_sources 23) (select event_complete_targets 22))))
 (let (($x156 (> event_count 23)))
 (=> $x156 $x159))))
(assert
 (let (($x165 (= (select event_complete_sources 24) (select event_complete_targets 23))))
 (let (($x162 (> event_count 24)))
 (=> $x162 $x165))))
(assert
 (let (($x171 (= (select event_complete_sources 25) (select event_complete_targets 24))))
 (let (($x168 (> event_count 25)))
 (=> $x168 $x171))))
(assert
 (let (($x177 (= (select event_complete_sources 26) (select event_complete_targets 25))))
 (let (($x174 (> event_count 26)))
 (=> $x174 $x177))))
(assert
 (let (($x183 (= (select event_complete_sources 27) (select event_complete_targets 26))))
 (let (($x180 (> event_count 27)))
 (=> $x180 $x183))))
(assert
 (let (($x189 (= (select event_complete_sources 28) (select event_complete_targets 27))))
 (let (($x186 (> event_count 28)))
 (=> $x186 $x189))))
(assert
 (let (($x195 (= (select event_complete_sources 29) (select event_complete_targets 28))))
 (let (($x192 (> event_count 29)))
 (=> $x192 $x195))))
(assert
 (let (($x201 (= (select event_complete_sources 30) (select event_complete_targets 29))))
 (let (($x198 (> event_count 30)))
 (=> $x198 $x201))))
(assert
 (let (($x207 (= (select event_complete_sources 31) (select event_complete_targets 30))))
 (let (($x204 (> event_count 31)))
 (=> $x204 $x207))))
(assert
 (let (($x210 (select event_recomputed_with_owner 0)))
 (let (($x209 (> event_count 0)))
 (=> $x209 $x210))))
(assert
 (let (($x212 (select event_recomputed_with_owner 1)))
 (let (($x24 (> event_count 1)))
 (=> $x24 $x212))))
(assert
 (let (($x214 (select event_recomputed_with_owner 2)))
 (let (($x30 (> event_count 2)))
 (=> $x30 $x214))))
(assert
 (let (($x216 (select event_recomputed_with_owner 3)))
 (let (($x36 (> event_count 3)))
 (=> $x36 $x216))))
(assert
 (let (($x218 (select event_recomputed_with_owner 4)))
 (let (($x42 (> event_count 4)))
 (=> $x42 $x218))))
(assert
 (let (($x220 (select event_recomputed_with_owner 5)))
 (let (($x48 (> event_count 5)))
 (=> $x48 $x220))))
(assert
 (let (($x222 (select event_recomputed_with_owner 6)))
 (let (($x54 (> event_count 6)))
 (=> $x54 $x222))))
(assert
 (let (($x224 (select event_recomputed_with_owner 7)))
 (let (($x60 (> event_count 7)))
 (=> $x60 $x224))))
(assert
 (let (($x226 (select event_recomputed_with_owner 8)))
 (let (($x66 (> event_count 8)))
 (=> $x66 $x226))))
(assert
 (let (($x228 (select event_recomputed_with_owner 9)))
 (let (($x72 (> event_count 9)))
 (=> $x72 $x228))))
(assert
 (let (($x230 (select event_recomputed_with_owner 10)))
 (let (($x78 (> event_count 10)))
 (=> $x78 $x230))))
(assert
 (let (($x232 (select event_recomputed_with_owner 11)))
 (let (($x84 (> event_count 11)))
 (=> $x84 $x232))))
(assert
 (let (($x234 (select event_recomputed_with_owner 12)))
 (let (($x90 (> event_count 12)))
 (=> $x90 $x234))))
(assert
 (let (($x236 (select event_recomputed_with_owner 13)))
 (let (($x96 (> event_count 13)))
 (=> $x96 $x236))))
(assert
 (let (($x238 (select event_recomputed_with_owner 14)))
 (let (($x102 (> event_count 14)))
 (=> $x102 $x238))))
(assert
 (let (($x240 (select event_recomputed_with_owner 15)))
 (let (($x108 (> event_count 15)))
 (=> $x108 $x240))))
(assert
 (let (($x242 (select event_recomputed_with_owner 16)))
 (let (($x114 (> event_count 16)))
 (=> $x114 $x242))))
(assert
 (let (($x244 (select event_recomputed_with_owner 17)))
 (let (($x120 (> event_count 17)))
 (=> $x120 $x244))))
(assert
 (let (($x246 (select event_recomputed_with_owner 18)))
 (let (($x126 (> event_count 18)))
 (=> $x126 $x246))))
(assert
 (let (($x248 (select event_recomputed_with_owner 19)))
 (let (($x132 (> event_count 19)))
 (=> $x132 $x248))))
(assert
 (let (($x250 (select event_recomputed_with_owner 20)))
 (let (($x138 (> event_count 20)))
 (=> $x138 $x250))))
(assert
 (let (($x252 (select event_recomputed_with_owner 21)))
 (let (($x144 (> event_count 21)))
 (=> $x144 $x252))))
(assert
 (let (($x254 (select event_recomputed_with_owner 22)))
 (let (($x150 (> event_count 22)))
 (=> $x150 $x254))))
(assert
 (let (($x256 (select event_recomputed_with_owner 23)))
 (let (($x156 (> event_count 23)))
 (=> $x156 $x256))))
(assert
 (let (($x258 (select event_recomputed_with_owner 24)))
 (let (($x162 (> event_count 24)))
 (=> $x162 $x258))))
(assert
 (let (($x260 (select event_recomputed_with_owner 25)))
 (let (($x168 (> event_count 25)))
 (=> $x168 $x260))))
(assert
 (let (($x262 (select event_recomputed_with_owner 26)))
 (let (($x174 (> event_count 26)))
 (=> $x174 $x262))))
(assert
 (let (($x264 (select event_recomputed_with_owner 27)))
 (let (($x180 (> event_count 27)))
 (=> $x180 $x264))))
(assert
 (let (($x266 (select event_recomputed_with_owner 28)))
 (let (($x186 (> event_count 28)))
 (=> $x186 $x266))))
(assert
 (let (($x268 (select event_recomputed_with_owner 29)))
 (let (($x192 (> event_count 29)))
 (=> $x192 $x268))))
(assert
 (let (($x270 (select event_recomputed_with_owner 30)))
 (let (($x198 (> event_count 30)))
 (=> $x198 $x270))))
(assert
 (let (($x272 (select event_recomputed_with_owner 31)))
 (let (($x204 (> event_count 31)))
 (=> $x204 $x272))))
(assert
 (let ((?x402 (- event_count 1)))
 (let ((?x403 (select event_complete_targets ?x402)))
 (= ?x403 current_complete_model))))
(assert
 (not authenticated_issuer))
(assert
 (not native_enforcement))
(assert
 (select event_is_type 0))
(assert
 (let (($x276 (select event_exact_type_link_still_valid_in_current 0)))
(not $x276)))
(check-sat)
