// `NoSuchType` does not exist in ./lib.ts, but it is used only as a TYPE, so it
// is erased before linking (as at runtime) and the check must NOT fail.
import { present, NoSuchType } from "./lib";

export type Ctl = NoSuchType;
export const out = present;
