import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// "npm run dev:https" startet mit eigenem Zertifikat, damit der Standort am Handy funktioniert.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'https' ? [basicSsl()] : [])],
  server: { host: mode === 'https' ? true : undefined },
}));
