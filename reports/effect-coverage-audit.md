# Card effect implementation audit (development)

> This is a static first-pass audit, not proof of runtime behavior. A phrase matched by a pattern may still be only partially implemented; a phrase unmatched here may be a passive rule or deck-building note rather than an executable effect.

- Card records: 737
- Cards with effect text: 721
- Cards without effect text: 16
- Effect clauses split on Japanese full stop/semicolon: 1447
- Clauses not matched by the current first-pass action patterns: 312 occurrences across 190 unique phrases

## Cards without effect text

- チビドラゴン (card_0014)
- スライム (card_0043)
- 短剣の騎士 (card_0045)
- 棒ゴブリン (card_0052)
- 蒼魚 (card_0054)
- 桜小鳥 (card_0068)
- 剣ゴブリン (card_0084)
- イノシシ (card_0139)
- 戦闘兵器 : C (card_0146)
- ブレイズスラスター (card_0150)
- マスターゴブリン (card_0156)
- ウミガメ (card_0245)
- ゴーレム (card_0262)
- 巨大破砕機 (card_0402)
- 岩の人形 (card_0421)
- 凍土の王 (card_0440)

## Clauses not matched by first-pass action patterns

Review each phrase against the original card wording before implementation. Repeated names indicate separate source records may share the same text.

### 」を持つ
- Occurrences: 31
- Cards: 銀雪の幼竜、ソラトビペンギン、ハブタエラプトル、花禍の穿蜂、銀雪の灰竜、尖晶石の精霊、宝石姫サファイア、雪女、飛天の騎獣、疾風のハーピー、熟達の女騎士、陽光の獅子、影の毒喰み、炎鱗狩りの剣士、闇魔大王、銀雪の蒼竜、森の脅威、暴牙のティラノ、ゼウス、碑獣タイタン、糸動源、白魔の訪れ、幽体化、アクセラモーター、氷漬け、古びた加速部品、炎鱗双剣、銀雪夜、詠唱魔法陣・奔流、天空城

### これはタップして場に出る
- Occurrences: 24
- Cards: アクアエネルギー、ムゲンエネルギー、マリンエネルギー、ボルケーノエネルギー、ヘヴンエネルギー、ブーストエネルギー、ブレイブエネルギー、フォレストエネルギー、ヒールエネルギー、ヒートエネルギー、パーツエネルギー、パワーエネルギー、リチャージエネルギー、ネイチャーエネルギー、ドローエネルギー、ダークエネルギー、ダメージエネルギー、スマッシュエネルギー、スプリットエネルギー、スピネルエネルギー、シャリエエネルギー、キュアエネルギー、オーバーエネルギー、インパクトエネルギー

### 相手の効果で選ばれない
- Occurrences: 15
- Cards: 微風魚、ヒツジ、悪逆のユナロス、クサリガマグロの握り、テミスの天秤、碑獣ガリル、Not Found、鉄皮ヘビ、輸送機サンタ・クロス、大海蛇、万緑の巨象、天界の戦馬、円盾の守護者、深青の大鯨、封印されし悪魔像

### ※このカードは何枚でもデッキに入れることができる
- Occurrences: 10
- Cards: 竹の魔物、量産型タイロス、アクアエネルギー、マリンエネルギー、フォレストエネルギー、ヒートエネルギー、ノーマルエネルギー、ネイチャーエネルギー、ダークエネルギー

### モンスターとの戦闘時、戦闘相手のパワーで戦闘する
- Occurrences: 8
- Cards: ポイズンゾンビ、サンリ、花禍の穿蜂、豹紋蛸、蜂軍団長、ヘビ、鉄皮ヘビ、大蛇

### 自分の[宝石]が2体以上場にいるなら、全て行う
- Occurrences: 6
- Cards: 尖晶石の片腕、尖晶石の人形、尖晶石の精霊、尖晶石の桃鱗、尖晶石の晶翼、導く尖晶石

### 場に出た時、以下からランダムに1つ行う
- Occurrences: 5
- Cards: 尖晶石の片腕、尖晶石の人形、尖晶石の精霊、尖晶石の桃鱗、尖晶石の晶翼

### 」を持たせて出す
- Occurrences: 5
- Cards: 蟻司司令官、黎明の天使、電光石火、緊急発進台、輪廻転生

### 相手の翼は発動しない
- Occurrences: 4
- Cards: 魔風のハーピー、風読みのハーピー、大翼のハーピー、疾風のハーピー

