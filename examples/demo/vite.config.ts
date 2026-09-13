import { defaultClientConditions, defineConfig } from "vite";

// Resolve the workspace packages to their TypeScript sources so the demo needs no separate build step.
export default defineConfig({
    resolve: {
        conditions: ["@rsegrest/source", ...defaultClientConditions],
    },
    build: {
        target: "es2022",
        rollupOptions: {
            input: {
                benchmark: "index.html",
                fontAnd3d: "font-and-3d.html",
            },
        },
    },
});
