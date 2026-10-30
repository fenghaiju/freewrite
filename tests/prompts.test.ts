import { describe, expect, it } from "vitest";
import { buildSystemPrompt, buildUserPrompt, parseDraft } from "../src/orchestration/prompts";
import { findPlatform } from "../src/platforms/registry";

const zhihu = findPlatform("zhihu")!;

describe("buildSystemPrompt", () => {
	it("asks for a JSON object with the expected keys", () => {
		const prompt = buildSystemPrompt({ source: "body", sourceTitle: "title", platform: zhihu });
		expect(prompt).toContain('"title"');
		expect(prompt).toContain('"body"');
		expect(prompt).toContain('"tags"');
		expect(prompt).toContain('"summary"');
	});

	it("appends the user's extra system prompt", () => {
		const prompt = buildSystemPrompt({
			source: "body",
			sourceTitle: "title",
			platform: zhihu,
			systemPrompt: "Always write in British English.",
		});
		expect(prompt).toContain("Always write in British English.");
	});

	it("does not add an empty extra prompt section", () => {
		const prompt = buildSystemPrompt({ source: "body", sourceTitle: "title", platform: zhihu, systemPrompt: "   " });
		expect(prompt).not.toContain("Additional instructions from the user");
	});
});

describe("buildUserPrompt", () => {
	it("includes the platform constraints and the source", () => {
		const prompt = buildUserPrompt({ source: "the article body", sourceTitle: "the title", platform: zhihu });
		expect(prompt).toContain("知乎");
		expect(prompt).toContain("the article body");
		expect(prompt).toContain("the title");
		expect(prompt).toContain(String(zhihu.titleLimit));
	});

	it("tells the model when Markdown is not supported", () => {
		const weibo = findPlatform("weibo")!;
		const prompt = buildUserPrompt({ source: "body", sourceTitle: "title", platform: weibo });
		expect(prompt).toContain("does not support Markdown");
	});

	it("tells the model when Markdown is supported", () => {
		const csdn = findPlatform("csdn")!;
		const prompt = buildUserPrompt({ source: "body", sourceTitle: "title", platform: csdn });
		expect(prompt).toContain("keep code blocks");
	});
});

describe("parseDraft", () => {
	it("parses a plain JSON object", () => {
		const parsed = parseDraft('{"title":"T","body":"B","tags":["a","b"],"summary":"S"}');
		expect(parsed).toEqual({ title: "T", body: "B", tags: ["a", "b"], summary: "S" });
	});

	it("parses a JSON object wrapped in a markdown fence", () => {
		const parsed = parseDraft('```json\n{"title":"T","body":"B","tags":[],"summary":""}\n```');
		expect(parsed?.title).toBe("T");
		expect(parsed?.body).toBe("B");
	});

	it("parses a JSON object surrounded by prose", () => {
		const parsed = parseDraft('Here you go:\n{"title":"T","body":"B"}\nHope that helps.');
		expect(parsed?.title).toBe("T");
	});

	it("strips the leading hash from tags", () => {
		const parsed = parseDraft('{"title":"T","body":"B","tags":["#one","#two"],"summary":""}');
		expect(parsed?.tags).toEqual(["one", "two"]);
	});

	it("returns null when there is no body", () => {
		expect(parseDraft('{"title":"T","body":"","tags":[],"summary":""}')).toBeNull();
	});

	it("returns null for unparseable input", () => {
		expect(parseDraft("no json here")).toBeNull();
		expect(parseDraft("")).toBeNull();
	});

	it("handles escaped newlines in the body", () => {
		const parsed = parseDraft('{"title":"T","body":"line1\\nline2","tags":[],"summary":""}');
		expect(parsed?.body).toBe("line1\nline2");
	});
});
