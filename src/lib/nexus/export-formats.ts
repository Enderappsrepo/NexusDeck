export const EXPORT_FORMATS = [
  { id: "markdown", label: "Markdown", extension: ".md" },
  { id: "loot", label: "LOOT", extension: ".txt" },
  { id: "mo2", label: "Mod Organizer 2", extension: ".txt" },
  { id: "vortex", label: "Vortex", extension: ".txt" },
] as const;

export type ExportFormatId = (typeof EXPORT_FORMATS)[number]["id"];
