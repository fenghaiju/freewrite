/**
 * Renders the real freeWrite UI classes inside a faithful Obsidian shell.
 *
 * The three README screenshots are produced from the plugin's own
 * `WorkbenchView`, `FreeWriteSettingTab` and `InlineEditModal` classes, so the
 * markup and the styling cannot drift away from the shipped code.
 */

import { FreeWriteSettingTab } from "../../src/ui/settingsTab";
import { InlineEditModal } from "../../src/ui/inlineEditModal";
import { WorkbenchView } from "../../src/ui/workbenchView";
import { DEFAULT_SETTINGS, type FreeWriteSettings } from "../../src/settings";
import type { PlatformDraft } from "../../src/types";
import {
	installDomHelpers,
	setIcon,
	TFile,
	type App,
	type WorkspaceLeaf,
} from "obsidian";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const SOURCE_TITLE = "从技术到表达：一次 AI 辅助写作的实践";

const SOURCE_BODY = `很多人以为写公众号最难的是文笔，其实不是。真正难的是把一个技术话题，翻译成普通读者愿意读完的文字。

我把这个过程拆成了三步：先确定读者真正的问题，再决定哪些技术细节必须留下，最后才动笔。

第一步是选题。技术人写东西最容易犯的错，是选一个自己觉得有意思的话题，而不是读者正在搜索的问题。区别在于，前者的标题是名词，后者是问句。

第二步是取舍。一个函数讲清楚，还是连同它的边界条件一起讲？读者需要的不是完整，是刚好够用。多余的细节会让重点消失。

第三步是语言。把「由于异步机制的存在导致时序不可预测」改成「回调回来的时间不确定，所以顺序可能变」。不是降低信息量，而是降低解码成本。

AI 辅助写作真正有价值的地方，就在这三步的重复劳动上：它可以很快给你二十个选题角度，帮你把一段话改写成三种语气。但选题和取舍，仍然是你自己的判断。

写完之后，我还是会从头读一遍，把所有「其实」「基本上」「某种程度上」删掉。这些词是思考偷懒的痕迹。`;

const DRAFTS: PlatformDraft[] = [
	{
		platformId: "zhihu",
		title: "把一篇长文改写成知乎高赞回答，我用了三步",
		body: `很多人问：同一个选题，为什么在公众号能爆，在知乎却只有几十赞？

答案不在文笔，而在「读者的问题」。知乎是问答场，标题要像问题，正文要像答案，第一句就给结论，再补三个论据。

我自己的做法分三步。第一步，把标题从名词改成问句。「一次 AI 辅助写作的实践」是名词，「为什么技术文章在知乎没人看」是问句，后者才有被搜索的可能。

第二步，只留一个主张。知乎读者没有耐心读三个论点，如果开头三段不能说服他，他就不会读第四段。所以我通常把最重要的那部分放在最前面。

第三步，把「因为」全部展开。技术写作里最常见的偷懒是写「由于异步机制导致顺序不确定」，知乎读者读到的是术语，不是原因。改成「回调回来的时间不确定，所以你看到的顺序可能和发送顺序不一样」，信息量没变，但读者不用猜。

这三步做完，剩下的就只是把公众号那篇稿子的长度压到三分之一。删掉的部分不是不重要，而是不重要到不值得占用读者的注意力。`,
		tags: ["写作", "AI辅助", "效率"],
		summary: "用问答结构重写技术长文的三步法。",
		durationMs: 4200,
		warnings: [],
		images: [],
	},
	{
		platformId: "xiaohongshu",
		title: "长文变笔记的 3 个步骤",
		body: `一篇 3000 字的文章，压成小红书笔记只需三步：

1. 标题写冲突，不要写总结
2. 每段只留一个观点
3. 结尾留一个可以照做的小步骤

第 1 步最关键。「一次 AI 辅助写作的实践」没人点，「写了 3000 字，删到 300 字」才有人点。`,
		tags: ["写作", "效率工具"],
		summary: "把长文压成短笔记的三步。",
		durationMs: 2800,
		warnings: ["Title is 14 characters, the limit is 20."],
		images: [],
	},
];

