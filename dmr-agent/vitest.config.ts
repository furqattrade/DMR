import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    root: './',
  },
  resolve: {
    alias: {
      '@src': './src',
    },
  },
  plugins: [
    swc.vite({
      jsc: {
        parser: {
          syntax: 'typescript',
          tsx: false,
          decorators: true,
        },
        target: 'es2022',
        transform: {
          decoratorMetadata: true,
        },
      },
    }),
  ],
});
