import commonjs from 'rollup-plugin-commonjs'; // Convert CommonJS modules to ES6
import vue from 'rollup-plugin-vue'; // Handle .vue SFC files
import buble from 'rollup-plugin-buble'; // Transpile/polyfill with reasonable browser support
import resolve from '@rollup/plugin-node-resolve';
import scss from 'rollup-plugin-scss'

export default {
    input: 'src/index.js', // Path relative to package.json
    output: {
        name: 'Demo',
        exports: 'named',
    },
    plugins: [
        commonjs(),
        vue({
            css: true, // Dynamically inject css as a <style> tag
            compileTemplate: true // Explicitly convert template to render function
        }),
        scss(),

        buble(), // Transpile to ES5
        resolve()
    ],
};