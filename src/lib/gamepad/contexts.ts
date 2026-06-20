export type InputContext =
  | "global"
  | "home"
  | "gameHub"
  | "discover"
  | "browse"
  | "modDetail"
  | "library"
  | "collections"
  | "collectionDetail"
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
    secondary: "X: Download",
    context: "Y: Endorse",
    tabs: "L1 / R1: Sort",
  },
  modDetail: {
    ...GLOBAL_HINTS,
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
    secondary: "X: Download",
    context: "Y: Details",
  },
  collectionDetail: {
    ...GLOBAL_HINTS,
    confirm: "A: Install All",
    secondary: "X: Download",
    context: "Y: Details",
  },
  dialog: {
    confirm: "A: Confirm",
    back: "B: Close",
    navigate: "D-pad",
  },
};

export function resolveContextFromPath(pathname: string): InputContext {
  if (pathname === "/") return "home";
  if (pathname.match(/\/collections\/[^/]+$/)) return "collectionDetail";
  if (pathname.includes("/collections")) return "collections";
  if (pathname.includes("/library")) return "library";
  if (pathname.match(/\/mods\/\d+$/)) return "modDetail";
  if (pathname.includes("/mods")) return "browse";
  if (pathname.match(/^\/games\/[^/]+$/)) return "gameHub";
  return "global";
}
