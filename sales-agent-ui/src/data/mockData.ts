import type { CallSummaryData, ConversationTurn, CustomerProfile, FollowUpTask, ObjectionCategory, ObjectionScenario, ProductInfo, ResponseSuggestion } from "../types/salesAgent";

// All customer and product information below is fictional demo data.
export const product: ProductInfo = {
  id: "sample-probook-x1", name: "ProBook X1", category: "Laptop · Sample product", price: "$1,299", description: "A sample laptop listing for the Sales Agent demo.",
  facts: ["High-performance processor", "14-inch lightweight design", "Up to 15-hour battery life", "1-year warranty"],
};
export const customer: CustomerProfile = {
  id: "demo-01", name: "Alex Chen", initials: "AC", role: "Tech Startup Founder", company: "Sample customer",
  needs: ["Reliable laptop for a remote team"], concerns: ["Price", "Comparing with other brands"], purchaseStage: "Evaluation", intent: "medium",
};
export const transcript: ConversationTurn[] = [
  { id: "t1", speaker: "customer", text: "Hi, I'm looking for a laptop for my team. Can you tell me more about the ProBook X1?", time: "10:24 AM", source: "mock" },
  { id: "t2", speaker: "seller", text: "Of course. I can walk you through the sample specifications and see what matters most for your team.", time: "10:24 AM", source: "mock" },
  { id: "t3", speaker: "customer", text: "That sounds good, but your product seems more expensive than the alternatives.", time: "10:25 AM", source: "mock" },
  { id: "t4", speaker: "seller", text: "I understand. Let me share some additional information that might be helpful.", time: "10:25 AM", source: "mock" },
];
export const demoListeningTranscript = transcript;

export const objectionScenarios: Record<ObjectionCategory, ObjectionScenario> = {
  price: {
    category: "price",
    title: "Price Objection",
    explanation: "The customer compares the price with alternatives and may be concerned about overall value.",
    priority: "High",
    keywords: ["price", "expensive", "cost", "too high", "budget", "afford"],
    suggestions: [
      { id: "price-1", title: "Value-based", text: "I understand price matters. We can compare the same configuration and what's included, so you can see how the overall value fits your team.", strategy: "Value-based", explanation: "Makes a fair comparison using confirmed product details, without asserting unverified savings.", verify: "Use only the listed product specifications and verified quote details.", recommended: true },
      { id: "price-2", title: "Needs-based", text: "Which features matter most to your team? I can focus on those and help you decide whether this option fits the way you work.", strategy: "Needs-based", explanation: "Connects the price discussion to the customer's actual use case and priorities.", verify: "Do not claim a feature or benefit that is not in the confirmed product information." },
      { id: "price-3", title: "Alternative", text: "If this configuration is outside the range you have in mind, I can check whether there are approved alternatives that better fit your needs.", strategy: "Alternative", explanation: "Offers a next step without promising an unverified discount or price match.", verify: "Confirm available configurations and current pricing before presenting an alternative." },
    ],
  },
  promotion: {
    category: "promotion",
    title: "Promotion Objection",
    explanation: "The customer is asking whether an offer or discount is available before deciding.",
    priority: "Medium",
    keywords: ["promotion", "promotional", "discount", "coupon", "deal", "special offer", "sale"],
    suggestions: [
      { id: "promotion-1", title: "Value-based", text: "I can walk you through what is included at the listed price, then verify whether any current promotion applies to your purchase.", strategy: "Value-based", explanation: "Explains the confirmed offer first and keeps any promotion conditional on verification.", verify: "Confirm current promotion, dates, terms, and eligibility before quoting a discount.", recommended: true },
      { id: "promotion-2", title: "Needs-based", text: "What would make the purchase easier for your team: a different configuration, timing, or payment arrangement? I can check the approved options.", strategy: "Needs-based", explanation: "Finds out what constraint the customer is trying to solve before suggesting an option.", verify: "Only describe payment terms or options confirmed by the sales team." },
      { id: "promotion-3", title: "Alternative", text: "I don't want to guess about a discount. I can confirm which offers are currently available and follow up with the exact terms.", strategy: "Alternative", explanation: "Provides a concrete next step without presenting a hypothetical promotion as fact.", verify: "Verify the promotion and the customer's eligibility before sharing details." },
    ],
  },
  roi: {
    category: "roi",
    title: "ROI Objection",
    explanation: "The customer wants to understand whether the business value can justify the investment.",
    priority: "Medium",
    keywords: ["roi", "return on investment", "worth it", "value", "time saving", "time savings", "save time", "business value", "pay for itself"],
    suggestions: [
      { id: "roi-1", title: "Value-based", text: "We can look at the confirmed features and price, then compare them with the outcomes your team wants to achieve.", strategy: "Value-based", explanation: "Frames value around documented product details and the customer's goals.", verify: "Use confirmed product information and customer-provided business inputs only.", recommended: true },
      { id: "roi-2", title: "Needs-based", text: "Which part of your team's current workflow would you most want to improve? That will help us focus on the outcomes that matter to you.", strategy: "Needs-based", explanation: "Starts with the customer's real workflow instead of assuming a return or time saving.", verify: "Do not promise specific savings or business results without evidence." },
      { id: "roi-3", title: "Alternative", text: "If it helps, we can identify the questions or measurements your team would need before deciding whether this is worth the investment.", strategy: "Alternative", explanation: "Offers a lower-pressure evaluation step before making a financial claim.", verify: "Agree on measurable inputs; label estimates clearly and verify any pricing." },
    ],
  },
};

