# Development-only effect automation

This document describes the first implementation pass in `magaimonotcg-dev`.
The production frontend and production server were not changed.

## What is now wired in

- Card effect text is split into individual Japanese sentences and classified as an entry, turn-start, turn-end, opponent-turn-start, opponent-turn-end, destruction, attack, immediate, or energy-cost ability.
- Costed abilities written as `(2)` or `（2）` can be activated from a selected face-up monster, energy card, or field card. The listed cost is deducted from the available energy pool first.
- Automatic triggers are checked for monsters, energy cards, and field cards at the supported timing points.
- Face-down traps can automatically reveal, move to the discard pile, and resolve for all 21 current trap-card trigger phrases: opponent monster entry/attack, opponent spell use, opponent healing/damage to you, Orica use, your life reaching zero, and supported turn timings. Common conditions for entry traps are checked (cost at most 2, the [ザコ] type, a [海] field, available mana, and the named haste ability).
- A selected monster has an `攻撃を宣言` action. It only announces the attack and runs attack-triggered effects; it does not calculate combat or select a target.
- Common effect text patterns cover drawing, adding cards from the deck/discard to hand, revealing/discarding a matching hand card, life damage/healing, monster damage/healing/modifiers, tapping, counters, destroying a monster/field card, and milling the top of a deck.
- If a draw would happen while the local player has 9 cards, the game pauses for one card to be discarded and then continues the remaining draw.
- Card lookup prefers a card's `cardDataId` where available, so duplicate names are less likely to resolve against the wrong local card definition.
- Public-state changes caused by a trap resolving are sent back to the development server.

## Known limitations

This is an initial engine, not full support for every card. The current data has 737 records, 721 with effect text, and many different sentence forms. The parser recognizes timing phrases, but it does not understand every natural-language effect.

Effects that require an unimplemented condition, a specific target-selection rule, replacement/prevention effects, chained interrupts, complex resonance summons, or uncommon wording may still log as unsupported or behave only partially. Some opponent-card definitions may be ambiguous online because the development server currently sanitizes card data and does not preserve `cardDataId` in public card objects. Combat itself remains manual.

Before moving any change to production, test it in a two-player development room with representative cards for each trigger and effect type. Never treat a card as fully automated just because its timing phrase was recognized.
