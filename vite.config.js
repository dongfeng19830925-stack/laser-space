import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  build: {
    rolldownOptions: {
      input: {
        model: fileURLToPath(new URL('./index.html', import.meta.url)),
        laserRoom: fileURLToPath(new URL('./laser-room/index.html', import.meta.url)),
      },
    },
  },
});