const SETTINGS: FreeWriteSettings = {
	...DEFAULT_SETTINGS,
	opencodePath: "opencode",
	defaultModel: "anthropic/claude-sonnet-4-5",
	discoveredModels: [
		"anthropic/claude-sonnet-4-5",
		"anthropic/claude-opus-4-1",
		"openai/gpt-4o",
	],
	providers: [
		{
			id: "anthropic",
			name: "Anthropic",
			models: ["claude-sonnet-4-5", "claude-opus-4-1"],
			apiKey: "sk-ant-…",
		},
	],
	enabledPlatforms: ["wechat_mp", "zhihu", "csdn", "juejin"],
	bridge: {
		...DEFAULT_SETTINGS.bridge,
		endpoint: "https://your-app.example.com/api/publish",
	},
};

/* -------------------------------------------------------------------------- */
/* Fake plugin                                                                */
/* -------------------------------------------------------------------------- */

interface FakePlugin {
	app: App;
	settings: FreeWriteSettings;
	runtime: {
		getStatus(): { running: boolean; baseUrl?: string; version?: string };
	};
	saveSettings(): Promise<void>;
}

function createPlugin(): FakePlugin {
	return {
		app: {
			workspace: {
				getLeavesOfType: () => [],
				revealLeaf: async () => undefined,
				getActiveFile: () => null,
			},
			vault: {
				cachedRead: async () => SOURCE_BODY,
				getName: () => "Notes",
			},
			setting: {
				open: () => undefined,
				openTabById: () => undefined,
			},
		} as unknown as App,
		settings: SETTINGS,
		runtime: {
			getStatus: () => ({
				running: true,
				baseUrl: "http://127.0.0.1:41234",
				version: "1.19.5",
			}),
		},
		saveSettings: async () => undefined,
	};
}

/* -------------------------------------------------------------------------- */
/* Obsidian shells                                                            */
/* -------------------------------------------------------------------------- */

/** Builds the workspace leaf a view is hosted in. */
function createLeaf(app: App): WorkspaceLeaf {
	// The panel is hosted directly on the page: Obsidian's workspace chrome is
	// sized by the application window and would collapse in a full-page shot.
	const leaf = document.createElement("div");
	leaf.className = "workspace-leaf mod-root";
	document.body.appendChild(leaf);

	return { containerEl: leaf, app } as unknown as WorkspaceLeaf;
}

/** Adds the vertical navigation Obsidian shows beside a plugin settings tab. */
function buildSettingsNav(activeId: string): HTMLElement {
	const header = document.createElement("div");
	header.className = "vertical-tab-header";

	const search = document.createElement("div");
	search.className = "setting-search-container";
	const searchInput = document.createElement("div");
	searchInput.className = "search-input-container mod-raised";
	const input = document.createElement("input");
	input.type = "search";
	input.placeholder = "Search settings";
	searchInput.appendChild(input);
	const clearButton = document.createElement("div");
	clearButton.className = "search-input-clear-button";
	searchInput.appendChild(clearButton);
	search.appendChild(searchInput);
	header.appendChild(search);

	const groups = document.createElement("div");
	groups.className = "vertical-tab-header-group-container";

	const community = document.createElement("div");
	community.className = "vertical-tab-header-group";
	const communityTitle = document.createElement("div");
	communityTitle.className = "vertical-tab-header-group-title";
	communityTitle.setText("Community plugins");
	community.appendChild(communityTitle);

	const items = document.createElement("div");
	items.className = "vertical-tab-header-group-items";
	items.setAttr("data-section", "community-plugins");

	const item = document.createElement("div");
	item.className = "vertical-tab-nav-item tappable is-active";
	item.setAttr("data-setting-id", activeId);
	const icon = document.createElement("div");
	icon.className = "vertical-tab-nav-item-icon";
	setIcon(icon, "pen-line");
	item.appendChild(icon);
	const title = document.createElement("div");
	title.className = "vertical-tab-nav-item-title";
	title.setText("freeWrite");
	item.appendChild(title);
	const chevron = document.createElement("div");
	chevron.className = "vertical-tab-nav-item-chevron";
	setIcon(chevron, "chevron-right");
	item.appendChild(chevron);

	items.appendChild(item);
	community.appendChild(items);
	groups.appendChild(community);
	header.appendChild(groups);

	return header;
}

