import commonjs from 'rollup-plugin-commonjs'; // Convert CommonJS modules to ES6
import vue from 'rollup-plugin-vue'; // Handle .vue SFC files
import buble from 'rollup-plugin-buble'; // Transpile/polyfill with reasonable browser support
import resolve from '@rollup/plugin-node-resolve';
import scss from 'rollup-plugin-scss'
import replace from 'rollup-plugin-replace'
import scssVariable from 'rollup-plugin-sass-variables'
import postcss from 'rollup-plugin-postcss'
import common from 'rollup-plugin-commonjs'
import babel from 'rollup-plugin-babel'

export default {
    input: 'src/index.js', // Path relative to package.json
    output: {
        name: 'Demo',
        exports: 'named',
    },
    plugins: [

        vue({
          css: true
        }),
        scss(),
        postcss(),
        scssVariable(),

        replace({
          'process.env.NODE_ENV': JSON.stringify('production')
        }),
        resolve({
          mainFields: ['module', 'main']
        }),
        common(),
        babel({exclude: 'node_modules/**'})





        /*commonjs(),
        vue({
            css: true, // Dynamically inject css as a <style> tag
            compileTemplate: true // Explicitly convert template to render function
        }),
        scss(),
        postcss(),
        scssVariable(),
        buble(), // Transpile to ES5
        resolve(),
        replace({
          'process.env.NODE_ENV': JSON.stringify('production'),
          'process.env.VUE_ENV': JSON.stringify('browser')
        })*/
    ],
};