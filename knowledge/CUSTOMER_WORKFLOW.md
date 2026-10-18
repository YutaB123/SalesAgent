# Phone-first sales workflow

The workspace now stores customer memory server-side in `sales_customer_memory` using the same server-only `SUPABASE_DB_URL` as the plan catalog. Run `python knowledge/store.py customer-init` once after installing `knowledge/requirements.txt`. The additive migration does not alter the team's existing normalized CRM tables. The private memory table has RLS enabled and no anonymous or authenticated client grants; only the local server accesses it.

- Enter a phone number before a call to fetch the prior summary, needs, objections and follow-up. A name is optional. Ten-digit numbers default to US +1; international numbers need their country code.
- After call confirmation, the number is normalized and the profile is matched or created. The call's customer ID is sent with coaching requests; the server supplies a bounded summary of prior calls to the model. Historical notes are evidence, never instructions.
- Transcript updates are saved while speaking and finalized on End Conversation. The browser keeps a durable outbox when cloud writes fail, retries on the next write or online event, and displays sync status. The same call ID is updated instead of appended twice. Server-side merging retains concurrent call entries from other devices.
- Post-call analysis fills needs, concerns, readiness and follow-up tasks. Dates from a recorded callback request take priority. Otherwise the interface labels a proposed date as **suggested**, not agreed. This does not schedule an actual call or send a message. Do-not-contact requests block subsequent dialing and automatic follow-up suggestions.
- Archive hides a profile from the active list and preserves server history. A lookup by its number can recover it; opt-outs remain enforced.

## Supplier refresh

The Plan Database page has supplier filters, benefit search, line-count selection, plan cards and a detail editor. Saved data reloads every minute while the page is visible. This reload does not scrape carrier sites.

**Fetch latest plans** performs an actual official-page fetch and evidence-backed extraction, then imports the checked records into Supabase with audit entries. T-Mobile, AT&T, Verizon, Mint Mobile, Visible, Google Fi and Cricket resolve by name. Other suppliers need their official HTTPS plans URL once per fetch. Source websites may block automated retrieval or omit rendered details; a failed fetch preserves the existing catalog and shows an error.

No customer information is included in supplier extraction requests. DNS is resolved and pinned to public IPv4 addresses; redirects outside the selected source domain are rejected. Features require exact source excerpts. Advertised prices require textual price evidence and explicit line counts. Automatically extracted offers are not existing-customer bills. A refresh cannot update the verification date of an older standard base-price table it did not re-extract. Automated extraction still needs human review for final eligibility and pricing quotes.

## Validation

```sh
node --test knowledge/coaching.test.js knowledge/refresh.test.js guard.test.js
python -m unittest discover -s knowledge -p 'test_*.py'
cd sales-agent-ui
pnpm build
pnpm exec tsc --ignoreConfig --noEmit false --module commonjs --target es2022 --skipLibCheck --outDir /tmp/salesagent-memory-tests src/utils/customerSignals.ts
cd ..
node --test tests/customer-memory.cjs
```

Live validation used a reserved fictional phone number, checked the pre-call history preview, a history-aware coaching response, budget/travel highlights, automatic transcript persistence and a next-day requested follow-up. The fixture is archived after verification. A name-only Visible refresh successfully added three official-source plans.
