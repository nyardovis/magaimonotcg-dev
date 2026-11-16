# Ankr TCG effect checks

Run from the repository root:

```sh
node tests/effect-tests.js
node tests/effect-execution-tests.js
npm install
npx playwright install chromium
node tests/effect-browser-tests.js effect-live-audit-report.json
node tests/effect-audit.js effect-compiler-audit-report.json
```

- `effect-audit.js`: scans all 737 card records, saved ability splits, parser coverage, triggers, costs, and target-selection hints. It emits a JSON report for review.
- `effect-tests.js`: parser and regression tests.
- `effect-execution-tests.js`: contract tests for the original test-only simulator.
- `effect-browser-tests.js`: launches Chromium, loads the real development game, tests the live effect resolver (draw, board-target damage, enter triggers, tap activation costs), and runs every stored card ability clause against a controlled test board. It reports runtime exceptions, unimplemented clauses, target-selection requirements, and clauses that do not change state.
- GitHub Actions runs all three on relevant pushes and pull requests and uploads the audit report.

**Scope:** the browser audit now invokes the actual `game.js` resolver. Its all-card run is a broad smoke/audit pass, not proof that every effect is semantically correct: conditional branches, all possible target combinations, visual interactions, and two-player synchronization still need focused tests. `needs_choice`, `needs_board_target`, `needs_card_selection`, `no_state_change`, and `unimplemented` are reported separately for review.

The audit excludes the user's exceptions: `愛おしき放課後`, `いぬ`, and deck-copy text on `量産型タイロス` / `ノーマルエネルギー`.
