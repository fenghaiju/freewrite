import { defineConfig } from "vitest/config";
import * as path from "path";

export default defineConfig({
	resolve: {
		alias: {
			// The real `obsidian` package only ships type declarations, so tests
			// use a small stub instead.
			obsidian: path.resolve(__dirname, "tests/stubs/obsidian.ts"),
		},
	},
	test: {
		include: ["tests/**/*.test.ts"],
		environment: "node",
		globals: false,
	},
});
