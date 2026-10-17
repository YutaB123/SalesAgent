import { Clock3, Home, MessageSquarePlus, Settings2, UsersRound } from "lucide-react";
import type { NavKey } from "../types/salesAgent";
import { AssistantMascot } from "./AssistantMascot";
const items: { key: NavKey; label: string; icon: typeof Home }[] = [
  { key: "home", label: "Home", icon: Home }, { key: "new-conversation", label: "New Conversation", icon: MessageSquarePlus },
  { key: "customer-tracking", label: "Customer Tracking", icon: UsersRound }, { key: "history", label: "History", icon: Clock3 }, { key: "settings", label: "Settings", icon: Settings2 },
];
export function AppSidebar({ active, onNavigate }: { active: NavKey; onNavigate: (page: NavKey) => void }) {
  const selected = active === "suggestions" || active === "ongoing" ? "new-conversation" : active;
  return <aside className="sidebar"><div className="brand-lockup"><span className="brand-mark"><AssistantMascot/></span><span>Sales Agent</span></div>
    <div className="workspace-switcher"><div className="workspace-avatar">S</div><div className="workspace-copy"><strong>Sales Workspace</strong><span>Demo environment</span></div></div>
    <div className="nav-section-label">WORKSPACE</div><nav className="main-nav" aria-label="Main navigation">{items.map(({key,label,icon:Icon})=><button key={key} className={`nav-item ${selected===key?"active":""}`} onClick={()=>onNavigate(key)}><Icon size={18}/><span>{label}</span></button>)}</nav>
    <div className="sidebar-bottom"><div className="profile-row"><div className="profile-avatar">JZ</div><div className="profile-copy"><strong>Jin Zhang</strong><span>Sales Team</span></div><span className="profile-menu">···</span></div></div>
  </aside>;
}
