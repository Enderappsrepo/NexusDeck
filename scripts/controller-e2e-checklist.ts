/**
 * Controller-only navigation checklist for manual or CI verification.
 * Run with: npx tsx scripts/controller-e2e-checklist.ts
 */

const CHECKLIST = [
  "Home → pick game → R1 to Discover → A on mod → A download → A install",
  "B back chain returns to Home",
  "Library: X toggles enable/disable without focusing Enable button",
  "Library: L2/R2 reorders mods",
  "Collection: Install all required chains download + install",
  "Menu opens search or command palette",
  "Hint bar visible when controller active",
  "Focus ring visible on all interactive elements",
] as const;

console.log("NexusDeck Controller E2E Checklist\n");
CHECKLIST.forEach((item, i) => {
  console.log(`${i + 1}. [ ] ${item}`);
});
console.log("\nAutomated gamepad simulation requires Playwright + virtual gamepad in CI.");
process.exit(0);
