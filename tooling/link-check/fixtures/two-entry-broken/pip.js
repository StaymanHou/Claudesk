// Mutant B's shape: only the SECOND entry's graph imports a missing export, so a
// check that built only the first entry would pass.
import { present, deletedExport } from "./lib.js";

export const out = [present, deletedExport];
