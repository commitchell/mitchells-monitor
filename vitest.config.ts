import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        include: ["test/**/*.test.ts"],
        exclude: ["test/extension.test.ts", "test/integration.test.ts"],
        environment: "node",
        typecheck: {
            tsconfig: "./tsconfig.json",
        },
    },
});
