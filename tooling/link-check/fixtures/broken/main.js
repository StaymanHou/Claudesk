// `deletedExport` does not exist in ./lib.js and is used as a VALUE, so a real
// ESM linker must reject this import.
import { present, deletedExport } from "./lib.js";

export const out = [present, deletedExport];
