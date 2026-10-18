import { useEffect, useState } from 'react';

type RecommendationResult = {
  status: string;
  needs?: {
    lines?: number;
    budgetTarget?: number | null;
    usage?: string[];
    priorities?: string[];
  };
  recommendations: Array<{
    plan: {
      id: string;
      name: string;
      monthlyTotal: number;
      monthlyPricePerLine: number;
    };
    phone: {
      id: string;
      brand: string;
      model: string;
      retailPrice: number;
      monthlyPayment: number;
    } | null;
    monthlyTotal: number;
    reasons: string[];
    tradeoffs: string[];
  }>;
};

export function RecommendationPanel({ transcript }: { transcript: string }) {
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!transcript.trim()) {
      setResult(null);
      setError('');
      setLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript })
        });
        if (!response.ok) throw new Error('Recommendation request failed');
        const next = await response.json() as RecommendationResult;
        if (!cancelled) setResult(next);
      } catch {
        if (!cancelled) setError('Recommendations are temporarily unavailable.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [transcript]);

  return <div className="recommendation-content" aria-live="polite">
    <h2>Recommended plans &amp; phones</h2>
    <p className="recommendation-note">Mock dataset examples only. Plan prices and phone installments are shown separately and are not live quotes.</p>
    {loading && <p className="empty-copy">Finding the best match…</p>}
    {error && <p className="recommendation-error" role="alert">{error}</p>}
    {result?.status === 'no_match' && <p className="empty-copy">No suitable match found within the current criteria.</p>}
    {result?.status === 'error' && <p className="recommendation-error" role="alert">Could not generate recommendations.</p>}
    {result?.recommendations?.map(item => <article className="recommendation-card" key={`${item.plan.id}-${item.phone?.id ?? 'no-phone'}`}>
      <h3>{item.phone ? `${item.phone.brand} ${item.phone.model} + ${item.plan.name}` : item.plan.name}</h3>
      <p>Total: ${item.monthlyTotal.toFixed(2)}/month</p>
      <small>Plan: ${item.plan.monthlyTotal.toFixed(2)}/month for {result.needs?.lines ?? 1} line(s) · ${item.plan.monthlyPricePerLine.toFixed(2)} per line</small>
      {item.phone && <>
        <p>Device payment: ${item.phone.monthlyPayment.toFixed(2)}/month</p>
        <small>Demo retail price: ${item.phone.retailPrice.toFixed(2)} · simulated 24-month installment</small>
      </>}
      <p>Why it matches: {item.reasons.join(', ') || 'general use'}</p>
      {item.tradeoffs.length > 0 && <small>Trade-offs: {item.tradeoffs.join('; ')}</small>}
    </article>)}
  </div>;
}
