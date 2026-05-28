import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "https://survey-api.avalon.exposed",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://survey-api.avalon.exposed",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