export function detectObjection(statement: string): ObjectionScenario | undefined {
  const normalized = statement.toLowerCase();
  // Check promotion and ROI before broad price terms to avoid accidental overlap.
  const orderedCategories: ObjectionCategory[] = ["promotion", "roi", "price"];
  return orderedCategories.map((category) => objectionScenarios[category])
    .find((scenario) => scenario.keywords.some((keyword) => normalized.includes(keyword)));
}

export const suggestions: ResponseSuggestion[] = [
  { id: "s1", title: "Explain product value", text: "I understand. Would it help if I walked you through what is included in the price?", strategy: "Acknowledge the concern", explanation: "Offers relevant product context without making assumptions.", verify: "None", recommended: true },
  { id: "s2", title: "Understand the objection", text: "Which part of the price feels most important as you compare your options?", strategy: "Ask an open question", explanation: "Helps identify what is driving the customer's concern.", verify: "None" },
  { id: "s3", title: "Offer a comparison", text: "Would a side-by-side comparison of the listed specifications be useful?", strategy: "Offer a next step", explanation: "Moves the conversation forward without pressuring the customer.", verify: "Confirm competitor specifications before comparing." },
];
export const summary: CallSummaryData = {
  summary: "Alex is evaluating the ProBook X1 for a remote team and comparing it with another brand. Price is the main concern. Alex requested more detail before making a decision.",
  needs: ["Reliable laptop for a remote team", "Compare product specifications"], concerns: ["Price", "Comparing with other brands"], purchaseStage: "Evaluation", outcome: "Continuing evaluation · Send product comparison",
  scores: [
    { category: "Understanding customer needs", score: 4, reason: "Confirmed the use case and invited the customer to explain their priorities." },
    { category: "Answer clarity and accuracy", score: 4, reason: "Kept the response focused on information available in the sample product listing." },
    { category: "Addressing concerns", score: 3, reason: "Recognized the price concern; a more specific comparison is still needed." },
    { category: "Next-step clarity", score: 4, reason: "A product comparison gives the conversation a practical next step." },
  ],
};
export const followUps: FollowUpTask[] = [
  { id: "f1", title: "Send a product specification comparison", owner: "Sales Team", due: "Within 1 day" },
  { id: "f2", title: "Follow up on the customer's price questions", owner: "Sales Team", due: "Within 2 days" },
  { id: "f3", title: "Offer a product demo for the remote team", owner: "Solutions Engineer", due: "Within 3 days" },
  { id: "f4", title: "Check whether the customer has additional questions", owner: "Sales Team", due: "Within 1 week" },
];
export const recentCalls = [
  { name: "Alex Chen", date: "Oct 16, 2026 · 10:24 AM", outcome: "Continuing evaluation", score: "15 / 20" },
  { name: "Jordan Lee", date: "Oct 15, 2026 · 3:10 PM", outcome: "Follow-up scheduled", score: "17 / 20" },
  { name: "Taylor Morgan", date: "Oct 14, 2026 · 11:45 AM", outcome: "Requested product details", score: "14 / 20" },
];
