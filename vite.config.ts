import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    // ゲーム処理はDOMに依存させないため、ブラウザを模した環境は使わない。
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
