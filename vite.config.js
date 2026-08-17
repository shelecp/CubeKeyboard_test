import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 开发用 vite 本地服务器；打包时把 JS/CSS 全部内联进单个 index.html，
// 这样 dist/index.html 可以直接双击打开，也方便拷贝到任意设备运行。
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    open: false,
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
  },
});
