import type { PlatformSpec } from "../types";

/**
 * Built-in platform registry.
 *
 * Every `publishUrl` points at the platform's own official compose page and was
 * verified to be reachable. freeWrite never posts to these sites directly: it
 * only opens the page and fills the clipboard, so the user always performs the
 * final publish action from a session they are already signed in to.
 */
export const PLATFORMS: PlatformSpec[] = [
	{
		id: "wechat_mp",
		name: "微信公众号",
		audience: "关注公众号的中文读者，习惯碎片化阅读与深度长文并行",
		titleLimit: 64,
		bodyRange: [800, 2500],
		usesTags: false,
		tagLimit: 0,
		publishUrl: "https://mp.weixin.qq.com/cgi-bin/home?t=media/index",
		style: "标题克制且信息量足，不使用夸张标题党；开头直接进入主题；段落简短，适合手机阅读；不使用 Markdown 语法",
	},
	{
		id: "zhihu",
		name: "知乎",
		audience: "关注技术、职场与知识解释的中文提问者社区",
		titleLimit: 100,
		bodyRange: [1000, 4000],
		usesTags: true,
		tagLimit: 5,
		publishUrl: "https://zhuanlan.zhihu.com/write",
		style: "以问题意识切入，先给结论再展开论证；可以保留 Markdown 的列表与代码块；语气理性、有依据",
	},
	{
		id: "csdn",
		name: "CSDN",
		audience: "以中文开发者为主的技术社区",
		titleLimit: 100,
		bodyRange: [1200, 5000],
		usesTags: true,
		tagLimit: 5,
		publishUrl: "https://editor.csdn.net/md/",
		style: "结构清晰的技术文档：背景、方案、代码、结论；完整保留 Markdown 代码块并标注语言；给出可运行的示例",
		keepMarkdown: true,
	},
	{
		id: "juejin",
		name: "掘金",
		audience: "中文技术博客读者，偏重工程实践",
		titleLimit: 60,
		bodyRange: [1000, 4000],
		usesTags: true,
		tagLimit: 3,
		publishUrl: "https://juejin.cn/editor/drafts/new",
		style: "面向一线工程师，强调踩坑经验与可复用结论；保留 Markdown 代码块；避免营销腔",
		keepMarkdown: true,
	},
	{
		id: "toutiao",
		name: "今日头条",
		audience: "泛消费大众，标题党容忍度高但反感空洞",
		titleLimit: 30,
		bodyRange: [600, 2000],
		usesTags: true,
		tagLimit: 5,
		publishUrl: "https://mp.toutiao.com/profile_v4/graphic/publish",
		style: "开头一句钩子抓住注意力；段落极短，多用换行；口语化；不使用 Markdown 语法",
	},
	{
		id: "bilibili",
		name: "哔哩哔哩专栏",
		audience: "偏好深度长文与分节的年轻用户",
		titleLimit: 80,
		bodyRange: [1200, 4000],
		usesTags: true,
		tagLimit: 10,
		publishUrl: "https://member.bilibili.com/read/editor",
		style: "可用小标题分节，节奏明快；保留 Markdown；适度使用表情符号但不过度",
		keepMarkdown: true,
	},
	{
		id: "xiaohongshu",
		name: "小红书",
		audience: "以年轻女性为主的生活方式社区，视觉优先",
		titleLimit: 20,
		bodyRange: [300, 1000],
		usesTags: true,
		tagLimit: 10,
		publishUrl: "https://creator.xiaohongshu.com/publish/publish",
		style: "第一人称分享；短句加 emoji；分段留白；口语化并带一点情绪；不使用 Markdown 语法",
	},
	{
		id: "weibo",
		name: "微博",
		audience: "碎片化信息流读者，注意力极短",
		titleLimit: 0,
		bodyRange: [80, 280],
		usesTags: true,
		tagLimit: 3,
		publishUrl: "https://weibo.com",
		style: "一段话讲清楚一件事，控制在 280 字以内；可带 1 到 3 个话题词；不使用 Markdown 语法",
	},
	{
		id: "x",
		name: "X",
		audience: "国际技术与人文读者",
		titleLimit: 0,
		bodyRange: [80, 280],
		usesTags: true,
		tagLimit: 2,
		publishUrl: "https://x.com/compose/post",
		style: "英文或与原文一致的语言；280 字以内；单条内容聚焦一个观点；可附 1 到 2 个话题词",
	},
	{
		id: "jianshu",
		name: "简书",
		audience: "偏文艺与深度阅读的中文用户",
		titleLimit: 80,
		bodyRange: [800, 3000],
		usesTags: false,
		tagLimit: 0,
		publishUrl: "https://www.jianshu.com",
		style: "散文化叙事，重意境与个人感受；不使用 Markdown 语法",
	},
	{
		id: "devto",
		name: "DEV Community",
		audience: "全球开发者社区",
		titleLimit: 120,
		bodyRange: [600, 3000],
		usesTags: true,
		tagLimit: 4,
		publishUrl: "https://dev.to/new",
		style: "英文技术文章；保留 Markdown 代码块并标注语言；首段说明动机与结论",
		keepMarkdown: true,
	},
	{
		id: "medium",
		name: "Medium",
		audience: "全球泛科技与人文读者",
		titleLimit: 100,
		bodyRange: [600, 2500],
		usesTags: false,
		tagLimit: 0,
		publishUrl: "https://medium.com/new-story",
		style: "英文叙事性文章；短段落；可使用 Markdown 的小标题",
	},
];

export const DEFAULT_PLATFORM_IDS = ["wechat_mp", "zhihu", "csdn", "juejin"];

/** Returns the ids of every known platform, including user-defined overrides. */
export function allPlatformIds(overrides: PlatformSpec[] = []): string[] {
	const builtin = PLATFORMS.map((platform) => platform.id);
	const extra = overrides.map((platform) => platform.id).filter((id) => !builtin.includes(id));
	return [...builtin, ...extra];
}

/** Returns the display name of a platform. */
export function platformName(id: string, overrides: PlatformSpec[] = []): string {
	return findPlatform(id, overrides)?.name ?? id;
}

export function findPlatform(id: string, overrides: PlatformSpec[] = []): PlatformSpec | undefined {
	const override = overrides.find((p) => p.id === id);
	if (override) return override;
	return PLATFORMS.find((p) => p.id === id);
}

export function resolvePlatforms(ids: string[], overrides: PlatformSpec[] = []): PlatformSpec[] {
	return ids
		.map((id) => findPlatform(id, overrides))
		.filter((p): p is PlatformSpec => Boolean(p));
}

/** Counts a string the way the target platform would, treating CJK as double width. */
export function weightedLength(text: string): number {
	let total = 0;
	for (const char of text) {
		const code = char.codePointAt(0) ?? 0;
		const isWide =
			(code >= 0x1100 && code <= 0x115f) ||
			(code >= 0x2e80 && code <= 0xa4cf) ||
			(code >= 0xac00 && code <= 0xd7a3) ||
			(code >= 0xf900 && code <= 0xfaff) ||
			(code >= 0xfe30 && code <= 0xfe6f) ||
			(code >= 0xff00 && code <= 0xff60) ||
			(code >= 0xffe0 && code <= 0xffe6) ||
			(code >= 0x20000 && code <= 0x3fffd);
		total += isWide ? 2 : 1;
	}
	return total;
}
