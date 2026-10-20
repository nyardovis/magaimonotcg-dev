# Card database (development)

Structured card list converted from the supplied OCR spreadsheet.

- Data: [cards.json](./cards.json)
- Cards: 737
- Original source: `コピー ～ あの頃TCGカード一覧（OCR）.xlsx`

Each card is an independent object with a unique `id` based on its original spreadsheet row. Duplicate names are intentionally kept separate. The original `effect_text` is preserved, and `abilities` splits it at Japanese full stops (`。`) for first-pass review; this split does not interpret every rule.

Per the supplied game rules, a parenthesized number such as `(1)` indicates the energy cost to activate that ability.

Fields include `name`, `reading`, `cost`, `types`, `power`, `effect_text`, `lore`, `set`, `tags`, `source_row`, and `abilities`.
