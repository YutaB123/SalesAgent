# `call_analysis.py` to Supabase mapping

Member 4 owns this server-side adapter. The browser must never receive the
Supabase secret key or the OpenAI API key.

## Call lifecycle

1. Create `calls` and return its `id` as the shared `call_id`.
2. Upsert finalized speech into `transcript_turns` using
   `(call_id, sequence_no)`.
3. At call end, select final turns ordered by `sequence_no` and call
   `analyze_call()` with `{speaker: speaker_role, text}` objects.
4. In one transaction, create a pending `analysis_runs` version, insert its
   child rows, mark it completed, and commit. Roll back on any failure.

## Required normalization

| Analysis output | Database value |
| --- | --- |
| `Ready to buy` | `Ready to Buy` |
| `Not considering` | `Not Considering` |
| score `0..4` | seller score `1..5` by adding one |
| `needs_discovery` | `Understanding Needs` |
| `clarity` | `Answer Quality` |
| `objection_handling` | `Objection Handling` |
| `next_steps` | `Next-Step Clarity` |

`honesty_and_respect` remains in `analysis_runs.result_json`; the current UI
score card has four dimensions.

For any communication score whose value is `null`, do not create a
`seller_scores` row. Retain the unobservable criterion in
`analysis_runs.result_json`. For a non-null score, add one and store the lowest
`turn_id` seller-evidence item as the normalized evidence row; retain every
evidence item in `result_json`.

The report's evidence `turn_id` is the zero-based position in the ordered
transcript passed to `analyze_call()`. It is **not** a database ID. Preserve an
ordered list of the selected `transcript_turns` rows and translate each evidence
position to that row's text `id` before writing `evidence_turn_id`.

Each concern becomes an `objections` row with the conservative initial status
`raised`; the current analyzer does not establish resolution status. When a
concern contains several evidence items, normalize the lowest `turn_id`
customer item and keep the complete evidence list in `result_json`.

For a follow-up action owned by `seller` or `customer`, copy `action` to
`action_text` and the owner to `owner_type`. The analyzer has no separate
purpose field, so write `purpose = NULL`; never manufacture one. If the owner is
`unknown`, do not create a `follow_up_actions` row—retain the action only in
`result_json` until a human assigns it. Use the lowest `turn_id` evidence item
for the normalized row and preserve all evidence in `result_json`.

If a follow-up action has no confirmed absolute timestamp, write
`due_at = NULL` and `due_status = 'seller_to_confirm'`. Do not convert phrases
such as "next Tuesday" into an invented date without call-time timezone context
and an explicit product decision to resolve relative dates.

## Strategy gap

The current `analyze_call()` result does not include a `strategies` object.
The fictional seed includes strategy cards so Member 3 can build and demo the
UI now. For a real call, either add a validated strategy section to the analysis
contract or run a separate strategy generator before marking the analysis run
completed. Never invent discount percentages; commercial terms must come from
an authorized policy.
