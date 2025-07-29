import path from 'node:path';
import {fileURLToPath} from 'node:url';
import terser from '@rollup/plugin-terser';
import forceTerserPlugin from './vite-plugin-force-terser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/**
 * @param {{ mode: 'development' | 'production' }} param0
 * @returns {import('vite').UserConfig}
 */
export default function ({mode}: { mode: 'development' | 'production' }) {
    const isDev = mode === 'development';

    return {
        build: {
            minify: !isDev,
            lib: {
                entry: ['./src/index.ts'],
                name: 'rxjs-bridge',
                fileName: 'rxjs-bridge',
                formats: ['es'],
            },
            emptyOutDir: true,
            outDir: path.resolve(__dirname, './lib'),
            sourcemap: true,
            rollupOptions: {
                output: {
                    entryFileNames: `rxjs-bridge.[format].js`,
                    assetFileNames: `[name][extname]`,
                    sourcemapExcludeSources: true,
                },
                plugins: [
                    // doesn't work for esm modules
                    terser({
                        compress: true,
                        mangle: true,
                        format: {
                            comments: false
                        }
                    })
                ]
            }
        },
        plugins: [
            // this works for esm modules
            !isDev && forceTerserPlugin({filePath: "./lib/rxjs-bridge.es.js"}),
        ],
        server: {
            fs: {
                strict: true,
                allow: ['src']
            }
        },
        optimizeDeps: {
            noDiscovery: true,
            include: []
        }
    };
}
