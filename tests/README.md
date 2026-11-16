# Ankr TCG effect checks

Run from the repository root:

```sh
node tests/effect-tests.js
node tests/effect-execution-tests.js
node tests/effect-audit.js effect-audit-report.json
```

- `effect-audit.js`: scans all 737 card records, saved ability splits, parser coverage, triggers, costs, and target-selection hints. It emits a JSON report for review.
- `effect-tests.js`: parser and regression tests.
- `effect-execution-tests.js`: deterministic tests for a test-only state resolver (draw, damage, healing, deck selection, and destruction). It verifies that explicit target/card choices are required and never silently guessed.
- GitHub Actions runs all three on relevant pushes and pull requests and uploads the audit report.

**Scope:** the execution simulator is deliberately separate from the browser game's live resolver. Passing it validates the compiler's action contract and selection expectations, not the complete game UI, actual `game.js` execution, or two-player synchronization. Those require integration/browser tests and remain separately unverified.

The audit excludes the user's exceptions: `愛おしき放課後`, `いぬ`, and deck-copy text on `量産型タイロス` / `ノーマルエネルギー`.
