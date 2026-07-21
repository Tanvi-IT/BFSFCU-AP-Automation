import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Dev server proxies /api to the local Azure Functions host so the browser
// makes same-origin calls and CORS is not involved during development.
//
// The target is 127.0.0.1, not localhost: the Functions host binds 0.0.0.0
// (IPv4 only), while Node 17+ resolves "localhost" to ::1 first and no longer
// reorders results. Using the hostname makes every proxied call fail with a
// 502 that looks like an auth problem from the browser.
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:7071",
        changeOrigin: true,
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
