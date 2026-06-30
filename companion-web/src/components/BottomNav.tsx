import { BrowseIcon, LibraryIcon, LoadOrderIcon, SettingsIcon } from "./icons";

export type MainTab = "browse" | "library" | "loadorder" | "settings";

export function BottomNav({
  active,
  onChange,
  sessionActive,
  onInstall,
}: {
  active: MainTab | "mod" | "install" | "connect" | "collections";
  onChange: (tab: MainTab) => void;
  sessionActive: boolean;
  onInstall?: () => void;
}) {
  const tabClass = (tab: MainTab) =>
    active === tab || (tab === "browse" && active === "mod") ? "cc-tab cc-tab-active" : "cc-tab";

  return (
    <nav className="cc-tab-bar">
      <button type="button" className={tabClass("browse")} onClick={() => onChange("browse")}>
        <BrowseIcon />
        Browse
      </button>
      <button type="button" className={tabClass("library")} onClick={() => onChange("library")}>
        <LibraryIcon />
        Library
      </button>
      <button type="button" className={tabClass("loadorder")} onClick={() => onChange("loadorder")}>
        <LoadOrderIcon />
        Order
      </button>
      <button type="button" className={tabClass("settings")} onClick={() => onChange("settings")}>
        <SettingsIcon />
        Settings
      </button>
      {sessionActive && onInstall && (
        <button
          type="button"
          className={active === "install" ? "cc-tab cc-tab-active" : "cc-tab"}
          onClick={onInstall}
        >
          Install
        </button>
      )}
    </nav>
  );
}
