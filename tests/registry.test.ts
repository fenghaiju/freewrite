import { describe, expect, it } from "vitest";
import { allPlatformIds, findPlatform, platformName, resolvePlatforms, weightedLength } from "../src/platforms/registry";
import { validateDraft, hasMarkdownSyntax } from "../src/orchestration/validation";

describe("platform registry", () => {
	it("exposes the built-in platforms", () => {
		expect(findPlatform("wechat_mp")?.name).toBe("微信公众号");
		expect(findPlatform("zhihu")?.name).toBe("知乎");
		expect(findPlatform("csdn")?.name).toBe("CSDN");
		expect(findPlatform("juejin")?.name).toBe("掘金");
	});

	it("gives every platform a publish URL on the platform's own domain", () => {
		const ids = allPlatformIds();
		expect(ids.length).toBeGreaterThan(0);
		for (const id of ids) {
			const platform = findPlatform(id)!;
			expect(platform.publishUrl).toMatch(/^https:\/\//);
		}
	});

	it("prefers a user override over the built-in definition", () => {
		const overrides = [{ ...findPlatform("zhihu")!, name: "知乎专栏" }];
		expect(findPlatform("zhihu", overrides)?.name).toBe("知乎专栏");
		expect(platformName("zhihu", overrides)).toBe("知乎专栏");
	});

	it("drops unknown ids when resolving", () => {
		const resolved = resolvePlatforms(["zhihu", "does-not-exist"]);
		expect(resolved).toHaveLength(1);
		expect(resolved[0].id).toBe("zhihu");
	});
});

describe("weightedLength", () => {
	it("counts CJK characters as two", () => {
		expect(weightedLength("中文")).toBe(4);
	});

	it("counts ASCII characters as one", () => {
		expect(weightedLength("abcd")).toBe(4);
	});

	it("counts a mixed string correctly", () => {
		expect(weightedLength("a中")).toBe(3);
	});
});

describe("validateDraft", () => {
	const base = {
		platformId: "zhihu",
		title: "标题",
		body: "正文内容，正文内容，正文内容。",
		tags: ["标签"],
		summary: "摘要",
		images: [],
	};

	it("reports no warnings for a draft that fits", () => {
		const zhihu = findPlatform("zhihu")!;
		const result = validateDraft(zhihu, { ...base, body: "字".repeat(1500) });
		expect(result.warnings).toEqual([]);
	});

	it("warns when the title is too long", () => {
		const toutiao = findPlatform("toutiao")!;
		const result = validateDraft(toutiao, { ...base, title: "标".repeat(30), body: "短" });
		expect(result.warnings.some((warning) => warning.includes("over the"))).toBe(true);
	});

	it("does not check the title on a platform that has none", () => {
		const weibo = findPlatform("weibo")!;
		const result = validateDraft(weibo, { ...base, title: "标".repeat(30), body: "短", tags: ["a"] });
		expect(result.warnings.some((warning) => warning.includes("Title"))).toBe(false);
	});

	it("warns when the body is too short", () => {
		const zhihu = findPlatform("zhihu")!;
		const result = validateDraft(zhihu, { ...base, body: "短" });
		expect(result.warnings.some((warning) => warning.includes("below"))).toBe(true);
	});

	it("warns when tags are missing on a platform that expects them", () => {
		const zhihu = findPlatform("zhihu")!;
		const result = validateDraft(zhihu, { ...base, tags: [], body: "字".repeat(1500) });
		expect(result.warnings.some((warning) => warning.includes("topic tags"))).toBe(true);
	});

	it("warns when a platform without Markdown support receives Markdown", () => {
		const weibo = findPlatform("weibo")!;
		const result = validateDraft(weibo, {
			...base,
			body: "**加粗** 内容",
			tags: ["a"],
		});
		expect(result.warnings.some((warning) => warning.includes("Markdown"))).toBe(true);
	});

	it("does not warn about Markdown on a platform that supports it", () => {
		const csdn = findPlatform("csdn")!;
		const result = validateDraft(csdn, {
			...base,
			body: "**加粗**\n\n```ts\nconst a = 1;\n```",
			tags: ["a"],
		});
		expect(result.warnings.some((warning) => warning.includes("Markdown"))).toBe(false);
	});
});

describe("hasMarkdownSyntax", () => {
	it("detects headings, lists, code and links", () => {
		expect(hasMarkdownSyntax("# Heading")).toBe(true);
		expect(hasMarkdownSyntax("- item")).toBe(true);
		expect(hasMarkdownSyntax("**bold**")).toBe(true);
		expect(hasMarkdownSyntax("`code`")).toBe(true);
		expect(hasMarkdownSyntax("[link](https://example.com)")).toBe(true);
		expect(hasMarkdownSyntax("```code```")).toBe(true);
	});

	it("does not flag plain prose", () => {
		expect(hasMarkdownSyntax("这是一段普通的中文文字。")).toBe(false);
	});
});
