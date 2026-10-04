import { defaultClientConditions, defineConfig } from "vite";

// The demo is published under a subpath on two hosts, so asset URLs cannot be
// root-relative. "./" makes the same build work from a GitHub Pages project page
// (/vector-display/) and from any folder on the personal site.
export default defineConfig({
    base: "./",
    resolve: {
        conditions: ["@vector-display/source", ...defaultClientConditions],
    },
    build: {
        target: "es2022",
        rollupOptions: {
            input: {
                benchmark: "index.html",
                fontAnd3d: "font-and-3d.html",
                life: "life.html",
            },
        },
    },
});
