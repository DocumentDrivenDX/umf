"""Pure controller controls: no imports/builds/installations of UMF."""
import ast
import base64
import copy
import hashlib
import importlib.util
import inspect
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest
import types
from unittest.mock import patch,Mock
import zipfile
import zlib


# Exact original pure installed-factory receipt helper, compressed as a test fixture.
# It is imported only by the source-shaped synthetic report test; its CLI/run path is never called.
_ORIGINAL_C1_PROBE_SHA256='db28fdaf30525d5e4c87eb371baa512deb2cb6bc68d69394eab70c592719c9e5'
_ORIGINAL_C1_PROBE_B85=(
    'c-rlK{d3zmlIZXLE4Z^&M=_x($?~T>+;`r@nQ>LVo|DXOokpdiNYLh5615~{$D8v1{`vy|0g|%g*}1E`dpma<i}+|XfJURc(P;ef'
    '5B*J9^yk^CFIKnC`o6l(SEHRDe)!>HRaVhrA(GuVTIH)Ojuy^(Ghbw}6X#{+tc!du0_S46&Wp;)O2{n4sq^aXg%d6Em2fi3DV;Cx'
    '-UK^4pYlx+i`}%y{~=b+Dq4!fDaAs>RhF+#0pxO>L1X<@RAslq`THhXWGOU?*-jyrQMM|b%}RU~@um_<uyf`tqg9rQk{ge*1W~#b'
    't7sJq-&u)UQ8<xPY*tma6uY+oFJWkT;czRvmEex#X@FhcVU(SyxLQX=DfD+)sh`(TdA-Qy>XZLKLa?c_g-ZQfnXlCEWmH|O-+8$M'
    '{a*sI6#|j9osUM5^&+a$yjZI5LL*Ub=74D|%2KD?>z{Wbx+z4uv-9@i-Nol{I2#NG_`jWt_aDD}4&AIhnf;-=^YQY-n~S&Sp}Se8'
    '!Mez9qe|@7Wz#6G^5T9M=NpT^I)DG^%cs!AVJrLA6!p{WYXt;Q_M!S(U_Gb?kcth>@a{aS;_CoM2H<?S{8+;&Hf0563sJ*}V(jOx'
    '1cl(^s1&7DefH_+v(ViWC!>>ekPOnp<Me149nO!A<I%C$Pvc~GFce4g(c$P|I2sLy=`a$>@Mw^p92^~vMx%J1#3LAki}w=N(cW;d'
    'cX+Tb4(7*6lpYO|qv0r;i<9F+F%WSQ5B3k!ljHrt$$lCgrOD{<WN(xl#K~bS=6fdtcjx`tyYo+B&&A$+im!ocUEhUy5rqJv)G6yI'
    'zKO2tZyqS1@T!EbBu8TZn8QlDhtDdSFGTr~tH5_e17ak=+D)?6Rh>{$l|S3b-p=Lu|NU}tdH#C#>BE=HSLcA{D<JedSmf~yB2mEP'
    'mwliFo(#^c^5vqPxqFvAS|SlwVrAz`EXzItXFg+<;8}(K=J}%R6L*<uTAFF1oJpb#*7qGqmqpyy6h4!P%obTCifB;=Mfu%zfDDOa'
    '$x0GoEDIHhW>rzfgwY0WV<3&|W_AUwZ7&j4Rguj%IHj{iw1Vc0qP)WHEr|7!n(>k{%Gc#!u&%^xzDce`#U+BPth(OJ`*(S9lP>Z*'
    'bD<WZ0*ZqLZ(tML)3kNZhN>`2MO0?<3<mh#L<B}f;3&67v!05s()k+yV%JJq8naE64i7tv$^uJ3q%@0lO>RfoHX$&{V(}&xMja1$'
    '&oAefXFuWUDWbcR8Eh#L^s;~suJcub%N!u{_M%927A4E9ECFIWtAqw%gNn;`R+<$+J^(U{7VTWM`5|py4`&f@m`MJf7g?eh0f3&Z'
    'Ziet7zOI3zWJtD4*ns4$L6>$Ck-|Rn_YJJ+UVh^*f%O9Qc;g)h{>xHlmBZF`GX@4#3g?$-u@UD*krzExkRc@56`<3DQSrt=ADd#O'
    'Hp`&Aj`j`?DJ!@ZUu8*I4>EhWA?jK(8`FY9M9FM^57X51WchfJmm=xiA|C#YxG%9HBVXOG1!s655+qp+TlWgZj7p}4A^xUHzWa&*'
    'IdVXqG!u&iYo)-h)vy4zh#%M9(he+0YNilDx>+oixGH<@B-%{}yC>6chx-q%&xKJ?!NGhF;*sy3e}$GE*m+=V)c7Z=;WA1^4+N9S'
    'M^Q=6h1EW#8_nZ4|HxUS;1WSr&Z2plFF<PQc~rm+0+&i<E3+VoJXPttUsl+*!|Rox0#4LAU=!j$0j}o7Er2^+Q$in0Ss1Rd*%Smi'
    '*(A0Wt?qk&$Mh0dOSZa!ERb}ZzatvGwf|y`7zo${J+8B^+re6eSnvv{@}7+a%q2^g4z}n(ZvjewL;V;#?n~;PM2{$JEh$Mc{d#^W'
    '8>NgO*(}$kq_Pr3tQk^G__@GO0f<IGG$n8WAO3IbdcIhdAiB(=GR`t8<^{kEfUO{%zx{Cb`us9fy9moY_;1Zg6{qB7j?8T5!{x<K'
    '7w^yB&bYc1c+$gYbTHZ<?VTLQaSFc=qd46gCI<&6@$n!&8Kv<_bS#dJ6EQkDNKcYc3L?y2a&#aL_KpRJPhT!C&)<Kxpw17YbTm5I'
    'KZy5}`ChyaKtR|T91i02SR5aTkr*BiM)6@1r^BQ9;XFAIM+e9Aqy3}gVDDsq-`)B7;?rk9_!Xe5#5=3E9rB^xc9_<7Ke;?Fd68XZ'
    'E7*${d6bBPSqjZxCB6a)Mt4CX<j`U&5R(XhFc7#rXAx(1`QgK7Cv@mf-}wy){kr;rnqYx6{GqqCl|HPGyNQcj%bj{Z*y|P04&od%'
    'ksjg-Y-mUnZlrSqnB%)=Yf@wqhx_kDNwkJt6FKEtNCs8PMXAOrBv^$2{UH|AitoCfPGIo<54|p24N5h!mV8*X0JwD!r0;%^`3l>4'
    'o@6M(m!&93Qg!0%Xmv%b%~*p9EKfP;YM@HMGGHJxWV*P>72}KU!kQy;>z=habYYHk6NYVaH%2(#6v%QE?lz`fbZB<LXht!VQp}Kz'
    'X4vswj69+AZ)GP$R4nepTNroJqF?2!ssNeBot^??6XE15vBN85hggVc)tyq}S4_N`xTFQS(<#AA5Y|FmMe+UX45W{eS_N>|S&2JZ'
    'm;@mG^<4f$KKEg@fDQk2CGJ!n{QO7_y&}k7dz+EKaHm<oPomp}Sn2dI#4p@dRSI)&-lN1_t0Jb=mGBGr_j|GjFe;87L1!&UX=u{A'
    'IaEBz-!opgIfpa}FLA(MN_?#@BU)I_z>q#YjlQuQR0*9_?{!x4zp0LDX+$<*mU@W=e77|OK&HhaTK97)LiWqeyo5Xw((NUsI>Z8m'
    'vaRr%;bD@L_`?rBd;w7|2Xa6QiMY+g9WI7^xy-5xeifj&h(Z}rlB|pojlNg`!7d!)pI95XOt3=`-{)$sXc4e50uzA}AWA*u{i?ba'
    'W%dt|1P*GZPPBmplzdSJcPhYLP9^i(E424i&QDq8%mqxTz;WBGPq}2eSyA6$!HW2%bTYsP2`-Uh3$b{T6oJDBs?YTIHsofQ{<T{9'
    'hNZx+6>w__leb(EMe7YLm@srp)3OE9fHs_I(K5dSt)(v|DsH|(+DfSPHDn)fTW_k5MUFxZ3iDL`4SZncGEX)O@lz44uhGP?VMTz~'
    'fZyaWXkmc)W9xt%6_z_0l33`kHa~$H%p@-mALz0@M8JbAM5kd$HYeZxOOXRPs4<{IXltWVUBf)Fx;V8)eGb}Ry9CJapvx>oC3G`#'
    'kk@D}w1-$V#zrh9|2AO)NS+@M4zUOma0RO=m2grrA1;M|-BmvT{dNia(O7B@*WRgW7(W|gJ&@0}@4ji_t~U9m^eO=X0h&aNBl<Jo'
    'iG=a(!SjA3#?mobdaI5AdR*z{qE?EN^ZGY>s`L`<Yr}xVyu?JzEZiR0MmJTP#Mf3=*i}`Zn^(Hm#3IqDcUouIv^;H5W+Oig<(6Gb'
    '{@-rKx04&*HEu`~`P~-UvlrF_?u2TTYOXBDiBWHef6WzSVmr0AUbTYk62AM6zWZ@{1%hzA*d+DL*y{&JNF-N6POb%~CI!jJupsa<'
    'R_L&&*V!V`qlrdN5icS(vtV|5rTB{3D}*vpK&D+(MP1`!+{E@$G(=ofVlg$<=N=7EBj1sIo>=%!gL1vdD%}2HrB8N;kWiuWe3yYT'
    '?aE>NgKJ7c9Z<~HjmGUVO$azr_Qb+g!_)s&0n`$ZSp^k);4GlsINUwTb?ZR~x&7V{vhA^#!Zs=yz4km|RjJ2x^+BmSh$-QP<+ovZ'
    '7FQeKP)kjgjsffm>ZjG&P4+UY9!^8V?yR6Qm2gU%I7v6norNp|lj&)e;Gddx=68}9x$zEuncqoif~eK?9w%O1oW)wNjW?-vQs^~j'
    '{BnchkRjrCVv&l7G-Af1CoPV<z_6+-Nd7xoA+=$(o#~-T3(!F!P=a!<kUyBlE!8*<5J`&Al8JRaNcbP_eIe#ZZH0_cr;nP!EGt~$'
    '{(ASa_kYIYG5qyjxV-Cjnc?&Zbs=l-aX|@61OuO^t6$5PxN!xdj3bFoP!NCUx#O|x4~ao|FQIh#;@6(**Gr80EvMdIVV;E{(;s0d'
    '_fENIHc-q`9!lUvFkHCZxr=P>YO^I8;A%!0hF1I9hG_CKgBQNU-mt~4a|?jkCk!QXfzE(3%{J!7a#8=mvI%?A5W#0uQ{Td$XX_M~'
    'R}ifc2%2s^TxaT=me$w><lNwIdA6bgUQ4ATi*K#4(I+7MdV?l$P(bSGmpHEP&6Rvr<ePOvFK@4AB1bCv#44pS<~luJu3?m<>PNZ8'
    'P_6F+pb6}3qh70*Yf~FvTZ(vx)uEf~H4ACIw=1)5tt;0Y;Jz@ssC84>O=YmyW<Svr!4=^L%*FctWk;(@tKTv`3V_KmxDT8j)GOCx'
    'F1Y89n)ZpMfIo?56sNFMLGFplvVR9FD~<}2cc78Ye?hkOu&Wi#&9Gp%;B1W=jsi1*jpXh|V=E9j%P=adfczH>b%Rb=?BkRGw_%GR'
    'XFlRdd-7_tq=U8|VeZ*%nV2gyG+D7Wgf*yXWI<U;O7$uRX6W}2msdD8uSM$P#~Z1-!?&`R1jOb;Y-!rbb8&`bn`|L%j)>%k{b)JQ'
    't~U9mY_J+cE|d@^gQ*^K6IUqGLXi5yRL<kDJ9NYXcdd?!s+&MAf4R;Vf@z{AcIZyJDRI6|d7kiJdlIs=?vqqd6+N3wk9iQVJx$J*'
    '5n)nmAyZ!+Sb8=$^SP?l)#@5rgY8&2pqjO~hR$g$CP=CIgHEb#U^<D_Rp=jTBRrAPKS+vP5;fEi3HNT{ufq~*8*Vy_FssfN$wxfm'
    '{<6{*V5o|xI8Ro+iwZ#XV0ckV&F%a)<6~e1@g_oQG1>4|K=M>coXd0CpLybW1F`gkZYYzj5NL~$X^NiEsHf^S_UAu3pJ@Yj?yw^`'
    '8)$LMi+Ps7ci_AicY0=+?K*R@KwA$o4kZEdCSJ1f4J7{@blLD*udsG|W3PwbTK=4}oKcweU6!FAtf~JE;IuUU@M9>ks&($l=(pyp'
    'Qc0hY0jp$gdfT!z*hV0nP<cubhFi}zeD{@o{2&>-bd_l+JGB`<qytK<QyLupd%d#sAy@6;LT**I0NT`I>egWZRYmA29grfo*s)~x'
    ')@k5Nw+~`+ed=_&4jZ<x)`s0Vs#H{ouH;rAMOSho=*(H8L<@a_KQpvI%QCbL;`aKp?wZ5L$e$e5LzsNXOYU2GC)wL?cl256n~T4G'
    '{&IQ#-L7$lKOU1nb2c<&%SEpffU;$^L6Ohi+56WQug^Z8|1&tkFrxFM*c}Yv|Ju0fHlBm625RAZdG?pt$Ft8rqZ=JoXMZvF#Np<A'
    'GhMpR>>_*J)t+|2w(=xN<1xyvWE)*2(NTzuciP=3q1wBKpWc%d*ozPJV|3%QN^2a-KKu6d6)sy!Nsqs$ib=NdoyB(9OVBRu?KHgv'
    'Uxs=@UiKQ){!g<U?N+zGUl;k`ps?~5Y`ELafcs|EY-YNG5nH{Vamg7f4R{7Xj%D&Vc4o8g8IbM?GaMy*_;N7nbFnkySPBIG%Zp!t'
    'tQ|beUd|Wt6r&9Ayeme6F7V{KlupIGDZ^%$MP;DQo20Q?HUzs84^OwrTH)2j`5J={tZo}j%@1o1+pPRZ?Rr;|8P21;kT!ts9jV!9'
    'dxNojxj?Sfhh2@cuVwT#TW*$r$qV#Uor9W)##i`RZ%c0&S@O44+mr8-V*~UOPrd<MvWZ23#(4HZd>vI0dDO;YO~QQZa0?NeXuPJi'
    'H-ThyEFN;H&SNk`_Ty4!S4cnwZel{Q^23n)x!Y4BG3t{DgP1pF#T?j4Jz!H9WMoUP=%kkhHd}oz1P}Q&tSBJ9SHS8(vecfSzc7U('
    'D~a>99wRz25%+8=>;~H9F=t{kf%?<$aG~2DC>OfU+O?%j4U;P5pd?qJ3CgyZ$wgbQ0p#H5%BlJ~?NBi|>k(Vy1d)CDYheEc%<Gy8'
    'Ri1H)McD4z)3Y&EmP=jIkq-Qh>P&+s<W&LWuy}*PJj>)s{0+?5Yui~Aye+(}gE^_A&@DA4m=E23r@GZXCskHE#ygZ<Y>UX<J?vmi'
    '+9<>2hy~yeoEox1qj6Q)!d(_KJBr?_$s#QPfBNnj?<F{23XN?u2HQ?{wOXQ2WH?!|tj+({c9$+=&!aQeVFYTKZ4l@gHO~4vT8@nZ'
    '6%}|-wshieL6*RH%x1Eavzbc>k^y5CNL7%_n(c63*m#mtYUSB0&m4hpBEe6sL1g)5+YlOBlU!x(En|8r*=3zYXO|V8_)1km`Coi$'
    'vO$HZsUWe66Ndk+d_)6g0#<rW7^+(<9m}bW2`(<Hf(29d3-J}BbaX7z!*p;EiNn!hvUfZ>N>7r*lk_+_JRThE?d=^N?$2Grm!O8F'
    'cPD8?>7&c;T%g?Fxh)xbq)#_z8V(l9BKnVP-J^V8%c3UV$?w88KxP_hVxdeuqpbMpne{qP#Og^TEX*@FtvZ^!_uxk}=f`mG#fyW{'
    '?y%mH@U{TpN)mT<-Cu~+6~MKLwe9NIHrp!i2TRXwcL5D=?Eh%uMW|ZdksXTkBQhwV)2P(wVz;npJF-a8K~He6w@pxc&UF$Grq~wj'
    'o_{;Y>m)1`G&)I1lhAk0N;hHI%a_LZcb*y0&Cl=>4-KoDqHdc8apZ4$DJdQ~Zs~rF5>kB_Z&xd{pz@LBly?o8Ypl0OV-^)yxx&r)'
    'otiymo;-HdB}TmD0&>=>+C?wNU68wgxh@1qSi5xJ(|y?4`RV-q`Q_Q?ix2OiSLbhElgWYlq(xc&loE2WSzVwLOH@^OoCUxBmd`mw'
    'YM<7}Yg%WJkZ&r`4Bp8LJK7^CMfQ1C;T}OdgU+z86J3f}WNTGTtG3E|Vko!6!K2!(Bw(57_tXr1WLmc8%WsLqjs31U&mSdKx9m;I'
    '5l~}XD=}Eb`<=DqX7kU~lUvmv*OXg*`pvp>tKscJ>6U9wEFRKXg2eb!%Sm;fZ&pa7HR27MbGKXS^Yn8)(`Rxe)EeXys=JN1?@Gqc'
    'b)T)*Ydqdro_Nnv_nVf@|1yQYy;`17`CALKrPBf#41yv4ziT3}b-K(7CPs?EY1`L-x$Qv#ZEMc<P{`zo*)Yku$>1a%?H>q`c8>;W'
    'avUEGkK_5tU_VWhli~3}I*6mu$sUiB4TexgAW^cP93Q1=obJV9FFJ_Qba;@)dxzq1AP%B|INlrV4dYQ0$kVF58ut^orlz_+k3`#j'
    'uwBBOG;I?3-(?i2JGlHGZ5}WdTCLmGTjsw^1<y1U=<%Fx8PI>34gTkt4Qeq!&4wWu=xM0a{FY?jVY1#X>3iFJ`*Z`(GF&&S+3u$`'
    '1FOp^7PiHDt&lPR+r7a#IT=OCe7JvnJW7-OlX)r*_XoINjYjjMV=+HGIUF1vr=tU=mNqE8%?(7fw=a@|W7y30PSU|3K1v4j(I62A'
    'Vt)Wolk_kW@!Wm9FZTK}W}-D$lfCiu`7^+tm5qE@`__40+=ZYLeT|DK=tcVft-(r<(f?+XmEFmI8Lj?18Ljl(e23Y}4A3#@*7&wq'
    '4_H$+FKK!DB(58dMK<bs76I7evenQl4aE}~tBhG;TYHQcW^_OIw7w{d8-av~UZw2ox45_N@A75Hp9T&(!$Z<*M@V->@>!6<)pR@>'
    '8T-uE?lhJTNi5H`6SnO?&$bk9)kw#NnEV@zgoe~GHl&5N@ld-aeUBNDZvJ;T32FydUY)YLp-q2{D}Ze~kFw!OOHXan<qNectX8+-'
    '=AX3nfvhhfsEejG5F@gJoM>~;CK`E$|IK$b*QBhD2A^XUm60VHL5<umtD9ARw?e734iK@+qb)H~R#-}$slih!O;3q!T~T{<-j?~?'
    'BJ#0o5eA)Vtha5e>uGa)*9y`~3KNkU&1bdyi1n|lLCeHvwobnARXt!FE`bN4Lqb>OCM{H_ElRDWqq^2p!!`X4jvvo~ZfgZ^*_BLd'
    'r??4#wp87BiC;|o&uHwC@zt~U>>+NhPFCS{mG81Lc1?__>KUu1ZTETB7;Q&q3tKo-S4+^-ZzFkx%^j3ER3lRJ2^GBX?plaNkN))&'
    '(15jXkaj?nc<e@ZQGuq`_!@TXK2n==dH(9d<?FtN=8%Ydid31gH5UEM3l%L@hUWN;0W-?Y8bkv!jyNDrKnJ9<-KuP8gXmq6t@Qvi'
    'PoRJsfpbyG;2_!RHopOZBvK(<3x~o6=tza7vbCrH7=*PQltWq}(MEZ=@5kk>pXEMiQE2e?u{R4gTosKlKV=ovPE_jju#Ufx7{=9Y'
    'mLBnSP1^$O7->#MyBYcVx-TWbmu`S?b}`>Q1zA;J^2IBXj>Izfk8F*iEzhmzM5UTL+cUllWinlQ!kaX``U)6@$H78ofE@a^E-O+K'
    '(4XbJLFBN_mEpIQx?a|&+oyx6aY+k-;mSAq)ORW8;k1_b5lr~a8kq;Y)P&9Idi8+nJ*&O$RGHA6#Nf|J0Uzmi&*MZ^71h|F_Sm!9'
    'f9dw$oqs+<ji5^bR_#pare25nwJz{WhffxFO*PQb54s(PoklaNL=wMw0y{1(V`hMap+n=fOya=ooA+&D%AO9<$KeX70d(swFhUgu'
    '?)=lAhKJt24f5g90RH<!2*395mk#M?(oOSrGpO*^;Pcg6q;_@d>>FFQ$7Jb{+WA=N>{_cF8>;$4>w0plzi4uHJx3Z)tgFY3*>~&U'
    'N>mh3Qe(z^(QQlvhi$`P0wIkcaf?NcD~KZ#@(F_`doJ4*w@_!)feXpf&FQA4BgEizCI>QyyxXk6Bmsn)gv~C?ex1VVDl*_4L~Otu'
    'sYzHmSsr|XoYmFE2Ycl(JWof-^So|riv%pW4Radm+P6Znje>83Qn?2f5x5-oQYoDMq`{lij9BYO-XxO1##?WCLOH-_<h$>p1%|@b'
    '!`OnVR-4be(q`$?{T=|&MR+hdG%ngHS=EAW(X}8KBv5Vxtrm2dzGeldc-bvmZN&Gi8#R-mTo$4GlJ~Y?Q!H>T&gO^vGU#4ckW>{R'
    ')e8#T!PdRG8@iqy^{_c~b#GMbY=5Dy0TgXt^Ax|6eYL66R`ZbouneP#Qw5&wVT>iM;!x>t`sjR27l2fN<of!LbVE=u`opF#!I*<b'
    'Sv@q&q~nQZL;i~wh(W`MI(?{jJ2JserG~E2X3K@@j_n)sq@zRK)|0LSss$tQ`OX7I-&%q6I*NqhNqw79hsRf*102<@!xE3?!Mlib'
    'P_kWjn7ixVnC-RV{;;8uX2^fqe63ciHuma;!x!}sC!MEj{n3#zVrCdje}<vRovMgdB|kSHZCoU~kH_yfMBE^b$vfleB9E%T0QM0&'
    'BnqfeT}Kti*c{`H{%i#c5U;ozH+&4^+zL2Tw8;KJnn}=oTw(RbHojX~hV}hitzB5Djv+ADLKX<z_>@6MAQ!%<Et{f#vgm_>l(RC$'
    'gI$@gIRox$fE29KLhfpVA1#aw9%7-4ArWYtHI>mc$!2L3`;W+lot9@q0=)}q@_qLszUu(0O0qDTl0p7}mv7@+tvFxoE(Q7+U&=>s'
    'n-6oE_d=^)GJzB%eUBLgN1*~NQ-|^1*BmsOTK+{bBnSPER4S|^AOXZ&rQN(c`|IrE&u5>`KZT<`o$~6#`_Gpj-p*c~y?y&B+#j4A'
    'a#T<B?vsb`Xsb?rrB``l{0!7*sD7MsGOMB?+7CDduMOS`N-!Wp8Bs{k#`>iiI>4sYP%yj3IQAGg-Yza9l1H~7+T&fq5QheT^sZoN'
    'KqBo~aC}z=H=fCR<F1dmnf$;+LKY661xtgX;N1%Cp7gQuU#J`FUbpxm%SkURb$+1-*J<A1;ZUD-fr*RFy#h%9qv%b2_rpr)u%*Ly'
    '4(0+APX#_nvNh5WP`?TElvaram;y|nCIYQtl?bhI>*%Zn9!G`-C0b&{t`4c$;wQ3{!Mr%-PvHPXK;lK*FHUzo##cJYii928UWT0A'
    'YK(BFS(@dv{)nN<W_^mE;I%4M#XU%I<z`WZY7i8nt+L`Po@Y3J2KnopeggP*pKDa&XpJ^4Ci)aedsA!&u5Cr_LBv5|Zqyuu)5rTv'
    '!NX6L07kuR5G&=h*JH<m4ckkXV~n&{@3=)J_6qC0h>EKcq^_Gg{Lw)-iZg~?>$q9HgX*YTa%_rdttu+8c9lktZCpe9bEl&XlO=ww'
    'neB^4-?k2{)yJm?_i=Q)28>|-J3ryT5r=A&lPtPg0V-KMD@g;ClItQ{W|h}E7hyjzz^(h?0xe8>KZXQ>W8ByqN4bjD<#k^1FwtDL'
    '2!RPW#8lKDp+Wq~(6}%k>?lrA2T1}YNN~L&)kBmB_@9RD>QuT}+t`Mvmy~Gsa_}RC@uB1&!{Oesb!PreLLJi|M4<t-9uuF7enOLK'
    '2HbdTA`3#IgoMI0V{L0QGXG2gmQB_zHH)J?&Se7Xn0RwwsHEqEH05;xsWIk~+cCs!13?<lc0)}X;t~_iox&gkB2CC8$e`cX87kS`'
    '8O$;|LnXI&2D2aQ3^%l`GnBifGm?(S{8ulq_LjNZ19AFr1W-8dNBrD3NU9TX6Y1}T`(S7{qz07^h^Hlp<0RVB9RN|AM1f1JQ3qO8'
    '=3{Hl8iO8yHhNv;o2zRBq&_>qVBF%~!E*`#0m>Je9Pp90deIaSO2VjGtw5C$Ahjn!lRGJM4Rbd1X<Rg=Q*&>SQjx(5KGb`t>uDC;'
    'C9`$#HC}x4O?)FHZ(|gE<jvx%$xQ*WOhljvMn73YRVMCcMV^Zy`5DNXH+{1<;vpeSnp|MI6&5R64QP}X+Q5u#?oX&-QMU5Bp{kyV'
    '7ne3iN+H8JW?5VtO|agdcn7N$ou)9s<uQ;KzCEP`*hY_4cB8AZFW+1g1WI>2@EgJ<rdX2Jc<`{(Y+K<vq3%yZhI-oWCs9R9Hsf87'
    '1vJ%`K^m1Aaj<SSl#Gsvx@8XM^ae3mg=F6uj76%FN)1h~9bMBN6^aik6L=*w#<8Pi@*-==?oW%<&+NV?yDgMbPYj!IwOlS0<mO8K'
    'J*ES<a)k~(#r1~U#1PZ1h4QEZ*SQvKkm0wMJgfwg<{EE_A9ewqt_m8v$X4Ftw_9haL)YLv-EYVdR<_x4Lx8Z#J>D)02)Y7qzkXxO'
    'x3bN48+*M~?(ufjUaqUi1OVFFjT>d27)WCc{+XV#aK|0WVHZl~>io?6u%ei8my-SP-(iJz>dyxIv^P|Pe?7LW7|q7w*D`yjR8FRY'
    '_8Q>iPDQ>&{S4P8c?q^b;NJ(8X`7+i1TCR9$oKo8+EQo-x#IlDvsm8T4CR^`sM4@)4hkcu#yW)GWQ9{jeOKlfdRQmXnLwyN=Ik4p'
    'Hg#h2Xamha9agnf(}7IbdD6<Wy={7CjLp5t<Ax2n*5yLcTCk}ApLVXL(=|Hg=9@A!X#6`CSf{b8lLmDCi44^)!yvyRIcfT%mdPwr'
    '^LQ&gJqGM$IP9#4a>S!NVOt}MsH{HnjuxUzS5NKYowc5ngC4D|Mcj#$A-9fAquB4#>rT@Ap30^bU-ob3Ny5NH(DvedS+AHUZEw%D'
    'kv16dql4dV9)&59SXv4i$Xq>R)sm9iT=!-L@Atq`y-3ISSlJY#VbL+n=G>@--qp#i9Io>K63?CRVzugNKBqgM=u5X*lEWVr;wurP'
    'tfx^NB_ikqtr%SJBnNFE+N#)K#ZA3jmDgL$TwG<V&LbvuO!dvW_db@l-k;R#eCr%UZJWvuC3#}YY?}+l-)wGY?3$f+T)&Gs0$N*n'
    's?s~h-yZx<m45s@z4noo+QtWf{ZB!(6!PB>(VF#3S;*3bWSVA-Jf#m0j~RnB;VDXJ8<6znpKXVAt<%1yg#M$7%^-u6_YuWieq&oY'
    'gXyz9*E_XA)g&qzJvpV&yV^a0r^aH2Ha?#ochKGzK8KFcj^w^vX+_u70;<~b65-S^93JVUZ^gvT64!9>qCyW;N`@7L;_5uYxuxsI'
    'W%Im}qnQ{!KQcr{w@1&57rGOjOJ6>FH+Jd$2YT^(9RXdq<B6>sxrl}+t5<wkPjSzh8`N+5;Z?Ibq`TG#@X3hs+7z)}^xe9DlNaao'
    '!Xf%eE4tI9RYv&M@R(;LxI+hfjtS6uE;z%hTvfQ|y>x$F>DU8O807PLg0<7y#LZW6Xin@sgR_ewBfo2>=VB0ddewk~pHQ@+YO`L5'
    'E@wzS=7`y-0RJ)(;Drr>h>7$A`Kk2X&LLHiT)<4-dpK3TPBcAJ<sXV}duGQh`GP1sGzdK)-yJ<wcxcV%YD5m+)-!1}j;57HrS<eB'
    '3U0`E{}L5T`QhkyGx1?YsFecYT&s5jT|->I6VXi}(g6M^mu4FsJt&&tu=fhkr5WGHAPpXISq2@dTJJ@Br~J}oSbMF=;$HXZGO}Y}'
    'C(Q}kHVJ6H<{1t{lXAw=OP2c@AXIu76Isw1y&L>XChkhtSJ*UMW<#K={D##`@{rpsDn((6k-5`{+A*ze8)h$x7ox*K$da_XRRVeQ'
    'joo4;ZdUjsKpA~s?T*tbVe==gl*ejzwrh`;9H$vSusp+?n56<aag#jW5Hp$jI!)a}gEZBeZ{fh+O%zIOkzXMlxL$kAo8wy#FN=gv'
    '53P0_ZIN3TG9{X?5mJt`+*Gt%dZ(Q$fX!M+0Q$+rmM0c>pkr`B5=Lh)?d5g$=JWX_?C1+t0r24oyl@gZ_~ZsZ2g{*D&~J}QbT1PH'
    'aQjj@<>M<gr~0C{{G(k*We=BjB)4g(3oxA8x%AX{V(VRvMmLAx%3kNtZt-jnV1}bYccA_x_RtVHw(*5OI+uK<RZCBa<e7mZc_H%E'
    'NXhwpN{IJi<paST5Z5_+6&8JZJ~fWk>LoDtq0B+~Q|={>3gPdND-jfGPb1#2W{h+e2e{d+@d{UuWrq-YTvofP6Rt1UW+q>^M&ZUx'
    '0$DaZ82YpiysCFRO57r2Fr%(D8bv*|m&MLDbsA4b1zsf^+kKcQ$!8jB*V<k3!hnfG)}{R4s50)&iIC22z|Hg<^t5eCzDA}wsNHNR'
    'txp?V+=Jz@G6D92*$mxwXEWKvcze5eU$`vs&6RPf3V4(8aIm*Oeb7sa)czeyD3{BFJL&T+I4$auIMI-6C0X-PuX;K-49!?<W)Vy7'
    '^h}>>vy}04vrRCqlDx?DRl`s6mBuiXj=9b9)T26>0C%u{qd03l486remO@SV<ikGc*}?T#Jo5Dht%%$8heyq1RMz~1AttwooHC|%'
    'e0HNNH=gNcz!{U9X&A2RJwb;XpqD@U2x3e819ObFN$=K!OZKF8i}PD6nDV{-29u3POXAmsTYba;Oe#1?x`?hy*-_O`ycB4mK%#Nu'
    'rAjQ-QqL$c1eQZ7lU`B39q4+#{$dH;GafR+iZCCO-g+{a`s>M1zH&tG6jJ+BBia(}qL}KC({x`xLf(B9fXd0M0N9MRG&^4owf1}u'
    'ql9F|WY0!G5(^jYe$BWOcD;?+Gp_O*yD_w0Z^!ogs(J_Z>K)p=#-x`eqTknIgBd5KtGo6sCm_}<89L8YqkNXu{aPAnXlQ6T2vrLN'
    'q(MGdz>4>Y36Bm@UBEPSSVc5sHI_B2u{Z!0=?+!d1;(<QSa2EzZ8MT*Uy%s8QQHU;%GAcmr?$-)m(u7KY+u@EYQqfgNq^g{G7doF'
    't4H({h0DvxUzdwORD}@1Ip3Vdh*-FbpMT!j`mSWT?R`AVYP~jDwqD4?G*7+k01`7lo5`=?>DSg8b{Kux%y_ZXd?-^xHtY;|uljo)'
    'rL12*B$6Kbd-m&w`o&8VJNe3?aW2RRDoa7n4diRB6S_KGh-H2YODavXuaGAr53UzcEa(z56!#>ylkx6wI`w@1z=w5JsESfukUak^'
    'gB)@oDwupctL=ICu3^!m*m}%eW#B~CrzX8vt|jaiKQ!#e=Ci}hUSn;VnYP|vm6}aGr%Kh)ZyxFr_@Q}FebaPx4``$rK6Gon7Gk$-'
    'K31<}I^QKR46j+;WH8Jy{xuz$<m3GH-CM<W`z$E-brtgpO>LztHqyUU3TH5!<f|LtFVdD4x5Bu_Uf!1h?UF$TS&_bp2+0W`F=N{q'
    '-WNil64tCLwR_?0{<%rs+VTTs@H%K9Uwl&0R#1)`1;b%5Jd%+%RY7PFm;@Dgo2@oq8`;Y!z6O<o^1mJ*&JOo6J|U<zI%XB!Ab~$r'
    'do&z2Fe*255K2++59spcjBSIxiF-vM1q*SzOQZ<De?C8Z4N7`^mxL6JhR&2pn+W)ZCtyKis#MSGsJ>zHL_4Jlm%O_RoGTWKC|l7N'
    'h-F0---u)v*I5~oy-4Gr=_6aBT959UQm$>x01FGI)=Dt~`mfI4fBN#t4v%`O#xB(Fo^tpd2GSTn`4VEE-w4DQKlB3wP8zZUzwxUK'
    '8e0BiyDEr>KF8rv!gTm(FeW=@C{eLe_Yu}iUf2z7n3FBxZZIa;+Y1#3L`Smh4hN<pnVBO=7^n=w;L&KaRID92>O!K4(vOX}@6yAj'
    'y6t{!g&S%JfJMHP+utIatBuf#{~^<0X#qb;vnw-kvrHSG!3-bU#7z@#X*M%4PX)BYGU|FnClHFtfu)Sw5qPCPROkg}w2xjL{=qv{'
    'Awsr=YqAE+J8ed5p(*MJ*}`+mu}wI{Kz+Z1VhGG;Ud<hGQ&J~Yj|MQIWl!C%W8~VIJOY8Vrki|Fb$Yjup{r$46*Um3pvplP=%_>m'
    'c8k$&DQ@9MzAkrH0N#3>5yh+KV^e%JU&8CF1{#Egm*07aG~pl-&v1(dZ3#FsK2+}+!_^&F^PAg@Q9LH7JX~_jeJW%US6#3@LtL6j'
    'tS*Ms+F69CFo@>a2pF|2EXP<Ef6y-|?{vldSo3w<MlcCVt%(KlF$yjnK36$~_U<YdJ{sDhE@y_MP)ZKHIji1S?hH*~vgyvALi^v('
    '%9LNxJB~kM1?GFpxG2=5Ww5QCu6!9pqIL7XW6YzwP(>bc`3X&!!WAk3v$|rxhXH>0@yq)Dadg)a2SldY^M;9!Juj<cWp>0aHD`sw'
    'kTw<#p9Xzf2PP@VE_p#z&hP=}uh3_H`_@$d`AyH_YLU--?hC#Zv99~{P{%JaZ$j(kLGg=n>wa{7;>(BDdL_N$HFnNNZfzlfxAq1p'
    '#O#dkZ;2{F_sar#_-&}k-?o_K#tqTQw@h&~J~bEjloN-U-A&)1wJ-A0h*?=jGqp4D7`1CZ9^0GCLw$hHo7{7@8vUvP)5U)dVbrEC'
    '!&-^LV?*xJQ7pQRbMnN&n8s(Hm}{%CjQrl1;pUufqohesdOP^B-#UxxI=C#XQ%gELw9iY~$Zi$$Ov~K!mO!oBJ$jr!)yE8jot+GC'
    't+KVAV(H_3t=Y`wg}O#Pg4B-Sthl1%M-^(T=A+ymc{$6qqTeY(#|z2CcX0?^Z@dnoB$-7LS`Rb}*d}~5e9->mD}BK@9%)yRM;kD2'
    'Zll6!yRbe9K@4_PF#V2pqHxXXK2|T)xr6hGRKN4DS=A%$6(s5Z2a<woD*'
)
def original_c1_probe_bytes():
    raw=zlib.decompress(base64.b85decode(_ORIGINAL_C1_PROBE_B85))
    if hashlib.sha256(raw).hexdigest()!=_ORIGINAL_C1_PROBE_SHA256:raise AssertionError('pinned original C1 pure helper fixture differs')
    return raw

