import { useEffect, useState } from 'react';

export type CustomerNeeds = {
  budgetTarget: number | null;
  lines: number;
  usage: string[];
  priorities: string[];
  osPreference: string;
  wantsNewPhone: boolean | null;
  phoneBudget: number | null;
};

type BudgetFit = {
  budget: number | null;
  monthlyTotal: number;
  remaining: number | null;
  withinBudget: boolean | null;
};

type RecommendationResult = {
  status: string;
  needs: CustomerNeeds;
  recommendations: Array<{
    plan: { id: string; name: string; monthlyTotal: number; monthlyPricePerLine: number };
    phone: { id: string; brand: string; model: string; os: string; storageGb: number; retailPrice: number; monthlyPayment: number } | null;
    monthlyTotal: number;
    reasons: string[];
    tradeoffs: string[];
    budgetFit: BudgetFit;
    costBreakdown: {
      planMonthly: number;
      deviceMonthly: number;
      totalMonthly: number;
      deviceRetailPrice: number | null;
      oneTimeCharges: number | null;
      oneTimeChargesStatus: string;
    };
    explanation: { reasons: string[]; tradeoffs: string[]; budgetFit: BudgetFit };
  }>;
};

export function PendingQuestionsPanel({ questions }: { questions: string[] }) {
  if (!questions.length) return null;
  return <section className="pending-questions"><h3>Questions to Confirm</h3><ul>{questions.map((question) => <li key={question}>{question}</li>)}</ul></section>;
}

export function RecommendationPanel({ needs, enabled }: { needs: CustomerNeeds; enabled: boolean }) {
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const needsKey = JSON.stringify(needs);

  useEffect(() => {
    if (!enabled) {
      setResult(null);
      setError('');
      setLoading(false);
      return;
    }
    let cancelled = false;
    const currentNeeds = JSON.parse(needsKey) as CustomerNeeds;
    const refresh = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(currentNeeds)
        });
        if (!response.ok) throw new Error('Recommendation request failed');
        const next = await response.json() as RecommendationResult;
        if (!cancelled) setResult(next);
      } catch {
        if (!cancelled) setError('Recommendation service is temporarily unavailable.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void refresh();
    return () => { cancelled = true; };
  }, [enabled, needsKey]);

  return <div className="recommendation-content" aria-live="polite">
    <h2>Recommended plans &amp; phones</h2>
    <p className="recommendation-note">Mock dataset examples only. Plan prices and phone installments are shown separately and are not live quotes.</p>
    {!enabled && <p className="empty-copy">Recommendations will update after the customer states a need.</p>}
    {loading && <p className="empty-copy">Finding the best match…</p>}
    {error && <p className="recommendation-error" role="alert">{error}</p>}
    {result?.status === 'no_match' && <section className="recommendation-card"><h3>No suitable match yet</h3><p>No phone and plan combination matches the current criteria.</p><p>Confirm the budget or ask whether the customer is willing to consider another device or plan.</p></section>}
    {result?.status === 'error' && <p className="recommendation-error" role="alert">Could not generate recommendations.</p>}
    <div className="recommendation-grid">{result?.recommendations?.map((item) => <article className="recommendation-card" key={`${item.plan.id}-${item.phone?.id ?? 'no-phone'}`}>
      <h3>{item.phone ? `${item.phone.brand} ${item.phone.model} + ${item.plan.name}` : item.plan.name}</h3>
      <div className="recommendation-costs">
        <p>Plan: ${item.costBreakdown.planMonthly.toFixed(2)}/month</p>
        {item.phone && <p>Device payment: ${item.costBreakdown.deviceMonthly.toFixed(2)}/month</p>}
        <p><b>Total: ${item.costBreakdown.totalMonthly.toFixed(2)}/month</b></p>
        {item.costBreakdown.deviceRetailPrice != null && <p>Device retail price: ${item.costBreakdown.deviceRetailPrice.toFixed(2)}</p>}
        <small>One-time charges have not been modeled.</small>
      </div>
      {item.explanation.reasons.map((reason, index) => <p className="recommendation-reason" key={index}>✓ {reason}</p>)}
      {item.explanation.budgetFit.withinBudget === true && <p className="recommendation-reason">Remaining budget: ${item.explanation.budgetFit.remaining!.toFixed(2)}/month</p>}
      {item.explanation.tradeoffs.map((tradeoff, index) => <small className="recommendation-tradeoff" key={index}>Trade-off: {tradeoff}</small>)}
    </article>)}</div>
  </div>;
}
