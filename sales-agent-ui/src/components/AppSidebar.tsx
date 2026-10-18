import { Clock3, Home, MessageSquarePlus, UsersRound } from "lucide-react";
import type { NavKey } from "../types/salesAgent";
import { AssistantMascot } from "./AssistantMascot";
const items: { key: NavKey; label: string; icon: typeof Home }[] = [
  { key: "home", label: "Home", icon: Home }, { key: "new-conversation", label: "New Conversation", icon: MessageSquarePlus },
  { key: "customer-tracking", label: "Customer Tracking", icon: UsersRound }, { key: "history", label: "History", icon: Clock3 },
];
export function AppSidebar({ active, onNavigate }: { active: NavKey; onNavigate: (page: NavKey) => void }) {
  const selected = active === "ongoing" || active === "summary" ? "new-conversation" : active;
  return <aside className="sidebar"><div className="brand-lockup"><span className="brand-mark"><AssistantMascot/></span><span>Sales Agent</span></div>
    <nav className="main-nav" aria-label="Main navigation">{items.map(({key,label,icon:Icon})=><button key={key} className={`nav-item ${selected===key?"active":""}`} onClick={()=>onNavigate(key)}><Icon size={18}/><span>{label}</span></button>)}</nav>
  </aside>;
}
