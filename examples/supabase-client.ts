import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY");
}

export const supabase = createClient(url, publishableKey);

export async function listDemoCustomers() {
  const { data, error } = await supabase
    .from("demo_customer_overview")
    .select("*")
    .order("company_name");

  if (error) throw error;
  return data;
}

export async function listDemoStrategyCards() {
  const { data, error } = await supabase
    .from("demo_strategy_cards")
    .select("*")
    .order("started_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function getDemoCall(callId: string) {
  const [call, transcript, strategy] = await Promise.all([
    supabase.from("calls").select("*").eq("id", callId).single(),
    supabase.from("transcript_turns").select("*").eq("call_id", callId).order("sequence_no"),
    supabase.from("demo_strategy_cards").select("*").eq("call_id", callId).single(),
  ]);

  for (const result of [call, transcript, strategy]) {
    if (result.error) throw result.error;
  }

  const analysisRunId = strategy.data.analysis_run_id;
  const [analysis, actions] = await Promise.all([
    supabase.from("analysis_runs").select("*").eq("id", analysisRunId).single(),
    supabase
      .from("follow_up_actions")
      .select("*")
      .eq("analysis_run_id", analysisRunId)
      .order("created_at"),
  ]);

  if (analysis.error) throw analysis.error;
  if (actions.error) throw actions.error;

  return {
    call: call.data,
    transcript: transcript.data,
    analysis: analysis.data,
    strategy: strategy.data,
    followUpActions: actions.data,
  };
}
