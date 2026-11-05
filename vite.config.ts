import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true,
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Las librerías grandes van en archivos aparte: el navegador las guarda en caché y no vuelven a bajar
        // con cada versión nueva de la app (y las gráficas solo se bajan cuando se abre una pantalla que las usa).
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          if (/node_modules\/(recharts|d3-[^/]+|victory-vendor|react-smooth|recharts-scale|internmap|delaunator|robust-predicates|fast-equals|decimal\.js-light)\//.test(id)) return "graficas";
          if (/node_modules\/framer-motion\//.test(id)) return "animaciones";
          if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|@remix-run|zustand|@tanstack|socket\.io-client|engine\.io-client|socket\.io-parser|engine\.io-parser|clsx|tailwind-merge|class-variance-authority)\//.test(id)) return "react";
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
}));
