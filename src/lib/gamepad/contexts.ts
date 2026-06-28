export type InputContext =
  | "global"
  | "home"
  | "games"
  | "settings"
  | "onboarding"
  | "setup"
  | "gameHub"
  | "discover"
  | "browse"
  | "modDetail"
  | "library"
  | "collections"
  | "collectionDetail"
  | "compare"
  | "preview"
  | "dialog";

export interface ContextHints {
  navigate?: string;
  confirm?: string;
  back?: string;
  secondary?: string;
  context?: string;
  tabs?: string;
  scroll?: string;
  menu?: string;
}

const GLOBAL_HINTS: ContextHints = {
  navigate: "D-pad / Stick",
  confirm: "A",
  back: "B",
  tabs: "L1 / R1",
  scroll: "L2 / R2",
  menu: "Menu",
};

export const CONTEXT_HINTS: Record<InputContext, ContextHints> = {
  global: GLOBAL_HINTS,
  home: {
    ...GLOBAL_HINTS,
    secondary: "X: Quick Launch",
    context: "Y: Quick Launch",
    scroll: "L2 / R2: Scroll",
  },
  games: {
    ...GLOBAL_HINTS,
    secondary: "X: Open",
    menu: "Menu: Search",
    scroll: "L2 / R2: Scroll",
  },
  settings: {
    ...GLOBAL_HINTS,
    scroll: "L2 / R2: Scroll",
    menu: "Menu: Command palette",
  },
  onboarding: {
    navigate: "D-pad / Stick",
    confirm: "A: Continue",
    back: "B: Previous",
    scroll: "L2 / R2: Scroll",
  },
  setup: {
    navigate: "D-pad / Stick",
    confirm: "A: Continue",
    back: "B: Previous",
    scroll: "L2 / R2: Scroll",
  },
  gameHub: {
    ...GLOBAL_HINTS,
    secondary: "X: Browse",
    context: "Y: Quick Launch",
    menu: "Menu: Search",
  },
  discover: {
    ...GLOBAL_HINTS,
    secondary: "X: Download",
    context: "Y: Endorse",
    tabs: "L1 / R1: View",
  },
  browse: {
    ...GLOBAL_HINTS,
    confirm: "A: Install",
    secondary: "X: Download",
    context: "Y: Endorse",
    tabs: "L1 / R1: Sort",
    scroll: "L2 / R2: Scroll",
    menu: "Menu: Search",
  },
  modDetail: {
    ...GLOBAL_HINTS,
    confirm: "A: Install",
    secondary: "X: Files",
    context: "Y: Endorse",
    tabs: "L1 / R1: Tab",
    scroll: "L2 / R2: Gallery",
  },
  library: {
    ...GLOBAL_HINTS,
    secondary: "X: Enable/Disable",
    context: "Y: Actions",
    scroll: "L2 / R2: Reorder",
    menu: "Menu: Search",
  },
  collections: {
    ...GLOBAL_HINTS,
    secondary: "X: Open",
    scroll: "L2 / R2: Scroll",
  },
  collectionDetail: {
    ...GLOBAL_HINTS,
    secondary: "X: Install",
    scroll: "L2 / R2: Scroll",
  },
  compare: {
    ...GLOBAL_HINTS,
    secondary: "X: Switch picker",
    tabs: "L1 / R1: Cycle mod",
    scroll: "L2 / R2: Scroll",
  },
  preview: {
    ...GLOBAL_HINTS,
    scroll: "L2 / R2: Scroll",
  },
  dialog: {
    navigate: "D-pad",
    confirm: "A: Select",
    back: "B: Close",
    scroll: "L2 / R2: Scroll",
  },
};

export function resolveContextFromPath(pathname: string): InputContext {
  if (pathname === "/") return "home";
  if (pathname === "/onboarding") return "onboarding";
  if (pathname === "/settings") return "settings";
  if (pathname === "/games") return "games";
  if (pathname.match(/\/compare$/)) return "compare";
  if (pathname.match(/\/preview\/\d+$/)) return "preview";
  if (pathname.match(/\/setup$/)) return "setup";
  if (pathname.match(/\/collections\/[^/]+$/)) return "collectionDetail";
  if (pathname.includes("/collections")) return "collections";
  if (pathname.includes("/library")) return "library";
  if (pathname.match(/\/mods\/\d+$/)) return "modDetail";
  if (pathname.includes("/mods")) return "browse";
  if (pathname.match(/^\/games\/[^/]+$/)) return "gameHub";
  return "global";
}
