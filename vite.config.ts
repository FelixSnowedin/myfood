import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// ponytail: relative base, so the build works under any GitHub Pages subpath
export default defineConfig({ base: './', plugins: [react()] });
