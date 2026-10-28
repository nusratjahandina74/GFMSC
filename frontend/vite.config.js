import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // NOTE: VITE_API_BASE_URL must come from .env (dev) / .env.production
  // (prod build) — do NOT hardcode it here via `define`. A `define` override
  // here would force-replace import.meta.env.VITE_API_BASE_URL at build
  // time unconditionally, in every mode, making the two .env files
  // pointless and silently sending local dev traffic to the live
  // production backend.
});