### 自分のデッキからエネルギー1枚までをタップして出す
- Occurrences: 4
- Cards: 変換、気竜術、緑化、緑の大地

### (これをタップ) 共鳴召喚を行う
- Occurrences: 3
- Cards: 誓いの天使、魔装の寿司職人、祈りの天使像

### 場に出た時、以下から1つ選ぶ
- Occurrences: 3
- Cards: 山麓の補給兵、竜討毒の鳥、夢見屋 亡霊&研究者

### モンスターとの戦闘時、これのパワーの代わりに0パワーで戦闘する
- Occurrences: 3
- Cards: 鋼鉄の繭、弩弓の騎士、剛健なツリーフォーク

### 自分のデッキの向きを変える
- Occurrences: 3
- Cards: 丸太騙し、月迎え、宵闇の水面

### 」は働かない
- Occurrences: 2
- Cards: 泡の異形、第二の太陽

### 場に出た時、これを=(自分の名前に「スライム」を含むモンスターの数×300)
- Occurrences: 2
- Cards: ナイトスライム

### 自分の手札の[竜術師]のコスト-1
- Occurrences: 2
- Cards: 竜術師

### 相手の罠は発動しない
- Occurrences: 2
- Cards: 黒い花、銀翼のハーピー

### これを2回行う
- Occurrences: 2
- Cards: 魔泡の魔王、森焼き

### 場に出た時、相手のモンスター全ての効果を消す
- Occurrences: 2
- Cards: 鼓膜破り、雪岳龍ダースアン

### 自分の[海]のフィールドが場にある時相手の効果で選ばれない
- Occurrences: 2
- Cards: 水底渡り、深海の禍根

### )
- Occurrences: 2
- Cards: 共鳴、愛おしき放課後

### 自分のデッキから「ノーマルエネルギー」1枚までをタップして出す
- Occurrences: 2
- Cards: 森の贄、森の雫

### 以下から1つ選ぶ
- Occurrences: 2
- Cards: 十文字炎、冥府の境界

### ※このカードは何枚でもデッキに入れる事ができる
- Occurrences: 2
- Cards: ボルケーノエネルギー、ヘヴンエネルギー

### 場に出た時、自分のモンスター1体を+200
- Occurrences: 2
- Cards: ブレイブエネルギー、パワーエネルギー

### (1) 自分のデッキから「古びた地図」1枚までを使用する
- Occurrences: 1
- Cards: 地図ゴブリン

### 場に出た時、モンスター全てを=1
- Occurrences: 1
- Cards: 棒人間

### ②ランダムな相手のモンスター1体を-200
- Occurrences: 1
- Cards: 尖晶石の片腕

### 場に出た時、相手のモンスター1体の効果を消す
- Occurrences: 1
- Cards: 悪戯フェアリー

### 場に出た時、自分のデッキの向きを変える
- Occurrences: 1
- Cards: 酒呑童子

### (これをタップ) 自分の[妖怪]1体の「場に出た時」の効果をコピーする
- Occurrences: 1
- Cards: 酒呑童子

### 場に出た時、場のカウンター全てを除く
- Occurrences: 1
- Cards: 垢舐め

### (これをタップ) 自分のデッキの向きを変える
- Occurrences: 1
- Cards: 垢舐め

### 自分のターン終了時、自分のデッキの向きを変える
- Occurrences: 1
- Cards: 鵺

### 場に出た時、自分の名前に「鮫」を含むモンスターが場にいるなら、マナ+2
- Occurrences: 1
- Cards: コバンザメ

### 自分のターン終了時、モンスター全てを-100
- Occurrences: 1
- Cards: 腐りスライム

### 庭の夕暮れに、影だけはまだ駆けていた
- Occurrences: 1
- Cards: いぬ

### キラキラとした瞳が、胸の奥で静かに光る
- Occurrences: 1
- Cards: いぬ

### 場に出た時、自分の手札からエネルギー1枚までをタップして出す
- Occurrences: 1
- Cards: 丸太のゴーレム

### 場に出た時、自分のデッキから罠1枚までを秘密裏に伏せる
- Occurrences: 1
- Cards: 蒼木蜘蛛

### (カウンター-5)これを×2
- Occurrences: 1
- Cards: 華乙女ベゴニア

### 場に出た時、自分の手札から[地]のエネルギー1枚までをタップして出す
- Occurrences: 1
- Cards: 碑獣ガーヴ

