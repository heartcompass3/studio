import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    host: "127.0.0.1",
    strictPort: false,
    open: false,
    proxy: {
      "/api-google": {
        target: "https://generativelanguage.googleapis.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-google/, ""),
        secure: false,
      },
    },
  },
});