_CANDIDATE_01010_FIXTURE_SHA256='1b39d7593535cfa088a0f4643a44d8815b40f6bc1b114c7e66c0698804227767'
_CANDIDATE_01010_FIXTURE_B85=(
    'c-oy;%WfRW5xnaw8a$h1y&t<Lc?CZXYYUcPABC){EU~pS-Lu_2vWSKLeWQ9_q%?w7CJ18KlT{U&9T^$*+l#Kd*-c~ZH+=I$ceCHt'
    'yMCB=oR@LB#ixZf8!oq*hH>aKZQ7^O7h3ps;(6Rpndf_X^QX2?KkW9)>&s?WmY+hm^s(RWxBnfdUl1w9`m=s>-v8ya^p*1RAD-rZ'
    '9NLEBPPX5}7Kvuw^g}!8H~hbD+7CaC+ikzJU@jt7Z7l1+Uepq@mm#MpOsyr#V5`Waqgr=6uKxGLD{?BP1Yc{eDzhR>wMtvFa_j_K'
    '5*(CJGV9aYet6)iU%31<PW-B$m#I(t1*ks<A5SahJnq(`c2oZW*>-u{?#6+Kr8`%k8;8x~kKHNJZp#bdId%Qq4dc^5I@YS|3wG$2'
    '$8Maui8qX;9bWHPZ*c6VwQdi9H%{$k{H6c6?58IM+|lyTFfBYU^Zl=T+VmBHEs^_r2%hgR^q7DLxXOhIckgE;drI+vlyz-CucT1U'
    '8n!7Es$LW?H6@P0vEW>?Fs{a6L^PFrE!st;i_OJlPAZD?j_WCJ*0-xG-fMMLSYoGLQ9=6}i;FcB7lc(xIcL%r_1+KpfrfWnx)c2F'
    'QjzYM<&WLKA9yVxV1mIN%}>gG&i7K))Z@$H-J6A${oKwuMBJuvKa>Mu-|@iHTFgtu4^bD=MolG26N0YA#8lZC(Wt0(@`00!PWVu@'
    'eO{3hZ3UAuTx<Y2Rjfi}UqsTPuw^5#RjH0RpNlf>hrgG$&?qk@PLlpiP+At=?p9Fp^z8kZ4)NIC1Zg9VG3NzG4jv=4msSXEoc%oD'
    'RsRnBT5Gg2<Of3%ugdr!Od{)@D_khqQmv`7sO%hYah8Q##G4Mz>tKD9wWg3m;?n`+et`h}OhaFBz?;9lJkl?w7@aLe`J{kYM^2ow'
    '@|8p7Qb~G~l7uqI07~MZl&UGNnBXW0I@7QA18rU|tvlA&csW5A1S_X4yToi2=@eT%h0)LpnX=DZHL0v)Wy8_P#6jq6WT=VtxrTY1'
    'z%A$i+BoySICH;yl1QQg&PQW(EG%>NsRnJe)&QHTSIX)dvXa&cDP(anqiC7DOHmn9o`}GO!DlMsY<`m;cuVJJPb8uB{Cx|#pVyeD'
    'o!;pGxU72_tBpE8y(oZ@4%zzz`DD+YVu-EdWh%kw3~@+!*GiI!H6jPaNfce!<Q!@?-ruZSeme1%D^IOLe+Vxkpo#f*dEB+3bzFM)'
    'jXaFgSMtaSJyK!`g3(<$DU0d~V?}m4W(v|+=$v+0Ya|NR3S*+RwHlKuHhG@Mj`A<`?hj?b9~U0lD7if@`WAj6<Q4onhg_@;%+W$('
    '9XU&AIwM#sU#d>Qi{M-^S;ausg-8nW96WjBC8_85^N0yQK}47NtLWR%+Kz=c_ecHXvSxJqWbs#$keJo_S{4ul7o&Bc2?ldDQ3cdr'
    'RHYcLT#<-PJ_~56w^B2Dz%Wa%1UZ90>3J4qY@`46xasrbccpPyc)MFyek}*+g1?eN6_rA1u19kSkkgpBXanA97!?vtjYJbbbg*_B'
    '(@rLWW@K+N^s+urVWG6)`SpPrU(Mmnq51x>;Qqv=>)4eJ@)~wX9C(7NOP7==F(@fL+ChN-88RzHl1vO%IZ-`O%M=K5EgU3VhVmRc'
    'CPIVs9pH~EzJVSCEnY*9j>SB6x>WB|)I}*gur=w#aEOvssuG?=Sulp1mS%WBhtd;RB!hg8{y6u)1O0KuH_!*Tp=-3!8b%6&pKC*|'
    'Jj4aOfY*^2Rl+jW0Q1BuL@>q4ssxN{F#@uLG(V%wywc#$|8EMnhxOmgB-ksN2n;Du!xfRMfOBJjg~v%LVNQZz8bYLl3zE=6I!Vzg'
    '5=$YB2B#$-GdWK*X!_Vd{S%%UcaXBrJY8|N<G7j6E&LWs82`LIjl;JanD~h{^WE<8OB<`22@5$&umL_L6I^XdUYZ1^6u30j=nCOf'
    'HE8CNopsS_s`%tfO7Sv&kH@@%ng0@FZqVj?T*Yn=18l+!I9;I5kk3e``AejdA&G_H0f?-&QH11_*IvcweX$y51PvgNM1u2!aq!B*'
    'F5B$jcYF>Pq-WFna}&Rd6@hosft;>zYqmxkjSEx+E?tb?$L%Pwq=58Ys;F4P;3St-v4)a{yFFN9%9(cyVH~$T->mPTdv1c-_2mN('
    'E#`P1qW$vFZaKN#b0+?E-y^)6c}J~qoA&HO&;NsIZ+EH<!?6EVbnnO2>%Z#o<+|}*_m8m~VB|jF{#3U8+_-(XEZyC_`1Im;)z?}{'
)
def candidate_01010_fixture_bytes():
    raw=zlib.decompress(base64.b85decode(_CANDIDATE_01010_FIXTURE_B85))
    if hashlib.sha256(raw).hexdigest()!=_CANDIDATE_01010_FIXTURE_SHA256:raise AssertionError('pinned 0.10.10 fixture differs')
    return raw

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('successor', ROOT/'tools/qualify_core_successor.py')
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)


def fixture():
    result= {'id':'test-fixture-only','profile':c.PROFILE,'purpose':'candidate-production',
            'version':'7.8.6','source':{'commit':'1'*40,'tree':'2'*40},
            'controller':{'commit':'3'*40,'tree':'4'*40,'workflow_sha256':'5'*64,'script_sha256':'6'*64},
            'platform':'linux-x86_64','bounds':{'workers':1,'seconds':600,'log_bytes':1048576,'artifact_bytes':67108864},
            'resources':{'action_runtime_resources/'+n+'.json':'7'*64 for n in c.RESOURCE_NAMES},'protocols':{'semantic':'0.10.0','engine':'umf-core-r2','codegen':'umf-codegen-r3-seven-ops-nine-resources/1'},
            'inputs':{'Cargo.lock':'8'*64,'bun.lock':'9'*64,'crates/umf-core/src/canonical_codegen_literals.rs':'e'*64},
            'recipes':{'python/hatch_build.py':'a'*64},'common':None,'continuation':None}
    result['compatibility']={'census_sha256':'d'*64,'early':['python/tests/test_compat.py::test_early_'+str(i) for i in range(18)],'later':['python/tests/test_compat.py::test_later_'+str(i) for i in range(31)],'historicalExcluded':[c.HISTORICAL_COLD]}
    result['inputs'][c.COMPAT_CENSUS]='d'*64
    for name,path in c.RESOURCE_SOURCES.items():result['inputs'][path]=result['resources']['action_runtime_resources/'+name+'.json']
    return result


def context(a):
    return {'repository':'DocumentDrivenDX/umf','repository_id':'1382276802','owner_id':'273466046',
            'event':'workflow_dispatch','ref':'refs/heads/main','workflow':'DocumentDrivenDX/umf/.github/workflows/core-successor-qualification.yml@refs/heads/main',
            'workflow_sha':'b'*40,'run':'123','attempt':'1','job':'456','platform':a['platform'],
            'controller':a['controller'],'job_name':'linux' if a['platform']=='linux-x86_64' else 'macos','upload_step':c.UPLOAD_STEP,'admitted':True}


def registry(a):
    return {'profile':c.REGISTRY,'admissions':[copy.deepcopy(a)]}


def deep_report(a,cell):
    result= {'profile':c.DEEP,'source':a['source'],'version':a['version'],'resources':a['resources'],'protocols':a['protocols'],
            'maximumWork':1000000,'cases':17,'calls':51,'coldConstructors':51,'coldPerCall':True,
            'runtime':{'cell':cell,'python':c.CELLS[cell][1],'implementation':'cpython','executable_sha256':'d'*64},
            **{k:True for k in ('constructorPassed','custodyPreserved','installedFilesUnchanged','loadedOwnershipVerified','recordVerified','embeddedCLIVerified','normalResolver','resourceSuccess','budgetRefusalVerified')},
            'wheel_sha256':'a'*64,'native_sha256':'b'*64,'resource_manifest_sha256':'c'*64,'inputProfile':'installed-canonical/1','data_sha256':a['inputs']['crates/umf-core/src/canonical_codegen_literals.rs'],'factory_manifest_sha256':'f'*64,'paidManifestReports':51,'compatibility':{}}
    result['compatibility']=compatibility_report(a,result['wheel_sha256'],result['native_sha256'])
    return result


def compatibility_report(a,wheel,native,original=None):
    return {'profile':c.COMPAT_PROFILE,'source':a['source'],'inputProfile':'installed-canonical/1',
            'census_sha256':a['compatibility']['census_sha256'],'wheel_sha256':wheel,'native_sha256':native,
            'original':original or c.original_context(context(a)),
            'groups':{g:{'cases':dict.fromkeys(a['compatibility'][g],'passed'),'xml_sha256':'f'*64} for g in ('early','later')}}


def compatibility_xml(selectors,status=None):
    import xml.etree.ElementTree as ET
    root=ET.Element('testsuite')
    for selector in selectors:
        file,*parts=selector.split('::')
        row=ET.SubElement(root,'testcase',classname='.'.join([file[:-3].replace('/','.'),*parts[:-1]]),name=parts[-1])
        if status:ET.SubElement(row,status)
    return ET.tostring(root)


def material(a,kind='common'):
    return {'kind':kind,'run':123,'job':456,'attempt':1,'artifact':789,'workflow':c.WORKFLOW,
            'workflow_sha':'b'*40,'controller':a['controller']['commit'],'source':a['source']['commit'],
            'platform':'linux-x86_64','job_name':'linux','upload_step':c.UPLOAD_STEP,'sha256':'a'*64,'members':{'component.json':'b'*64}}


class AdmissionTests(unittest.TestCase):
    def test_empty_registry_refuses_before_executor(self):
        a=fixture()
        with self.assertRaises(c.Refusal): c.admit({'profile':c.REGISTRY,'admissions':[]},a['id'],context(a))
    def test_registered_exact_binding(self):
        a=fixture(); self.assertEqual(c.admit(registry(a),a['id'],context(a)),a)
    def test_mismatches_and_placeholders(self):
        a=fixture()
        for field,value in [('version','0.10.9'),('version','C'),('version','0.10.8'),('profile','unknown'),('platform','linux'),('purpose','release')]:
            b=copy.deepcopy(a); b[field]=value
            with self.subTest(field=field,value=value),self.assertRaises(c.Refusal):c.admit(registry(b),b['id'],context(b))
        for k,v in [('admitted',False),('admitted',1),('repository','Other/umf'),('repository_id',1382276802),('owner_id','0'),('ref','refs/heads/other'),('workflow','wrong'),('event','push'),('platform','macos-arm64')]:
            b=context(a);b[k]=v
            with self.subTest(context=k),self.assertRaises(c.Refusal):c.admit(registry(a),a['id'],b)
        for section in ('source','inputs','recipes','resources'):
            b=copy.deepcopy(a);key=next(iter(b[section]));b[section][key]='not-a-hash'
            with self.subTest(section=section),self.assertRaises(c.Refusal):c.admit(registry(b),b['id'],context(b))
        for k in a['controller']:
            b=context(a);b['controller']=dict(a['controller']);b['controller'][k]='0'*len(b['controller'][k])
            with self.subTest(controller=k),self.assertRaises(c.Refusal):c.admit(registry(a),a['id'],b)
    def test_types_closure_and_bounds(self):
        a=fixture()
        for field,value in [('workers',True),('workers',2),('seconds',True),('seconds',0),('seconds',5401),('artifact_bytes',67108865),('log_bytes',0)]:
            b=copy.deepcopy(a);b['bounds'][field]=value
            with self.subTest(field=field,value=value),self.assertRaises(c.Refusal):c.admit(registry(b),b['id'],context(b))
        b=copy.deepcopy(a);b['source']['commit']='0'*40
        with self.assertRaises(c.Refusal):c.admit(registry(b),b['id'],context(b))
        b=registry(a);b['admissions'].append(copy.deepcopy(a))
        with self.assertRaises(c.Refusal):c.admit(b,a['id'],context(a))
        b=copy.deepcopy(a);b['extra']=True
        with self.assertRaises(c.Refusal):c.admit(registry(b),b['id'],context(b))
    def test_mac_requires_original_common_material(self):
        a=fixture();a['platform']='macos-arm64'
        with self.assertRaises(c.Refusal):c.admit(registry(a),a['id'],context(a))
    def test_duplicate_json_refuses(self):
        with self.assertRaises(c.Refusal):c.loads('{"admissions":[],"admissions":[{}]}')


