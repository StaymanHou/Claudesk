import { fileURLToPath } from "node:url";

// The narrowing the entry check exists to catch: pip.html exists but is no
// longer an input, so nothing in its graph would be link-checked.
export default {
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
      },
    },
  },
};
