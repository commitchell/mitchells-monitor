// @ts-check
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

async function main() {
    const ctx = await esbuild.context({
        entryPoints: ["src/extension.ts"],
        bundle: true,
        format: "cjs",
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: "node",
        outfile: "dist/extension.js",
        external: ["vscode"],
        logLevel: "info",
        plugins: [
            /* add to the end of plugins array */
            esbuildProblemMatcherPlugin,
            copyAssetsPlugin,
        ],
    });
    if (watch) {
        await ctx.watch();
    } else {
        await ctx.rebuild();
        await ctx.dispose();
    }
}

/**
 * @type {import('esbuild').Plugin}
 */
const copyAssetsPlugin = {
    name: "copy-assets",
    setup(build) {
        build.onEnd(() => {
            const mediaDir = path.join(__dirname, "media");
            const distMediaDir = path.join(__dirname, "dist", "media");

            // Create dist/media directory if it doesn't exist
            if (!fs.existsSync(distMediaDir)) {
                fs.mkdirSync(distMediaDir, { recursive: true });
            }

            // Copy font files
            if (fs.existsSync(mediaDir)) {
                const files = fs.readdirSync(mediaDir);
                files.forEach((file) => {
                    const srcPath = path.join(mediaDir, file);
                    const destPath = path.join(distMediaDir, file);
                    fs.copyFileSync(srcPath, destPath);
                });
                console.log("[copy-assets] Media files copied to dist/media");
            }

            // Copy icon.png to dist
            const iconPath = path.join(__dirname, "icon.png");
            const distIconPath = path.join(__dirname, "dist", "icon.png");
            if (fs.existsSync(iconPath)) {
                fs.copyFileSync(iconPath, distIconPath);
                console.log("[copy-assets] Extension icon copied to dist/");
            }
        });
    },
};

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
    name: "esbuild-problem-matcher",

    setup(build) {
        build.onStart(() => {
            console.log("[watch] build started");
        });
        build.onEnd((result) => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`);
                if (location) {
                    console.error(`    ${location.file}:${location.line}:${location.column}:`);
                }
            });
            console.log("[watch] build finished");
        });
    },
};

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
