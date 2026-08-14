import {
  Upload,
  SlidersHorizontal,
  ListChecks,
  MessageCircle,
  Satellite,
} from "lucide-react";

function TopBar({
  view,
  drawer,
  onUpload,
  onJobSetup,
  onJobs,
  onChat,
  showChat = true,
}) {
  return (
    <header className="topbar">
      <div className="brand-area">
        <div className="brand-icon">
          <Satellite size={16} />
        </div>

        <div>
          <div className="brand-name">
            Earth Data Hub
          </div>

          <div className="brand-subtitle">
            Field data collection & harmonization
          </div>
        </div>
      </div>

      <nav className="nav-actions">
        <button
          type="button"
          className={`nav-button ${
            view === "map" ? "active" : ""
          }`}
          onClick={onUpload}
        >
          <Upload size={15} />
          Upload Boundary
        </button>

        <button
          type="button"
          className={`nav-button ${
            drawer === "job" ? "active" : ""
          }`}
          onClick={onJobSetup}
        >
          <SlidersHorizontal size={15} />
          Job Setup
        </button>

        <button
          type="button"
          className={`nav-button ${
            view === "jobs" ? "active" : ""
          }`}
          onClick={onJobs}
        >
          <ListChecks size={15} />
          Jobs
        </button>
      </nav>

      {/* Hidden when no assist service is configured. */}
      {showChat ? (
        <button
          type="button"
          className={`chat-launcher ${
            drawer === "chat"
              ? "chat-launcher-active"
              : ""
          }`}
          onClick={onChat}
          aria-label="Open assistant"
        >
          <MessageCircle size={18} />
        </button>
      ) : null}
    </header>
  );
}

export default TopBar;