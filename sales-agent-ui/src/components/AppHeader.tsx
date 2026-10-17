interface Props { title: string; subtitle: string }
/** Page title only. (The old "Need a hand?", "Demo workspace", bell and avatar did nothing.) */
export function AppHeader({ title, subtitle }: Props) { return <header className="topbar"><div><div className="breadcrumb"><strong>{title}</strong></div><p className="topbar-subtitle">{subtitle}</p></div></header>; }
