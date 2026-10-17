# Member 2: post-call analysis

Entry point: `call_analysis.analyze_call(transcript, *, product_context="", output_language="English", complete=None)`.
Python 3.11+, no third-party dependencies. This is a backend function, not a deployed API or frontend integration.
The repository contained only README.md when this module was added, so no existing framework was assumed.

## Team integration

1. Rowan finishes transcription and maps participant IDs to `seller` / `customer`. Use `unknown` if not established; do not guess the role from diarization IDs.
2. Pass the ordered final turns to this function. Each turn is `{ "speaker": "customer", "text": "I am comparing plans." }`. Optional timestamps can remain in the caller; evidence `turn_id` refers to the original zero-based position.
3. Call from the backend after the call, then return the result as JSON to the frontend. This module does not change the live objection-card pipeline.
4. For an async FastAPI/LiveKit backend, run the synchronous function in `asyncio.to_thread` to avoid blocking audio processing. Add authentication/rate limits in the team's API layer before exposing paid analysis.

```python
import asyncio
from call_analysis import analyze_call, AnalysisError

# In an async backend handler, using final transcript turns:
report = await asyncio.to_thread(
    analyze_call,
    [{"speaker": "seller", "text": "What matters most?"},
     {"speaker": "customer", "text": "Price. I am comparing plans."}],
    product_context="Use the team's verified product facts here.",
)
```

## Model setup

Default: `OPENAI_API_KEY` in server environment and optional `SALES_ANALYSIS_MODEL` (default `gpt-4o-mini`). Never put keys in browser code, commit files, or transcript JSON. No API key was used to validate this change.

Alternatively inject your existing provider:

```python
def complete(system_prompt, user_json):
    # Call your provider using separate system/user messages.
    # Return one JSON object as a dict or JSON string. Enforce your own token/timeout budget.
    return your_llm_client(system_prompt, user_json)

report = analyze_call(turns, complete=complete)
```

The default adapter makes one request, no automatic retries, 60-second timeout,
60,000 transcript-character limit, 12,000 product-context-character limit and 3,500 output-token cap.
These limit request size, not exact dollar spend. Large reports can exceed the output cap and fail;
the caller should display a retry/error state rather than a fabricated report. Configure provider account spending limits separately.
Default calls send supplied transcript/context to OpenAI; this module does not save transcripts locally.

## Returned fields

| Field | Content |
|---|---|
| summary | Short factual summary + evidence |
| customer_needs | Need findings + customer evidence |
| concerns | Price / Features / Trust / Timing / Product fit / Other; multiple findings allowed |
| purchase_stage | Exploring / Comparing / Ready to buy / Not considering; null if unclear |
| call_outcome | Observed outcome + evidence |
| follow_up_actions | Action, owner, promised vs suggested, channel, verbatim time_text or null, evidence |
| communication_scores | Five rubric criteria, 0-4 or null, reason, seller evidence |
| scoring | Derived overall_score 0-100 or null; coverage count; not purchase probability |
| schema_version | 1.0 |

Each evidence item is `{ "turn_id": 0, "quote": "exact quote" }`.
The validator rejects invented quotes, unsupported labels, wrong speaker attribution, invalid times,
missing criteria and malformed scores. It cannot prove that a real quote supports the interpretation;
human review and labelled-call evaluation remain necessary.

Scoring criteria: needs_discovery, clarity, objection_handling, honesty_and_respect, next_steps.
Equal weights across observed criteria; null criteria are excluded, and coverage must be shown beside the total.
Follow-up time stays verbatim, e.g. "tomorrow"; there is no guessed timestamp.
Phone follow-up means a human-call reminder. No outreach, scheduling, discounts or CRM writes are executed.

## Verification

```bash
python -m unittest -v test_call_analysis.py
python call_analysis.py transcript.json
```

Tests use synthetic transcripts and a stub/mocked provider. They validate contracts, quote checks,
null handling, role attribution, one-request behavior, invalid output and truncation handling.
They do not establish live model accuracy, resistance to all prompt injection, or production readiness.
Before demo: run a real-provider smoke test, then check several labelled calls (including ambiguous stage,
no concerns, no follow-up, and transcript with unknown speakers).

## Reference design sources

- https://github.com/attentiontech/gtm-superintelligence — evidence-linked coaching and editable rubrics.
- https://github.com/SalesforceAIResearch/enterprise-sales-copilot — separation of transcript, model processing and UI.

This implementation was written independently; no source code or proprietary OnCue features were copied.
The existing repository had no project license; this change does not choose a license for the team.
