# T-Mobile seller recovery demo

The dashboard answers: what matters to this customer, what could lose the sale, what can the seller do before they leave, and how should the seller reach out? All quotes must come from labelled customer turns. Phone specifications and prices in the current demo catalog remain mock values, never a current T-Mobile offer.

## Presenting the estimate honestly

There is no measured team conversion baseline yet. The default scenario assumes 100 eligible opportunities, a 20% baseline and a 5 percentage-point lift from relevant, timely follow-up: 20 versus 25 expected closes, or 5 incremental closes. Both rates are hypotheses, not T-Mobile statistics or a per-customer prediction. Configure RECOVERY_BASELINE_RATE and RECOVERY_ASSUMED_UPLIFT as fractions when the team has defensible inputs. Zero lift would mean zero incremental closes.

Intent (1–10), evidence confidence (High/Medium/Low), and deal risk (0–100) serve different purposes. One explicit, unqualified purchase commitment can support High evidence confidence and intent 9; an explicit refusal can support High confidence and intent 1. Neither means a calibrated conversion probability. Latest explicit conditions or decisions take precedence over old interest. Seller statements do not establish customer buying intent. These are text-based rules, not acoustic confidence analysis.

## Follow-up workflow

Use the requested channel and agreed time when recorded. Otherwise, suggest a short message for one next step, or email for a multi-point written comparison. Confirm permission and the destination; missing email is not inferred. The proposed two-hour recovery window is an operational demo assumption, not a customer promise. Recap the discussed handset, stated priority, unresolved objection, and one concrete next step. Confirm current configuration, price and stock before selling. Do not invent discounts or a customer commitment.

The Send message now button sends the visible draft in one click to the displayed saved phone number. Email still uses recipient/content confirmation. Messages use the locally configured Photon project agent and platform; email requires RESEND_API_KEY and FOLLOWUP_FROM_EMAIL. No-contact requests suppress outreach. Provider acceptance is shown separately from confirmed delivery. Durable request IDs prevent resending accepted or unconfirmed requests. If a request is unconfirmed, check provider activity before any new send.

## Validating the business claim later

Randomly assign eligible, contactable opportunities to usual follow-up versus the personalized workflow. Define eligibility and conversion window first, record channel, timing, delivery outcome, seller approval, opt-outs and completed purchases. Compare conversion in both groups with sample counts and uncertainty, and track complaints/opt-outs. Replace scenario assumptions only after sufficient observations; do not attribute every recovered sale to the tool.

## Suggested time and scheduled iMessage

Analysis adds a timing suggestion. Explicit customer relative durations, today/tomorrow and weekday AM/PM times are resolved against the actual call date in America/Los_Angeles. Unsupported, past, or different-timezone timing requires seller selection rather than guessing an agreement. Without timing evidence, suggest two hours later within weekday 9am–6pm Pacific hours; this is an operational assumption. The input displays the browser's local time.

Schedule iMessage approves the exact visible recipient, message and chosen time. Nothing is automatically scheduled merely by opening a customer or generating a summary. The durable SQLite followup_jobs queue is checked every 15 seconds by the Node server. Browser closure is fine; the computer/server must stay online and the communications sidecar must run. After downtime, tasks more than 24 hours late fail for review. Archive, opt-out and changed-phone checks run before sending. Only scheduled jobs can be cancelled; sending/unconfirmed jobs require provider reconciliation. Provider acceptance is not confirmed delivery. A process crash during sending leaves a visible unconfirmed state for review, never an automatic resend.

Queue status comes from /api/followups/schedules. Schedule and cancel require the explicit customer-action header, the same workspace access check as other follow-up routes, and a saved customer/call. Active jobs block manual duplicate sends. The schedule retains the approved draft if later analysis changes; cancel and create a new schedule to approve different content.

## Editing and customer history

Generate follow-up creates and saves a draft from the customer's latest saved call and profile. It does not send the draft. Scheduled drafts remain editable: Update schedule atomically saves the displayed time and message only while the task is still scheduled; it refuses changes once sending has started. The due-task claim rechecks the stored due time and uses the latest stored message to avoid a race with edits.

Customer History merges saved calls (including transcripts), scheduled tasks, and provider submission records. A scheduled message and its outbox submission share an ID and appear as one message. Immediate submissions are recorded too. Provider acceptance remains distinct from confirmed delivery; cancelled and failed messages keep their actual status. There is no additional seller-approval dialog on this screen.
