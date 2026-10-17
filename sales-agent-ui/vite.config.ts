import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// `pnpm dev` runs the UI on :5173 and forwards the backend routes to the Node server on :3000
// (start it with `node server.js` from the repo root). In production the Node server serves the built UI itself.
const backend = "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { "/api": backend, "/communications": backend } },
});