class InitialInspectorIntakeTests(unittest.TestCase):
    """Closed source-only controls for the distinct original Inspector intake."""
    def admission(self,source='7'*40,tree='8'*40,run=71234567890,job=71234567891,ref='refs/heads/synthetic-candidate'):
        a=fixture();a['version']='0.10.10';a['source']={'commit':source,'tree':tree}
        a['inputs'][c.CANDIDATE01010_RESOURCES]='e'*64
        p={'workflow':c.INSPECTOR_WORKFLOW,'workflow_id':c.INSPECTOR_WORKFLOW_ID,
           'run':run,'attempt':1,'job':job,'ref':ref,
           'controller':source,'source':source,'tree':tree,
           'artifact':987654321,'artifact_name':f'{c.INSPECTOR_ARTIFACT_PREFIX}-{run}-1','sha256':'a'*64,
           'members':{'producer.json':'b'*64,'source-inputs.tar':'c'*64,
                      'cost-gate.json':'d'*64,'public-probe.log':'e'*64,'wheels/'+c.INSPECTOR_RAW:'f'*64},
           'census_sha256':'d'*64,'fixture_sha256':'e'*64,
           'wheel':{'member':'wheels/'+c.INSPECTOR_RAW,'sha256':'f'*64,'bytes':12345,'native_sha256':'9'*64}}
        a['initialInspector']=p
        return a,p

    def synthetic_report_graph(self,work,a,p):
        """Build a fully synthetic original-format graph; no UMF/native work."""
        import csv
        import xml.etree.ElementTree as ET
        source=work/'source';reports=work/'reports';source.mkdir();reports.mkdir()
        helper_path=source/c.CANDIDATE01010_PROBE;helper_path.parent.mkdir(parents=True,exist_ok=True)
        helper_bytes=original_c1_probe_bytes();helper_path.write_bytes(helper_bytes)
        spec=importlib.util.spec_from_file_location('_synthetic_original_c1_probe',helper_path)
        helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
        fixture_bytes=candidate_01010_fixture_bytes();fixture=json.loads(fixture_bytes)
        fixture_path=source/c.CANDIDATE01010_RESOURCES;fixture_path.parent.mkdir(parents=True,exist_ok=True);fixture_path.write_bytes(fixture_bytes)
        fixture_sha=hashlib.sha256(fixture_bytes).hexdigest();p['fixture_sha256']=fixture_sha
        a['inputs'][c.CANDIDATE01010_RESOURCES]=fixture_sha
        a['inputs'][c.CANDIDATE01010_PROBE]=hashlib.sha256(helper_bytes).hexdigest()

        def put_source(name,body):
            path=source/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(body);return hashlib.sha256(body).hexdigest()
        corpus_cases=[{'id':'synthetic-case-%02d'%i,'expected':{'ordinal':i,'synthetic':True}} for i in range(17)]
        corpus_bytes=(json.dumps({'cases':corpus_cases},indent=2)+'\n').encode()
        source_hashes={c.CANDIDATE01010_RESOURCES:fixture_sha,c.CANDIDATE01010_PROBE:hashlib.sha256(helper_bytes).hexdigest()}
        for name,body in {
            'Cargo.lock':b'# synthetic source-only fixture lock\n',
            'python/tests/test_retained_codegen_native.py':b'# synthetic named-loader identity fixture\n',
            'tests/rust-core/fixtures/access-inspection/cases.json':corpus_bytes,
            'fixtures/saga/portable.json':b'{"synthetic":true}\n',
        }.items():source_hashes[name]=put_source(name,body)
        saga_inputs='fixtures/saga/portable.json'
        custody="export const SAGA_QUALIFICATION_INPUTS=[\n  '"+saga_inputs+"'\n] as const;\n"
        source_hashes['scripts/saga-portable/custody.ts']=put_source('scripts/saga-portable/custody.ts',custody.encode())
        while len(source_hashes)<179:
            name='synthetic/pinned/source-%03d.txt'%(len(source_hashes)+1)
            source_hashes[name]=put_source(name,('source-only fixture '+name+'\n').encode())

        public=[f'python/tests/test_synthetic_public.py::test_public_{i:02d}' for i in range(18)]
        python_cases=[f'python/tests/test_synthetic_factory.py::test_factory_{i:02d}' for i in range(31)]
        rust_names=['test_synthetic_rust_%03d'%i for i in range(477)]
        census={'installedFactory':{'sourceFiles':source_hashes,'closureSHA256':'a'*64,
            'rust':[{'package':'umf-core','target':'synthetic-target','cases':[{'name':n} for n in rust_names]}],
            'python':[{'group':'synthetic-31','cases':python_cases}], 'publicControls':public}}
        census_bytes=(json.dumps(census,indent=2)+'\n').encode();census_sha=hashlib.sha256(census_bytes).hexdigest()
        p['census_sha256']=census_sha;a['inputs'][c.COMPAT_CENSUS]=census_sha
        census_path=source/c.COMPAT_CENSUS;census_path.parent.mkdir(parents=True,exist_ok=True);census_path.write_bytes(census_bytes)
        # The original source-input archive contains the exact census plus its
        # 179 pinned sourceFiles; the 180-member roster is intentionally kept.
        source_tar=reports/'source-inputs.tar'
        with tarfile.open(source_tar,'w') as archive:
            for name in [c.COMPAT_CENSUS,*source_hashes]:
                body=(source/name).read_bytes();info=tarfile.TarInfo(name);info.size=len(body);info.mode=0o644;info.mtime=0
                archive.addfile(info,io.BytesIO(body))

        native=b'synthetic native member bytes; never loaded or executed'
        metadata=b'Metadata-Version: 2.1\nName: umf-core\nVersion: 0.10.10\n\n'
        wheel_files={'umf/_rust_core.abi3.so':native,'umf_core-0.10.10.dist-info/METADATA':metadata}
        csvbuf=io.StringIO(newline='');writer=csv.writer(csvbuf,lineterminator='\n')
        for name,body in wheel_files.items():
            digest=base64.urlsafe_b64encode(hashlib.sha256(body).digest()).rstrip(b'=').decode()
            writer.writerow([name,'sha256='+digest,str(len(body))])
        writer.writerow(['umf_core-0.10.10.dist-info/RECORD','',''])
        wheel_files['umf_core-0.10.10.dist-info/RECORD']=csvbuf.getvalue().encode()
        wheel_members={name:{'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest()} for name,body in wheel_files.items()}
        wheel_bytes_io=io.BytesIO()
        with zipfile.ZipFile(wheel_bytes_io,'w') as archive:
            for name,body in wheel_files.items():archive.writestr(name,body)
        wheel_bytes=wheel_bytes_io.getvalue();wheel_sha=hashlib.sha256(wheel_bytes).hexdigest()
        native_sha=hashlib.sha256(native).hexdigest();p['wheel'].update(sha256=wheel_sha,bytes=len(wheel_bytes),native_sha256=native_sha)
        p['members']={p['wheel']['member']:wheel_sha}
        wheelpath=reports/p['wheel']['member'];wheelpath.parent.mkdir(parents=True,exist_ok=True);wheelpath.write_bytes(wheel_bytes)
        identity={'resourceFixture':c.CANDIDATE01010_RESOURCES,'resourceFixtureSHA256':fixture_sha,
            'candidateArtifactVersion':'0.10.10','literalDataSHA256':fixture['literalData']['sha256'],'generation':fixture['generation']}
        cargo_sha=source_hashes['Cargo.lock'];loader_sha=source_hashes['python/tests/test_retained_codegen_native.py']
        cargo_metadata=b'{"synthetic":true}\n';features=b'synthetic-feature-graph\n'
        (reports/'cargo-metadata.json').write_bytes(cargo_metadata);(reports/'producer-cargo-features.txt').write_bytes(features)
        producer={'profile':'umf.private-construction-batch-producer/1','source':p['source'],'inputProfile':'installed-canonical/1',
            'cargoLockSHA256':cargo_sha,'resourcePinsSHA256':fixture_sha,'currentInputIdentity':identity,
            'testSHA256':loader_sha,'censusSHA256':census_sha,'dependencies':{},
            'wheel':{'path':'/runner/wheels/'+c.INSPECTOR_RAW,'bytes':len(wheel_bytes),'sha256':wheel_sha},
            'cargoMetadataSHA256':hashlib.sha256(cargo_metadata).hexdigest(),'featureGraphSHA256':hashlib.sha256(features).hexdigest(),
            'nativeMember':{'path':'umf/_rust_core.abi3.so','sha256':native_sha},'members':wheel_members,
            'publishable':False,'readyForEnrollment':False}
        payload={'profile':'umf.private-construction-batch-source/1','source':p['source'],'tree':p['tree'],
            'inputProfile':'installed-canonical/1','cargoLockSHA256':cargo_sha,'resourcePinsSHA256':fixture_sha,
            'currentInputIdentity':identity,'censusSHA256':census_sha,'testSHA256':loader_sha,
            'limits':{'construction':1000000,'perCall':1000000},'oldNativePassesReused':False,'publishable':False,'readyForEnrollment':False}
        (reports/'producer.json').write_text(json.dumps(producer,indent=2)+'\n')
        (reports/'source-and-payload.json').write_text(json.dumps(payload,indent=2)+'\n')

        expected=helper.expected_manifest(fixture)
        source_manifest=json.loads(json.dumps(expected))
        for row in source_manifest['resources']:row['bytes']=float(row['bytes'])
        pairs=[]
        for row in corpus_cases:
            for carrier in ('dispatcher','list','tuple'):
                result={'ok':True,'result':row['expected']} if carrier=='dispatcher' else row['expected']
                pairs.append((row['id'],carrier,hashlib.sha256(json.dumps(result,sort_keys=True,separators=(',',':'),ensure_ascii=True,allow_nan=False).encode()).hexdigest()))
        manifest_sha=helper.manifest(source_manifest,expected)
        life={'completed':True,'workCreated':True,'maximumWork':1000000,'returnedWork':1,'attemptedWork':1}
        measurement={'profile':'umf.private-installed-factory-cost/1','inputProfile':'installed-canonical/1',
            'actualCandidateSource':p['source'],'wheelSHA256':wheel_sha,'nativeSHA256':native_sha,
            'closureSHA256':census['installedFactory']['closureSHA256'],'currentInputIdentity':identity,
            'maximumWork':1000000,'status':'cost-complete','inspectionCases':17,'inspectionCalls':51,'freshConstructors':51,
            'requestCustodyPreserved':True,'installedFilesUnchanged':True,'publishable':False,'readyForEnrollment':False,'pairs':[]}
        for case,carrier,result_sha in pairs:
            measurement['pairs'].append({'case':case,'carrier':carrier,'resultSHA256':result_sha,'completed':True,
                'sourceManifest':source_manifest,'manifestSHA256':manifest_sha,'constructor':life,'call':life,'manifest':life})
        (reports/'measurement.json').write_text(json.dumps(measurement,indent=2)+'\n')

        def junit_bytes(selectors):
            root=ET.Element('testsuite')
            for selector in selectors:
                file,*parts=selector.split('::')
                ET.SubElement(root,'testcase',classname='.'.join([file[:-3].replace('/','.'),*parts[:-1]]),name=parts[-1])
            return ET.tostring(root,encoding='utf-8')
        companion_names=['measurement.json','public-controls.xml',*[f'{kind}-cost-{when}.json' for kind in ('identity','installed-record') for when in ('before','after')]]
        (reports/'public-controls.xml').write_bytes(junit_bytes(public))
        state={'profile':'umf.private-retained-installed-identity/1','artifactSource':p['source'],'controllerSource':p['source'],
            'wheelSHA256':wheel_sha,'currentInputIdentity':identity,'distributionOwnershipVerified':True,
            'completeWheelAndInstalledRecordVerified':True,'loadedModules':{
                'umf/__init__.py':{'sha256':'1'*64},'umf/rust_codegen.py':{'sha256':'2'*64},
                'umf/_rust.py':{'sha256':'3'*64},'umf/_rust_core.abi3.so':{'sha256':native_sha}}}
        record={'status':'passed','wheel_sha256':wheel_sha,'native_sha256':native_sha}
        for suffix in ['cost-before','cost-after','producer-before-rust','initial','final','lifecycle2-before','lifecycle2-after','factory-group-0-before','factory-group-0-after']:
            (reports/f'identity-{suffix}.json').write_text(json.dumps(state,indent=2)+'\n')
            (reports/f'installed-record-{suffix}.json').write_text(json.dumps(record,indent=2)+'\n')
        cost_members={}
        for name in companion_names:
            body=(reports/name).read_bytes();cost_members[name]={'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest()}
        cost={'profile':'umf.private-retained-cost-gate/1','artifactSource':p['source'],'controllerSource':p['source'],
            'wheelSHA256':wheel_sha,'nativeSHA256':native_sha,'censusSHA256':census_sha,'run':str(p['run']),'attempt':'1',
            'currentInputIdentity':identity,'status':'cost-gate-passed','inputProfile':'installed-canonical/1',
            'publicControlsExecution':'COMPLETED','identityBeforePassed':True,'identityAfterPassed':True,
            'publicProbePassed':True,'publicControlsPassed':True,'expensiveTestCompilationAdmitted':True,'members':cost_members}
        (reports/'cost-gate.json').write_text(json.dumps(cost,indent=2)+'\n')

        targets=[{'package':'umf-core','target':'synthetic-target','caseNames':rust_names}]
        compiled={'source':p['source'],'status':'authenticated-before-test-execution','selectedCases':477,'censusSHA256':census_sha,'targets':targets}
        (reports/'compiled-census.json').write_text(json.dumps(compiled,indent=2)+'\n')
        rust_results=[]
        for index,name in enumerate(rust_names):
            log=reports/'rust-cases'/(str(index)+'-case.log');log.parent.mkdir(exist_ok=True)
            body=b'1 passed; 0 failed\n';log.write_bytes(body)
            rust_results.append({'package':'umf-core','target':'synthetic-target','name':name,'passed':True,'exit':0,'logSHA256':hashlib.sha256(body).hexdigest()})
        rust={'source':p['source'],'status':'passed','cases':477,'passed':477,'censusSHA256':census_sha,
            'compiledCensusSHA256':hashlib.sha256((reports/'compiled-census.json').read_bytes()).hexdigest(),'results':rust_results}
        (reports/'rust-census-result.json').write_text(json.dumps(rust,indent=2)+'\n')

        for index,selectors in enumerate((python_cases,)):
            (reports/f'factory-group-{index}.xml').write_bytes(junit_bytes(selectors))
            (reports/f'factory-group-{index}.log').write_bytes(b'31 named synthetic tests passed\n')
        python_groups=[{'group':'synthetic-31','cases':python_cases,'passed':True,
            'xmlSHA256':hashlib.sha256((reports/'factory-group-0.xml').read_bytes()).hexdigest()}]
        saga={'profile':'umf.saga.portable-host-receipt/2','cases':19,'passed':19,'hostId':'python',
            'runtime':{'python':'3.11.17','platform':'Linux','arch':'x86_64'},
            'results':[{'id':f'synthetic-saga-{i:02d}','passed':True} for i in range(19)],
            'installedBinding':{'status':'passed','wheelSha256':wheel_sha,'beforeNativeSha256':native_sha,'afterNativeSha256':native_sha},
            'corpusSha256':hashlib.sha256((source/'fixtures/saga/portable.json').read_bytes()).hexdigest(),
            'qualificationInputs':{saga_inputs:source_hashes[saga_inputs]}}
        (reports/'public-saga19.json').write_text(json.dumps(saga,indent=2)+'\n');(reports/'public-saga19.log').write_bytes(b'19 passed\n')
        aggregate={'profile':'umf.private-installed-factory-semantics/1','inputProfile':'installed-canonical/1',
            'artifactSource':p['source'],'controllerSource':p['source'],'wheelSHA256':wheel_sha,'run':str(p['run']),'attempt':'1',
            'currentInputIdentity':identity,'costGateAuthenticated':True,'rustPassed':True,'sagaPassed':True,
            'finalIdentityPassed':True,'requiredQualificationPassed':True,'pythonGroups':python_groups}
        (reports/'aggregate.json').write_text(json.dumps(aggregate,indent=2)+'\n')
        lifecycle_cases=['python/tests/test_saga_lifecycle.py::InstalledSagaLifecycle::test_author_declare_edit_exchange_and_assess',
            'python/tests/test_saga_lifecycle.py::InstalledSagaLifecycle::test_unknown_recovery_meaning_refuses_edit']
        lifecycle_log=b'2 passed\n';lifecycle_junit=junit_bytes(lifecycle_cases)
        (reports/'saga-lifecycle2.log').write_bytes(lifecycle_log);(reports/'saga-lifecycle2.xml').write_bytes(lifecycle_junit)
        lifecycle={'profile':'umf.private-installed-saga-lifecycle2/1','status':'passed','passed':True,
            'source':p['source'],'run':str(p['run']),'attempt':'1','cases':lifecycle_cases,
            'currentInputIdentity':identity,'wheel':producer['wheel'],'nativeMember':producer['nativeMember'],
            'processExitCode':0,'execution':'same-job-after-cost-and-required-semantics',
            'log':{'path':'saga-lifecycle2.log','sha256':hashlib.sha256(lifecycle_log).hexdigest()},
            'junit':{'path':'saga-lifecycle2.xml','sha256':hashlib.sha256(lifecycle_junit).hexdigest()},
            'identityBefore':{'path':'identity-lifecycle2-before.json','sha256':hashlib.sha256((reports/'identity-lifecycle2-before.json').read_bytes()).hexdigest()},
            'identityAfter':{'path':'identity-lifecycle2-after.json','sha256':hashlib.sha256((reports/'identity-lifecycle2-after.json').read_bytes()).hexdigest()}}
        (reports/'saga-lifecycle2-result.json').write_text(json.dumps(lifecycle,indent=2)+'\n')
        for name in ('public-probe.log','cost-driver.log','lanes-driver.log'):(reports/name).write_bytes(('synthetic '+name+'\n').encode())
        return source,reports,helper

    def test_initial_profile_is_closed_and_bound_to_original_candidate(self):
        a,p=self.admission();c.initial_inspector_shape(p,a)
        future=copy.deepcopy(p);future.update(run=91234567890,job=91234567891,artifact=91234567892)
        future['artifact_name']=f'{c.INSPECTOR_ARTIFACT_PREFIX}-{future["run"]}-{future["attempt"]}'
        c.initial_inspector_shape(future,a) # shape only; no artifact or run is authenticated here
        for mutate in (
            lambda q:q.update(workflow=c.WORKFLOW),
            lambda q:q.update(run=0),
            lambda q:q.update(controller='1'*40),
            lambda q:q.update(tree='2'*40),
            lambda q:q.update(ref='refs/heads/../foreign'),
            lambda q:q.update(artifact_name='other'),
            lambda q:q['members'].update({'../foreign':'1'*64}),
            lambda q:q.update(extra=True),
            lambda q:q['wheel'].update(member='wheels/umf_core-0.10.9-cp311.whl'),
        ):
            bad=copy.deepcopy(p);mutate(bad)
            with self.subTest(mutated=bad),self.assertRaises(c.Refusal):c.initial_inspector_shape(bad,a)

    def test_actual_f7d_costfailure_is_rejected_before_any_download_or_stage(self):
        a,p=self.admission(source='f7d36bff78f9604bb4d1b9eb00fd0e9ff7bc78e6',tree='ce1317b8c6bf2c0f5f64ae7640551fd949330afe',run=42724153895,job=129525360428,ref='refs/heads/codex/truss-constructor-recovery')
        run={'id':p['run'],'workflow_id':p['workflow_id'],'path':p['workflow'],'run_attempt':1,
             'event':'workflow_dispatch','head_branch':'codex/truss-constructor-recovery',
             'head_sha':p['controller'],'status':'completed','conclusion':'failure',
             'repository':{'full_name':c.REPO,'id':1382276802,'owner':{'id':273466046}},
             'head_repository':{'id':1382276802}}
        job={'id':p['job'],'run_id':p['run'],'run_attempt':1,'head_sha':p['controller'],
             'name':'feasibility','labels':['ubuntu-24.04'],'status':'completed','conclusion':'failure',
             'steps':[{'name':c.INSPECTOR_UPLOAD,'status':'completed','conclusion':'success'}],
             'started_at':'2026-11-09T00:00:00Z','completed_at':'2026-11-09T01:00:00Z'}
        art={'id':p['artifact'],'name':p['artifact_name'],'expired':False,'digest':'sha256:'+p['sha256'],
             'workflow_run':{'id':p['run'],'head_sha':p['controller'],'repository_id':1382276802,
                             'head_repository_id':1382276802},'created_at':'2026-11-09T00:30:00Z'}
        with self.assertRaisesRegex(c.Refusal,'original-run-not-qualified'):
            c.initial_inspector_provenance(a,p,run,job,art)

    def test_actual_failed_run_stops_before_artifact_zip_request(self):
        a,p=self.admission();responses={
            'actions/runs/'+str(p['run'])+'/attempts/1':{'id':p['run'],'workflow_id':p['workflow_id'],'path':p['workflow'],'run_attempt':1,'event':'workflow_dispatch','head_branch':'codex/truss-constructor-recovery','head_sha':p['controller'],'status':'completed','conclusion':'failure','repository':{'full_name':c.REPO,'id':1382276802,'owner':{'id':273466046}},'head_repository':{'id':1382276802}},
            'actions/jobs/'+str(p['job']):{'id':p['job'],'run_id':p['run'],'run_attempt':1,'head_sha':p['controller'],'name':'feasibility','labels':['ubuntu-24.04'],'status':'completed','conclusion':'failure'},
            'actions/artifacts/'+str(p['artifact']):{'id':p['artifact'],'name':p['artifact_name'],'expired':False,'digest':'sha256:'+p['sha256'],'workflow_run':{'id':p['run'],'head_sha':p['controller'],'repository_id':1382276802,'head_repository_id':1382276802}}}
        seen=[]
        def fake(path,*args,**kwargs):seen.append(path);return responses[path]
        with tempfile.TemporaryDirectory() as raw,patch.object(c,'deadline_api',side_effect=fake):
            with self.assertRaises(c.Refusal):c.initial_inspector_material(a,Path(raw),Path(raw)/'intake')
        self.assertEqual(seen,['actions/runs/'+str(p['run'])+'/attempts/1','actions/jobs/'+str(p['job']),'actions/artifacts/'+str(p['artifact'])])
        self.assertFalse(any(path.endswith('/zip') for path in seen))

    def test_synthetic_successful_original_zip_is_verified_then_raw_wheel_is_reused_once(self):
        a,p=self.admission(run=91234567890,job=91234567891,ref='refs/heads/synthetic-candidate')
        with tempfile.TemporaryDirectory() as fixture_dir:
            fixture_root=Path(fixture_dir)
            source,reports,_=self.synthetic_report_graph(fixture_root,a,p)
            archive_path=fixture_root/'original.zip'
            payload=io.BytesIO()
            with zipfile.ZipFile(payload,'w',compression=zipfile.ZIP_DEFLATED) as archive:
                for path in sorted(reports.rglob('*')):
                    if path.is_file():archive.write(path,path.relative_to(reports).as_posix())
            archive_bytes=payload.getvalue();p['members']={}
            with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
                for info in archive.infolist():p['members'][info.filename]=hashlib.sha256(archive.read(info)).hexdigest()
            p['sha256']=hashlib.sha256(archive_bytes).hexdigest()
            run={'id':p['run'],'workflow_id':p['workflow_id'],'path':p['workflow'],'run_attempt':1,
             'event':'workflow_dispatch','head_branch':p['ref'].removeprefix('refs/heads/'),'head_sha':p['controller'],
             'status':'completed','conclusion':'success','repository':{'full_name':c.REPO,'id':1382276802,'owner':{'id':273466046}},
             'head_repository':{'id':1382276802}}
            job={'id':p['job'],'run_id':p['run'],'run_attempt':1,'head_sha':p['controller'],'name':'feasibility',
             'labels':['ubuntu-24.04'],'status':'completed','conclusion':'success','started_at':'2026-11-09T00:00:00Z',
             'completed_at':'2026-11-09T01:00:00Z','steps':[{'name':c.INSPECTOR_UPLOAD,'status':'completed','conclusion':'success'}]}
            art={'id':p['artifact'],'name':p['artifact_name'],'expired':False,'digest':'sha256:'+p['sha256'],
             'size_in_bytes':len(archive_bytes),'workflow_run':{'id':p['run'],'head_sha':p['controller'],
             'repository_id':1382276802,'head_repository_id':1382276802},'created_at':'2026-11-09T00:30:00Z'}
            responses={'actions/runs/'+str(p['run'])+'/attempts/1':run,
                   'actions/jobs/'+str(p['job']):job,'actions/artifacts/'+str(p['artifact']):art}
            def fake(path,binary=False,limit=c.MAX_BYTES,sink=None,**kwargs):
                if path.endswith('/zip'):
                    Path(sink).write_bytes(archive_bytes);return len(archive_bytes)
                return responses[path]
            with tempfile.TemporaryDirectory() as raw:
                root=Path(raw)
                with patch.object(c,'deadline_api',side_effect=fake):
                    original=c.initial_inspector_material(a,source,root/'retained'/'initial')
                self.assertEqual(original.read_bytes(),(reports/p['wheel']['member']).read_bytes())
                command=Mock()
                selected=c.initial_or_produced_raw(a,root,root/'retained'/'raw',command,original)
                self.assertEqual(selected.read_bytes(),original.read_bytes());command.assert_not_called()

    def test_initial_linux_reuse_runs_independent_owned_cli_build_before_mandatory_guard(self):
        a,p=self.admission();a['initialInspector']=p
        with tempfile.TemporaryDirectory() as raw:
            root=Path(raw);original=root/'qualified-original.whl';original.write_bytes(b'authenticated original wheel bytes')
            p['wheel']['sha256']=hashlib.sha256(original.read_bytes()).hexdigest()
            invoked=[]
            def command(argv):
                invoked.append(argv)
                target=root/'owned'/'target'/'release'/'umf';target.parent.mkdir(parents=True,exist_ok=True)
                target.write_bytes(b'independently source-built CLI')
            reused=c.initial_or_produced_raw(a,root,root/'raw',command,original)
            self.assertEqual(reused.read_bytes(),original.read_bytes());self.assertEqual(invoked,[])
            target=root/'owned'/'target'/'release'/'umf';self.assertFalse(target.exists())
            standalone=c.standalone_cli_source(a,root/'owned',command)
            self.assertEqual(standalone,target);self.assertEqual(standalone.read_bytes(),b'independently source-built CLI')
            self.assertEqual(invoked,[['cargo','build','--locked','--release','--manifest-path','Cargo.toml',
                                      '-p','umf-cli','--features','umf-cli/native-postgresql']])
            with self.assertRaises(c.Refusal):c.standalone_cli_source(a,root/'missing-owned',lambda _argv:None)
            no_intake=fixture();existing=root/'ordinary'/'target'/'release'/'umf';existing.parent.mkdir(parents=True);existing.write_bytes(b'ordinary route output')
            self.assertEqual(c.standalone_cli_source(no_intake,root/'ordinary',lambda _argv:self.fail('unexpected CLI rebuild')),existing)
        stage=inspect.getsource(c.execute_candidate).split("elif gate=='wheel':",1)[1].split("elif gate=='sdk':",1)[0]
        self.assertLess(stage.index('initial_or_produced_raw('),stage.index('standalone_cli_source('))
        self.assertIn('standalone_cli_source(a,work,command)',stage)
        self.assertNotIn('cargo build',inspect.getsource(c.initial_or_produced_raw))

    def test_source_shaped_original_reports_reject_targeted_corruption(self):
        def corrupt_tar(source,reports):
            path=reports/'source-inputs.tar';changed=io.BytesIO()
            with tarfile.open(path,'r:') as original,tarfile.open(fileobj=changed,mode='w') as rewritten:
                first=True
                for row in original.getmembers():
                    body=original.extractfile(row).read()
                    if first:body+=b'corrupt';first=False
                    row.size=len(body);rewritten.addfile(row,io.BytesIO(body))
            path.write_bytes(changed.getvalue())
        mutations=(
            ('source-tar-byte',corrupt_tar),
            ('measurement-semantics',lambda source,reports: (lambda path,obj:(obj.update(status='cost-failed'),path.write_text(json.dumps(obj))))(reports/'measurement.json',json.loads((reports/'measurement.json').read_text()))),
            ('rust-case-log',lambda source,reports: (reports/'rust-cases'/'0-case.log').write_text('1 failed; 0 passed\n')),
            ('lifecycle-status',lambda source,reports: (lambda path,obj:(obj.update(status='failed'),path.write_text(json.dumps(obj))))(reports/'saga-lifecycle2-result.json',json.loads((reports/'saga-lifecycle2-result.json').read_text()))),
        )
        for label,mutate in mutations:
            with self.subTest(corruption=label),tempfile.TemporaryDirectory() as raw:
                root=Path(raw);a,p=self.admission(run=91234567890,job=91234567891)
                source,reports,_=self.synthetic_report_graph(root,a,p)
                mutate(source,reports)
                with self.assertRaises(c.Refusal):c.initial_inspector_reports(a,p,source,reports)

    def test_initial_wheel_reuse_does_not_substitute_for_independent_cli_source(self):
        body=inspect.getsource(c.execute_candidate)
        self.assertIn('initial_inspector_material(a,source,retained/',body)
        self.assertIn('initial_or_produced_raw(a,source,rawdir,command,initial_raw,deadline)',body)
        self.assertIn('standalone_cli_source(a,work,command)',body)
        self.assertNotIn('initial-inspector-embedded-cli-mode',body)

    def test_registration_remains_default_off_and_registry_empty(self):
        workflow=json.loads((ROOT/'.github/workflows/core-successor-qualification.yml').read_text())
        registry=json.loads((ROOT/c.REGISTRY_PATH).read_text())
        self.assertEqual(set(workflow['on']),{'workflow_dispatch'})
        self.assertFalse(workflow['on']['workflow_dispatch']['inputs']['admitted']['default'])
        self.assertEqual(workflow['permissions'],{'contents':'read','actions':'read'})
        self.assertEqual(registry,{'profile':c.REGISTRY,'admissions':[]})


class CustodyTests(unittest.TestCase):
    def test_exact_roster_and_mutations(self):
        with tempfile.TemporaryDirectory() as raw:
            root=Path(raw);(root/'one').write_bytes(b'original');pins={'one':hashlib.sha256(b'original').hexdigest()}
            c.inventory(root,pins)
            (root/'extra').write_bytes(b'x')
            with self.assertRaises(c.Refusal):c.inventory(root,pins)
            (root/'extra').unlink();(root/'one').write_bytes(b'changed')
            with self.assertRaises(c.Refusal):c.inventory(root,pins)
            (root/'one').unlink();(root/'one').symlink_to('/etc/passwd')
            with self.assertRaises(c.Refusal):c.inventory(root,pins)
    def test_full_archive_bytes_modes_and_missing_extra(self):
        expected={'a':('100644',b'x'),'bin':('100755',b'y'),'link':('120000',b'a')}
        def archive(mutate=None):
            data=io.BytesIO()
            with tarfile.open(fileobj=data,mode='w',format=tarfile.PAX_FORMAT,pax_headers={'comment':'1'*40}) as t:
                for name,(mode,body) in expected.items():
                    if mutate=='missing' and name=='bin':continue
                    i=tarfile.TarInfo('umf-test/'+name);i.mode={'100644':0o664,'100755':0o775,'120000':0o777}[mode]
                    if mode=='120000':i.type=tarfile.SYMTYPE;i.linkname=body.decode();t.addfile(i)
                    else:i.size=len(body);t.addfile(i,io.BytesIO(b'z' if mutate=='bytes' else body))
                    if mutate=='duplicate':t.addfile(i,io.BytesIO(body) if mode!='120000' else None)
            return data.getvalue()
        roster={k:(mode,c.git_blob(body)) for k,(mode,body) in expected.items()}
        c.archive_correspondence(io.BytesIO(archive()),roster,'1'*40,'umf-test/')
        for mutation in ('missing','bytes','duplicate'):
            with self.subTest(mutation=mutation),self.assertRaises(c.Refusal):c.archive_correspondence(io.BytesIO(archive(mutation)),roster,'1'*40,'umf-test/')
    def test_original_actions_provenance(self):
        a=fixture();p=material(a)
        run={'id':123,'run_attempt':1,'head_sha':'b'*40,'path':p['workflow'],'event':'workflow_dispatch','repository':{'full_name':'DocumentDrivenDX/umf','id':1382276802,'owner':{'id':273466046}},'status':'completed','conclusion':'success'}
        upload={'name':c.UPLOAD_STEP,'status':'completed','conclusion':'success','started_at':'2026-11-04T00:00:30Z','completed_at':'2026-11-04T00:01:30Z'}
        job={'id':456,'run_id':123,'run_attempt':1,'head_sha':'b'*40,'name':'linux','labels':['ubuntu-24.04'],'steps':[upload],'status':'completed','conclusion':'success','started_at':'2026-11-04T00:00:00Z','completed_at':'2026-11-04T00:02:00Z'}
        artifact={'name':'core-successor-linux-123-1','id':789,'expired':False,'created_at':'2026-11-04T00:01:00Z','digest':'sha256:'+'a'*64,'workflow_run':{'id':123,'head_sha':'b'*40}}
        c.provenance(p,run,job,artifact,a)
        for name,obj,key,value in [('run',run,'head_sha','0'*40),('job',job,'run_attempt',True),('job',job,'run_attempt',2),('job',job,'name','macos'),('job',job,'labels',['macos-15']),('job',job,'head_sha','3'*40),('job',job,'steps',[]),('job',job,'steps',[{**upload,'conclusion':'failure'}]),('artifact',artifact,'created_at','2026-11-04T00:03:00Z'),('artifact',artifact,'expired',True),('run',run,'conclusion','failure')]:
            b=copy.deepcopy(obj);b[key]=value
            with self.subTest(name=name,key=key),self.assertRaises(c.Refusal):c.provenance(p,b if name=='run' else run,b if name=='job' else job,b if name=='artifact' else artifact,a)
    def test_loaded_ownership_and_normal_resolver_byte_identity(self):
        with tempfile.TemporaryDirectory() as raw:
            root=Path(raw);package=root/'site/umf';package.mkdir(parents=True)
            c.loaded_ownership(package,root/'site',package/'native.so',package/'rust_codegen.py')
            for native,compiler in [(root/'foreign.so',package/'rust_codegen.py'),(package/'native.so',root/'compiler.py')]:
                with self.assertRaises(c.Refusal):c.loaded_ownership(package,root/'site',native,compiler)
            archive=root/'original.whl';archive.write_bytes(b'archive')
            report={'install':[{'metadata':{'name':'umf-core','version':'7.8.6'},'download_info':{'url':archive.as_uri(),'archive_info':{'hashes':{'sha256':c.digest(archive)}}}}]}
            c.resolver_identity(report,{'umf-core':archive},'7.8.6')
            for field,value in [('url','https://pypi.org/other.whl'),('url',(root/'other.whl').as_uri()),('archive_info',{'hashes':{'sha256':'0'*64}})]:
                b=copy.deepcopy(report);b['install'][0]['download_info'][field]=value
                with self.subTest(field=field,value=value),self.assertRaises(c.Refusal):c.resolver_identity(b,{'umf-core':archive},'7.8.6')
            b=copy.deepcopy(report);b['install'].append(b['install'][0])
            with self.assertRaises(c.Refusal):c.resolver_identity(b,{'umf-core':archive},'7.8.6')
    def test_deep_receipt_types_and_failed_required_gates(self):
        a=fixture();r=c.empty_receipt(a,context(a));r['status']='passed';r['steps']={k:{'status':'passed','evidence':{'sha256':'a'*64,'path':'observed.json'}} for k in c.GATES};r['inspection']={cell:deep_report(a,cell) for cell in c.CELLS}
        c.aggregate(r,a)
        for key,value in [('calls',True),('cases',16),('maximumWork',1000001),('coldConstructors',True),('coldConstructors',50),('coldPerCall',False),('runtime',{'cell':'direct-3.11.17','python':'3.13.16','implementation':'cpython','executable_sha256':'d'*64}),('constructorPassed',1),('custodyPreserved','true'),('profile','shallow'),('source',{'commit':'0'*40,'tree':'2'*40})]:
            b=copy.deepcopy(r);b['inspection']['direct-3.11.17'][key]=value
            with self.subTest(key=key),self.assertRaises(c.Refusal):c.aggregate(b,a)
        for k in c.GATES:
            b=copy.deepcopy(r);b['steps'][k]['status']='failed'
            with self.subTest(gate=k),self.assertRaises(c.Refusal):c.aggregate(b,a)
        missing=copy.deepcopy(r);del missing['inspection']['rebuilt-3.13.16']
        with self.assertRaises(c.Refusal):c.aggregate(missing,a)
        b=copy.deepcopy(r);del b['inspection']['direct-3.11.17']['native_sha256']
        with self.assertRaises(c.Refusal):c.aggregate(b,a)


class OrchestrationTests(unittest.TestCase):
    def test_complete_mock_success_failure_and_missing_only(self):
        a=fixture();ctx=context(a);seen=[]
        def run(gate):seen.append(gate);return {'status':'passed','evidence':{'sha256':'a'*64,'path':'observed.json'}}
        def finish(receipt):return True
        r=c.orchestrate(a,ctx,run,finish);self.assertEqual(seen,list(c.GATES));self.assertEqual(r['status'],'passed');self.assertFalse(r['releaseQualified'])
        seen.clear()
        def fail(gate):
            seen.append(gate)
            if gate=='wheel':raise c.Refusal('test failure')
            return run(gate)
        r=c.orchestrate(a,ctx,fail,finish);self.assertEqual(r['status'],'failed');self.assertIn('wheel',r['steps']);self.assertNotIn('sdk',r['steps'])
        prior=c.empty_receipt(a,ctx);prior['steps']={'common':{'status':'passed','evidence':{'sha256':'a'*64,'path':'observed.json'}}}
        seen.clear();r=c.orchestrate(a,ctx,run,finish,prior);self.assertNotIn('common',seen);self.assertEqual(r['steps']['common']['original'],c.original_context(ctx))
        prior['source']['commit']='f'*40
        with self.assertRaises(c.Refusal):c.orchestrate(a,ctx,run,finish,prior)
    def test_mocked_runtime_continuation_success_and_deep_failure(self):
        a=fixture();ctx=context(a)
        a['continuation']=material(a,'continuation')
        for corrupt in (False,True):
            with self.subTest(corrupt=corrupt),tempfile.TemporaryDirectory() as raw:
                root=Path(raw);out=root/'out';out.mkdir()
                args=c.parser().parse_args(['run','--root',str(root),'--controller',str(root),'--source',str(root),'--output',str(out)])
                def intake(admission,p,destination,proof_dir=None):
                    destination.mkdir();r=c.empty_receipt(a,ctx);r['status']='failed'
                    for gate in c.GATES:
                        f=destination/(gate+'.json');f.write_text('{}')
                        r['steps'][gate]={'status':'passed','evidence':{'path':f.name,'sha256':c.digest(f)}}
                    for cell in c.CELLS:
                        d=deep_report(a,cell)
                        if corrupt and cell=='rebuilt-3.13.16':d['calls']=True
                        (destination/('inspection-'+cell+'.json')).write_text(json.dumps(d))
                    (destination/'rebuild.json').write_text('{}');(destination/'component.json').write_text(json.dumps(r));return r
                with patch.object(c,'source_check'),patch.object(c,'checkout_identity'),patch.object(c,'original_material',side_effect=intake),patch.object(c,'validate_rebuild'),patch.object(c,'run_bounded') as producer,patch('platform.system',return_value='Linux'),patch('platform.machine',return_value='x86_64'):
                    result=c.execute_candidate(a,ctx,args)
                    self.assertEqual(result,2 if corrupt else 0);self.assertEqual(producer.call_count,4)
                actual=c.read(out/'retained/component.json');self.assertEqual(actual['status'],'failed' if corrupt else 'passed');self.assertFalse(actual['releaseQualified'])
    def test_wrong_live_source_and_tree_refuse(self):
        for bad in ('commit','tree'):
            def git(root,*argv):
                if argv[0]=='status':return ''
                return '0'*40 if (bad=='commit' and argv[-1]=='HEAD') or (bad=='tree' and argv[-1]=='HEAD^{tree}') else ('1'*40 if argv[-1]=='HEAD' else '2'*40)
            with self.subTest(field=bad),patch.object(c,'git',side_effect=git),self.assertRaises(c.Refusal):c.checkout_identity(Path('/unused'),fixture()['source'])
    def test_repeated_admission_never_replays_a_producer(self):
        a=fixture();ctx=context(a);title='core-successor:'+a['id']+':'+a['platform']
        with patch.object(c,'api',return_value={'workflow_runs':[{'id':123,'display_title':title}]}):c.no_replay(a['id'],ctx)
        for state in ('success','failure','in_progress'):
            with self.subTest(state=state),patch.object(c,'api',return_value={'workflow_runs':[{'id':122,'display_title':title,'conclusion':state}]}),self.assertRaises(c.Refusal):c.no_replay(a['id'],ctx)
        with patch.object(c,'api',return_value={'workflow_runs':[{'id':x,'display_title':'unrelated'} for x in range(100)]}),self.assertRaises(c.Refusal):c.no_replay(a['id'],ctx)
    def test_budget_and_failure_retention(self):
        a=fixture();times=iter([0,601]);r=c.orchestrate(a,context(a),lambda _:self.fail('budget must stop work'),lambda _:True,clock=lambda:next(times))
        self.assertEqual(r['status'],'failed');self.assertEqual(r['failure'],'budget-exhausted')
    def test_workflow_json_is_duplicate_sensitive_yaml_subset(self):
        w=c.loads((ROOT/c.WORKFLOW).read_text())
        self.assertEqual(set(w['on']),{'workflow_dispatch'});self.assertFalse(w['on']['workflow_dispatch']['inputs']['admitted']['default']);self.assertEqual(w['permissions'],{'contents':'read','actions':'read'})
        for job in w['jobs'].values():
            for step in job['steps']:
                if 'run' in step:
                    result=subprocess.run(['bash','-n'],input=step['run'],text=True,capture_output=True)
                    self.assertEqual(result.returncode,0,result.stderr)
        self.assertNotIn('matrix',json.dumps(w));self.assertNotIn('id-token',json.dumps(w));self.assertEqual(set(w['jobs']),{'linux','macos'})
        for job in w['jobs'].values():self.assertNotIn('strategy',job);self.assertIn("inputs.admitted == true",job['if']);self.assertTrue(any(x.get('if')=="always() && steps.retention.outputs.bounded == 'true'" and x.get('uses','').startswith('actions/upload-artifact@') for x in job['steps']))
    def test_cli_parser_and_recipe_forms(self):
        p=c.parser();a=p.parse_args(['authorize','--root','x','--controller','y','--id','z','--platform','linux-x86_64','--output','o']);self.assertEqual(a.operation,'authorize')
        commands=c.recipe_commands(fixture(),Path('/source'),Path('/out'))
        flat=json.dumps(commands);self.assertNotIn('--no-deps',flat);self.assertNotIn('locally_qualified',flat);self.assertIn('build:sdk',flat);self.assertIn('auditwheel',inspect.getsource(c.execute_candidate))
        for gate,rows in commands.items():
            for row in rows:self.assertIsInstance(row,list);self.assertTrue(all(isinstance(s,str) for s in row))
    def test_pipeline_never_calls_producer_for_unregistered_binding(self):
        a=fixture();ctx=context(a)
        with patch.object(c,'run_bounded',side_effect=AssertionError('producer reached')) as execute:
            with self.assertRaises(c.Refusal):c.admit({'profile':c.REGISTRY,'admissions':[]},a['id'],ctx)
            execute.assert_not_called()
    def test_mac_recipe_uses_common_sdist_without_direct_source_wheel(self):
        a=fixture();a['platform']='macos-arm64';commands=c.recipe_commands(a,Path('/source'),Path('/out'))
        self.assertEqual(commands['common'],[])
        self.assertNotIn('wheel',commands) # material-dependent argv are selected only after authenticated intake
        self.assertNotIn('<CORE_SDIST>',inspect.getsource(c.execute_candidate))
    def test_false_aggregate_and_fresh_final_check(self):
        a=fixture();ctx=context(a)
        run=lambda gate:{'status':'passed','evidence':{'path':gate+'.json','sha256':'a'*64}}
        r=c.orchestrate(a,ctx,run,lambda _:False);self.assertEqual(r['status'],'failed')
        prior=c.empty_receipt(a,ctx);prior['steps']={g:run(g) for g in c.GATES};seen=[]
        def observe(g):seen.append(g);return run(g)
        r=c.orchestrate(a,ctx,observe,lambda _:True,prior)
        self.assertEqual(seen,['job-setup','final-identity']);self.assertEqual(r['status'],'passed')
    def test_owned_deadline_failure_signals_only_its_child(self):
        child=Mock();child.pid=987654321;child.poll.return_value=None
        with tempfile.TemporaryDirectory() as raw,patch.object(c.subprocess,'Popen',return_value=child),patch.object(c.time,'monotonic',side_effect=[0,2]),patch.object(c.os,'killpg') as signal:
            with self.assertRaises(c.Refusal):c.run_bounded(['unused'],raw,{},1,Path(raw)/'log',100)
            signal.assert_called_once_with(987654321,c.signal.SIGTERM)
    def test_schema_and_empty_real_registry(self):
        schema=c.loads((ROOT/'qualification-inputs/core-successor-qualification.schema.json').read_text());self.assertEqual(schema['$schema'],'https://json-schema.org/draft/2020-12/schema');self.assertIn('receipt',schema['$defs'])
        def refs(value):
            if isinstance(value,dict):
                if '$ref' in value:self.assertIn(value['$ref'].split('/')[-1],schema['$defs'])
                for item in value.values():refs(item)
            elif isinstance(value,list):
                for item in value:refs(item)
        refs(schema)
        self.assertFalse(schema['$defs']['context']['additionalProperties'])
        self.assertEqual(set(schema['$defs']['inspections']['required']),set(c.CELLS))
        reg=c.loads((ROOT/c.REGISTRY_PATH).read_text());self.assertEqual(reg,{'profile':c.REGISTRY,'admissions':[]})

class ConsolidatedReviewTests(unittest.TestCase):
    def test_real_transport_namespace_for_current_parent(self):
        requests=[]
        class Response:
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read(self,n):return b'{"workflow_runs":[]}'
        class Opener:
            def open(self,request,timeout):requests.append(request.full_url);return Response()
        with patch.dict(os.environ,{'GH_TOKEN':'synthetic-only'}),patch.object(c.urllib.request,'build_opener',return_value=Opener()):
            c.no_replay(fixture()['id'],context(fixture()))
        self.assertEqual(requests,['https://api.github.com/repos/DocumentDrivenDX/umf/actions/workflows/core-successor-qualification.yml/runs?event=workflow_dispatch&per_page=100&page=1'])
    def test_each_vector_carrier_has_fresh_resources_and_constructor(self):
        made=[];engines=[];calls=[]
        corpus=[{'id':str(i),'request':{'document':{},'selected':[]},'expected':{'case':i}} for i in range(17)]
        def resources():
            item={'fresh':len(made)};made.append(item);return item
        class Engine:
            def __init__(self,res,**kwargs):engines.append(self);self.case=(len(engines)-1)//3;self.res=res;self.kwargs=kwargs
            def call(self,op,request):calls.append(self);return {'ok':True,'result':{'case':self.case}}
            def inspect_access_views(self,*args):calls.append(self);return {'case':self.case}
        counts=c.inspection_cases(corpus,resources,Engine)
        self.assertEqual(counts,{'cases':17,'calls':51,'coldConstructors':51})
        self.assertEqual(len({id(x) for x in made}),51);self.assertEqual(len({id(x) for x in engines}),51)
        self.assertTrue(all(x.kwargs=={'max_work':1000000,'resource_mode':'retained-native/1'} for x in engines))
    def test_required_four_consumer_cells(self):
        self.assertEqual(c.CELLS,{'direct-3.11.17':('direct','3.11.17'),'direct-3.13.16':('direct','3.13.16'),'rebuilt-3.11.17':('rebuilt','3.11.17'),'rebuilt-3.13.16':('rebuilt','3.13.16')})
    def test_tokenless_inspect_entrypoint_cannot_call_online_authorization(self):
        with tempfile.TemporaryDirectory() as raw:
            args=['controller','inspect','--root',raw,'--controller',raw,'--source',raw,'--id','test','--platform','linux-x86_64','--output',raw]
            with patch.object(sys,'argv',args),patch.object(c,'authorize',side_effect=AssertionError('online child authorization')) as online:
                self.assertEqual(c.main(),2);online.assert_not_called()


class EntrypointTransportTests(unittest.TestCase):
    """Real controller/API/authorization flow; only OS tools/native boundary fake."""
    def exercise(self,corrupt=None,original_members=None):
        with tempfile.TemporaryDirectory() as raw:
            root=Path(raw).resolve();P=root/'authority';Q=root/'controller';C=root/'source';out=root/'output'
            for d in (P,Q,C,out):d.mkdir()
            a=fixture();a['controller']['workflow_sha256']=hashlib.sha256((ROOT/c.WORKFLOW).read_bytes()).hexdigest()
            a['controller']['script_sha256']=hashlib.sha256((ROOT/'tools/qualify_core_successor.py').read_bytes()).hexdigest()
            for d in (P,Q):
                for name in (c.WORKFLOW,'tools/qualify_core_successor.py'):
                    p=d/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes((ROOT/name).read_bytes())
            inputs={'crates/umf-core/src/canonical_codegen_literals.rs':b'// synthetic literal DATA', 'Cargo.lock':b'lock','bun.lock':b'bun','spec/release.json':json.dumps({k:a['version'] for k in ('sdkVersion','pythonVersion','rustVersion','nodeVersion','codegenVersion')}).encode(),
                    'tests/rust-core/fixtures/access-inspection/cases.json':b'{"cases":[]}',
                    'python/src/umf/action_runtime_resource_manifest.json':b'{}',
                    'qualification-inputs/core-0.10.3-wheel-input-lock.json':b'{}'}
            inputs[c.COMPAT_CENSUS]=json.dumps({'installedFactory':{'publicControls':a['compatibility']['early'],'python':[{'cases':a['compatibility']['later']}],'legacyDisposition':{'historicalOnly':[c.HISTORICAL_COLD]}}}).encode()
            for name,path in c.RESOURCE_SOURCES.items():inputs[path]=b'{}';a['resources']['action_runtime_resources/'+name+'.json']=hashlib.sha256(b'{}').hexdigest()
            inputs[c.CURRENT_RESOURCES]=json.dumps({'literalData':{'sha256':hashlib.sha256(inputs['crates/umf-core/src/canonical_codegen_literals.rs']).hexdigest()},'resources':{n:{'path':v,'bytes':2,'sha256':hashlib.sha256(b'{}').hexdigest()} for n,v in c.RESOURCE_SOURCES.items()}}).encode()
            recipes=['tools/generate_codegen_resource_literals.py','python/hatch_build.py','python/umf_codegen/hatch_build.py','tools/verify_python_artifacts.py','tools/qualify_python_release_wheel.py','scripts/package-sdk-rust-default.ts','scripts/package-sdk.py','scripts/test-sdk-install.ts','scripts/saga-portable/installed-browser.ts','scripts/test-native-sdk-install.mjs']
            a['inputs']={};a['recipes']={}
            for mapping,rows in [('inputs',inputs),('recipes',{n:b'# frozen synthetic recipe' for n in recipes})]:
                for name,body in rows.items():
                    p=C/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(body);a[mapping][name]=c.digest(p)
            a['compatibility']['census_sha256']=a['inputs'][c.COMPAT_CENSUS]
            # Original successful producer components, later consumers unobserved.
            p=material(a,'continuation');p.update(run=101,job=102,artifact=103,workflow_sha=('e' if original_members is not None else 'd')*40)
            prior_ctx=context(a);prior_ctx.update(run='101',job='102',workflow_sha='d'*40)
            previous=c.empty_receipt(a,prior_ctx);previous['status']='failed'
            members={}
            for gate in (('source','common','wheel') if corrupt in ('fresh-sdk','sdk-profile','browser-missing') else ('source','common','wheel','sdk')):
                body=json.dumps({'wheel':hashlib.sha256(b'selected').hexdigest()} if gate=='wheel' else {}).encode()
                members[gate+'.json']=body;previous['steps'][gate]={'status':'passed','evidence':{'path':gate+'.json','sha256':hashlib.sha256(body).hexdigest()}}
            if corrupt in ('resume-rebuild','bad-rebuild','missing-rebuild-receipt','bad-rebuild-receipt'):
                members['rebuilt/rebuilt.whl']=b'rebuilt'
                receipt=json.dumps({'artifacts':{'sdist_rebuilt':{'sha256':('0'*64 if corrupt=='bad-rebuild-receipt' else hashlib.sha256(b'rebuilt').hexdigest())}}}).encode()
                members['core-artifact.json']=receipt
                value={'raw_sha256':hashlib.sha256(b'raw').hexdigest(),'sdist_sha256':hashlib.sha256(b'sdist').hexdigest(),
                       'rebuilt_sha256':hashlib.sha256(b'rebuilt').hexdigest(),'receipt_sha256':hashlib.sha256(receipt).hexdigest()}
                if corrupt=='bad-rebuild':value['rebuilt_sha256']='0'*64
                if corrupt=='missing-rebuild-receipt':del members['core-artifact.json']
                members['rebuild.json']=json.dumps(value).encode()
                previous['steps']['rebuild']={'status':'passed','evidence':{'path':'rebuild.json','sha256':hashlib.sha256(members['rebuild.json']).hexdigest()}}
                previous['steps']['consumers']={'status':'failed'}
            members['component.json']=json.dumps(previous).encode()
            members['001.log']=b'ORIGINAL LOG - DO NOT TRUNCATE'
            members.update({'common/umf_core-7.8.6.tar.gz':b'sdist','common/umf_codegen-7.8.6-py3-none-any.whl':b'companion','common/umf_codegen-7.8.6.tar.gz':b'codegen source','selected/core.whl':b'selected','raw/core.whl':b'raw','standalone-umf':b'standalone'})
            if corrupt=='partial-rebuild':
                members['rebuilt/partial.whl']=b'failed partial wheel'
                members['core-artifact.json']=b'{bad incomplete receipt'
                previous['steps']['rebuild']={'status':'failed'}
                members['component.json']=json.dumps(previous).encode()
            if original_members is not None:members=original_members
            zbytes=io.BytesIO()
            with zipfile.ZipFile(zbytes,'w') as z:
                for name,body in members.items():z.writestr(name,body)
            blob=zbytes.getvalue();p['sha256']=hashlib.sha256(blob).hexdigest();p['members']={n:hashlib.sha256(b).hexdigest() for n,b in members.items()};a['continuation']=None if corrupt in ('fresh','fail-after-rebuild') else p
            if corrupt=='retention':a['bounds']['artifact_bytes']=65536
            reg=P/c.REGISTRY_PATH;reg.parent.mkdir(parents=True);reg.write_text(json.dumps(registry(a)))
            env={'GITHUB_REPOSITORY':'DocumentDrivenDX/umf','GITHUB_REPOSITORY_ID':'1382276802','GITHUB_REPOSITORY_OWNER_ID':'273466046','GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_REF':'refs/heads/main','GITHUB_WORKFLOW_REF':'DocumentDrivenDX/umf/'+c.WORKFLOW+'@refs/heads/main','GITHUB_WORKFLOW_SHA':'e'*40,'GITHUB_RUN_ID':'123','GITHUB_RUN_ATTEMPT':'1','SUCCESSOR_JOB_NAME':'linux','SUCCESSOR_ADMITTED':'true','GH_TOKEN':'synthetic-read-token-not-real','GITHUB_TOKEN':'synthetic-other','ACTIONS_RUNTIME_TOKEN':'synthetic-artifact','ACTIONS_ID_TOKEN_REQUEST_TOKEN':'synthetic-oidc','ACTIONS_ID_TOKEN_REQUEST_URL':'https://synthetic.invalid','PATH':os.environ.get('PATH','')}
            current_run=101 if corrupt=='fail-after-rebuild' else 123
            current_job=102 if corrupt=='fail-after-rebuild' else 456
            env['GITHUB_RUN_ID']=str(current_run)
            requests=[];commands=[];children=[];browser_ready=[False];prerequisites=set()
            def run_meta(run,head,conclusion):return {'id':run,'run_attempt':1,'head_sha':head,'path':c.WORKFLOW,'event':'workflow_dispatch','repository':{'id':1382276802,'full_name':c.REPO,'owner':{'id':273466046}},'status':'completed','conclusion':conclusion}
            upload={'name':c.UPLOAD_STEP,'status':'completed','conclusion':'success','started_at':'2026-11-04T00:00:30Z','completed_at':'2026-11-04T00:01:30Z'}
            def job_meta(job,run,head):return {'id':job,'run_id':run,'run_attempt':1,'head_sha':head,'name':'linux','labels':['ubuntu-24.04'],'status':'completed','conclusion':'failure','steps':[upload],'started_at':'2026-11-04T00:00:00Z','completed_at':'2026-11-04T00:02:00Z'}
            responses={'actions/runs/123/attempts/1':run_meta(123,'e'*40,'success'),
                       'actions/runs/123/attempts/1/jobs':{'jobs':[job_meta(456,123,'e'*40)]},
                       'actions/workflows/core-successor-qualification.yml/runs?event=workflow_dispatch&per_page=100&page=1':{'workflow_runs':[{'id':123,'display_title':'core-successor:'+a['id']+':linux-x86_64'}]},
                       'actions/runs/101/attempts/1':run_meta(101,p['workflow_sha'],'failure'),'actions/jobs/102':job_meta(102,101,p['workflow_sha']),
                       'actions/artifacts/103':{'id':103,'name':'core-successor-linux-101-1','expired':False,'digest':'sha256:'+p['sha256'],'workflow_run':{'id':101,'head_sha':p['workflow_sha']},'created_at':'2026-11-04T00:01:00Z'},'actions/artifacts/103/zip':blob}
            if corrupt=='fail-after-rebuild':
                responses['actions/runs/101/attempts/1']=run_meta(101,'e'*40,'failure')
                responses['actions/runs/101/attempts/1/jobs']={'jobs':[job_meta(102,101,'e'*40)]}
                responses['actions/workflows/core-successor-qualification.yml/runs?event=workflow_dispatch&per_page=100&page=1']={'workflow_runs':[{'id':101,'display_title':'core-successor:'+a['id']+':linux-x86_64'}]}
            if corrupt=='rerun':
                env['GITHUB_RUN_ATTEMPT']='2'
                for suffix in ('','/jobs'):
                    old=responses.pop('actions/runs/123/attempts/1'+suffix)
                    if suffix:old['jobs'][0]['run_attempt']=2
                    else:old['run_attempt']=2
                    responses['actions/runs/123/attempts/2'+suffix]=old
            if corrupt=='upload':responses['actions/jobs/102']['steps']=[{**upload,'conclusion':'failure'}]
            class Response:
                def __init__(self,body):self.body=body
                def __enter__(self):return self
                def __exit__(self,*args):pass
                def read(self,n):
                    chunk=self.body[:n];self.body=self.body[n:];return chunk
            class Opener:
                def open(self,request,timeout):
                    path=request.full_url.split('/umf/',1)[1];requests.append((path,request.get_header('Authorization')))
                    body=responses[path];return Response(body if isinstance(body,bytes) else json.dumps(body).encode())
            def git(d,*args):
                if args[0]=='status':return ''
                head,tree={str(P):('e'*40,'f'*40),str(Q):('3'*40,'4'*40),str(C):('1'*40,'2'*40)}[str(d)]
                return tree if args[-1]=='HEAD^{tree}' else head
            def git_bytes(argv,**kwargs):
                if argv[:3]==['git','ls-tree','-r']:
                    return b''.join(b'100644 blob '+c.git_blob(p.read_bytes()).encode()+b'\t'+p.relative_to(C).as_posix().encode()+b'\0' for p in sorted(C.rglob('*')) if p.is_file())
                self.assertEqual(argv,['git','-C',str(P),'show','HEAD:'+c.REGISTRY_PATH]);return reg.read_bytes()
            def native_boundary(admission,ctx,args):
                children.append(args.cell);self.assertFalse(any(os.environ.get(k) for k in ('GH_TOKEN','GITHUB_TOKEN','ACTIONS_RUNTIME_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN','ACTIONS_ID_TOKEN_REQUEST_URL')))
                d=deep_report(a,args.cell);d['wheel_sha256']=c.digest(c.one(out/('retained/selected' if c.CELLS[args.cell][0]=='direct' else 'retained/rebuilt'),'*.whl'))
                d['compatibility']=c.read(out/'retained'/('compatibility-'+args.cell+'.json'))
                if corrupt=='rebuilt51' and args.cell=='rebuilt-3.13.16':d['calls']=50
                if corrupt=='retention' and args.cell=='rebuilt-3.13.16':(out/'retained/overflow.json').write_bytes(b'x'*131072)
                (out/'retained'/('inspection-'+args.cell+'.json')).write_text(json.dumps(d));return 0
            def execute(argv,cwd,child_env,seconds,log,maximum):
                commands.append(argv);Path(log).write_text('synthetic command stdout\n')
                if argv==['bun','install','--frozen-lockfile']:
                    if corrupt=='setup-failure':raise c.Refusal('synthetic-fresh-runner-bun-install-failed')
                    prerequisites.add('bun');return
                if argv==['cargo','fetch','--locked']:prerequisites.add('cargo');return
                if argv[:3]==['cargo','install','wasm-bindgen-cli']:prerequisites.add('wasm');return
                if argv[-2:]==['build==1.3.0','hatchling==1.27.0']:prerequisites.add('python');return
                # A fresh-runner OS boundary has no inherited node_modules,
                # Cargo cache, wasm executable, or Python build backend.
                if prerequisites!={'bun','cargo','wasm','python'}:
                    raise c.Refusal('synthetic-fresh-runner-missing-prerequisites')
                if argv[:2]==['git','archive']:
                    prefix=next(v.split('=',1)[1] for v in argv if v.startswith('--prefix='));target=Path(next(v.split('=',1)[1] for v in argv if v.startswith('--output=')))
                    with tarfile.open(target,'w',format=tarfile.PAX_FORMAT,pax_headers={'comment':a['source']['commit']}) as archive:
                        for path in sorted(C.rglob('*')):
                            if path.is_file():
                                body=path.read_bytes();info=tarfile.TarInfo(prefix+path.relative_to(C).as_posix());info.mode=0o664;info.size=len(body);archive.addfile(info,io.BytesIO(body))
                    return
                if '--outdir' in argv and '-m' in argv and 'build' in argv:
                    target=Path(argv[argv.index('--outdir')+1]);target.mkdir(parents=True,exist_ok=True)
                    if argv[-1]=='python/umf_codegen':
                        (target/'umf_codegen-7.8.6-py3-none-any.whl').write_bytes(b'companion');(target/'umf_codegen-7.8.6.tar.gz').write_bytes(b'codegen source')
                    elif '--sdist' in argv:(target/'umf_core-7.8.6.tar.gz').write_bytes(b'sdist')
                    else:
                        (target/'core.whl').write_bytes(b'raw')
                        cli=out/'owned/target/release/umf';cli.parent.mkdir(parents=True,exist_ok=True);cli.write_bytes(b'standalone')
                    return
                if argv[:2]==['auditwheel','repair']:
                    target=Path(argv[argv.index('--wheel-dir')+1]);target.mkdir();(target/'core.whl').write_bytes(b'repaired');return
                if 'tools/qualify_python_release_wheel.py' in argv:
                    # Check the REAL frozen argparse interface rather than
                    # silently accepting controller-invented recipe switches.
                    helper=ROOT/'tools/qualify_python_release_wheel.py'
                    self.assertEqual(c.digest(helper),'e9a53ef03d3968c23971e69c344db1eb9ea2c74c9848d70d84c52fc59a13f54e')
                    text=helper.read_text()
                    for option in argv:
                        if option.startswith('--'):self.assertIn('"'+option+'"',text)
                    target=Path(argv[argv.index('--output-wheel-directory')+1]);target.mkdir();(target/'core.whl').write_bytes(b'selected')
                    Path(argv[argv.index('--receipt')+1]).write_text('{}');return
                if argv==['bun','run','build:sdk']:
                    target=C/'.cache/sdk-distribution';target.mkdir(parents=True);(target/'umf-sdk.tgz').write_bytes(b'sdk')
                    (target/'manifest.json').write_text('{}');(target/'receipt.json').write_text('{}');return
                if argv==['bunx','playwright','install','--with-deps','chromium']:
                    if corrupt=='browser-missing':raise c.Refusal('synthetic-browser-acquisition-failed')
                    browser_ready[0]=True;return
                if argv==['bun','scripts/test-sdk-install.ts']:
                    phase=child_env.get('UMF_SDK_INSTALL_PHASE','full');self.assertIn(phase,('full','saga'))
                    target=Path(child_env['UMF_SDK_INSTALL_RETAIN_DIR']);target.mkdir()
                    text=(ROOT/'scripts/test-sdk-install.ts').read_text()
                    self.assertIn("installPhase==='full'?'umf.sdk-installed-archive-custody/2':'umf.sdk-installed-saga-custody/1'",text)
                    profile='umf.sdk-installed-archive-custody/2' if phase=='full' or corrupt=='sdk-profile' else 'umf.sdk-installed-saga-custody/1'
                    (target/'g03-sdk-install-custody.json').write_text(json.dumps({'profile':profile}));return
                if argv==['bun','scripts/saga-portable/installed-browser.ts']:
                    self.assertTrue(browser_ready[0],'fresh-host Chromium must be acquired first')
                    profile=c.read(Path(child_env['UMF_SDK_INSTALL_RETAIN_DIR'])/'g03-sdk-install-custody.json')['profile']
                    if profile!='umf.sdk-installed-saga-custody/1':raise c.Refusal('synthetic-frozen-browser-profile-refusal')
                    return
                if argv[:3]==['bun','scripts/saga-portable/other-hosts.ts','cli']:
                    cli=Path(child_env['UMF_SAGA_CLI'])
                    Path(child_env['UMF_SAGA_RESULT_PATH']).write_text(json.dumps({'cases':19,'passed':19,'host':'cli','artifacts':{'cliBinary':{'path':str(cli),'sha256':c.digest(cli)}}}));return
                if '--browser' in argv:self.assertTrue(browser_ready[0])

                if '--rebuilt-wheel-directory' in argv:
                    target=Path(argv[argv.index('--rebuilt-wheel-directory')+1])
                    helper=ROOT/'tools/verify_python_artifacts.py'
                    self.assertEqual(c.digest(helper),'0ce62ccf70e89e14f95e7679473c9d58c1662042081f4b9c5b0eb7809854b355')
                    function=next(n for n in ast.parse(helper.read_text()).body if isinstance(n,ast.FunctionDef) and n.name=='_rebuild_sdist_wheel')
                    # Execute the REAL frozen helper's mkdir/nonempty guard only;
                    # its compiler/extractor remainder stays outside pure tests.
                    guard=ast.Module(body=function.body[:2],type_ignores=[])
                    exec(compile(guard,str(helper),'exec'),{'output_dir':target})
                    (target/'rebuilt.whl').write_bytes(b'rebuilt')
                    Path(argv[argv.index('--receipt')+1]).write_text(json.dumps({'artifacts':{'sdist_rebuilt':{'sha256':c.digest(target/'rebuilt.whl')}}}));return
                if '-c' in argv:
                    target=Path(argv[-3]);version=argv[-2];cell=argv[-1]
                    target.write_text(json.dumps(deep_report(a,cell)['runtime']));return
                if any(x.startswith('--junitxml=') and 'compatibility-' in x for x in argv):
                    target=Path(next(x.split('=',1)[1] for x in argv if x.startswith('--junitxml=')))
                    names=[str(Path(x).relative_to(C)) for x in argv if x.startswith(str(C)+'/python/tests/')]
                    target.write_bytes(compatibility_xml(names));return
                if any(v.startswith('--junitxml=') for v in argv):
                    Path(next(v.split('=',1)[1] for v in argv if v.startswith('--junitxml='))).write_text('<testsuites><testsuite tests="1" failures="0" errors="0" skipped="0"/></testsuites>');return
                if argv[:3]==['bun','scripts/saga-portable/other-hosts.ts','python']:
                    allowed="['cli','python','python-rebuilt'].includes(hostId)"
                    self.assertIn(allowed,(ROOT/'scripts/saga-portable/other-hosts.ts').read_text())
                    self.assertIn(child_env['UMF_SAGA_HOST_ID'],('python','python-rebuilt'))
                    if child_env['UMF_SAGA_HOST_ID']=='python-rebuilt':self.assertEqual(Path(child_env['UMF_SAGA_PYTHON_SOURCE_ARCHIVE']).read_bytes(),b'sdist')
                    Path(child_env['UMF_SAGA_RESULT_PATH']).write_text(json.dumps({'cases':19,'passed':19,'hostId':child_env['UMF_SAGA_HOST_ID']}));return
                if 'install' in argv and '--report' in argv:
                    if corrupt=='fail-after-rebuild':raise c.Refusal('synthetic-consumer-failure-after-complete-rebuild')
                    self.assertIn('--no-compile',argv)
                    Path(argv[argv.index('--report')+1]).write_text('{}');return
                if '--receipt' in argv:
                    Path(argv[argv.index('--receipt')+1]).write_text(json.dumps({'native_sha256':'b'*64}));return
                if 'inspect' in argv:
                    self.assertNotIn('GH_TOKEN',child_env)
                    if corrupt=='context':Path(argv[argv.index('--offline-context')+1]).write_text('{}')
                    if corrupt in ('resigned-source','resigned-Q'):
                        target=Path(argv[argv.index('--offline-context')+1]);data=c.read(target)
                        data['source' if corrupt=='resigned-source' else 'controller']['commit']='f'*40
                        target.write_text(json.dumps(data));argv[argv.index('--offline-context-sha256')+1]=c.digest(target)
                    before=len(requests)
                    with patch.dict(os.environ,child_env,clear=True),patch.object(sys,'argv',[argv[3],*argv[4:]]):
                        rc=c.main()
                    self.assertEqual(len(requests),before,'tokenless child must not contact API')
                    if rc:raise c.Refusal('child-refused')
                    return
                if 'umf/_bin' in ' '.join(argv):return
                # The embedded CLI is a tool boundary too, not a real executable.
            # Fake only wheel extraction at CLI tool boundary; actual transport
            # ZIP intake above still uses the REAL ZipFile implementation.
            real_zip=c.zipfile.ZipFile
            class Wheel:
                def __enter__(self):return self
                def __exit__(self,*args):pass
                def read(self,name):return b'synthetic embedded CLI'
            def archives(file,*args,**kwargs):
                return Wheel() if str(file).endswith('.whl') else real_zip(file,*args,**kwargs)
            argv=['controller','run','--root',str(P),'--controller',str(Q),'--source',str(C),'--id',a['id'],'--platform','linux-x86_64','--output',str(out)]
            with patch.dict(os.environ,env,clear=True),patch.object(c,'git',side_effect=git),patch.object(c.subprocess,'check_output',side_effect=git_bytes),patch.object(c.urllib.request,'build_opener',return_value=Opener()),patch.object(c,'run_bounded',side_effect=execute),patch.object(c,'inspect_installed',side_effect=native_boundary),patch.object(c.zipfile,'ZipFile',side_effect=archives),patch('platform.system',return_value='Linux'),patch('platform.machine',return_value='x86_64'),patch.object(sys,'argv',argv):
                status=c.main()
            if corrupt and corrupt not in ('fresh','fresh-sdk','resume-rebuild','partial-rebuild'):
                self.assertEqual(status,2)
                if corrupt=='fail-after-rebuild':
                    result=c.read(out/'retained/component.json')
                    self.assertEqual(result['steps']['rebuild']['status'],'passed')
                    self.assertEqual(result['steps']['consumers']['status'],'failed')
                    self.assertEqual((out/'retained/rebuilt/rebuilt.whl').read_bytes(),b'rebuilt')
                    self.assertEqual(len([cmd for cmd in commands if '--rebuilt-wheel-directory' in cmd]),1)
                    return {p.relative_to(out/'retained').as_posix():p.read_bytes() for p in (out/'retained').rglob('*') if p.is_file()}
                if corrupt=='setup-failure':
                    self.assertEqual(c.read(out/'retained/component.json')['steps']['job-setup']['status'],'failed');self.assertEqual(len(commands),1)
                if corrupt in ('bad-rebuild','missing-rebuild-receipt','bad-rebuild-receipt'):
                    self.assertEqual(children,[]);self.assertEqual(commands,[])
                if corrupt=='rerun':
                    self.assertEqual(commands,[]);self.assertEqual(c.read(out/'retained/failure.json')['reason'],'rerun-requires-fresh-reviewed-continuation-admission')
                if corrupt=='upload':
                    self.assertEqual(commands,[]);self.assertEqual(c.read(out/'retained/failure.json')['reason'],'original-upload-step-not-successful')
                elif corrupt=='context':
                    self.assertEqual(children,[]);self.assertEqual(c.read(out/'retained/failure.json')['reason'],'parent-context-hash')
                elif corrupt in ('resigned-source','resigned-Q'):
                    self.assertEqual(children,[]);self.assertEqual(c.read(out/'retained/failure.json')['reason'],'offline-Q-C-binding-differs')
                elif corrupt in ('sdk-profile','browser-missing'):
                    self.assertEqual(children,[]);self.assertEqual(c.read(out/'retained/component.json')['steps']['sdk']['status'],'failed')
                elif corrupt=='retention':
                    self.assertEqual(children,list(c.CELLS));marker=c.read(out/'retained/retention.json');self.assertFalse(marker['fullRetention'])
                    self.assertLessEqual(c.retention_size(out/'retained'),65536);self.assertTrue(c.verify_retention(out,65536))
                    self.assertEqual(next(v['sha256'] for v in marker['omitted'] if v['path']=='overflow.json'),hashlib.sha256(b'x'*131072).hexdigest())
                elif corrupt=='rebuilt51':
                    self.assertEqual(children,list(c.CELLS));self.assertEqual(c.read(out/'retained/component.json')['failure'],'deep-count-or-budget-differs')
            else:
                self.assertEqual(status,0,{'children':children,'failure':c.read(out/'retained/component.json')['failure'] if (out/'retained/component.json').exists() else c.read(out/'retained/failure.json')});self.assertEqual(children,list(c.CELLS))
                result=c.read(out/'retained/component.json');self.assertEqual(result['original']['workflow_sha'],'e'*40);self.assertEqual(result['controller']['commit'],'3'*40);self.assertEqual(result['source']['commit'],'1'*40)
                self.assertEqual(set(result['inspection']),set(c.CELLS));self.assertFalse(result['releaseQualified'])
                if a['continuation'] is not None and original_members is None:self.assertEqual((out/'retained/original/101-1-103/001.log').read_bytes(),b'ORIGINAL LOG - DO NOT TRUNCATE')
                self.assertNotEqual((out/'retained/current/123-1/001.log').read_bytes(),b'ORIGINAL LOG - DO NOT TRUNCATE')
                self.assertTrue(c.verify_retention(out))
                self.assertEqual(len([cmd for cmd in commands if '--report' in cmd]),4)
                self.assertEqual(len([cmd for cmd in commands if 'freeze' in cmd]),4)
                self.assertEqual(prerequisites,{'bun','cargo','wasm','python'})
                rebuilds=[cmd for cmd in commands if '--rebuilt-wheel-directory' in cmd]
                self.assertEqual(len(rebuilds),0 if corrupt=='resume-rebuild' else 1)
                if corrupt=='resume-rebuild':
                    self.assertEqual((out/'retained/rebuilt/rebuilt.whl').read_bytes(),b'rebuilt')
                    self.assertEqual(result['steps']['rebuild']['original']['run'],'101')
            return status
    def test_actual_failed_consumer_flow_resumes_its_completed_rebuild_bytes(self):
        original=self.exercise('fail-after-rebuild')
        self.exercise('resume-rebuild',original)
    def test_partial_failed_rebuild_is_not_restored_into_helper_directory(self):self.exercise('partial-rebuild')
    def test_resigned_wrong_rebuild_receipt_wheel_hash_refuses(self):self.exercise('bad-rebuild-receipt')
    def test_fresh_runner_continuation_acquires_all_prerequisites(self):self.exercise()
    def test_fresh_runner_setup_failure_refuses_before_remaining_gates(self):self.exercise('setup-failure')
    def test_failed_consumers_resume_after_authenticated_nonempty_rebuild(self):self.exercise('resume-rebuild')
    def test_resigned_wrong_rebuild_hash_refuses_before_commands(self):self.exercise('bad-rebuild')
    def test_missing_completed_rebuild_receipt_refuses_before_commands(self):self.exercise('missing-rebuild-receipt')
    def test_complete_entrypoint_real_transport_offline_children_and_four_cells(self):self.exercise()
    def test_rerun_attempt_two_is_refused_by_actual_parent_transport_flow(self):self.exercise('rerun')
    def test_fresh_source_common_wheel_SDK_and_consumer_entrypoint(self):self.exercise('fresh')
    def test_unseeded_SDK_entrypoint_checks_frozen_profiles_and_acquisition(self):self.exercise('fresh-sdk')
    def test_frozen_browser_profile_refuses_wrong_installer_receipt(self):self.exercise('sdk-profile')
    def test_browser_acquisition_failure_retains_failed_SDK_gate(self):self.exercise('browser-missing')
    def test_entrypoint_final_ceiling_includes_failure_and_omission_receipts(self):self.exercise('retention')
    def test_bad_original_upload_step_stops_entrypoint_before_commands(self):self.exercise('upload')
    def test_changed_parent_context_refuses_tokenless_child(self):self.exercise('context')
    def test_bad_rebuilt313_deep_result_fails_complete_entrypoint(self):self.exercise('rebuilt51')
    def test_resigned_parent_source_cannot_authorize_itself(self):self.exercise('resigned-source')
    def test_resigned_parent_Q_cannot_authorize_itself(self):self.exercise('resigned-Q')


class AmpereReviewTests(unittest.TestCase):
    def test_same_run_attempt_two_refuses_before_transport(self):
        ctx=context(fixture());ctx['attempt']='2'
        with patch.object(c,'api',return_value={'workflow_runs':[{'id':123,'display_title':'core-successor:'+fixture()['id']+':linux-x86_64'}]}) as transport:
            with self.assertRaises(c.Refusal):c.no_replay(fixture()['id'],ctx)
            transport.assert_not_called()
    def test_real_saga_contract_in_all_cells(self):
        source=(ROOT/'scripts/saga-portable/other-hosts.ts').read_text()
        self.assertIn("['cli','python','python-rebuilt'].includes(hostId)",source)
        for cell,(kind,_) in c.CELLS.items():
            env=c.saga_environment(cell,Path('/python'),Path('/wheel'),Path('/sdist'),Path('/report'))
            self.assertEqual(env['UMF_SAGA_HOST_ID'],'python' if kind=='direct' else 'python-rebuilt')
            if kind=='rebuilt':self.assertEqual(env['UMF_SAGA_PYTHON_SOURCE_ARCHIVE'],'/sdist')
            self.assertEqual(env['UMF_SAGA_RESULT_PATH'],'/report')
    def test_actual_sdk_phase_and_browser_recipe_contract(self):
        installer=(ROOT/'scripts/test-sdk-install.ts').read_text();browser=(ROOT/'scripts/saga-portable/installed-browser.ts').read_text()
        self.assertIn("installPhase==='full'?'umf.sdk-installed-archive-custody/2':'umf.sdk-installed-saga-custody/1'",installer)
        self.assertIn("custody.profile!=='umf.sdk-installed-saga-custody/1'",browser)
        steps=c.sdk_recipe(Path('/out'))
        phases=[(argv,env) for argv,env in steps if argv==['bun','scripts/test-sdk-install.ts']]
        self.assertEqual([e['UMF_SDK_INSTALL_PHASE'] for _,e in phases],['full','saga'])
        self.assertNotEqual(phases[0][1]['UMF_SDK_INSTALL_RETAIN_DIR'],phases[1][1]['UMF_SDK_INSTALL_RETAIN_DIR'])
        acquire=next(i for i,(argv,_) in enumerate(steps) if argv==['bunx','playwright','install','--with-deps','chromium'])
        browser_steps=[i for i,(argv,_) in enumerate(steps) if '--browser' in argv or argv==['bun','scripts/saga-portable/installed-browser.ts']]
        self.assertTrue(browser_steps and all(acquire<i for i in browser_steps))
        actual=next(env for argv,env in steps if argv==['bun','scripts/saga-portable/installed-browser.ts'])
        self.assertEqual(actual['UMF_SDK_INSTALL_RETAIN_DIR'],phases[1][1]['UMF_SDK_INSTALL_RETAIN_DIR'])
    def test_final_retention_counts_json_logs_and_its_own_receipt(self):
        with tempfile.TemporaryDirectory() as raw:
            out=Path(raw);r=out/'retained';r.mkdir()
            data={'large.json':b'j'*5000,'native.log':b'l'*5000,'history.txt':b't'*5000}
            for name,body in data.items():(r/name).write_bytes(body)
            proof=c.finalize_retention(out,4096)
            self.assertLessEqual(sum(p.stat().st_size for p in r.rglob('*') if p.is_file()),4096)
            self.assertFalse(proof['fullRetention']);self.assertEqual(proof['finalRetainedBytes'],sum(p.stat().st_size for p in r.rglob('*') if p.is_file()))
            for entry in proof['omitted']:
                self.assertEqual(entry['sha256'],hashlib.sha256(data[entry['path']]).hexdigest())
            self.assertEqual({e['path'] for e in proof['omitted']},set(data))
            self.assertTrue(c.verify_retention(out,4096))
    def test_omission_index_larger_than_cap_is_honestly_hash_addressed(self):
        with tempfile.TemporaryDirectory() as raw:
            out=Path(raw);root=out/'retained';root.mkdir()
            for i in range(100):(root/('%03d.json'%i)).write_bytes(b'{}')
            proof=c.finalize_retention(out,4096)
            self.assertFalse(proof['fullRetention']);self.assertFalse(proof['omissionIndex']['retained'])
            index=out/'owned/retention-index/omission-index.jsonl'
            self.assertEqual(proof['omissionIndex']['sha256'],c.digest(index));self.assertEqual(proof['omissionIndex']['count'],100)
            self.assertTrue(c.verify_retention(out,4096));self.assertLessEqual(c.retention_size(root),4096)
    def test_command_log_is_exclusive_even_if_caller_counter_restarts(self):
        with tempfile.TemporaryDirectory() as raw:
            target=Path(raw)/'001.log';target.write_bytes(b'original')
            with patch.object(c.subprocess,'Popen',side_effect=AssertionError('must not launch')):
                with self.assertRaises(FileExistsError):c.run_bounded(['unused'],raw,{},1,target,100)
            self.assertEqual(target.read_bytes(),b'original')



class CoupledExtensionTests(unittest.TestCase):
    """Synthetic materials and API only; never native or real GitHub evidence."""
    def prepared(self):
        a=fixture();a.update(id='aggregate-fixture',purpose='candidate-aggregate',components={},roster={})
        components=[];responses={};member_sets={}
        common={'core-sdist':('umf_core-7.8.6.tar.gz',b'common source'),
                'codegen-wheel':('umf_codegen-7.8.6-py3-none-any.whl',b'pure wheel'),
                'codegen-sdist':('umf_codegen-7.8.6.tar.gz',b'pure source'),
                'source':('umf-v7.8.6.tar',b'synthetic full Git archive')}
        for index,platform in enumerate(c.PLATFORMS):
            comp=fixture();comp.update(id='component-'+str(index),platform=platform)
            if index:comp['common']=material(comp)
            components.append(comp);members={}
            for role,(name,body) in common.items():
                path=('common/' if role!='source' else '')+name;members[path]=body
                if not index:a['roster'][role]={'name':name,'platform':'linux-x86_64','member':path,'sha256':hashlib.sha256(body).hexdigest(),'bytes':len(body),'mode':0o644}
            buf=io.BytesIO();cli=('embedded-'+platform).encode()
            with zipfile.ZipFile(buf,'w') as archive:
                info=zipfile.ZipInfo('umf/_bin/umf');info.external_attr=0o100755<<16;archive.writestr(info,cli)
            bodies={'core-wheel':('core-'+platform+'.whl',buf.getvalue()),
                    'standalone-cli':('umf-'+platform,('standalone-'+platform).encode()),
                    'sdk':('sdk-'+platform+'.tgz',('sdk-'+platform).encode()),
                    'sdk-manifest':('sdk-'+platform+'.json',json.dumps({'syntheticPlatform':platform}).encode())}
            for role,(name,body) in bodies.items():
                members['payload/'+name]=body
                a['roster'][platform+'/'+role]={'name':name,'platform':platform,'member':'payload/'+name,'sha256':hashlib.sha256(body).hexdigest(),'bytes':len(body),'mode':0o755 if role=='standalone-cli' else 0o644}
            def doc(name,value):members[name]=(json.dumps(value)+'\n').encode();return {'path':name,'sha256':hashlib.sha256(members[name]).hexdigest()}
            cli_proof=doc('embedded-cli19.json',{'cases':19,'passed':19,'host':'cli','artifacts':{'cliBinary':{'sha256':hashlib.sha256(cli).hexdigest()}}})
            standalone=doc('standalone-cli19.json',{'cases':19,'passed':19,'host':'cli','artifacts':{'cliBinary':{'sha256':a['roster'][platform+'/standalone-cli']['sha256']}}})
            ctx=context(comp);ctx.update(run=str(123+index),job=str(456+index))
            r=c.empty_receipt(comp,ctx);r['status']='passed';r['inspection']={cell:deep_report(comp,cell) for cell in c.CELLS}
            values={'source':{'tar_sha256':a['roster']['source']['sha256'],'allModesSymlinksAndBlobBytesMatch':True},
                    'wheel':{'wheel':a['roster'][platform+'/core-wheel']['sha256'],'standaloneCLI':a['roster'][platform+'/standalone-cli']['sha256']},
                    'sdk':{'archive_sha256':a['roster'][platform+'/sdk']['sha256'],'manifest_sha256':a['roster'][platform+'/sdk-manifest']['sha256'],'platform':platform,'checks':{key:True for key in c.SDK_CHECKS}},
                    'consumers':{'normalResolverCells':list(c.CELLS),'embeddedCLI19':cli_proof,'standaloneCLI19':standalone}}
            cells={}
            for cell in c.CELLS:
                deep=r['inspection'][cell]
                deep['wheel_sha256']=a['roster'][platform+'/core-wheel']['sha256']
                deep['compatibility']=compatibility_report(comp,deep['wheel_sha256'],deep['native_sha256'],c.original_context(ctx))
                for group in ('early','later'):
                    name='compatibility-'+group+'-'+cell+'.xml';raw=compatibility_xml(comp['compatibility'][group]);members[name]=raw
                    # doc() authenticates exact original member bytes.
                    deep['compatibility']['groups'][group]['xml_sha256']=hashlib.sha256(raw).hexdigest()
                doc('compatibility-'+cell+'.json',deep['compatibility'])
                record={'status':'passed','distribution_version':a['version'],'wheel_sha256':deep['wheel_sha256'],'native_sha256':deep['native_sha256']}
                install={'install':[{'metadata':{'name':name,'version':a['version']},'download_info':{'archive_info':{'hashes':{'sha256':sha}}}} for name,sha in [('umf-core',deep['wheel_sha256']),('umf-codegen',a['roster']['codegen-wheel']['sha256'])]]}
                cells[cell]={}
                for key,prefix,suffix,body in [('interpreter','interpreter-','.json',deep['runtime']),('install','install-','.json',install),('freeze','freeze-','.txt',{'synthetic':'freeze'}),('record','record-','.json',record),('postRecord','record-post-','.json',record),('inspection','inspection-','.json',deep),('native','native-','.xml',{'synthetic':'xml'}),('saga','saga-','.json',{'cases':19,'passed':19})]:
                    cells[cell][key]=doc(prefix+cell+suffix,body)['sha256']
            values['consumers']['cells']=cells
            r['steps']={gate:{'status':'passed','evidence':doc(gate+'.json',values.get(gate,{}))} for gate in c.GATES}
            doc('component.json',r)
            member_sets[platform]=members
            a['components'][platform]={'admission_id':comp['id'],'material':{**material(comp,'qualified'),'run':123+index,'job':456+index,'artifact':789+index,'platform':platform,'job_name':'linux' if not index else 'macos'}}
        return a,{'profile':c.REGISTRY,'admissions':[a,*components]},member_sets

    def invoke(self,mutate=None,execute=False,api_change=None,zip_change=None):
        a,reg,member_sets=self.prepared()
        if mutate:mutate(a,reg,member_sets)
        responses={}
        for index,platform in enumerate(c.PLATFORMS):
            binding=a['components'][platform]['material'];members=member_sets[platform]
            data=io.BytesIO()
            with zipfile.ZipFile(data,'w') as archive:
                for name,body in members.items():
                    info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16
                    if zip_change:zip_change(info)
                    archive.writestr(info,body)
            payload=data.getvalue();binding.update(sha256=hashlib.sha256(payload).hexdigest(),members={name:hashlib.sha256(body).hexdigest() for name,body in members.items()})
            run=binding['run'];job=binding['job'];artifact=binding['artifact']
            responses['actions/runs/'+str(run)+'/attempts/1']={'id':run,'run_attempt':1,'head_sha':'b'*40,'path':c.WORKFLOW,'event':'workflow_dispatch','repository':{'id':1382276802,'full_name':c.REPO,'owner':{'id':273466046}},'status':'completed','conclusion':'success'}
            upload={'name':c.UPLOAD_STEP,'status':'completed','conclusion':'success','started_at':'2026-11-04T00:00:30Z','completed_at':'2026-11-04T00:01:30Z'}
            responses['actions/jobs/'+str(job)]={'id':job,'run_id':run,'run_attempt':1,'head_sha':'b'*40,'name':binding['job_name'],'labels':['ubuntu-24.04' if not index else 'macos-15'],'status':'completed','conclusion':'success','steps':[upload],'started_at':'2026-11-04T00:00:00Z','completed_at':'2026-11-04T00:02:00Z'}
            responses['actions/artifacts/'+str(artifact)]={'name':'core-successor-'+binding['job_name']+'-'+str(run)+'-1','id':artifact,'expired':False,'digest':'sha256:'+binding['sha256'],'created_at':'2026-11-04T00:01:00Z','workflow_run':{'id':run,'head_sha':'b'*40},'size_in_bytes':len(payload)}
            responses['actions/artifacts/'+str(artifact)+'/zip']=payload
        if api_change:api_change(responses)
        # Use real streaming API/extraction/provenance and aggregate code; only
        # HTTP response boundary is fake. reads consume, exactly like HTTP.
        class Response(io.BytesIO):
            pass
        class Opener:
            def open(self,request,timeout):
                body=responses[request.full_url.split('/umf/',1)[1]]
                return Response(body if isinstance(body,bytes) else json.dumps(body).encode())
        with tempfile.TemporaryDirectory() as raw,patch.object(c.urllib.request,'build_opener',return_value=Opener()):
            out=Path(raw)
            if execute:
                (out/c.REGISTRY_PATH).parent.mkdir();(out/c.REGISTRY_PATH).write_text(json.dumps(reg))
                args=Mock(root=out,output=out,source=out/'source',controller=out/'controller')
                with patch.object(c,'source_check') as identity,patch.object(c,'checkout_identity') as checkout:
                    self.assertEqual(c.execute_coupled(a,context(a),args),0)
                    self.assertEqual(identity.call_count,2);self.assertEqual(checkout.call_count,2)
                sums=(out/'retained/SHA256SUMS').read_text().splitlines()
                self.assertEqual(len(sums),len(a['roster'])+4)
                for name in ['source-manifest.json','build-manifest.json','qualification-manifest.json','release-pins.json']:
                    self.assertIn(c.digest(out/'retained'/name)+'  '+name,sums)
                self.assertFalse(c.read(out/'retained/qualification-manifest.json')['publicationAuthorized'])
                return
            value=c.coupled_materials(a,reg,out)
            self.assertEqual(len(value['assets']),12)
            self.assertTrue(all(value[k] is False for k in ('releaseQualified','nativeReleaseQualified','coupledQualified','publicationAuthorized')))
            self.assertTrue(all((out/(platform+'.sizes.json')).is_file() for platform in c.PLATFORMS))
            return value

    def test_complete_original_two_platforms_streamed_and_checksums(self):self.invoke();self.invoke(execute=True)
    def test_observed_continuation_sdk_bundle_reaches_actual_coupled_reader(self):
        def continuation(a,reg,member_sets,corrupt=None):
            for index,platform in enumerate(c.PLATFORMS):
                members=member_sets[platform];sdk=json.loads(members['sdk.json'])
                original=f'original/{123+index}-1-{789+index}'
                with tempfile.TemporaryDirectory() as raw:
                    out=Path(raw);retained=out/'retained';retained.mkdir()
                    for directory,profile,existing in (('sdk-consumer-full','umf.sdk-installed-archive-custody/2','passed'),
                                                       ('sdk-consumer-saga','umf.sdk-installed-saga-custody/1','not-run-in-saga-phase')):
                        source=out/directory/'g03-sdk-install-custody.json';source.parent.mkdir(parents=True)
                        source.write_text(json.dumps({'profile':profile,'existing139ConsumerChecks':existing,'sagaResult':{'cases':19,'passed':19}})+'\n')
                        source.chmod(0o644)
                    def copy_current(source,target):
                        target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(source.read_bytes());target.chmod(source.stat().st_mode&0o777)
                    custody=c.retain_sdk_custody(out,retained,c.OperationDeadline(30),copy_current)
                    custody_bodies={name:(retained/name).read_bytes() for name in (c.SDK_FULL_CUSTODY,c.SDK_SAGA_CUSTODY)}
                    sdk['custody']=custody
                if corrupt=='wrong-mode' and platform=='linux-x86_64':sdk['custody']['full139']['mode']=0o755
                sdk_bytes=(json.dumps(sdk)+'\n').encode()
                with tempfile.TemporaryDirectory() as raw:
                    material=Path(raw)/'continuation-original';material.mkdir();working=Path(raw)/'working';working.mkdir()
                    (material/'sdk.json').write_bytes(sdk_bytes)
                    for name,body in custody_bodies.items():(material/name).write_bytes(body)
                    c.restore_continuation_working_members(material,working,False,copy_current)
                    members['sdk.json']=(working/'sdk.json').read_bytes()
                    for name in (c.SDK_FULL_CUSTODY,c.SDK_SAGA_CUSTODY):members[name]=(working/name).read_bytes()
                members[original+'/sdk.json']=sdk_bytes
                for name in (c.SDK_FULL_CUSTODY,c.SDK_SAGA_CUSTODY):members[original+'/'+name]=members[name]
                receipt=json.loads(members['component.json'])
                receipt['steps']['sdk']['evidence']={'path':original+'/sdk.json','sha256':hashlib.sha256(sdk_bytes).hexdigest()}
                members['component.json']=json.dumps(receipt).encode()
                if corrupt=='partial-restoration' and platform=='linux-x86_64':del members[c.SDK_SAGA_CUSTODY]
        self.invoke(lambda a,r,m:continuation(a,r,m))
        for corrupt in ('partial-restoration','wrong-mode'):
            with self.subTest(corrupt=corrupt),self.assertRaises(c.Refusal):
                self.invoke(lambda a,r,m,corrupt=corrupt:continuation(a,r,m,corrupt))
        def unknown_legacy(a,reg,member_sets):
            members=member_sets['linux-x86_64'];sdk=json.loads(members['sdk.json']);sdk['unreviewed']=True
            members['sdk.json']=(json.dumps(sdk)+'\n').encode()
            receipt=json.loads(members['component.json']);receipt['steps']['sdk']['evidence']['sha256']=hashlib.sha256(members['sdk.json']).hexdigest()
            members['component.json']=json.dumps(receipt).encode()
        with self.assertRaises(c.Refusal):self.invoke(unknown_legacy)
    def test_missing_extra_platform_and_role_refuse(self):
        a,_,_=self.prepared()
        for key in ['macos-arm64','foreign']:
            b=copy.deepcopy(a)
            if key=='foreign':b['components'][key]=b['components']['macos-arm64']
            else:del b['components'][key]
            with self.subTest(key=key),self.assertRaises(c.Refusal):c.validate(b)
        b=copy.deepcopy(a);del b['roster']['source']
        with self.assertRaises(c.Refusal):c.validate(b)
    def test_foreign_source_resources_policy_and_data_refuse(self):
        for key in ('source','resources','recipes','inputs','protocols'):
            def change(a,reg,m,key=key):
                item=reg['admissions'][2];field=next(iter(item[key]));item[key]=dict(item[key]);item[key][field]='f'*len(item[key][field])
            with self.subTest(key=key),self.assertRaises(c.Refusal):self.invoke(change)
    def test_partial_component_and_upgraded_booleans_refuse(self):
        for kind in ('partial','flag','step'):
            def change(a,reg,m,kind=kind):
                r=json.loads(m['macos-arm64']['component.json'])
                if kind=='partial':r['status']='failed'
                elif kind=='flag':r['releaseQualified']=True
                else:r['steps']['sdk']['status']='failed'
                m['macos-arm64']['component.json']=json.dumps(r).encode()
            with self.subTest(kind=kind),self.assertRaises(c.Refusal):self.invoke(change)
    def test_re_signed_wrong_cli_sdk_and_resolver_refuse(self):
        for case in ('cli','sdk','resolver','source','standalone'):
            def change(a,reg,m,case=case):
                platform='macos-arm64';r=json.loads(m[platform]['component.json'])
                file={'cli':'embedded-cli19.json','standalone':'standalone-cli19.json','sdk':'sdk.json','resolver':'consumers.json','source':'source.json'}[case]
                body=json.loads(m[platform][file])
                if case in ('cli','standalone'):body['artifacts']['cliBinary']['sha256']='f'*64
                elif case=='sdk':body['platform']='linux-x86_64'
                elif case=='source':body['allModesSymlinksAndBlobBytesMatch']=False
                else:body.pop('normalResolverCells')
                m[platform][file]=json.dumps(body).encode()
                if case in ('cli','standalone'):
                    con=json.loads(m[platform]['consumers.json']);con['embeddedCLI19' if case=='cli' else 'standaloneCLI19']['sha256']=hashlib.sha256(m[platform][file]).hexdigest();m[platform]['consumers.json']=json.dumps(con).encode();file='consumers.json'
                gate=file[:-5];r['steps'][gate]['evidence']['sha256']=hashlib.sha256(m[platform][file]).hexdigest();m[platform]['component.json']=json.dumps(r).encode()
            with self.subTest(case=case),self.assertRaises(c.Refusal):self.invoke(change)
    def test_asset_path_hash_name_mode_and_size_refuse(self):
        for key,value in [('member','../escape'),('sha256','f'*64),('mode',0o777),('bytes',True),('bytes',c.MAX_BYTES+1),('name','umf_core-7.8.6.tar.gz')]:
            def change(a,reg,m,key=key,value=value):a['roster']['macos-arm64/sdk'][key]=value
            with self.subTest(key=key,value=value),self.assertRaises(c.Refusal):self.invoke(change)
    def test_transport_expansion_and_streaming_boundary(self):
        for byte_count in (c.MAX_BYTES+1,):
            a,_,_=self.prepared();a['roster']['source']['bytes']=byte_count
            with self.assertRaises(c.Refusal):c.validate(a)
        class Response(io.BytesIO):pass
        class Opener:
            def open(self,*args,**kwargs):return Response(b'x'*4097)
        with tempfile.TemporaryDirectory() as raw,patch.object(c.urllib.request,'build_opener',return_value=Opener()):
            with self.assertRaises(c.Refusal):c.api('actions/artifacts/1/zip',True,4096,sink=Path(raw)/'partial')
            self.assertLessEqual((Path(raw)/'partial').stat().st_size,4096)
    def test_original_job_provenance_not_synthetic_qualification_flag(self):
        a,_,_=self.prepared();binding=a['components']['macos-arm64']['material']
        # The real provenance function rejects original job drift before any ZIP.
        with self.assertRaises(c.Refusal):c.provenance(binding,{}, {}, {},fixture())
    def test_actual_original_actor_job_artifact_failure_and_type_refusals(self):
        for target,key,value in [('actions/runs/124/attempts/1','event','push'),
                                 ('actions/runs/124/attempts/1','conclusion','failure'),
                                 ('actions/jobs/457','labels',['ubuntu-24.04']),
                                 ('actions/jobs/457','run_attempt',True),
                                 ('actions/jobs/457','steps',[]),
                                 ('actions/artifacts/790','digest','sha256:'+'f'*64),
                                 ('actions/artifacts/790','expired',True),
                                 ('actions/artifacts/790','size_in_bytes',67108865)]:
            def change(rows,target=target,key=key,value=value):rows[target][key]=value
            with self.subTest(target=target,key=key),self.assertRaises(c.Refusal):self.invoke(api_change=change)
    def test_real_zip_member_types_and_paths_refuse_after_outer_digest_matches(self):
        for kind in ('symlink','device','path'):
            def change(info,kind=kind):
                if kind=='path':info.filename='../escape/'+info.filename
                else:info.external_attr=(0o120777 if kind=='symlink' else 0o020644)<<16
            with self.subTest(kind=kind),self.assertRaises(c.Refusal):self.invoke(zip_change=change)
    def test_identical_common_source_disagreement_refuses_even_resigned_transport(self):
        def change(a,reg,m):m['macos-arm64']['common/umf_core-7.8.6.tar.gz']=b'foreign common'
        with self.assertRaises(c.Refusal):self.invoke(change)
    def test_duplicate_renamed_asset_cannot_cover_two_required_roles(self):
        def change(a,reg,m):
            a['roster']['macos-arm64/sdk']=dict(a['roster']['linux-x86_64/sdk'])
        with self.assertRaises(c.Refusal):self.invoke(change)
    def test_generated_manifest_names_and_sum_members_are_closed(self):
        a,_,_=self.prepared();names={row['name'] for row in a['roster'].values()}
        self.assertEqual(len(names),12)
        # SOURCEPASS inspection allows only these derivative four documents,
        # plus SUMS which excludes its own hash rather than fabricating one.
        source=inspect.getsource(c.execute_coupled)
        for name in ['source-manifest.json','build-manifest.json','qualification-manifest.json','release-pins.json','SHA256SUMS']:self.assertIn(name,source)

    def test_default_off_empty_registry_and_component_scope_preserved(self):
        self.assertEqual(c.read(ROOT/c.REGISTRY_PATH)['admissions'],[])
        workflow=c.read(ROOT/c.WORKFLOW)
        self.assertFalse(workflow['on']['workflow_dispatch']['inputs']['admitted']['default'])
        self.assertEqual(workflow['on']['workflow_dispatch']['inputs']['operation']['options'],['run','aggregate','observe'])
        a,_,_=self.prepared()
        with self.assertRaises(c.Refusal):c.admit({'profile':c.REGISTRY,'admissions':[]},a['id'],context(a))
        self.assertEqual(c.MAX_BYTES,67108864)

class InstalledFactoryExtensionTests(unittest.TestCase):
    def test_fresh_real_factory_api_no_caller_resource_or_profile(self):
        owners=[];reports=[]
        corpus=[{'request':{'document':{},'selected':[]},'expected':{'value':i}} for i in range(17)]
        class Engine:
            @classmethod
            def from_installed(cls,**kwargs):
                self=cls();self.case=len(owners)//3;self.kwargs=kwargs;owners.append(self);return self
            def resource_source_manifest(self):return {'receiver':owners.index(self)}
            def call(self,*args):return {'ok':True,'result':{'value':self.case}}
            def inspect_access_views(self,*args):return {'value':self.case}
        result=c.installed_inspection_cases(corpus,Engine,reports.append)
        self.assertEqual(result,{'cases':17,'calls':51,'coldConstructors':51})
        self.assertEqual(len({id(o) for o in owners}),51)
        self.assertEqual(reports,[{'receiver':i} for i in range(51)])
        self.assertTrue(all(o.kwargs=={'max_work':1000000} for o in owners))
    def test_paid_manifest_exact_roster_numeric_type_and_wrong_origin(self):
        a=fixture()
        with tempfile.TemporaryDirectory() as raw:
            root=Path(raw);rows=[]
            for name in c.RESOURCE_NAMES:
                path='action_runtime_resources/'+name+'.json';p=root/path;p.parent.mkdir(exist_ok=True);p.write_bytes(b'{}');a['resources'][path]=c.digest(p);a['inputs'][c.RESOURCE_SOURCES[name]]=c.digest(p)
                rows.append({'name':name,'path':c.RESOURCE_SOURCES[name],'bytes':2.0,'sha256':c.digest(p)})
            m={'profile':'umf.codegen.installed-source-manifest/1','inputProfile':'installed-canonical/1','resources':rows}
            c.factory_manifest(m,a,root)
            for field,value in [('inputProfile','ordinary'),('resources',rows[:-1])]:
                b=copy.deepcopy(m);b[field]=value
                with self.assertRaises(c.Refusal):c.factory_manifest(b,a,root)
            for field,value in [('bytes',True),('sha256','f'*64),('path','elsewhere'),('name','foreign')]:
                b=copy.deepcopy(m);b['resources'][0][field]=value
                with self.assertRaises(c.Refusal):c.factory_manifest(b,a,root)
    def test_new_deep_cannot_erase_explicit_compatibility_or_data_identity(self):
        a=fixture();cell=next(iter(c.CELLS));d=deep_report(a,cell);c.validate_deep(d,a,cell)
        for key,value in [('compatibility',{}),('inputProfile','retained-native/1'),('data_sha256','f'*64)]:
            b=copy.deepcopy(d);b[key]=value
            with self.assertRaises(c.Refusal):c.validate_deep(b,a,cell)


class ThreeHoldCorrectionTests(unittest.TestCase):
    def test_named_compatibility_missing_failed_skipped_and_foreign_bindings_refuse(self):
        a=fixture();d=deep_report(a,next(iter(c.CELLS)));c.validate_deep(d,a,d['runtime']['cell'])
        for group in ('early','later'):
            for status in ('failed','skipped','unexecuted',None):
                bad=copy.deepcopy(d);cases=bad['compatibility']['groups'][group]['cases'];name=next(iter(cases))
                if status is None:del cases[name]
                else:cases[name]=status
                with self.subTest(group=group,status=status),self.assertRaises(c.Refusal):c.validate_deep(bad,a,d['runtime']['cell'])
        for key,value in [('source',{'commit':'f'*40,'tree':'e'*40}),('census_sha256','f'*64),('wheel_sha256','f'*64),('native_sha256','f'*64),('inputProfile','retained-native/1')]:
            bad=copy.deepcopy(d);bad['compatibility'][key]=value
            with self.subTest(key=key),self.assertRaises(c.Refusal):c.validate_deep(bad,a,d['runtime']['cell'])
        bad=copy.deepcopy(d);bad['compatibility']['original']['controller_sha']='f'*40
        with self.assertRaises(c.Refusal):c.validate_deep(bad,a,d['runtime']['cell'])

    def test_historical_cold51_only_excluded_no_compatibility_selector_waiver(self):
        a=fixture();c.validate(a)
        for mutate in ('omit','historical','duplicate','wildcard','extra-exclusion'):
            bad=copy.deepcopy(a);v=bad['compatibility']
            if mutate=='omit':v['early'].pop()
            if mutate=='historical':v['early'][0]=c.HISTORICAL_COLD
            if mutate=='duplicate':v['later'][0]=v['early'][0]
            if mutate=='wildcard':v['early'][0]='python/tests/test_compat.py::TestClass'
            if mutate=='extra-exclusion':v['historicalExcluded'].append(v['early'][0])
            with self.subTest(mutate=mutate),self.assertRaises(c.Refusal):c.validate(bad)
        code=inspect.getsource(c.inspect_installed)
        self.assertNotIn('inspection_cases(corpus,fresh_resources',code)
        self.assertNotIn('retained-native/1',code)
        self.assertIn('compatibility_material',code)

    def test_original_named_xml_is_required_not_count_or_status_claim(self):
        a=fixture();names=a['compatibility']['early']
        with tempfile.TemporaryDirectory() as raw:
            p=Path(raw)/'case.xml';p.write_bytes(compatibility_xml(names));c.named_junit(p,names)
            for body in [compatibility_xml(names[:-1]),compatibility_xml(names+[names[0]]),compatibility_xml(names,'skipped'),compatibility_xml(names,'failure'),compatibility_xml(names,'error'),b'<testsuite tests="18" failures="0"/>']:
                p.write_bytes(body)
                with self.assertRaises(c.Refusal):c.named_junit(p,names)

    def test_manifest_strictly_after_completed_inspection_order_mutant_refuses(self):
        corpus=[{'request':{'document':{},'selected':[]},'expected':{}} for _ in range(17)]
        events=[]
        class Engine:
            @classmethod
            def from_installed(cls,**kwargs):
                self=cls();self.done=False;events.append('constructor');return self
            def call(self,*args):self.done=True;events.append('call');return {'ok':True,'result':{}}
            def inspect_access_views(self,*args):self.done=True;events.append('call');return {}
            def resource_source_manifest(self):
                if not self.done:raise AssertionError('manifest-before-first-call')
                events.append('report');return {}
        self.assertEqual(c.installed_inspection_cases(corpus,Engine,lambda _:None)['calls'],51)
        self.assertEqual(events,['constructor','call','report']*51)
        text=inspect.getsource(c.installed_inspection_cases)
        old=text.replace('            manifest_check(engine.resource_source_manifest())','').replace("            counts['coldConstructors']+=1", "            counts['coldConstructors']+=1\n            manifest_check(engine.resource_source_manifest())")
        ns=dict(vars(c));exec(compile(old,'before-call-mutant','exec'),ns)
        with self.assertRaisesRegex(AssertionError,'manifest-before-first-call'):ns['installed_inspection_cases'](corpus,Engine,lambda _:None)

    def test_constructor_or_call_failure_does_not_publish_manifest(self):
        corpus=[{'request':{'document':{},'selected':[]},'expected':{}} for _ in range(17)]
        effects=[]
        class Engine:
            @classmethod
            def from_installed(cls,**kwargs):return cls()
            def call(self,*args):raise RuntimeError('first-call')
            def resource_source_manifest(self):effects.append('report');return {}
        with self.assertRaisesRegex(RuntimeError,'first-call'):c.installed_inspection_cases(corpus,Engine,lambda _:None)
        self.assertEqual(effects,[])
        with patch.object(Engine,'from_installed',side_effect=RuntimeError('ctor')):
            with self.assertRaisesRegex(RuntimeError,'ctor'):c.installed_inspection_cases(corpus,Engine,lambda _:None)
        self.assertEqual(effects,[])

    def test_canonical_and_wheel_paths_are_distinct_closed_roles_original_bytes_unchanged(self):
        a=fixture()
        with tempfile.TemporaryDirectory() as raw:
            package=Path(raw);rows=[]
            for name in c.RESOURCE_NAMES:
                installed='action_runtime_resources/'+name+'.json';p=package/installed;p.parent.mkdir(exist_ok=True);p.write_bytes(b'{}')
                h=c.digest(p);a['resources'][installed]=h;a['inputs'][c.RESOURCE_SOURCES[name]]=h
                rows.append({'name':name,'path':c.RESOURCE_SOURCES[name],'bytes':2.0,'sha256':h})
            value={'profile':'umf.codegen.installed-source-manifest/1','inputProfile':'installed-canonical/1','resources':rows}
            before=copy.deepcopy(value);encoded=c.factory_report_bytes(value)
            self.assertEqual(c.factory_manifest(value,a,package),hashlib.sha256(encoded).hexdigest());self.assertEqual(value,before)
            self.assertEqual(json.loads(encoded),before)
            for mutate in ('installed-as-source','role-order','alias','hash','sourcehash','missing-installed','float-nan','float-inf','float-frac','integer','boolean','too-large'):
                b=copy.deepcopy(value);bound=copy.deepcopy(a)
                if mutate=='installed-as-source':b['resources'][0]['path']='action_runtime_resources/coreSchema.json'
                if mutate=='role-order':b['resources'][0],b['resources'][1]=b['resources'][1],b['resources'][0]
                if mutate=='alias':b['resources'][1]=b['resources'][0]
                if mutate=='hash':b['resources'][0]['sha256']='f'*64
                if mutate=='sourcehash':bound['inputs'][c.RESOURCE_SOURCES['coreSchema']]='e'*64
                if mutate=='missing-installed':(package/'action_runtime_resources/coreSchema.json').unlink()
                for kind,number in [('float-nan',float('nan')),('float-inf',float('inf')),('float-frac',2.5),('integer',2),('boolean',True),('too-large',float(2**53))]:
                    if mutate==kind:b['resources'][0]['bytes']=number
                with self.subTest(mutate=mutate),self.assertRaises((c.Refusal,FileNotFoundError)):c.factory_manifest(b,bound,package)
                (package/'action_runtime_resources/coreSchema.json').write_bytes(b'{}')
            bad=copy.deepcopy(a);bad['inputs']['crates/umf-core/src/canonical_codegen_literals.rs']='f'*64
            d=deep_report(a,next(iter(c.CELLS)))
            with self.assertRaises(c.Refusal):c.validate_deep(d,bad,d['runtime']['cell'])


class FirstProductionObservationTests(unittest.TestCase):
    def isolated_caches(self,root):
        values={}
        for key in ('CARGO_HOME','RUSTUP_HOME','UV_CACHE_DIR','BUN_INSTALL_CACHE_DIR'):
            path=root/'empty-cache'/key;path.mkdir(parents=True,exist_ok=True);values[key]=str(path)
        return values

    def admission_and_plan(self,source_commit='1'*40,source_tree='2'*40):
        a,_=InitialInspectorIntakeTests().admission(source_commit,source_tree)
        a['profile']=c.MULTIPART_CANDIDATE
        wheel=a['initialInspector']['wheel']['member']
        roles=list(c.COMMON_ROLES)+['linux-x86_64/'+r for r in c.HOST_ROLES]+['raw-wheel','rebuilt-wheel','initial-input:'+wheel]
        objects={role:{'roles':[role],'mode':0o755 if role.endswith('standalone-cli') else 0o644,
                       'maximum_bytes':1048576 if role=='source' else 65536} for role in roles}
        logical=sum(row['maximum_bytes'] for row in objects.values());parts=sum((row['maximum_bytes']+c.MAX_PAYLOAD-1)//c.MAX_PAYLOAD for row in objects.values())
        proof=1048576;control=(3*parts+4)*c.BUFFER;external=1048576
        budgets={'logical_bytes':logical,'role_bytes':logical,'transport_bytes':logical+proof,
                 'expanded_bytes':logical+proof,'workspace_bytes':3*logical+(logical+proof)+proof+control+external,
                 'proof_bytes':proof,'seconds':5400,'control_bytes':control,'external_workspace_bytes':external}
        value={'payload_bytes':c.MAX_PAYLOAD,'objects':objects,
               'source':{'object':'source','prefix':'umf-v0.10.10/','commit':source_commit,'tree':source_tree,
                         'maximum_tar_bytes':1048576,'maximum_member_bytes':1048576,'maximum_members':1000},
               'budgets':budgets}
        a['transportObservation']=value
        return a,value

    def test_closed_observe_config_and_only_first_linux_production(self):
        a,plan=self.admission_and_plan();self.assertTrue(c.observation_config(plan,a));c.validate(a)
        schema=c.read(ROOT/'qualification-inputs/core-successor-qualification.schema.json')
        shape=schema['$defs']['multipart-admission']
        self.assertIn('transportObservation',shape['properties']);self.assertNotIn('transport',shape['required'])
        self.assertEqual(len(shape['allOf'][-1]['oneOf']),2)
        workflow=c.read(ROOT/c.WORKFLOW);dispatch=workflow['on']['workflow_dispatch']['inputs']['operation']
        self.assertIn('observe',dispatch['options'])
        seal=next(row for row in workflow['jobs']['linux']['steps'] if row.get('name')=='Seal final byte-bounded evidence including receipts')
        self.assertIn('--controller controller --source source',seal['run'])
        c.require_operation(a,'observe')
        for operation in ('run','aggregate','inspect'):
            with self.subTest(operation=operation),self.assertRaises(c.Refusal):c.require_operation(a,operation)
        bad=copy.deepcopy(plan);bad['unresolved_sha256']='0'*64
        with self.assertRaises(c.Refusal):c.observation_config(bad,a)
        bad=copy.deepcopy(plan);bad['objects']['source']['roles']=['core-sdist']
        with self.assertRaises(c.Refusal):c.observation_config(bad,a)
        for field,value in [('platform','macos-arm64'),('version','0.10.9')]:
            wrong=copy.deepcopy(a);wrong[field]=value
            with self.subTest(field=field),self.assertRaises(c.Refusal):c.require_operation(wrong,'observe')
        wrong=copy.deepcopy(a);wrong['common']={}
        with self.assertRaises(c.Refusal):c.require_operation(wrong,'observe')

    def test_observation_control_budget_keeps_original_ceiling_at_admission(self):
        a,plan=self.admission_and_plan()
        ceiling=(3*c.MAX_PARTS+4)*c.BUFFER
        schema=c.read(ROOT/'qualification-inputs/core-successor-qualification.schema.json')
        self.assertEqual(schema['$defs']['multipart-budgets']['properties']['control_bytes']['maximum'],ceiling)
        bounded=copy.deepcopy(plan);bounded['budgets']['control_bytes']=ceiling
        bounded['budgets']['workspace_bytes']=3*bounded['budgets']['logical_bytes']+bounded['budgets']['transport_bytes']+bounded['budgets']['proof_bytes']+ceiling+bounded['budgets']['external_workspace_bytes']
        self.assertTrue(c.observation_config(bounded,a))
        rejected=copy.deepcopy(bounded);rejected['budgets']['control_bytes']=ceiling+1
        rejected['budgets']['workspace_bytes']+=1
        a['transportObservation']=rejected
        with self.assertRaisesRegex(c.Refusal,'observation-control-budget'):
            c.validate(a)

    def test_observation_mode_schema_matches_runtime_optional_hash_boundary(self):
        schema=c.read(ROOT/'qualification-inputs/core-successor-qualification.schema.json')
        shape=schema['$defs']['multipart-mode']
        self.assertEqual(shape['properties']['observationConfigSHA256'],{'$ref':'#/$defs/hash'})
        self.assertFalse(shape['additionalProperties'])
        self.assertNotIn('observationConfigSHA256',shape['required'])
        a,plan=self.admission_and_plan();a['transportObservation']=plan
        with tempfile.TemporaryDirectory() as raw:
            output=Path(raw);deadline=c.operation_deadline(output,a)
            mode=c.read(output/'multipart-mode.json')
            mode_schema=schema['$defs']['multipart-mode'];mode_hash=schema['$defs']['hash']['pattern']
            self.assertTrue(set(mode_schema['required'])<=set(mode))
            self.assertTrue(set(mode)<=set(mode_schema['properties']))
            self.assertFalse(mode_schema['additionalProperties'])
            self.assertRegex(mode['id'],r'^[a-z0-9][a-z0-9-]{0,63}$')
            self.assertRegex(mode['observationConfigSHA256'],mode_hash)
            self.assertEqual(mode['observationConfigSHA256'],hashlib.sha256(json.dumps(plan,sort_keys=True,separators=(',',':')).encode()).hexdigest())
            self.assertNotIn('observationConfigSHA256',mode_schema['required'])
            self.assertNotIn('futureField',mode_schema['properties'])
            self.assertEqual(deadline.seconds,min(a['bounds']['seconds'],plan['budgets']['seconds']))
        with tempfile.TemporaryDirectory() as raw:
            root=Path(raw);output=root/'out';output.mkdir()
            legacy=fixture();legacy.update(profile=c.MULTIPART_CANDIDATE,transport=MultipartTransportTests().plan())
            (root/c.REGISTRY_PATH).parent.mkdir(parents=True);(root/c.REGISTRY_PATH).write_text(json.dumps(registry(legacy)))
            mode={'id':legacy['id'],'source':legacy['source'],'controller':legacy['controller'],
                  'deadline':{'startedMonotonic':1,'seconds':30},'observationConfigSHA256':'a'*64}
            (output/'multipart-mode.json').write_text(json.dumps(mode))
            with patch.object(c,'validate'):
                with self.assertRaisesRegex(c.Refusal,'multipart-mode-observation-config-unexpected'):
                    c.authorized_seal(output,root)

    def test_observe_runs_exact_six_producer_stages_then_stays_nonpassing(self):
        a,_=self.admission_and_plan();seen=[];ctx=context(a);deadline=c.OperationDeadline(30)
        def run(stage):seen.append(stage);return {'status':'passed','evidence':{'path':stage+'.json','sha256':'a'*64}}
        receipt=c.orchestrate_observation(a,ctx,run,deadline)
        self.assertEqual(seen,list(c.OBSERVE_GATES));self.assertEqual(receipt['status'],'producer-observed')
        self.assertIsNone(receipt['inspection']);self.assertFalse(receipt['releaseQualified'])
        seen.clear()
        def fail(stage):
            seen.append(stage)
            if stage=='wheel':raise c.Refusal('synthetic-stage-refusal')
            return {'status':'passed','evidence':{'path':stage+'.json','sha256':'a'*64}}
        failed=c.orchestrate_observation(a,ctx,fail,c.OperationDeadline(30))
        self.assertEqual(seen,list(c.OBSERVE_GATES[:4]));self.assertEqual(failed['status'],'failed')
        self.assertEqual(failed['steps']['wheel']['status'],'failed')
        self.assertEqual(failed['failure'],'synthetic-stage-refusal')

    def test_existing_continuation_reuses_first_six_then_runs_later_gates(self):
        a,_=self.admission_and_plan();ctx=context(a)
        prior=c.orchestrate_observation(a,ctx,lambda stage:{'status':'passed','evidence':{'path':stage+'.json','sha256':'a'*64}},c.OperationDeadline(30))
        continuation={k:v for k,v in a.items() if k!='transportObservation'};continuation['transport']=MultipartTransportTests().plan()
        seen=[]
        def run(stage):seen.append(stage);return {'status':'passed','evidence':{'path':stage+'.json','sha256':'b'*64}}
        result=c.orchestrate(continuation,ctx,run,lambda receipt:True,prior=prior)
        self.assertEqual(seen,['job-setup','consumers','inspection','final-identity'])
        self.assertEqual(result['steps']['source']['evidence']['sha256'],'a'*64)
        self.assertEqual(result['status'],'passed')
        self.assertFalse(result['releaseQualified'])

    def test_multipart_continuation_source_and_restored_working_copy_are_declared_custody(self):
        a=fixture();a['profile']=c.MULTIPART_CANDIDATE;a['transport']=MultipartTransportTests().plan()
        members={'component.json':b'{"status":"producer-observed"}',
                 'source.tar.gz':b'original full source archive',
                 'common/umf_core-0.10.10.tar.gz':b'original core sdist'}
        continuation=material(a,'continuation');continuation['members']={name:hashlib.sha256(body).hexdigest() for name,body in members.items()}
        c.material_shape(continuation,multipart=True);a['continuation']=continuation
        with tempfile.TemporaryDirectory() as raw:
            out=Path(raw);retained=out/'retained';retained.mkdir()
            namespace='original/123-1-789'
            for name,body in members.items():
                target=retained/namespace/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(body)
            working=retained/'common/umf_core-0.10.10.tar.gz';working.parent.mkdir(parents=True,exist_ok=True);working.write_bytes(members['common/umf_core-0.10.10.tar.gz'])
            usage=c.multipart_stage_accounting(out,a,complete=True)
            self.assertEqual(usage['proof_bytes'],0)
            self.assertEqual(usage['continuation_copy_bytes'],sum(map(len,members.values()))+len(members['common/umf_core-0.10.10.tar.gz']))
            self.assertGreaterEqual(usage['workspace_bytes'],usage['continuation_copy_bytes'])
            working.chmod(0o755)
            with self.assertRaisesRegex(c.Refusal,'multipart-continuation-copy-mode-or-size'):
                c.multipart_stage_accounting(out,a,complete=True)
            working.chmod(0o644)
            working.write_bytes(b'X'*len(members['common/umf_core-0.10.10.tar.gz']))
            with self.assertRaisesRegex(c.Refusal,'multipart-continuation-copy-hash'):
                c.multipart_stage_accounting(out,a,complete=True)
            working.write_bytes(members['common/umf_core-0.10.10.tar.gz']);working.unlink()
            with self.assertRaisesRegex(c.Refusal,'multipart-continuation-copy-missing'):
                c.multipart_stage_accounting(out,a,complete=True)

    def test_actual_source_shaped_outputs_derive_and_seal_existing_multipart_plan(self):
        with tempfile.TemporaryDirectory() as raw:
            root=Path(raw);source=root/'source';source.mkdir()
            def git(*args):return subprocess.check_output(['git','-C',str(source),*args]).decode().strip()
            subprocess.run(['git','-C',str(source),'init','-q'],check=True)
            subprocess.run(['git','-C',str(source),'config','user.email','pure@example.invalid'],check=True)
            subprocess.run(['git','-C',str(source),'config','user.name','Pure Fixture'],check=True)
            (source/'tracked.txt').write_bytes(b'complete immutable source member\n')
            subprocess.run(['git','-C',str(source),'add','tracked.txt'],check=True)
            subprocess.run(['git','-C',str(source),'commit','-qm','pure source fixture'],check=True)
            commit=git('rev-parse','HEAD');tree=git('rev-parse','HEAD^{tree}')
            a,plan=self.admission_and_plan(commit,tree);out=root/'output';retained=out/'retained';retained.mkdir(parents=True)
            archive=retained/'source.tar.gz'
            subprocess.run(['git','-C',str(source),'archive','--format=tar.gz','--prefix=umf-v0.10.10/','--output',str(archive),commit],check=True)
            with patch.dict(os.environ,self.isolated_caches(root)):
                reserve=c.observation_stage_reservation(out,a,source,('linux-x86_64/sdk',),c.OperationDeadline(5400))
                self.assertEqual(reserve['logicalBytesReserved'],plan['objects']['linux-x86_64/sdk']['maximum_bytes'])
            wheel='wheels/'+c.INSPECTOR_RAW
            paths={
                'core-sdist':'common/umf_core-0.10.10.tar.gz',
                'codegen-wheel':'common/umf_codegen-0.10.10-py3-none-any.whl',
                'codegen-sdist':'common/umf_codegen-0.10.10.tar.gz',
                'linux-x86_64/core-wheel':'selected/umf_core-0.10.10-cp311-cp311-manylinux.whl',
                'linux-x86_64/standalone-cli':'standalone-umf',
                'linux-x86_64/sdk':'umf-sdk-linux-x86_64.tgz',
                'linux-x86_64/sdk-manifest':'sdk-manifest.json',
                'raw-wheel':'raw/umf_core-0.10.10-cp311-cp311-linux.whl',
                'rebuilt-wheel':'rebuilt/umf_core-0.10.10-cp311-cp311-linux.whl',
                'initial-input:'+wheel:'initial-inspector/'+wheel}
            for role,name in paths.items():
                target=retained/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(('verified fixture '+role).encode())
                target.chmod(0o755 if role.endswith('standalone-cli') else 0o644)
            with patch.dict(os.environ,self.isolated_caches(root)):
                exact=c.observed_transport(out,a,source,c.OperationDeadline(5400),require_complete=True)
            self.assertEqual(set(row for obj in exact['objects'].values() for row in obj['roles']),set(plan['objects']))
            component={'status':'producer-observed','steps':{name:{'status':'passed'} for name in c.OBSERVE_GATES},'releaseQualified':False}
            exact_admission={k:v for k,v in a.items() if k!='transportObservation'};exact_admission['transport']=exact
            result=c.seal_multipart(out,exact_admission,component,deadline=c.OperationDeadline(5400))
            self.assertTrue(result['fullRetention']);self.assertFalse(result['qualified']);self.assertFalse(result['uploadReadbackAuthenticated'])
            slots=c.multipart_upload_outputs(out,exact_admission,deadline=c.OperationDeadline(5400))
            self.assertEqual(slots,list(range(len(slots))))
            with patch.dict(os.environ,self.isolated_caches(root)):
                self.assertEqual(c.observed_transport(out,a,source,c.OperationDeadline(5400),require_complete=True),exact)

    def test_failed_observation_can_retain_verified_source_and_partial_outputs_only(self):
        with tempfile.TemporaryDirectory() as raw:
            root=Path(raw);source=root/'source';source.mkdir()
            subprocess.run(['git','-C',str(source),'init','-q'],check=True)
            subprocess.run(['git','-C',str(source),'config','user.email','pure@example.invalid'],check=True)
            subprocess.run(['git','-C',str(source),'config','user.name','Pure Fixture'],check=True)
            (source/'tracked.txt').write_bytes(b'bounded source\n');subprocess.run(['git','-C',str(source),'add','tracked.txt'],check=True)
            subprocess.run(['git','-C',str(source),'commit','-qm','fixture'],check=True)
            commit=subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD']).decode().strip()
            tree=subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD^{tree}']).decode().strip()
            a,_=self.admission_and_plan(commit,tree);out=root/'out';retained=out/'retained';retained.mkdir(parents=True)
            subprocess.run(['git','-C',str(source),'archive','--format=tar.gz','--prefix=umf-v0.10.10/','--output',str(retained/'source.tar.gz'),commit],check=True)
            with patch.dict(os.environ,self.isolated_caches(root)):
                exact=c.observed_transport(out,a,source,c.OperationDeadline(5400),require_complete=False)
            self.assertEqual(list(exact['objects']),['source.tar.gz'])
            self.assertFalse(any(row['roles']!=['source'] for row in exact['objects'].values()))
            partial_admission={k:v for k,v in a.items() if k!='transportObservation'};partial_admission['transport']=exact
            failed={'status':'failed','failure':'later producer stage refused','releaseQualified':False}
            sealed=c.seal_multipart(out,partial_admission,failed,deadline=c.OperationDeadline(5400))
            self.assertTrue(sealed['fullRetention']);self.assertFalse(sealed['qualified'])
            self.assertEqual(len(sealed['objects']),1)
            slots=c.multipart_upload_outputs(out,partial_admission,deadline=c.OperationDeadline(5400))
            self.assertEqual(slots,list(range(len(slots))))

    def test_seal_rechecks_observe_context_and_recomputed_local_plan(self):
        a,plan=self.admission_and_plan();exact=MultipartTransportTests().plan()
        with tempfile.TemporaryDirectory() as raw:
            root=Path(raw);(root/'qualification-inputs').mkdir();(root/c.REGISTRY_PATH).write_text(json.dumps({'profile':c.REGISTRY,'admissions':[a]}))
            out=root/'out';(out/'retained').mkdir(parents=True)
            config=hashlib.sha256(json.dumps(plan,sort_keys=True,separators=(',',':')).encode()).hexdigest()
            mode={'id':a['id'],'source':a['source'],'controller':a['controller'],'deadline':{'startedMonotonic':0,'seconds':5400},'observationConfigSHA256':config}
            (out/'multipart-mode.json').write_text(json.dumps(mode));(out/'retained/component.json').write_text(json.dumps({'status':'producer-observed'}))
            (out/'observed-transport.json').write_text(json.dumps(exact))
            ctx={'controller':a['controller'],'admitted':True};clock=c.OperationDeadline(5400)
            with patch.dict(os.environ,{'SUCCESSOR_OPERATION':'observe'}), \
                 patch.object(c,'authority_binding',return_value=({},ctx)) as authority, \
                 patch.object(c,'checkout_identity') as source_check, \
                 patch.object(c,'operation_deadline',return_value=clock), \
                 patch.object(c,'observed_transport',return_value=exact) as derive:
                sealed=c.authorized_seal(out,root,root/'controller',root/'source')
                self.assertNotIn('transportObservation',sealed);self.assertEqual(sealed['transport'],exact)
                authority.assert_called_once();source_check.assert_called_once();derive.assert_called_once()
            (out/'observed-transport.json').write_text(json.dumps({'forged':True}))
            with patch.dict(os.environ,{'SUCCESSOR_OPERATION':'observe'}), \
                 patch.object(c,'authority_binding',return_value=({},ctx)), \
                 patch.object(c,'checkout_identity'),patch.object(c,'operation_deadline',return_value=clock), \
                 patch.object(c,'observed_transport',return_value=exact):
                with self.assertRaisesRegex(c.Refusal,'observation-local-plan-substitution'):
                    c.authorized_seal(out,root,root/'controller',root/'source')
            (out/'observed-transport.json').write_text(json.dumps(exact))
            with patch.dict(os.environ,{'SUCCESSOR_OPERATION':'run'}), \
                 patch.object(c,'authority_binding',return_value=({},ctx)),patch.object(c,'checkout_identity'), \
                 patch.object(c,'observed_transport',return_value=exact) as derive:
                with self.assertRaisesRegex(c.Refusal,'observation-seal-Q-context'):
                    c.authorized_seal(out,root,root/'controller',root/'source')
                derive.assert_not_called()

    def test_observe_entrypoint_authenticates_before_outputs_then_seals_after_stages(self):
        a,plan=self.admission_and_plan();ctx=context(a);exact=MultipartTransportTests().plan()
        with tempfile.TemporaryDirectory() as raw:
            root=Path(raw);controller=root/'controller';source=root/'source';out=root/'out'
            for path in (controller,source,out):path.mkdir()
            (root/c.REGISTRY_PATH).parent.mkdir(parents=True)
            (root/c.REGISTRY_PATH).write_text(json.dumps(registry(a)))
            config=hashlib.sha256(json.dumps(plan,sort_keys=True,separators=(',',':')).encode()).hexdigest()
            seconds=min(a['bounds']['seconds'],plan['budgets']['seconds'])
            mode={'id':a['id'],'source':a['source'],'controller':a['controller'],'deadline':{'startedMonotonic':c.time.monotonic(),'seconds':seconds},'observationConfigSHA256':config}
            (out/'multipart-mode.json').write_text(json.dumps(mode))
            ctx['controller']=a['controller'];ctx['admitted']=True
            ghout=root/'github-output';ghout.write_text('')
            def authority(_):return {},ctx
            def authorize(_):return a,ctx
            def execute(*_):
                self.assertFalse((out/'retained/component.json').exists())
                self.assertFalse((out/'observed-transport.json').exists())
                (out/'retained').mkdir(exist_ok=True)
                (out/'retained/component.json').write_text(json.dumps({'status':'producer-observed'}))
                (out/'observed-transport.json').write_text(json.dumps(exact))
                return 0
            with patch.dict(os.environ,{'SUCCESSOR_OPERATION':'observe','GITHUB_OUTPUT':str(ghout)}), \
                 patch.object(c,'authority_binding',side_effect=authority),patch.object(c,'checkout_identity'), \
                 patch.object(c,'authorize',side_effect=authorize),patch.object(c,'execute_candidate',side_effect=execute) as stages, \
                 patch.object(sys,'argv',['controller','observe','--root',str(root),'--controller',str(controller),'--source',str(source),'--id',a['id'],'--platform','linux-x86_64','--output',str(out)]):
                status=c.main()
                self.assertEqual(status,0,c.read(out/'retained/failure.json') if status else '')
            stages.assert_called_once()
            self.assertEqual(json.loads((out/'multipart-mode.json').read_text())['deadline'],mode['deadline'])
            # Seal is refused until the producer's final component is present.
            (out/'retained/component.json').unlink();(out/'observed-transport.json').unlink()
            with patch.dict(os.environ,{'SUCCESSOR_OPERATION':'observe','GITHUB_OUTPUT':str(ghout)}), \
                 patch.object(c,'authority_binding',side_effect=authority),patch.object(c,'checkout_identity'), \
                 patch.object(c,'observed_transport',return_value=exact), \
                 patch.object(c,'seal_multipart') as seal,patch.object(c,'multipart_upload_outputs',return_value=[0]), \
                 patch.object(sys,'argv',['controller','seal','--root',str(root),'--controller',str(controller),'--source',str(source),'--id',a['id'],'--platform','linux-x86_64','--output',str(out)]):
                self.assertEqual(c.main(),2)
                seal.assert_not_called()
            (out/'retained/component.json').write_text(json.dumps({'status':'producer-observed'}))
            (out/'observed-transport.json').write_text(json.dumps(exact))
            with patch.dict(os.environ,{'SUCCESSOR_OPERATION':'observe','GITHUB_OUTPUT':str(ghout)}), \
                 patch.object(c,'authority_binding',side_effect=authority),patch.object(c,'checkout_identity'), \
                 patch.object(c,'observed_transport',return_value=exact), \
                 patch.object(c,'seal_multipart',return_value={'fullRetention':False}) as seal, \
                 patch.object(c,'multipart_upload_outputs',return_value=[0]), \
                 patch.object(sys,'argv',['controller','seal','--root',str(root),'--controller',str(controller),'--source',str(source),'--id',a['id'],'--platform','linux-x86_64','--output',str(out)]):
                self.assertEqual(c.main(),0)
                self.assertEqual(seal.call_args.args[1]['transport'],exact)


class MultipartTransportTests(unittest.TestCase):
    def plan(self,body=b'authentic bytes',split=5,roles=('source',)):
        h=lambda x:hashlib.sha256(x).hexdigest()
        parts=[{'ordinal':i,'offset':start,'length':len(body[start:start+split]),'sha256':h(body[start:start+split])} for i,start in enumerate(range(0,len(body),split))]
        n=len(body);proof=4096;wire=n+proof+4096;controls=(3*len(parts)+4)*c.BUFFER
        return {'profile':c.MULTIPART,'payload_bytes':min(split,c.MAX_PAYLOAD),'objects':{'source.tar.gz':{'name':'source.tar.gz','roles':list(roles),'mode':0o644,'bytes':n,'sha256':h(body),'parts':parts}},
                'budgets':{'logical_bytes':n,'role_bytes':n*len(roles),'expanded_bytes':n+proof,'transport_bytes':wire,'workspace_bytes':3*n+wire+proof+controls+13,'proof_bytes':proof,'seconds':30,'control_bytes':controls,'external_workspace_bytes':13},
                'source':{'object':'source.tar.gz','tar_bytes':10240,'tar_sha256':h(b'raw tar identity'),'member_bytes':13,'members':1,'prefix':'umf-test/'}}
    def files(self,root,body,plan):
        paths=[]
        for row in plan['objects']['source.tar.gz']['parts']:
            p=root/str(row['ordinal']);p.write_bytes(body[row['offset']:row['offset']+row['length']]);paths.append(p)
        return paths
    def tar(self,body=b'raw\xc3\xa9\xf0\x9f\x98\x80 data',name='unicode.txt',kind=None,link=''):
        s=io.BytesIO()
        with tarfile.open(fileobj=s,mode='w',format=tarfile.PAX_FORMAT,pax_headers={'comment':'1'*40}) as z:
            item=tarfile.TarInfo('umf-test/'+name);item.mode=0o664
            if kind:item.type=kind;item.linkname=link;item.size=0;item.mode=0o777
            else:item.size=len(body)
            z.addfile(item,None if kind else io.BytesIO(body))
        return s.getvalue()
    def test_separate_profile_closed_finite_plan_and_no_real_admissions(self):
        p=self.plan();self.assertEqual(c.multipart_plan(p),3)
        self.assertEqual(c.MAX_BYTES,67108864);self.assertEqual(c.MAX_PAYLOAD,62914560)
        self.assertEqual(c.read(ROOT/c.REGISTRY_PATH),{'profile':c.REGISTRY,'admissions':[]})
        for mutate in ('profile','extra','payload','bool','parts','objects','logical','disk','roles','time'):
            q=copy.deepcopy(p)
            if mutate=='profile':q['profile']=c.PROFILE
            if mutate=='extra':q['claim']='qualified'
            if mutate=='payload':q['payload_bytes']=62914561
            if mutate=='bool':q['objects']['source.tar.gz']['parts'][0]['ordinal']=False
            if mutate=='parts':q['objects']['source.tar.gz']['parts']*=129
            if mutate=='objects':q['objects']={str(i):next(iter(p['objects'].values())) for i in range(129)}
            if mutate=='logical':q['budgets']['logical_bytes']+=1
            if mutate=='disk':q['budgets']['workspace_bytes']-=1
            if mutate=='roles':q['objects']['source.tar.gz']['roles']*=2
            if mutate=='time':q['budgets']['seconds']=5401
            with self.subTest(mutate=mutate),self.assertRaises(c.Refusal):c.multipart_plan(q)
    def test_layout_gap_overlap_order_duplicate_truncate_and_overflow_refuse(self):
        p=self.plan()
        for field,value in [('offset',1),('offset',-1),('ordinal',2),('length',6),('length',0),('length',2**64),('sha256','0'*64)]:
            q=copy.deepcopy(p);q['objects']['source.tar.gz']['parts'][1][field]=value
            with self.subTest(field=field,value=value),self.assertRaises(c.Refusal):c.multipart_plan(q)
        for kind in ('drop','reverse','extra'):
            q=copy.deepcopy(p);rows=q['objects']['source.tar.gz']['parts']
            if kind=='drop':rows.pop()
            if kind=='reverse':rows.reverse()
            if kind=='extra':rows.append(copy.deepcopy(rows[-1]))
            with self.subTest(kind=kind),self.assertRaises(c.Refusal):c.multipart_plan(q)
    def test_reassembly_exact_whole_hash_and_bytes_across_utf8_header_boundaries(self):
        body=self.tar();p=self.plan(body,split=317);c.multipart_plan(p)
        with tempfile.TemporaryDirectory() as raw:
            root=Path(raw);paths=self.files(root,body,p);target=root/'restored.tar';c.reconstruct_parts(paths,p['objects']['source.tar.gz'],target,c.MultipartBudget(p))
            self.assertEqual(target.read_bytes(),body)
            with self.assertRaises(c.Refusal):c.reconstruct_parts(paths,p['objects']['source.tar.gz'],target,c.MultipartBudget(p))
            changed=copy.deepcopy(p['objects']['source.tar.gz']);changed['sha256']='f'*64
            with self.assertRaisesRegex(c.Refusal,'whole-object'):c.reconstruct_parts(paths,changed,root/'bad',c.MultipartBudget(p))
    def test_part_tamper_truncation_missing_and_symlink_never_complete(self):
        body=b'one immutable logical stream';p=self.plan(body)
        for kind in ('tamper','truncate','missing','symlink'):
            with tempfile.TemporaryDirectory() as raw:
                root=Path(raw);paths=self.files(root,body,p)
                if kind=='tamper':paths[0].write_bytes(b'X'*paths[0].stat().st_size)
                if kind=='truncate':paths[0].write_bytes(b'')
                if kind=='missing':paths[0].unlink()
                if kind=='symlink':paths[0].unlink();paths[0].symlink_to(paths[1])
                with self.subTest(kind=kind),self.assertRaises(c.Refusal):c.reconstruct_parts(paths,p['objects']['source.tar.gz'],root/'out',c.MultipartBudget(p))
    def test_budget_reservation_precedes_download_or_target_write(self):
        p=self.plan();b=c.MultipartBudget(p);b.reserve('transport_bytes',p['budgets']['transport_bytes'])
        with self.assertRaises(c.Refusal):b.reserve('transport_bytes',1)
        self.assertEqual(b.used['transport_bytes'],p['budgets']['transport_bytes'])
        with tempfile.TemporaryDirectory() as raw:
            root=Path(raw);paths=self.files(root,b'authentic bytes',p);b.reserve('workspace_bytes',p['budgets']['workspace_bytes']);target=root/'out'
            with self.assertRaises(c.Refusal):c.reconstruct_parts(paths,p['objects']['source.tar.gz'],target,b)
            self.assertFalse(target.exists())
        times=iter([0,31]);expired=c.MultipartBudget(p,clock=lambda:next(times))
        with self.assertRaisesRegex(c.Refusal,'deadline'):expired.reserve('transport_bytes',0)
    def test_real_zip_compressed_and_expanded_caps_and_closed_payload_roster(self):
        body=b'0123456789';p=self.plan(body,10);part=p['objects']['source.tar.gz']['parts'][0]
        with tempfile.TemporaryDirectory() as raw:
            root=Path(raw)
            for kind in ('good','extra','symlink','expanded','compressed','tamper'):
                zpath=root/(kind+'.zip')
                with zipfile.ZipFile(zpath,'w') as z:
                    info=zipfile.ZipInfo('payload.bin');info.external_attr=(0o120777 if kind=='symlink' else 0o100644)<<16;z.writestr(info,body if kind!='tamper' else b'X'*10)
                    if kind=='extra':z.writestr('extra',b'x')
                row={'bytes':zpath.stat().st_size,'expanded_bytes':10,'provenance':{'sha256':c.digest(zpath)}}
                if kind=='expanded':row['expanded_bytes']=11
                if kind=='compressed':row['bytes']=67108865
                if kind=='good':c.multipart_envelope(zpath,root/'out',row,part,c.MultipartBudget(p));self.assertEqual((root/'out').read_bytes(),body)
                else:
                    with self.subTest(kind=kind),self.assertRaises(c.Refusal):c.multipart_envelope(zpath,root/(kind+'out'),row,part,c.MultipartBudget(p))
    def test_complete_git_stream_raw_and_gzip_no_json_or_unicode_rewrite(self):
        import gzip
        payload=b'UTF8\xc3\xa9 + pair\xf0\x9f\x98\x80 + opaque bytes\xff';tar=self.tar(payload);roster={'unicode.txt':('100644',c.git_blob(payload))}
        for wire in (tar,gzip.compress(tar,mtime=0)):
            p=self.plan(wire,split=317);src=p['source'];src.update(tar_bytes=len(tar),tar_sha256=hashlib.sha256(tar).hexdigest(),member_bytes=len(payload))
            with tempfile.TemporaryDirectory() as raw:
                paths=self.files(Path(raw),wire,p);stream=c.PartStream(paths,p['objects']['source.tar.gz'])
                result=c.stream_source_archive(stream,roster,'1'*40,src);self.assertEqual(result['members'],1);self.assertEqual(stream.total,len(wire));stream.close()
    def test_source_stream_member_header_pax_path_type_blob_and_tail_mutants(self):
        payload=b'original';tar=self.tar(payload);src=self.plan()['source'];src.update(tar_bytes=len(tar),tar_sha256=hashlib.sha256(tar).hexdigest(),member_bytes=len(payload))
        roster={'unicode.txt':('100644',c.git_blob(payload))}
        for kind in ('blob','missing','commit','tail','truncated','path','link'):
            body=tar;rows=roster;commit='1'*40;limits=copy.deepcopy(src)
            if kind=='blob':rows={'unicode.txt':('100644','f'*40)}
            if kind=='missing':rows={'absent':('100644',c.git_blob(payload))}
            if kind=='commit':commit='2'*40
            if kind=='tail':body=tar[:-1]+b'X'
            if kind=='truncated':body=tar[:-513]
            if kind=='path':body=self.tar(payload,name='../escape')
            if kind=='link':body=self.tar(name='unicode.txt',kind=tarfile.SYMTYPE,link='../../escape');rows={'unicode.txt':('120000',c.git_blob(b'../../escape'))};limits['member_bytes']=0
            with self.subTest(kind=kind),self.assertRaises(c.Refusal):c.stream_source_archive(io.BytesIO(body),rows,commit,limits)
        # PAX size is refused directly from header, BEFORE body allocation/read.
        header=bytearray(tar[:512]);header[124:136]=('%011o\0'%(c.MAX_PAX+1)).encode();header[148:156]=b'        ';header[148:156]=('%06o\0 '%sum(header)).encode()
        with self.assertRaisesRegex(c.Refusal,'pax-bound'):c.stream_source_archive(io.BytesIO(bytes(header)),roster,'1'*40,src)
    def test_new_candidate_profile_requires_complete_roles_and_old_caps_unchanged(self):
        a=fixture();a['profile']=c.MULTIPART_CANDIDATE;roles=list(c.COMMON_ROLES)+[a['platform']+'/'+r for r in c.HOST_ROLES];a['transport']=self.plan(roles=roles);c.validate(a)
        old=fixture();old['bounds']['artifact_bytes']=67108865
        with self.assertRaises(c.Refusal):c.validate(old)
        wrong=copy.deepcopy(a);wrong['transport']['objects']['source.tar.gz']['roles']=['source']
        wrong['transport']['budgets']['role_bytes']=wrong['transport']['budgets']['logical_bytes']
        with self.assertRaisesRegex(c.Refusal,'complete-logical-roles'):c.validate(wrong)
        old['bounds']['artifact_bytes']=67108864;old['transport']=a['transport']
        with self.assertRaises(c.Refusal):c.validate(old)
    def test_local_part_seal_preserves_original_whole_bytes_and_all_role_membership(self):
        body=b'authentic bytes';a=fixture();a['profile']=c.MULTIPART_CANDIDATE;a['transport']=self.plan(body)
        with tempfile.TemporaryDirectory() as raw:
            out=Path(raw);retained=out/'retained';retained.mkdir();(retained/'source.tar.gz').write_bytes(body);(retained/'source.tar.gz').chmod(0o644);(retained/'proof.txt').write_bytes(b'bounded proof')
            result=c.seal_multipart(out,a);self.assertTrue(result['fullRetention']);self.assertFalse(result['uploadReadbackAuthenticated']);self.assertFalse(result['qualified'])
            self.assertEqual((out/'owned/multipart-originals/source.tar.gz').read_bytes(),body)
            self.assertEqual(c.multipart_upload_outputs(out,a),[0,1,2])
            (out/'multipart-payloads/000/payload.bin').write_bytes(b'bad')
            with self.assertRaises(c.Refusal):c.multipart_upload_outputs(out,a)
    def test_interrupted_missing_objects_retains_failure_not_full_retention(self):
        a=fixture();a['transport']=self.plan();record={'status':'failed','failure':'original refusal'}
        with tempfile.TemporaryDirectory() as raw:
            out=Path(raw);(out/'retained').mkdir();r=c.seal_multipart(out,a,record)
            self.assertFalse(r['fullRetention']);self.assertEqual(r['objects'][0]['refusal'],'missing-or-changed-logical-object');self.assertEqual(record['failure'],'original refusal')
            self.assertFalse(r['qualified']);self.assertEqual(c.multipart_upload_outputs(out,a),[])
    def test_finite_schema_workflow_no_new_matrix_or_unbounded_part_upload(self):
        schema=c.read(ROOT/'qualification-inputs/core-successor-qualification.schema.json');self.assertEqual(schema['$defs']['multipart-objects']['maxProperties'],128)
        self.assertEqual(schema['$defs']['multipart-part']['properties']['length']['maximum'],62914560)
        workflow=c.read(ROOT/c.WORKFLOW)
        for name,job in workflow['jobs'].items():
            self.assertNotIn('strategy',job);parts=[x for x in job['steps'] if x.get('name','').startswith(c.UPLOAD_STEP+' / part-')]
            self.assertEqual(len(parts),c.MAX_PARTS);self.assertLessEqual(len(job['steps']),256)
            for i,step in enumerate(parts):
                self.assertIn('part_%03d'%i,step['if']);self.assertIn("multipart == 'true'",step['if']);self.assertEqual(step['with']['compression-level'],0);self.assertEqual(step['uses'],'actions/upload-artifact@v4')
            self.assertIn('admitted',job['if'])



def multipart_material_fixture():
    a=fixture();t=MultipartTransportTests().plan();q=[]
    for i,part in enumerate(t['objects']['source.tar.gz']['parts']):
        p=material(a,kind='qualified');p.update(artifact=790+i,envelope='part-%03d'%i,upload_step=c.UPLOAD_STEP+' / part-%03d'%i,members={'payload.bin':part['sha256']})
        q.append({'object':'source.tar.gz','ordinal':i,'bytes':200,'expanded_bytes':part['length'],'provenance':p})
    proof=material(a,kind='qualified');proof.update(artifact=999,envelope='proof')
    m={'profile':c.MULTIPART_MATERIAL,'source':a['source']['commit'],'controller':a['controller']['commit'],'platform':a['platform'],'kind':'qualified','objects':t['objects'],'envelopes':q,'proof':proof,'proof_bytes':100,'proof_expanded_bytes':50,'totals':{'budgets':t['budgets'],'source':t['source'],'transport_bytes':700,'expanded_bytes':65}}
    return a,t,m


class MultipartOriginalCustodyTests(unittest.TestCase):
    def test_original_part_artifact_names_and_upload_windows_not_legacy_aliases(self):
        a,t,m=multipart_material_fixture();a['profile']=c.MULTIPART_CANDIDATE;c.multipart_material_shape(m);p=m['envelopes'][0]['provenance']
        run={'id':123,'run_attempt':1,'head_sha':'b'*40,'path':c.WORKFLOW,'event':'workflow_dispatch','repository':{'full_name':c.REPO,'id':1382276802,'owner':{'id':273466046}},'status':'completed','conclusion':'success'}
        job={'id':456,'run_id':123,'run_attempt':1,'head_sha':'b'*40,'name':'linux','labels':['ubuntu-24.04'],'status':'completed','conclusion':'success','started_at':'2026-11-05T00:00:00Z','completed_at':'2026-11-05T00:02:00Z','steps':[{'name':p['upload_step'],'status':'completed','conclusion':'success','started_at':'2026-11-05T00:01:00Z','completed_at':'2026-11-05T00:01:10Z'}]}
        art={'id':p['artifact'],'expired':False,'name':'core-successor-linux-123-1-part-000','digest':'sha256:'+p['sha256'],'workflow_run':{'id':123,'head_sha':'b'*40},'created_at':'2026-11-05T00:01:05Z'}
        c.provenance(p,run,job,art,a)
        for key,value in [('name','core-successor-linux-123-1'),('created_at','2026-11-05T00:01:11Z'),('id',999),('digest','sha256:'+'f'*64)]:
            wrong=dict(art);wrong[key]=value
            with self.subTest(key=key),self.assertRaises(c.Refusal):c.provenance(p,run,job,wrong,a)
    def test_mixed_origin_duplicate_missing_reordered_parts_and_exact_totals_refuse(self):
        a,t,m=multipart_material_fixture();c.multipart_material_shape(m)
        for kind in ('source','controller','platform','artifact','label','missing','order','compressed','expanded','total','proof-origin','proof-label'):
            x=copy.deepcopy(m);r=x['envelopes'][0]
            if kind in ('source','controller','platform'):r['provenance'][kind]='f'*40 if kind!='platform' else 'macos-arm64'
            if kind=='artifact':r['provenance']['artifact']=x['envelopes'][1]['provenance']['artifact']
            if kind=='label':r['provenance']['envelope']='part-001'
            if kind=='missing':x['envelopes'].pop()
            if kind=='order':x['envelopes'].reverse()
            if kind=='compressed':r['bytes']=67108865
            if kind=='expanded':r['expanded_bytes']+=1
            if kind=='total':x['totals']['transport_bytes']+=1
            if kind=='proof-origin':x['proof']['source']='f'*40
            if kind=='proof-label':x['proof']['envelope']='part-007';x['proof']['upload_step']=c.UPLOAD_STEP+' / part-007'
            with self.subTest(kind=kind),self.assertRaises(c.Refusal):c.multipart_material_shape(x)
    def test_workspace_copies_counted_and_untrusted_mode_cannot_authorize_seal(self):
        with tempfile.TemporaryDirectory() as raw:
            root=Path(raw);(root/'one').write_bytes(b'original');(root/'copy').write_bytes(b'original')
            with self.assertRaisesRegex(c.Refusal,'workspace-exceeded'):c.workspace_bound(root,15)
            self.assertEqual(c.workspace_bound(root,16),16)
            (root/'multipart-mode.json').write_text(json.dumps({'id':'foreign','source':fixture()['source'],'controller':fixture()['controller']}))
            with self.assertRaises(c.Refusal):c.authorized_seal(root,ROOT)
    def test_new_schema_keeps_old_closed_shapes_and_empty_registry_authority(self):
        s=c.read(ROOT/'qualification-inputs/core-successor-qualification.schema.json')
        self.assertEqual(s['$defs']['admission']['properties']['profile']['const'],c.PROFILE)
        self.assertEqual(s['$defs']['bounds']['properties']['artifact_bytes']['maximum'],67108864)
        self.assertFalse(s['$defs']['material']['additionalProperties'])
        self.assertNotIn('transport',s['$defs']['admission']['properties'])
        self.assertEqual(s['$defs']['multipart-material']['properties']['envelopes']['maxItems'],128)
        self.assertFalse(s['$defs']['multipart-plan']['additionalProperties'])
        self.assertFalse(c.read(ROOT/c.REGISTRY_PATH)['admissions'])
        self.assertFalse(s['$defs']['admission']['additionalProperties'])
        self.assertIn('initialInspector',s['$defs']['admission']['properties'])
        initial=s['$defs']['initial-inspector']
        self.assertFalse(initial['additionalProperties'])
        self.assertEqual(initial['properties']['workflow_id']['const'],c.INSPECTOR_WORKFLOW_ID)
        self.assertEqual(initial['properties']['run']['minimum'],1)
        self.assertEqual(initial['properties']['source']['$ref'],'#/$defs/commit')
        self.assertEqual(s['$defs']['admission']['properties']['continuation']['oneOf'][1]['$ref'],'#/$defs/material')




class MultipartTwoHoldRedTests(unittest.TestCase):
    def test_legacy_common_and_continuation_do_not_accept_envelope_extension(self):
        for field in ('common','continuation'):
            a=fixture();a[field]=material(a,field);a[field]['envelope']='proof'
            with self.subTest(field=field),self.assertRaisesRegex(c.Refusal,'closed-fields-differ'):c.validate(a)
    def test_midstream_reassembly_expiry_refuses_before_output_write(self):
        helper=MultipartTransportTests();body=b'authentic bytes';p=helper.plan(body);now=[0]
        with tempfile.TemporaryDirectory() as raw:
            root=Path(raw);paths=helper.files(root,body,p);budget=c.MultipartBudget(p,clock=lambda:now[0]);target=root/'output'
            original=c.PartStream.read
            def slow(stream,n):
                value=original(stream,n);now[0]=31;return value
            with patch.object(c.PartStream,'read',slow):
                with self.assertRaisesRegex(c.Refusal,'deadline'):c.reconstruct_parts(paths,p['objects']['source.tar.gz'],target,budget)
            self.assertFalse(target.exists() and target.stat().st_size>0,'expired read must not be written')


class MultipartDeadlineAndIsolationTests(unittest.TestCase):
    def test_legacy_aggregate_and_new_material_forms_remain_closed(self):
        aggregate,*_=CoupledExtensionTests().prepared()
        for kind in ('envelope','multipart'):
            a=copy.deepcopy(aggregate);first=a['components']['linux-x86_64']['material']
            if kind=='envelope':first['envelope']='proof'
            else:a['components']['linux-x86_64']['material']=multipart_material_fixture()[2]
            with self.subTest(kind=kind),self.assertRaisesRegex(c.Refusal,'closed-fields-differ'):c.validate(a)
        for field in ('common','continuation'):
            a=fixture();a[field]=multipart_material_fixture()[2];a[field]['kind']=field
            with self.subTest(field=field),self.assertRaises(c.Refusal):c.validate(a)
        a=fixture();a['profile']=c.MULTIPART_CANDIDATE;a['transport']=MultipartTransportTests().plan(roles=list(c.COMMON_ROLES)+[a['platform']+'/'+x for x in c.HOST_ROLES]);a['common']=material(a);a['common']['envelope']='proof'
        c.validate(a)
    def test_parser_blocked_read_and_final_eof_expiry_no_completion(self):
        helper=MultipartTransportTests();payload=b'authentic';body=helper.tar(payload);src=helper.plan()['source'];src.update(tar_bytes=len(body),tar_sha256=hashlib.sha256(body).hexdigest(),member_bytes=len(payload))
        for when in ('first','eof'):
            now=[0];deadline=c.OperationDeadline(30,clock=lambda:now[0]);calls=[];finished=[]
            class Slow(io.BytesIO):
                def read(self,n):
                    calls.append(n);value=super().read(n)
                    if when=='first' or not value:now[0]=31
                    return value
                def finish(self):finished.append(True)
            with self.subTest(when=when),self.assertRaisesRegex(c.Refusal,'deadline'):c.stream_source_archive(Slow(body),{'unicode.txt':('100644',c.git_blob(payload))},'1'*40,src,deadline)
            self.assertEqual(finished,[])
            if when=='first':self.assertEqual(calls,[2])
    def test_reassembly_expired_write_has_no_second_chunk_or_chmod(self):
        helper=MultipartTransportTests();body=b'authentic bytes';p=helper.plan(body);now=[0];deadline=c.OperationDeadline(30,clock=lambda:now[0])
        with tempfile.TemporaryDirectory() as raw:
            root=Path(raw);paths=helper.files(root,body,p);target=root/'restored';writes=[];original=c.timed_write
            def write(out,data,d):
                writes.append(bytes(data));value=original(out,data,d);now[0]=31;return value
            with patch.object(c,'timed_write',side_effect=write),patch.object(Path,'chmod') as mode:
                with self.assertRaisesRegex(c.Refusal,'deadline'):c.reconstruct_parts(paths,p['objects']['source.tar.gz'],target,c.MultipartBudget(p,deadline=deadline))
            self.assertEqual(len(writes),1);mode.assert_not_called()
    def test_seal_hash_and_finalization_expiry_cannot_return_complete(self):
        helper=MultipartTransportTests();a=fixture();a['transport']=helper.plan();a['profile']=c.MULTIPART_CANDIDATE
        for where in ('hash','finalize'):
            now=[0];deadline=c.OperationDeadline(30,clock=lambda:now[0])
            with tempfile.TemporaryDirectory() as raw:
                out=Path(raw);(out/'retained').mkdir();p=out/'retained/source.tar.gz';p.write_bytes(b'authentic bytes');p.chmod(0o644)
                fn=c.digest if where=='hash' else c.finalize_retention
                def slow(*args,**kwargs):value=fn(*args,**kwargs);now[0]=31;return value
                name='digest' if where=='hash' else 'finalize_retention'
                with patch.object(c,name,side_effect=slow):
                    with self.assertRaisesRegex(c.Refusal,'deadline'):c.seal_multipart(out,a,deadline=deadline)
                if where=='hash':
                    self.assertFalse((out/'retained/multipart-index.json').exists());self.assertFalse(list((out/'multipart-payloads').rglob('payload.bin')))
    def test_network_remaining_timeout_and_expired_response_before_file_write(self):
        now=[0];deadline=c.OperationDeadline(30,clock=lambda:now[0]);now[0]=5;timeouts=[]
        class Response(io.BytesIO):
            def __enter__(self):return self
            def __exit__(self,*args):self.close()
        class Opener:
            def open(self,request,timeout):timeouts.append(timeout);now[0]=31;return Response(b'original')
        with tempfile.TemporaryDirectory() as raw,patch.object(c.urllib.request,'build_opener',return_value=Opener()):
            path=Path(raw)/'download'
            with self.assertRaisesRegex(c.Refusal,'deadline'):c.api('actions/artifacts/1/zip',True,sink=path,deadline=deadline)
            self.assertFalse(path.exists());self.assertEqual(timeouts,[25])
    def test_blocked_network_chunk_cannot_be_written_or_reported_success(self):
        now=[0];deadline=c.OperationDeadline(30,clock=lambda:now[0]);socket=Mock()
        class Response(io.BytesIO):
            fp=types.SimpleNamespace(raw=types.SimpleNamespace(_sock=socket))
            def __enter__(self):return self
            def __exit__(self,*args):self.close()
            def read(self,n):value=super().read(n);now[0]=31;return value
        opener=Mock();opener.open.return_value=Response(b'authentic')
        with tempfile.TemporaryDirectory() as raw,patch.object(c.urllib.request,'build_opener',return_value=opener):
            p=Path(raw)/'part'
            with self.assertRaisesRegex(c.Refusal,'deadline'):c.api('actions/artifacts/1/zip',True,sink=p,deadline=deadline)
            self.assertEqual(p.stat().st_size,0);socket.settimeout.assert_called_once_with(30)
    def test_same_deadline_reused_across_mode_phases_and_no_part_reset(self):
        now=[0];a=fixture();a['profile']=c.MULTIPART_CANDIDATE;a['transport']=MultipartTransportTests().plan()
        with tempfile.TemporaryDirectory() as raw:
            root=Path(raw);first=c.operation_deadline(root,a,clock=lambda:now[0]);mode=(root/'multipart-mode.json').read_bytes();now[0]=29
            second=c.operation_deadline(root,a,clock=lambda:now[0]);self.assertEqual(first.started,second.started);self.assertEqual(second.remaining(),1)
            b=c.MultipartBudget(a['transport'],deadline=second);now[0]=31
            for operation in (lambda:b.reserve('transport_bytes',0),lambda:c.operation_deadline(root,a,clock=lambda:now[0])):
                with self.assertRaisesRegex(c.Refusal,'deadline'):operation()
            self.assertEqual((root/'multipart-mode.json').read_bytes(),mode)
    def test_final_retention_hash_expiry_and_child_phase_timeout_no_success(self):
        now=[0];deadline=c.OperationDeadline(30,clock=lambda:now[0])
        with tempfile.TemporaryDirectory() as raw:
            out=Path(raw);(out/'retained').mkdir();(out/'retained/proof').write_bytes(b'authentic')
            original=c.digest
            def slow(*a,**k):value=original(*a,**k);now[0]=31;return value
            with patch.object(c,'digest',side_effect=slow):
                with self.assertRaisesRegex(c.Refusal,'deadline'):c.finalize_retention(out,deadline=deadline)
            self.assertFalse((out/'retained/retention.json').exists())
        child=Mock();child.poll.return_value=0;child.returncode=0;now[0]=0;deadline=c.OperationDeadline(30,clock=lambda:now[0])
        def popen(*args,**kwargs):now[0]=31;return child
        with tempfile.TemporaryDirectory() as raw,patch.object(c.subprocess,'Popen',side_effect=popen):
            with self.assertRaisesRegex(c.Refusal,'deadline'):c.run_bounded(['synthetic'],Path(raw),{},600,Path(raw)/'log',4096,op_deadline=deadline)




class MultipartExpiredDiagnosticTests(unittest.TestCase):
    def test_expiry_retains_only_small_diagnostic_without_payload_hash_or_replay(self):
        with tempfile.TemporaryDirectory() as raw:
            out=Path(raw);(out/'retained').mkdir();(out/'retained/actual-payload').write_bytes(b'original bytes')
            with patch.object(c,'digest',side_effect=AssertionError('No payload hashing after expiry')):
                result=c.expired_multipart_diagnostic(out,'multipart-deadline')
            self.assertFalse(result['fullRetention']);self.assertFalse(result['qualified']);self.assertFalse(result['payloadHashesObserved'])
            self.assertEqual((out/'owned/expired-unretained/actual-payload').read_bytes(),b'original bytes')
            self.assertEqual([p.name for p in (out/'retained').iterdir()],['expired-diagnostic.json'])
            self.assertLessEqual((out/'retained/expired-diagnostic.json').stat().st_size,4096)
            with self.assertRaises(c.Refusal):c.expired_multipart_diagnostic(out,'second attempt forbidden')



class MultipartNetworkCloseDeadlineTests(unittest.TestCase):
    def test_response_close_expiry_is_not_reported_as_completed_download(self):
        now=[0];deadline=c.OperationDeadline(30,clock=lambda:now[0])
        class Response(io.BytesIO):
            def __enter__(self):return self
            def __exit__(self,*args):self.close();now[0]=31
        opener=Mock();opener.open.return_value=Response(b'authentic')
        with tempfile.TemporaryDirectory() as raw,patch.object(c.urllib.request,'build_opener',return_value=opener):
            with self.assertRaisesRegex(c.Refusal,'deadline'):c.api('actions/artifacts/1/zip',True,sink=Path(raw)/'part',deadline=deadline)



class Closed01010CandidateInputTests(unittest.TestCase):
    """Synthetic source helper custody only, never actual G0/native evidence."""
    def tree(self, root, helper_version='0.10.10'):
        a=fixture();a['version']='0.10.10'
        candidate=root/c.CANDIDATE01010_RESOURCES;candidate.parent.mkdir(parents=True)
        candidate.write_text('{"synthetic":true}')
        helper=root/c.CANDIDATE01010_PROBE;helper.parent.mkdir(parents=True)
        helper.write_text("def current_inputs(root, selected):\n    return {}, {'synthetic': True}\ndef input_metadata_version(identity):\n    return "+repr(helper_version)+"\n")
        files={name:c.digest(root/name) for name in (c.CANDIDATE01010_RESOURCES,c.CANDIDATE01010_PROBE)}
        a['inputs'].update(files)
        census={'currentInputs':{'fixturePath':c.CANDIDATE01010_RESOURCES,'fixtureSHA256':files[c.CANDIDATE01010_RESOURCES],'metadataVersion':'0.10.10'},'sourceFiles':files.copy()}
        return a,census
    def test_fixed_candidate_joins_source_census_and_actual_pure_helper(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);a,census=self.tree(root)
            self.assertEqual(c.selected_current_resources(a,root,census),c.CANDIDATE01010_RESOURCES)
    def test_old_source_route_keeps_original_fixture(self):
        self.assertEqual(c.selected_current_resources(fixture(),Path('/absent'),{}),c.CURRENT_RESOURCES)
    def test_wrong_path_version_hash_or_source_pin_refuses(self):
        for change in ('old-path','arbitrary-path','version','fixture-hash','source-pin','bytes','helper-version'):
            with self.subTest(change=change),tempfile.TemporaryDirectory() as directory:
                root=Path(directory);a,census=self.tree(root,'0.10.9' if change=='helper-version' else '0.10.10')
                if change=='old-path':census['currentInputs']['fixturePath']=c.CURRENT_RESOURCES
                if change=='arbitrary-path':census['currentInputs']['fixturePath']='caller.json'
                if change=='version':census['currentInputs']['metadataVersion']='0.10.9'
                if change=='fixture-hash':census['currentInputs']['fixtureSHA256']='a'*64
                if change=='source-pin':census['sourceFiles'][c.CANDIDATE01010_PROBE]='a'*64
                if change=='bytes':(root/c.CANDIDATE01010_RESOURCES).write_text('changed')
                with self.assertRaises((c.Refusal, ValueError)):c.selected_current_resources(a,root,census)
    def test_pending_or_unreviewed_owner_adapter_refuses_without_fallback(self):
        for source in ("def current_inputs(*args): raise ValueError('pending source-bound G0')\ndef input_metadata_version(identity): return '0.10.10'\n",'x=1\n'):
            with tempfile.TemporaryDirectory() as directory:
                root=Path(directory);a,census=self.tree(root);helper=root/c.CANDIDATE01010_PROBE;helper.write_text(source)
                expected=c.digest(helper);a['inputs'][c.CANDIDATE01010_PROBE]=expected;census['sourceFiles'][c.CANDIDATE01010_PROBE]=expected
                with self.assertRaises((c.Refusal, ValueError)):c.selected_current_resources(a,root,census)


if __name__=='__main__':unittest.main()
