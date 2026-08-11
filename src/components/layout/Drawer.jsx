import { X } from "lucide-react";

function Drawer({
  open,
  title,
  icon: Icon,
  onClose,
  children,
}) {
  return (
    <aside
      className={`drawer ${open ? "drawer-open" : ""}`}
      aria-hidden={!open}
    >
      <div className="drawer-header">
        <div className="drawer-title">
          {Icon && <Icon size={17} />}
          <span>{title}</span>
        </div>

        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label={`Close ${title}`}
        >
          <X size={18} />
        </button>
      </div>

      <div className="drawer-body">
        {children}
      </div>
    </aside>
  );
}

export default Drawer;