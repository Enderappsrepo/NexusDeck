import { resolveTabHandler } from "../src/lib/gamepad/tabPriority.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const sidebar: import("../src/lib/gamepad/GamepadRouter.ts").TabHandler = {
  tabIds: ["home"],
  activeTab: "home",
  onTabChange: () => {},
  scope: "sidebar",
};

const page: import("../src/lib/gamepad/GamepadRouter.ts").TabHandler = {
  tabIds: ["play", "discover"],
  activeTab: "play",
  onTabChange: () => {},
  scope: "page",
};

assert(resolveTabHandler([sidebar, page]) === page, "page handler should beat sidebar");
assert(resolveTabHandler([page, sidebar]) === page, "page handler should win when registered last");

const onlySidebar = { ...sidebar, tabIds: ["a", "b"], activeTab: "a" };
assert(resolveTabHandler([onlySidebar]) === onlySidebar, "sidebar alone should be used");

console.log("gamepad tab priority checks passed");
