import { fileURLToPath } from "node:url";

// Two entries, like the repo's vite.config.ts (main + pip).
export default {
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        pip: fileURLToPath(new URL("./pip.html", import.meta.url)),
      },
    },
  },
};