### 共鳴召喚:「彩戦紙トパーズ」、「彩戦紙インディゴ」自分のターン開始時、自分のマナ＋（これのカウンターの数）
- Occurrences: 1
- Cards: 極彩戦紙アマル

### 場に出た時、自分の[騎士]1体を+300
- Occurrences: 1
- Cards: 部隊指揮官

### ②他のモンスター1体を-400
- Occurrences: 1
- Cards: 竜討毒の鳥

### (2) モンスター1体の効果を消す
- Occurrences: 1
- Cards: 絵画の幽霊

### 自分の[海]のフィールドが場にある時は相手の効果で選ばれない
- Occurrences: 1
- Cards: 豹紋蛸

### 自分の手札の[火]のコスト-1
- Occurrences: 1
- Cards: 炎鱗鬼ヴァサゴ

### 場に出た時、相手のモンスター1体を-300
- Occurrences: 1
- Cards: 毒沼の竜

### 場に出た時、これのパワー= (モンスターの最大パワー)
- Occurrences: 1
- Cards: 精神の鏡

### 共鳴召喚：[装備]×2自分のターン開始時、自分のデッキから[装備]1枚までを使用する
- Occurrences: 1
- Cards: 古城の呪剣

### 場に出た時、未来を照らす
- Occurrences: 1
- Cards: 尖晶石の少女

### 場に出た時、自分のデッキから[詠唱]1枚までを使用する
- Occurrences: 1
- Cards: 魔石の詠唱師

### 自分のターン開始時、自分のデッキから3コスト以下の[夢]1枚までを使用する
- Occurrences: 1
- Cards: 夢見のオオクジラ

### 相手の[神]モンスターが場に出た時、これをデッキの下に戻す
- Occurrences: 1
- Cards: 因幡の白うさぎ

### 」を与える
- Occurrences: 1
- Cards: 草の魔物

### 場に出た時、自分の[獣]全てを+300
- Occurrences: 1
- Cards: 獣使い

### 自分の手札の[宝石]のコスト-1
- Occurrences: 1
- Cards: 原石杖の魔術師

### 相手の手札とデッキと捨て札は選ばれない
- Occurrences: 1
- Cards: テミスの天秤

### 共鳴召喚: [ヒト],[植物] 相手の効果で選ばれない
- Occurrences: 1
- Cards: 仮面英雄バンブート

### 場に出た時、相手のモンスター1体を-1000
- Occurrences: 1
- Cards: マイナススナイパー

### お互いのターン開始時のエネルギーのアンタップは、最古のエネルギー1枚のみ発生する
- Occurrences: 1
- Cards: 磯撫で

### 場に出た時、自分のマナ+2
- Occurrences: 1
- Cards: 日傘の海賊嬢

### 場に出た時、自分の捨て札が7枚以上あるなら、自分のマナ+3
- Occurrences: 1
- Cards: 海賊長ヴァルロス

### 手札にある時、これのコスト- (自分の[ハーピー]の数)
- Occurrences: 1
- Cards: 銀翼のハーピー

### 相手の手札の魔法のコスト+1
- Occurrences: 1
- Cards: 彩戦紙ネイビー

### 相手の捨て札は選ばれない
- Occurrences: 1
- Cards: 宇宙の異形

### これは魔法の効果を受けない
- Occurrences: 1
- Cards: 天逆鉾の破片

### 自分の他のモンスターが場に出た時、それを-300
- Occurrences: 1
- Cards: 天逆鉾の破片

### ②相手のモンスター全てを-200
- Occurrences: 1
- Cards: 尖晶石の桃鱗

### 自分の手札の効果の無いモンスターのコスト-1
- Occurrences: 1
- Cards: 雲のゴーレム

### 場に出た時、他のモンスター1体の効果を消す
- Occurrences: 1
- Cards: 雲のゴーレム

### 手札にある時、これのコスト- (自分のタップ中のモンスターの数)
- Occurrences: 1
- Cards: 陣風のハーピー

### 場に出た時、自分のマナ+5
- Occurrences: 1
- Cards: クリスタルドラゴン

### 捨て札にある時、自分のターン開始時、自分の[光]のエネルギーが3枚以上場にあるなら、場から相手の900パワー以下のモンスター1体を捨てて、これをデッキの下に戻す
- Occurrences: 1
- Cards: エクリプスドラゴン

### この効果は消えない
- Occurrences: 1
- Cards: 蒸気機関の古代機

