export type NavKey = "home" | "new-conversation" | "history" | "settings" | "suggestions" | "ongoing" | "summary" | "follow-ups" | "customer-tracking";
export type Speaker = "customer" | "seller";
export type BuyingIntent = "high" | "medium" | "low" | "unclear";
export type ConcernCategory = "price" | "features" | "trust" | "timing" | "product_fit" | "comparison" | "other";
export type ObjectionCategory = "price" | "promotion" | "roi";
export type ObjectionPriority = "High" | "Medium";
export type ConversationSource = "mock" | "live";
export type ListeningStatus = "ready" | "listening" | "error";

export interface ProductInfo { id: string; name: string; category: string; price: string; description: string; facts: string[]; }
export interface CustomerProfile { id: string; name: string; initials: string; role: string; company: string; needs: string[]; concerns: string[]; purchaseStage: string; intent: BuyingIntent; }
export interface CustomerCallHistory {
  id: string;
  date: string;
  summary: string;
  productDiscussed: string;
  concerns: string[];
  nextSteps: string[];
  transcript?: ConversationTurn[];
  recovery?: import("./coach").PostCallRecovery;
  recoveryContextCallIds?: string[];
}
export interface TrackedCustomer {
  email?: string;
  followUpDrafts?: Partial<Record<"email"|"message", {recipient:string;subject:string;body:string}>>;
  id: string;
  name: string;
  company: string;
  role: string;
  contact: string;
  needs: string;
  concerns: string;
  productDiscussed: string;
  purchaseStage: string;
  followUpDate: string;
  notes: string;
  readiness?: number;
  lastContact: string;
  summary: string;
  callHistory: CustomerCallHistory[];
  isSample?: boolean;
  recommendedPlan?: string;
  confidence?: "High" | "Medium" | "Low";
  followUpTasks?: FollowUpTask[];
  followUpPending?: boolean;
  recommendedChannel?: "email" | "message";
  confirmedChannel?: "email" | "message";
  communicationScore?: number | null;
  criticalInformation?: { text: string; quote: string; kind: string }[];
  followUpRecommendation?: { date: string; reason: string; basis: "agreed" | "suggested" };
  doNotContact?: boolean;
  archived?: boolean;
  trackingGroup?: "active" | "history";
}
export interface ConversationTurn { id: string; speaker: Speaker; text: string; time: string; source?: ConversationSource; }
export interface ResponseSuggestion { id: string; title: string; text: string; strategy: string; explanation: string; verify: string; recommended?: boolean; }
export interface ObjectionScenario {
  category: ObjectionCategory;
  title: string;
  explanation: string;
  priority: ObjectionPriority;
  keywords: string[];
  suggestions: [ResponseSuggestion, ResponseSuggestion, ResponseSuggestion];
}
export interface FollowUpTask { id: string; title: string; owner: string; due: string; completed?: boolean; }
export interface SellerScore { category: string; score: number; reason: string; }
export interface CallSummaryData { summary: string; needs: string[]; concerns: string[]; purchaseStage: string; outcome: string; scores: SellerScore[]; }
