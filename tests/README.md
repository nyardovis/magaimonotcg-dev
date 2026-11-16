# Ankr TCG effect checks

Run locally from the repository root:

```sh
node tests/effect-tests.js
node tests/effect-audit.js
node tests/effect-audit.js effect-audit-report.json
```

## What is checked

- Card record count, required IDs/names, and duplicate IDs.
- Whether each saved `abilities` array exactly matches the current quote/bracket-aware split of `effect_text`.
- Per-clause compiler classification: trigger, activation cost, recognized action family, target hints, and conditions.
- Parser regression fixtures, including player-selected deck search, damage, summon/energy placement, and activation costs.
- The effect runtime's built-in regression fixtures.

The audit deliberately keeps the user's named exceptions out of normal effect-coverage counts: `愛おしき放課後`, `いぬ`, and the deck-copy text on `量産型タイロス` / `ノーマルエネルギー`.

## Important limitation

These are automated **data/parser and effect-IR contract tests**. They do not yet execute the full browser game state machine. Actual resolution in `game.js` depends on the live board state, DOM rendering, pending target UI, and online synchronization. A passing parser test therefore does not prove a card's effect works in a real match. The audit labels clauses for review rather than claiming implementation is complete.

GitHub Actions runs the regression suite on relevant pushes and pull requests, then uploads the full JSON audit as an artifact.