### 場に出た時と (カウンター-5) 、自分のデッキをシャッフルする、自分のデッキの上1枚を公開し、それ1枚までを使用する
- Occurrences: 1
- Cards: 博打魔機 バチカ

### 共鳴召喚：3コスト以上の[騎士],[天竜剣]相手の効果で選ばれない
- Occurrences: 1
- Cards: 天鎧騎士シエロ

### 手札にある時、これのコスト- (相手のモンスターの数)
- Occurrences: 1
- Cards: パナケイア

### 手札にある時、場のモンスターが4体以上同名なら、場にこれのコスト=1
- Occurrences: 1
- Cards: 魔泡の魔王

### (自分の同名が2体以上場にあるモンスター1体を破壊) 以下からランダムに1つ行う
- Occurrences: 1
- Cards: 魔泡の魔王

### 自分の手札のモンスターのコスト-1
- Occurrences: 1
- Cards: 祈りの天使像

### (2) 自分のデッキから2コスト以下の[風]1枚までを使用する
- Occurrences: 1
- Cards: 風の精霊

### (これをタップ) 自分のデッキか捨て札から「百鬼夜行」1枚までを使用する
- Occurrences: 1
- Cards: 闇魔大王

### 場に出た時、モンスター全てを=600
- Occurrences: 1
- Cards: 平穏の使者

### 攻撃時、自分のデッキの上1枚を公開し、それが5コスト以下かコストを持たないなら、それ1枚までを使用する
- Occurrences: 1
- Cards: 黙示録の暴竜

### (自分の他の[火]1体を破壊) これを×2
- Occurrences: 1
- Cards: 溶岩の粘体

### 自分の他の[地,機械]モンスターが場に出た時、自分のマナ+1
- Occurrences: 1
- Cards: 糸動奇 環

### ターン開始時、お互いのマナ+1
- Occurrences: 1
- Cards: 彼岸の精霊 カナロア

### (これを破壊) 自分のデッキから「岳龍マウナ」以外の[山]1枚までを使用する
- Occurrences: 1
- Cards: 岳龍マウナ

### 相手のモンスターが場に出た時、それを=100
- Occurrences: 1
- Cards: 夢幻竜

### 自分の手札の[地]と[火]と[水]と[風]と[雷]と[光]と[闇]のコスト-1
- Occurrences: 1
- Cards: レインボーマジシャン

### (そのターンの攻撃回数もリセットされる
- Occurrences: 1
- Cards: 再起の天使

### エネルギーはタップして場に出る
- Occurrences: 1
- Cards: 彼岸の魔女 リリィ

### 場に出た時、自分の[海]のフィールドが場にあるなら、他のモンスター1体をデッキの下に戻す
- Occurrences: 1
- Cards: 深海の禍根

### 手札にある時、これのコスト- ([闇]モンスターの数)
- Occurrences: 1
- Cards: 破邪の天使

### 」を持つ、これを2回行う
- Occurrences: 1
- Cards: 雪岳龍ダースアン

### (カウンター-1) モンスター1体を-800
- Occurrences: 1
- Cards: 紫毒蜂の女帝

### 自分の手札の[雷]の魔法のコスト=0
- Occurrences: 1
- Cards: 雷神

### (3) これの効果を消す
- Occurrences: 1
- Cards: 封印されし悪魔像

### 手札にある時、これのコスト-（自分の[地,機械]の数）
- Occurrences: 1
- Cards: 屍動鬼

### 手札にある時、これのコスト-（自分の[火]のモンスターの数）
- Occurrences: 1
- Cards: 朱炎の鳳凰

### 手札にある時、これのコスト-（相手の捨て札の枚数）
- Occurrences: 1
- Cards: 空を駆ける者

### 手札にある時、これのコスト- (自分の捨て札の[部品]の枚数)
- Occurrences: 1
- Cards: 最終兵器 : MS

### 手札にある時、これのコスト- (自分の捨て札の[地]の枚数)
- Occurrences: 1
- Cards: 碑獣タイタン

### (2)これは「相手のターン終了時まで相手の効果で選ばれない
- Occurrences: 1
- Cards: 碑獣タイタン

### 手札にある時、これのコスト- (自分の捨て札の魔法の枚数)
- Occurrences: 1
- Cards: 魔石を統べる精霊王

### 自分の手札の魔法のコスト- (自分の名前に「魔石」を含むモンスターの数)
- Occurrences: 1
- Cards: 魔石を統べる精霊王

### 場の自分の[火]のモンスターも共鳴条件として扱うことができる共鳴召喚を行う
- Occurrences: 1
- Cards: 烈火共鳴

