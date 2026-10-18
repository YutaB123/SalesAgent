import { followUps as demoFollowUps } from "../data/mockData";
import { customerRepository } from "../services/customerRepository";
import type { PostCallReport } from "../types/coach";
import type { FollowUpTask } from "../types/salesAgent";

// After a call, the post-call report is copied onto the customer's record, so Customer Tracking shows
// the right stage, readiness rating, needs, follow-up date and follow-up tasks without anyone retyping them.

const TASKS_KEY = "sales-agent-account-tasks-v1";
const SCORES_KEY = "sales-agent-account-scores-v1";

/** The report's purchase stage in the words Customer Tracking's stage menu uses. "Purchased" is never guessed. */
export function stageFromReport(report: PostCallReport): string | undefined {
  switch (report.purchase_stage?.label) {
    case "Exploring": return "Discovery";
    case "Comparing": return "Evaluation";
    case "Ready to buy": return "Decision";
    case "Not considering": return "Not moving forward";
    default: return undefined;
  }
}

/**
 * Purchase readiness, 1 to 10 (the tracking page's "seller estimate"; the seller can still edit it).
 * Starts from the stage the customer is at, plus one point if they agreed to a specific next step with a time.
 * This is deliberately simple and explainable. It is not the report's seller-communication score.
 */
export function readinessFromReport(report: PostCallReport, transcript?: { speaker: string; text: string }[]): number | undefined {
  const base: Record<string, number> = { Exploring: 3, Comparing: 6, "Ready to buy": 9, "Not considering": 1 };
  const label = report.purchase_stage?.label;
  const agreedNextStep = report.follow_up_actions.some((a) => a.kind === "promised" && Boolean(a.time_text));
  const customerQuotes = [
    ...(report.purchase_stage?.evidence || []).map(item => item.quote),
    ...(transcript || []).filter(turn => turn.speaker === "customer").map(turn => turn.text),
  ];
  const explicitBuyingIntent = customerQuotes.some(quote => /\b(?:i(?:'m| am) ready to (?:buy|purchase|order|get it)|i(?:'m| am) going to (?:buy|purchase|order|get it)|i(?:'d| would) like to (?:buy|purchase|order|get it)|i want to (?:buy|purchase|order|get it)|i(?:'ll| will) take it|let'?s do it|sign me up|go ahead and (?:order|buy)|i want to buy it)\b|(?:我要买|我想买|我准备买|我决定买|就买这个|我要这个|可以下单|现在下单|帮我订|就按这个买)/i.test(quote));
  if (explicitBuyingIntent) return agreedNextStep ? 10 : 9;
  if (!label || !(label in base)) return undefined;
  return Math.max(1, Math.min(10, base[label] + (agreedNextStep && label !== "Not considering" ? 1 : 0)));
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Turns phrases like "tomorrow evening" or "next Tuesday" into a date, using the day of the call.
 * Only the clear cases are resolved; anything vague ("soon", "after the holidays") returns undefined so no date is invented.
 */
export function resolveFollowUpDate(timeText: string | null | undefined, callDate: Date): string | undefined {
  if (!timeText) return undefined;
  const text = timeText.toLowerCase();
  const plus = (days: number) => { const d = new Date(callDate.getFullYear(), callDate.getMonth(), callDate.getDate() + days); return dateKey(d); };
  if (/day after tomorrow/.test(text)) return plus(2);
  if (/\btomorrow\b/.test(text)) return plus(1);
  if (/\b(today|tonight|this (morning|afternoon|evening))\b/.test(text)) return plus(0);
  const inDays = /\bin (\d{1,2}) days?\b/.exec(text);
  if (inDays) return plus(Number(inDays[1]));
  if (/\b(next week|in a week)\b/.test(text)) return plus(7);
  const weekday = WEEKDAYS.findIndex((name) => new RegExp(`\\b${name}\\b`).test(text));
  if (weekday >= 0) { const ahead = (weekday - callDate.getDay() + 7) % 7 || 7; return plus(ahead); }   // the next such day, never today
  return undefined;
}

function readTasks(): Record<string, FollowUpTask[]> {
  try {
    const saved = localStorage.getItem(TASKS_KEY);
    if (saved) { const parsed: unknown = JSON.parse(saved); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, FollowUpTask[]>; }
  } catch { /* fall through to the demo default */ }
  return { "demo-01": demoFollowUps.map((task) => ({ ...task })) };   // same default the tracking page starts with
}

export interface AppliedInsights { purchaseStage?: string; readiness?: number; followUpDate?: string; tasksAdded: number; }

/** Copy the report onto the customer. Safe to call twice for the same call (tasks are matched by id). */
export function applyReportToCustomer(customerId: string, callId: string, report: PostCallReport, callDate = new Date()): AppliedInsights | null {
  if (!customerRepository.list().some((c) => c.id === customerId)) return null;
  const purchaseStage = stageFromReport(report);
  const readiness = readinessFromReport(report);
  const dates = report.follow_up_actions.map((a) => resolveFollowUpDate(a.time_text, callDate)).filter((d): d is string => Boolean(d)).sort();
  const blocked = customerRepository.list().find(c => c.id === customerId)?.doNotContact || report.purchase_stage?.label === "Not considering";
  const suggested = new Date(callDate); suggested.setDate(suggested.getDate() + (report.purchase_stage?.label === "Ready to buy" ? 1 : 3));
  const followUpDate = blocked ? undefined : dates[0] || dateKey(suggested);
  const followUpRecommendation = followUpDate ? {date:followUpDate, basis:dates.length ? "agreed" as const : "suggested" as const, reason:dates.length ? "Based on the follow-up timing recorded in this call." : "Suggested next business conversation: review the open needs while the discussion is recent. No appointment was agreed."} : undefined;
  const needs = report.customer_needs.map((n) => n.text).slice(0, 3).join("; ");

  customerRepository.patch(customerId, {
    ...(purchaseStage ? { purchaseStage } : {}),
    ...(readiness !== undefined ? { readiness } : {}),
    ...(followUpDate ? { followUpDate, followUpRecommendation } : {}),
    ...(needs ? { needs } : {}),
  });

  // The tracking page lets the seller override the rating by hand. A new call is new information, so it re-estimates.
  if (readiness !== undefined) {
    try {
      const scores = JSON.parse(localStorage.getItem(SCORES_KEY) || "{}") as Record<string, number>;
      if (customerId in scores) { delete scores[customerId]; localStorage.setItem(SCORES_KEY, JSON.stringify(scores)); }
    } catch { /* malformed scores are ignored by the tracking page anyway */ }
  }

  const tasks = readTasks();
  const existing = Array.isArray(tasks[customerId]) ? tasks[customerId] : [];
  const added = report.follow_up_actions.map((a, i): FollowUpTask => ({
    id: `${callId}-followup-${i}`,
    title: a.action,
    owner: a.owner === "seller" ? "You" : a.owner === "customer" ? "Customer" : "Unassigned",
    due: a.time_text ?? "To confirm",
  })).filter((task) => !existing.some((e) => e.id === task.id));
  if (added.length) {
    tasks[customerId] = [...existing, ...added];
    try { localStorage.setItem(TASKS_KEY, JSON.stringify(tasks)); } catch { /* storage full or disabled: record fields were still saved */ }
  }
  return { purchaseStage, readiness, followUpDate, tasksAdded: added.length };
}