/** Builds the settings modal Obsidian opens for a plugin. */
function buildSettingsModal(): { container: HTMLElement; content: HTMLElement } {
	const container = document.createElement("div");
	container.className = "modal-container mod-dim";

	const bg = document.createElement("div");
	bg.className = "modal-bg";
	container.appendChild(bg);

	const modal = document.createElement("div");
	modal.className = "modal mod-settings mod-sidebar-layout";
	container.appendChild(modal);

	const closeButton = document.createElement("div");
	closeButton.className = "modal-header-button mod-raised clickable-icon";
	setIcon(closeButton, "x");
	modal.appendChild(closeButton);

	const modalHeader = document.createElement("div");
	modalHeader.className = "modal-header";
	const title = document.createElement("div");
	title.className = "modal-title";
	title.setText("freeWrite");
	modalHeader.appendChild(title);
	modal.appendChild(modalHeader);

	const modalContent = document.createElement("div");
	modalContent.className = "modal-content vertical-tabs-container";
	modalContent.appendChild(buildSettingsNav("freewrite"));

	const contentContainer = document.createElement("div");
	contentContainer.className = "vertical-tab-content-container";
	modalContent.appendChild(contentContainer);
	modal.appendChild(modalContent);

	document.body.appendChild(container);
	return { container, content: contentContainer };
}

/* -------------------------------------------------------------------------- */
/* Scenes                                                                     */
/* -------------------------------------------------------------------------- */

async function renderWorkbench(): Promise<void> {
	const plugin = createPlugin();
	const leaf = createLeaf(plugin.app);

	const view = new WorkbenchView(leaf, plugin as never);
	view.containerEl.setAttr("data-type", "freewrite-workbench");

	const titleEl = view.headerEl.querySelector(".view-header-title");
	titleEl?.setText("freeWrite");

	await view.loadSource(
		Object.assign(new TFile(), {
			path: `${SOURCE_TITLE}.md`,
			basename: SOURCE_TITLE,
			extension: "md",
			name: `${SOURCE_TITLE}.md`,
		}) as TFile,
	);

	// The drafts are produced by the pipeline; the screenshot shows them as they
	// look once the rewrite finished.
	const internals = view as unknown as {
		drafts: PlatformDraft[];
		progress: { platform: { name: string }; status: string }[];
	};
	internals.drafts = DRAFTS;
	internals.progress = DRAFTS.map((draft) => ({
		platform: { name: draft.platformId === "zhihu" ? "知乎" : "小红书" },
		status: "done",
	}));
	view.render();
}

function renderSettings(): void {
	const plugin = createPlugin();
	const { content } = buildSettingsModal();

	const tab = new FreeWriteSettingTab(plugin.app, plugin as never);
	content.appendChild(tab.containerEl);
	tab.display();
}

function renderInlineModal(): void {
	const plugin = createPlugin();

	const editor = {
		getSelection: () => "",
		replaceSelection: () => undefined,
	};

	const modal = new InlineEditModal(
		plugin.app,
		plugin as never,
		editor as never,
		"很多人以为写公众号最难的是文笔，其实不是。真正难的是把一个技术话题，翻译成普通读者愿意读完的文字。",
	);
	modal.setTitle("freeWrite");
	modal.open();
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
	installDomHelpers();

	const scene = new URLSearchParams(window.location.search).get("scene") ?? "workbench";
	document.body.classList.add("theme-dark", `scene-${scene}`);
	// Obsidian hides the view header unless the body carries this class.
	if (scene === "workbench") document.body.classList.add("show-view-header");

	if (scene === "settings") renderSettings();
	else if (scene === "inline-modal") renderInlineModal();
	else await renderWorkbench();

	document.body.setAttr("data-ready", "true");
}

void main();
