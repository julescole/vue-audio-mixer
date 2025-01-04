import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import dts from 'vite-plugin-dts'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js' // Add the plugin for injecting CSS into JS

export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
    cssInjectedByJsPlugin(), // Use the plugin for injecting CSS
    dts({
      insertTypesEntry: true,
      rollupTypes: true, // Enable rolling up type definitions into a single file
    }),
  ],
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'VueAudioMixer',
      fileName: (format) => `vue-audio-mixer.${format}.js`,
    },
    rollupOptions: {
      external: ['vue'], // Exclude Vue from the bundle
      output: {
        globals: {
          vue: 'Vue',
        },
      },
    },
    cssCodeSplit: false, // Disable CSS splitting so styles are bundled with JS
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: '', // Add SCSS global variables or mixins if needed
      },
    },
  },
})
