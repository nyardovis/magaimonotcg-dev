# Ankr TCG effect-rule clarifications

These clarifications were supplied by the project owner. Apply them in the development build first; do not deploy to production without explicit approval.

## Card-text corrections
- In the effect text of 魔風のハーピー, 風読みのハーピー, 大翼のハーピー, 疾風のハーピー, 碧い花, and 突風, treat 翼 as a typo for 罠 and replace every occurrence in those texts.
- Treat 種別を持つエネルギー as an energy card with any attribute.
- 誤射: effect text becomes 「モンスター1体以外は幸せになる。※幸せにより破壊される。（モンスターを1体選び、選ばれなかったモンスターをすべて破壊する）」. Operationally, choose one monster and destroy all other monsters.
- Rename every 回生の大天使 to 回生の天使, including references inside effect text.
- 愛おしき放課後's effect is intentionally not applied.
- 尖晶石の少女 effect text becomes:
  「場に出た時、未来を照らす。（次の中からランダムに3回選ぶ
  相手は3枚ドローする
  自分は３枚ドローする
  相手に600ダメージ与える
  自分に600ダメージ与える
  自分のデッキからエネルギーを１つ選びタップして出す
  これを+300）」
  Select uniformly from all six options, with replacement. Roll/select all three outcomes before resolving any, then resolve them in order.

## General rules
- “Cannot choose/select a specified zone” means cards in that zone cannot be selected as targets for effects. For example, if discard is unselectable, effects that summon from discard or add a card from discard to hand cannot select those cards. Effects that move cards into that zone (such as milling from deck to discard) still resolve as written. Non-effect actions such as inspecting discard remain available.
- 使用 means paying energy value to play the card. “Cannot be played without using it” means the energy value must be paid; it cannot be put into play by effects such as 回生の天使 that summon from another zone without stating 使用.
- “This effect cannot be removed” protects the card's own effect text and later effects granted to that card from effect-removal effects. Example: 悪戯フェアリー cannot remove the effect of ゾンビレックス, nor remove effects later granted to ゾンビレックス or 蒸気機関の古代機.
- “When you use your card” is determined by card type:
  - Monster / Field: paid energy from hand and played to the board.
  - Spell: pay energy, move it from hand to discard, and apply its effect.
  - Energy: place it in the energy zone.
  - Trap: set it face down.
  - If a card effect explicitly describes another method of using a card, follow that text. For example, ドラゴンヘッド using a spell from deck counts as using a spell. 回生の天使 summoning a monster from discard does not count as using that monster.
- Interpret 自分 and 相手 from the perspective of the card's owner. For 雪女 granting an effect to an opponent's monster until “your turn ends,” the duration ends at the end of that monster owner's opponent's turn (i.e. the source card owner's turn).
- “Traps do not activate”: if a set trap meets its trigger condition, do not apply its effect and do not flip it face up or move it to discard; do nothing with the trap.
- “Counter/cancel”: do not apply the card's effect and move the cancelled card to discard. This applies to every card type. If 魔石を統べる精霊王 is cancelled by オリカ・バリアー, it goes to discard and its enter-play effects do not resolve.
- Resonance summon steps:
  1. Activate an effect that performs a resonance summon (e.g. 共鳴).
  2. Choose a card that requires resonance summon.
  3. Choose the materials listed on that card. Materials are chosen from hand unless an effect explicitly permits materials from another zone.
- Whenever a card changes zones, it loses all information granted to it, including effect removals and granted effects. This rule overrides card text such as “this effect cannot be removed.” A card whose effect was removed and then is destroyed into discard loses the removal status and regains its printed effect if later played again.
