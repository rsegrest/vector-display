import { defaultClientConditions, defaultServerConditions } from "vite";
import { defineConfig } from "vitest/config";

// Tests import sibling workspace packages from their TypeScript sources, so no build is needed first.
export default defineConfig({
    resolve: { conditions: ["@vector-display/source", ...defaultClientConditions] },
    ssr: { resolve: { conditions: ["@vector-display/source", ...defaultServerConditions] } },
    test: { include: ["packages/*/src/**/*.test.ts", "examples/*/src/**/*.test.ts"] },
});