### モンスター1体の効果を消す
- Occurrences: 1
- Cards: 光の蝕み

### 自分の[地,機械]1体は「自分のターン終了時まで、これの()効果のエネルギー=1
- Occurrences: 1
- Cards: 糸動源

### 場の自分の[図工]のモンスターも共鳴条件として扱うことができる共鳴召喚を行う
- Occurrences: 1
- Cards: 色彩共鳴

### 共鳴召喚を行う
- Occurrences: 1
- Cards: 共鳴

### 場の自分の[光]のモンスターも共鳴条件として扱うことができる共鳴召喚を行う
- Occurrences: 1
- Cards: 天翔共鳴

### 自分のモンスター1体を+200
- Occurrences: 1
- Cards: 成長

### 勝利時、獲得するBC+300
- Occurrences: 1
- Cards: 愛おしき放課後

### (重複せず、ルームマッチでは働かない
- Occurrences: 1
- Cards: 愛おしき放課後

### 自分の1コスト以下のモンスター全てを+100
- Occurrences: 1
- Cards: 弱者の結束

### モンスター1体を+500
- Occurrences: 1
- Cards: 狂獣化

### 自分のマナ-（自分の残りマナ）
- Occurrences: 1
- Cards: 電光石火

### 自分のデッキから罠1枚までを秘密裏に伏せる
- Occurrences: 1
- Cards: 蜘蛛の目

### [ヒト]か[騎士]1体を+300
- Occurrences: 1
- Cards: 石の剣

### モンスター1体を-200
- Occurrences: 1
- Cards: 冷たき愛

### 」を持つ状態で出す
- Occurrences: 1
- Cards: 供物魔法陣

### 場の自分の[天使]のモンスターも条件として扱うことができる共鳴召喚を行う
- Occurrences: 1
- Cards: 光器共鳴

### 自分の[機械,玩具]1体を+300
- Occurrences: 1
- Cards: インパクトガイド

### 相手のモンスター1体を-500
- Occurrences: 1
- Cards: 畏怖の紋章

### 自分の[獣]1体を+500
- Occurrences: 1
- Cards: 凶暴化

### 自分の[海賊]1体を+300
- Occurrences: 1
- Cards: 海賊剣

### 以下からランダムに1つ行う
- Occurrences: 1
- Cards: 導く尖晶石

### ②自分の[宝石]1体を+400
- Occurrences: 1
- Cards: 導く尖晶石

### 場の自分の[夢]のモンスターも共鳴条件として扱うことができる共鳴召喚を行う
- Occurrences: 1
- Cards: 魂の共鳴

### 自分の[火,ヒト]1体を+300
- Occurrences: 1
- Cards: 炎鱗弓

### モンスター1体以外は幸せになる
- Occurrences: 1
- Cards: 誤射

### 自分と相手の捨て札全てをデッキに戻す
- Occurrences: 1
- Cards: VOID

### モンスター全ての効果を消す
- Occurrences: 1
- Cards: 風化

### 自分の[騎士]か[ドラゴン]1体を+300
- Occurrences: 1
- Cards: 天竜剣

### 自分の手札かデッキから「ノーマルエネルギー」2枚までをタップして出す
- Occurrences: 1
- Cards: 森の囁き

### 相手のランダムなモンスター1体を-200
- Occurrences: 1
- Cards: 酸性雨

### これを4回行う
- Occurrences: 1
- Cards: 酸性雨

### 場の自分の名前に「火口」を含むモンスターも条件として扱うことができ、共鳴召喚が必要な名前に「火口」を含むモンスターのコスト-6した共鳴召喚を行う
- Occurrences: 1
- Cards: 火口共鳴

### 自分のモンスター1体を+600
- Occurrences: 1
- Cards: 武装強化

### [植物]全てを+500
- Occurrences: 1
- Cards: 豪雨

### 自分の捨て札から「ノーマルエネルギー」10枚までをタップして出す
- Occurrences: 1
- Cards: 繁栄

### モンスター1体をデッキの下に戻す
- Occurrences: 1
- Cards: 宵闇の水面

### 自分の[ドラゴン]全てを+300
- Occurrences: 1
- Cards: 活竜術

### 自分の[植物]全てを+300
- Occurrences: 1
- Cards: 無限の恵沢

### 自分のマナ+（自分の[植物]の数）
- Occurrences: 1
- Cards: 無限の恵沢

