// Tiny flag parser shared by capture/render/build. Supports `--key value` and
// `--flag` (boolean). No deps. Returns a plain object; callers apply defaults.
export function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok.startsWith("--")) continue;
    const key = tok.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true; // boolean flag
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

// Resolve a value with a default and an optional numeric coercion.
export function num(v, dflt) {
  return v === undefined ? dflt : Number(v);
}
