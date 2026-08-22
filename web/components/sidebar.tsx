import { Icons } from "./icons";
import type { WorkspaceView } from "@/lib/types";

type SidebarProps = {
  currentView: WorkspaceView;
  documentCount: number;
  apiOnline: boolean;
  mobileOpen: boolean;
  onNavigate: (view: WorkspaceView) => void;
  onClose: () => void;
};

export function Sidebar({ currentView, documentCount, apiOnline, mobileOpen, onNavigate, onClose }: SidebarProps) {
  const go = (view: WorkspaceView) => {
    onNavigate(view);
    onClose();
  };

  return (
    <>
      {mobileOpen && <button type="button" className="sidebar-scrim" onClick={onClose} aria-label="Close navigation" />}
      <aside className={`sidebar ${mobileOpen ? "sidebar--open" : ""}`} aria-label="Primary navigation">
        <div className="brand">
          <span className="brand__mark"><Icons.logo size={23} /></span>
          <span>LedgerLens</span>
        </div>

        <nav className="nav-list">
          <p className="nav-eyebrow">Workspace</p>
          <button type="button" className={`nav-item ${currentView === "documents" ? "is-active" : ""}`} onClick={() => go("documents")}>
            <Icons.files size={18} /><span>Documents</span><span className="nav-count">{documentCount}</span>
          </button>
          <button type="button" className={`nav-item ${currentView === "ask" ? "is-active" : ""}`} onClick={() => go("ask")}>
            <Icons.chat size={18} /><span>Ask LedgerLens</span>
          </button>
        </nav>

        <div className="sidebar__status">
          <div className="status-row"><span className={`status-dot ${apiOnline ? "" : "status-dot--offline"}`} /><span>Retrieval engine</span><strong className={apiOnline ? "" : "is-offline"}>{apiOnline ? "Online" : "Offline"}</strong></div>
          <p>{apiOnline ? "Answers are grounded in your indexed documents." : "Start the Flask API to reconnect this workspace."}</p>
        </div>

        <div className="sidebar__footer">
          <div className="avatar" aria-hidden="true">FR</div>
          <div><strong>Financial Research</strong><span>Personal workspace</span></div>
        </div>
      </aside>
    </>
  );
}