### 自分の[火]1体を×2
- Occurrences: 1
- Cards: 完全燃焼

### 相手のモンスター全てを-400
- Occurrences: 1
- Cards: 氷の雨

### 自分の[ヒト]1体を+1000
- Occurrences: 1
- Cards: 旧式機械装甲

### 自分のモンスター全てを+200
- Occurrences: 1
- Cards: 悪魔な注文

### [機械]が場にいるなら、モンスター1体をデッキの下に戻す
- Occurrences: 1
- Cards: 小機の渦流

### 自分の[機械]全てを+300
- Occurrences: 1
- Cards: 小機の渦流

### 自分のモンスター全てを+500
- Occurrences: 1
- Cards: 補給物資

### 自分のマナ+3
- Occurrences: 1
- Cards: 人魚の涙

### 自分のライフ=100
- Occurrences: 1
- Cards: 超臨界

### 自分のモンスター全てを+1000
- Occurrences: 1
- Cards: 超臨界

### 自分のモンスター全ての効果を消す
- Occurrences: 1
- Cards: 超臨界

### 自分は上限まで引く
- Occurrences: 1
- Cards: 天啓

### 自分の[妖怪]全てを+300
- Occurrences: 1
- Cards: 百鬼夜行

### 相手のモンスター全てを-2000
- Occurrences: 1
- Cards: 毒波

### 自分のマナ+10
- Occurrences: 1
- Cards: 今、夢の中で

### 手札のこれは相手に選ばれない
- Occurrences: 1
- Cards: 刻の包機

### 手札にある時、これのコスト-（自分の捨て札の枚数）
- Occurrences: 1
- Cards: 刻の包機

### 自分のマナ+（自分のエネルギーの数）
- Occurrences: 1
- Cards: 刻の包機

### [相手のモンスターが場に出た時] それを-400
- Occurrences: 1
- Cards: 藪蛇

### [自分のライフが0になった時] 自分のライフ=700
- Occurrences: 1
- Cards: 絶対絶命

### このターンを終了する
- Occurrences: 1
- Cards: 絶対絶命

### 」を持つなら] それの効果を消す
- Occurrences: 1
- Cards: 鈍化

### [相手の魔法の使用時]自分のモンスター全てを+200
- Occurrences: 1
- Cards: 抵抗

### [相手のオリカの使用時]それを打ち消す
- Occurrences: 1
- Cards: オリカ・バリアー

### 自分の[獣]が場に出た時、それを+100
- Occurrences: 1
- Cards: 還り門の森

### (カウンター-2)カウンターがあるモンスター1体を+300
- Occurrences: 1
- Cards: 願いの泉

### (カウンター-7)自分のマナ+7
- Occurrences: 1
- Cards: 願いの泉

### 場に出た時、自分の[水]と[光]全てを+100
- Occurrences: 1
- Cards: 月宿る海

### 自分の[水]か[光]が場に出た時、それを+100
- Occurrences: 1
- Cards: 月宿る海

### 自分の2コスト以上の[虫]が場に出た時、自分のマナ+1
- Occurrences: 1
- Cards: 花華の縄張

### 相手のターン開始時、自分の[騎士]全てを+100
- Occurrences: 1
- Cards: 崖上の防衛砦

### 自分の手札の効果を持たないモンスターのコスト-1
- Occurrences: 1
- Cards: 持たざる者の闘技場

### 自分の効果を持たないモンスターが場に出た時、それを+300
- Occurrences: 1
- Cards: 持たざる者の闘技場

### 自分のターン開始時、モンスター全ての効果を消す
- Occurrences: 1
- Cards: 持たざる者の闘技場

### 自分の[光]か[闇]のモンスターが場に出た時、相手のモンスター1体を-400
- Occurrences: 1
- Cards: ディエティの月明

### 自分の[ドラゴン]が場に出た時、それを+300
- Occurrences: 1
- Cards: 龍頭山

### 自分の[火]が場に出た時、それを+800
- Occurrences: 1
- Cards: 裂けた火口

### 場に出た時、自分のデッキから「銀雪夜」1枚までを使用する
- Occurrences: 1
- Cards: 銀雪原

### 自分のターン終了時、モンスター全てを=300
- Occurrences: 1
- Cards: 円海島

### 自分の[水]のモンスターが場に出た時、それを+700
- Occurrences: 1
- Cards: 円海島

### 自分の手札の5コスト以上の[水]のコスト-4
- Occurrences: 1
- Cards: 最果ての海
