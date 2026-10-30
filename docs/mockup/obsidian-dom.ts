/**
 * Browser stand-in for the parts of Obsidian's API that freeWrite's UI uses.
 *
 * The README screenshots are rendered from the plugin's own `WorkbenchView`,
 * `FreeWriteSettingTab` and `InlineEditModal` classes, so the DOM helpers and
 * components below reproduce the implementation Obsidian 1.14.x ships rather
 * than an approximation of it. Every element structure was transcribed from the
 * installed application bundle.
 *
 * The DOM helpers themselves come from Obsidian's own `enhance.js`, which the
 * page loads before this module. `installDomHelpers` only fills in anything
 * that is missing so the components also work when the bundle is loaded on its
 * own.
 */

/** Options accepted by Obsidian's `createEl` family. */
export interface ElementInfo {
	cls?: string | string[];
	text?: string;
	attr?: Record<string, string | number | boolean | null>;
	title?: string;
	value?: string;
	type?: string;
	placeholder?: string;
	href?: string;
	parent?: Node;
	prepend?: boolean;
}

type CreateCallback = (el: HTMLElement) => void;

declare global {
	interface Node {
		empty(): void;
		createEl(tag: string, info?: string | ElementInfo, callback?: CreateCallback): HTMLElement;
		createDiv(info?: string | ElementInfo, callback?: CreateCallback): HTMLElement;
		createSpan(info?: string | ElementInfo, callback?: CreateCallback): HTMLElement;
		detach(): void;
	}
	interface Element {
		getText(): string;
		setText(value: string): void;
		addClass(...classes: string[]): void;
		removeClass(...classes: string[]): void;
		toggleClass(classes: string | string[], value: boolean): void;
		hasClass(cls: string): boolean;
		setAttr(name: string, value: string | number | boolean | null): void;
		setAttrs(attrs: Record<string, string | number | boolean | null>): void;
		getAttr(name: string): string | null;
		show(): void;
		hide(): void;
		toggle(visible: boolean): void;
		isShown(): boolean;
	}
}

/** Replaces the text content of an element. */
export function setText(el: Node, value: string): void {
	if (value instanceof DocumentFragment || value instanceof Node) {
		while (el.lastChild) el.removeChild(el.lastChild);
		el.appendChild(value);
		return;
	}
	if (el.nodeType === 1 || el.nodeType === 9 || el.nodeType === 11) {
		el.textContent = String(value);
	}
}

/** Creates an element, mirroring Obsidian's `createEl` options. */
export function createEl(
	tag: string,
	info?: string | ElementInfo,
	callback?: CreateCallback,
): HTMLElement {
	const el = document.createElement(tag);
	const options: ElementInfo = typeof info === "string" ? { cls: info } : { ...(info ?? {}) };

	if (options.cls) {
		el.className = Array.isArray(options.cls) ? options.cls.join(" ") : options.cls;
	}
	if (options.text) setText(el, options.text);
	if (options.attr) el.setAttrs(options.attr);
	if (options.title !== undefined) el.title = options.title;
	if (
		options.value !== undefined &&
		(el instanceof HTMLInputElement ||
			el instanceof HTMLSelectElement ||
			el instanceof HTMLOptionElement)
	) {
		el.value = options.value;
	}
	if (options.type && el instanceof HTMLInputElement) el.type = options.type;
	if (options.placeholder && el instanceof HTMLInputElement) {
		el.placeholder = options.placeholder;
	}
	if (
		options.href &&
		(el instanceof HTMLAnchorElement ||
			el instanceof HTMLLinkElement ||
			el instanceof HTMLBaseElement)
	) {
		el.href = options.href;
	}
	callback?.(el);
	if (options.parent) {
		if (options.prepend) options.parent.insertBefore(el, options.parent.firstChild);
		else options.parent.appendChild(el);
	}

	for (const key of Object.keys(options)) {
		if (!key.startsWith("on")) continue;
		const value = (options as unknown as Record<string, unknown>)[key];
		if (typeof value === "function") el.addEventListener(key.substring(2), value as EventListener);
	}

	return el;
}

/** Adds the DOM helpers Obsidian puts on the prototypes, when they are missing. */
export function installDomHelpers(): void {
	if ("setText" in Element.prototype && "createDiv" in Node.prototype) return;

	const elementProto = Element.prototype as unknown as Record<string, unknown>;
	const nodeProto = Node.prototype as unknown as Record<string, unknown>;

	elementProto.setText = function (this: Element, value: string): void {
		setText(this, value);
	};
	elementProto.getText = function (this: Element): string {
		return this.textContent ?? "";
	};
	elementProto.addClass = function (this: Element, ...classes: string[]): void {
		for (const cls of classes) if (cls) this.classList.add(cls);
	};
	elementProto.removeClass = function (this: Element, ...classes: string[]): void {
		for (const cls of classes) if (cls) this.classList.remove(cls);
	};
	elementProto.toggleClass = function (
		this: Element,
		classes: string | string[],
		value: boolean,
	): void {
		const list = Array.isArray(classes) ? classes : [classes];
		for (const cls of list) {
			if (!cls) continue;
			if (value) this.classList.add(cls);
			else this.classList.remove(cls);
		}
	};
	elementProto.hasClass = function (this: Element, cls: string): boolean {
		return this.classList.contains(cls);
	};
	elementProto.setAttr = function (
		this: Element,
		name: string,
		value: string | number | boolean | null,
	): void {
		if (value === null) this.removeAttribute(name);
		else this.setAttribute(name, String(value));
	};
	elementProto.setAttrs = function (
		this: Element,
		attrs: Record<string, string | number | boolean | null>,
	): void {
		for (const name of Object.keys(attrs)) {
			this.setAttr(name, attrs[name]);
		}
	};
	elementProto.getAttr = function (this: Element, name: string): string | null {
		return this.getAttribute(name);
	};
	elementProto.show = function (this: HTMLElement): void {
		if (this.style.display === "none") {
			this.style.display = this.getAttribute("data-display") ?? "";
			this.removeAttribute("data-display");
		}
	};
	elementProto.hide = function (this: HTMLElement): void {
		const display = this.style.display;
		if (display !== "none") {
			this.style.display = "none";
			if (display) this.setAttribute("data-display", display);
		}
	};
	elementProto.toggle = function (this: HTMLElement, visible: boolean): void {
		if (visible) this.show();
		else this.hide();
	};
	elementProto.isShown = function (this: HTMLElement): boolean {
		return !!this.offsetParent;
	};

	nodeProto.empty = function (this: Node): void {
		while (this.lastChild) this.removeChild(this.lastChild);
	};
	nodeProto.detach = function (this: Node): void {
		this.parentNode?.removeChild(this);
	};
	nodeProto.createEl = function (
		this: Node,
		tag: string,
		info?: string | ElementInfo,
		callback?: CreateCallback,
	): HTMLElement {
		return createEl(tag, { ...(typeof info === "string" ? { cls: info } : (info ?? {})), parent: this }, callback);
	};
	nodeProto.createDiv = function (
		this: Node,
		info?: string | ElementInfo,
		callback?: CreateCallback,
	): HTMLElement {
		return this.createEl("div", info, callback);
	};
	nodeProto.createSpan = function (
		this: Node,
		info?: string | ElementInfo,
		callback?: CreateCallback,
	): HTMLElement {
		return this.createEl("span", info, callback);
	};
}

/* -------------------------------------------------------------------------- */
/* Icons                                                                      */
/* -------------------------------------------------------------------------- */

const ICON_ATTRIBUTES = {
	xmlns: "http://www.w3.org/2000/svg",
	width: 24,
	height: 24,
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": 2,
	"stroke-linecap": "round",
	"stroke-linejoin": "round",
};

/** One SVG child, in the compact form Obsidian's icon table uses. */
type IconNode = number[];

function svgEl(tag: string, attributes: Record<string, string | number>): SVGElement {
	const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
	for (const name of Object.keys(attributes)) el.setAttribute(name, String(attributes[name]));
	return el;
}

function iconNode(spec: IconNode): SVGElement {
	switch (spec[0]) {
		case 0:
			return svgEl("line", { x1: spec[1], y1: spec[2], x2: spec[3], y2: spec[4] });
		case 1: {
			const attributes: Record<string, string | number> = { cx: spec[1], cy: spec[2], r: spec[3] };
			if (spec[4]) attributes.fill = "currentColor";
			return svgEl("circle", attributes);
		}
		case 2:
			return svgEl("polyline", { points: spec[1] });
		case 3:
			return svgEl("polygon", { points: spec[1] });
		case 4:
			return svgEl("ellipse", { cx: spec[1], cy: spec[2], rx: spec[3], ry: spec[4] });
		case 5: {
			const attributes: Record<string, string | number> = {
				x: spec[1],
				y: spec[2],
				width: spec[3],
				height: spec[4],
			};
			if (spec[5]) attributes.rx = spec[5];
			if (spec[6]) attributes.ry = spec[6];
			if (spec[7]) attributes.transform = spec[7];
			return svgEl("rect", attributes);
		}
		case 6: {
			const attributes: Record<string, string | number> = { d: spec[1] };
			if (spec[2]) attributes.fill = "currentColor";
			return svgEl("path", attributes);
		}
		default:
			return svgEl("path", { d: "" });
	}
}

/** The Lucide paths used by the plugin and by the mockup shells. */
const ICONS: Record<string, IconNode[]> = {
	"pen-line": [
		[6, "M13 21h8"],
		[
			6,
			"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
		],
	],
	settings: [
		[
			6,
			"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915",
		],
		[1, 12, 12, 3],
	],
	x: [
		[6, "M18 6 6 18"],
		[6, "m6 6 12 12"],
	],
	"chevron-right": [[6, "m9 18 6-6-6-6"]],
	search: [
		[6, "m21 21-4.34-4.34"],
		[1, 11, 11, 8],
	],
	"arrow-left": [
		[6, "m12 19-7-7 7-7"],
		[6, "M19 12H5"],
	],
	"arrow-right": [
		[6, "M5 12h14"],
		[6, "m12 5 7 7-7 7"],
	],
};

/** Renders a Lucide icon into a parent element, like Obsidian's `setIcon`. */
export function setIcon(parent: HTMLElement, iconId: string): void {
	const nodes = ICONS[iconId];
	if (!nodes) return;

	const first = parent.firstChild;
	if (first instanceof SVGElement && first.classList.contains(`lucide-${iconId}`)) return;
	if (first) parent.removeChild(first);

	const svg = svgEl("svg", ICON_ATTRIBUTES);
	svg.classList.add("svg-icon", `lucide-${iconId}`);
	for (const node of nodes) svg.appendChild(iconNode(node));
	parent.appendChild(svg);
}

/* -------------------------------------------------------------------------- */
/* Components                                                                 */
/* -------------------------------------------------------------------------- */

/** Base class of the components a `Setting` can hold. */
export abstract class BaseComponent {
	disabled = false;

	abstract getValue(): unknown;
	abstract setValue(value: never): this;

	setDisabled(disabled: boolean): this {
		this.disabled = disabled;
		return this;
	}

	then(callback: (component: this) => unknown): this {
		callback(this);
		return this;
	}
}

abstract class InputComponent<T extends HTMLInputElement | HTMLTextAreaElement> extends BaseComponent {
	inputEl: T;
	protected changeCallback?: (value: string) => unknown;

	constructor(inputEl: T) {
		super();
		this.inputEl = inputEl;
		this.inputEl.setAttribute("spellcheck", "false");
		this.inputEl.addEventListener("input", () => this.changeCallback?.(this.inputEl.value));
	}

	getValue(): string {
		return this.inputEl.value;
	}

	setValue(value: string): this {
		if (typeof value === "string") this.inputEl.value = value;
		return this;
	}

	setPlaceholder(placeholder: string): this {
		this.inputEl.setAttribute("placeholder", placeholder);
		return this;
	}

	onChange(callback: (value: string) => unknown): this {
		this.changeCallback = callback;
		return this;
	}

	override setDisabled(disabled: boolean): this {
		super.setDisabled(disabled);
		this.inputEl.disabled = disabled;
		return this;
	}
}

/** Text input inside a setting. */
export class TextComponent extends InputComponent<HTMLInputElement> {
	constructor(containerEl: HTMLElement) {
		super(containerEl.createEl("input", { type: "text" }));
	}
}

/** Multi-line text input inside a setting. */
export class TextAreaComponent extends InputComponent<HTMLTextAreaElement> {
	constructor(containerEl: HTMLElement) {
		super(containerEl.createEl("textarea"));
	}
}

/** Switch inside a setting. */
export class ToggleComponent extends BaseComponent {
	toggleEl: HTMLLabelElement;
	private on = false;
	private changeCallback?: (value: boolean) => unknown;

	constructor(containerEl: HTMLElement) {
		super();
		this.toggleEl = containerEl.createEl("label", {
			cls: "checkbox-container",
			attr: { tabIndex: 0 },
		});
		const input = this.toggleEl.createEl("input", { attr: { type: "checkbox", tabIndex: -1 } });
		input.addEventListener("change", () => this.onClick());
		this.toggleEl.addEventListener("keydown", (event) => {
			if (event.key !== " " && event.key !== "Enter") return;
			event.preventDefault();
			this.onClick();
		});
	}

	private onClick(): void {
		if (this.disabled) return;
		this.setValue(!this.getValue());
	}

	getValue(): boolean {
		return this.on;
	}

	setValue(value: boolean): this {
		if (this.on === value) return this;
		this.on = value;
		this.toggleEl.toggleClass("is-enabled", value);
		this.changeCallback?.(value);
		return this;
	}

	onChange(callback: (value: boolean) => unknown): this {
		this.changeCallback = callback;
		return this;
	}

	override setDisabled(disabled: boolean): this {
		super.setDisabled(disabled);
		this.toggleEl.toggleClass("is-disabled", disabled);
		return this;
	}
}

/** Dropdown inside a setting. */
export class DropdownComponent extends BaseComponent {
	selectEl: HTMLSelectElement;
	measureEl: HTMLSelectElement;
	measureOptionEl: HTMLOptionElement;
	private changeCallback?: (value: string) => unknown;

	constructor(containerEl: HTMLElement) {
		super();
		this.selectEl = containerEl.createEl("select", "dropdown");
		this.measureEl = containerEl.createEl("select", "dropdown is-measuring");
		this.measureEl.setAttribute("aria-hidden", "true");
		this.measureEl.tabIndex = -1;
		this.measureOptionEl = this.measureEl.createEl("option");
		this.selectEl.addEventListener("change", () => {
			this.resizeToFit();
			this.changeCallback?.(this.getValue());
		});
	}

	/** Mirrors Obsidian measuring the width of the selected option. */
	resizeToFit(): void {
		const selected = this.selectEl.options[this.selectEl.selectedIndex];
		if (!selected) return;
		this.measureOptionEl.text = selected.text;
		this.selectEl.style.setProperty("--dropdown-fitted-width", `${this.measureEl.offsetWidth}px`);
	}

	getValue(): string {
		return this.selectEl.value;
	}

	setValue(value: string): this {
		this.selectEl.value = value;
		this.resizeToFit();
		return this;
	}

	addOption(value: string, display: string): this {
		this.selectEl.createEl("option", { value, text: display });
		return this;
	}

	addOptions(options: Record<string, string>): this {
		for (const value of Object.keys(options)) this.addOption(value, options[value]);
		return this;
	}

	onChange(callback: (value: string) => unknown): this {
		this.changeCallback = callback;
		return this;
	}

	override setDisabled(disabled: boolean): this {
		super.setDisabled(disabled);
		this.selectEl.disabled = disabled;
		return this;
	}
}

/** Button inside a setting. */
export class ButtonComponent extends BaseComponent {
	buttonEl: HTMLButtonElement;
	private clickCallback?: (event: MouseEvent) => unknown;

	constructor(containerEl: HTMLElement) {
		super();
		this.buttonEl = containerEl.createEl("button");
		this.buttonEl.addEventListener("click", (event) => {
			if (this.disabled) return;
			this.clickCallback?.(event);
		});
	}

	getValue(): void {
		return undefined;
	}

	setValue(): this {
		return this;
	}

	setButtonText(text: string): this {
		this.buttonEl.setText(text);
		return this;
	}

	setCta(): this {
		this.buttonEl.addClass("mod-cta");
		return this;
	}

	removeCta(): this {
		this.buttonEl.removeClass("mod-cta");
		return this;
	}

	setDestructive(): this {
		this.buttonEl.addClass("mod-destructive");
		return this;
	}

	setWarning(): this {
		return this.setDestructive().setCta();
	}

	setIcon(iconId: string): this {
		setIcon(this.buttonEl, iconId);
		return this;
	}

	setClass(...classes: string[]): this {
		this.buttonEl.addClass(...classes);
		return this;
	}

	onClick(callback: (event: MouseEvent) => unknown): this {
		this.clickCallback = callback;
		return this;
	}

	override setDisabled(disabled: boolean): this {
		super.setDisabled(disabled);
		this.buttonEl.disabled = disabled;
		return this;
	}
}

/** A single row in a settings tab. */
export class Setting {
	settingEl: HTMLElement;
	infoEl: HTMLElement;
	nameEl: HTMLElement;
	descEl: HTMLElement;
	controlEl: HTMLElement;
	components: BaseComponent[] = [];
	errorEl: HTMLElement | null = null;
	private disabled = false;

	constructor(containerEl: HTMLElement) {
		this.settingEl = containerEl.createDiv({ cls: "setting-item", attr: { tabIndex: -1 } });
		this.infoEl = this.settingEl.createDiv("setting-item-info");
		this.nameEl = this.infoEl.createDiv("setting-item-name");
		this.descEl = this.infoEl.createDiv("setting-item-description");
		this.controlEl = this.settingEl.createDiv("setting-item-control");
	}

	setName(name: string): this {
		this.nameEl.setText(name);
		return this;
	}

	setDesc(desc: string | DocumentFragment): this {
		this.descEl.setText(desc);
		return this;
	}

	setClass(classes: string): this {
		this.settingEl.addClass(...classes.split(" ").filter(Boolean));
		return this;
	}

	setHeading(): this {
		this.settingEl.addClass("setting-item-heading");
		return this;
	}

	setDisabled(disabled: boolean): this {
		this.disabled = disabled;
		this.settingEl.toggleClass("is-disabled", disabled);
		for (const component of this.components) component.setDisabled(disabled);
		return this;
	}

	then(callback: (setting: this) => unknown): this {
		callback(this);
		return this;
	}

	addText(callback: (component: TextComponent) => unknown): this {
		return this.addComponent(new TextComponent(this.controlEl), callback);
	}

	addTextArea(callback: (component: TextAreaComponent) => unknown): this {
		return this.addComponent(new TextAreaComponent(this.controlEl), callback);
	}

	addToggle(callback: (component: ToggleComponent) => unknown): this {
		this.addComponent(new ToggleComponent(this.controlEl), callback);
		this.settingEl.addClass("mod-toggle");
		return this;
	}

	addDropdown(callback: (component: DropdownComponent) => unknown): this {
		return this.addComponent(new DropdownComponent(this.controlEl), callback);
	}

	addButton(callback: (component: ButtonComponent) => unknown): this {
		return this.addComponent(new ButtonComponent(this.controlEl), callback);
	}

	private addComponent<T extends BaseComponent>(component: T, callback: (component: T) => unknown): this {
		this.components.push(component);
		callback(component);
		if (this.disabled) component.setDisabled(true);
		return this;
	}
}

/* -------------------------------------------------------------------------- */
/* Views, tabs and modals                                                     */
/* -------------------------------------------------------------------------- */

/** The parts of `App` the freeWrite UI touches. */
export interface App {
	workspace: {
		getLeavesOfType(type: string): WorkspaceLeaf[];
		revealLeaf(leaf: WorkspaceLeaf): Promise<void>;
		getActiveFile(): TFile | null;
		getRightLeaf(split: boolean): WorkspaceLeaf | null;
	};
	vault: {
		cachedRead(file: TFile): Promise<string>;
		getName(): string;
		adapter: unknown;
	};
	setting: {
		open(): void;
		openTabById(id: string): void;
	};
}

/** A workspace leaf that hosts a view. */
export interface WorkspaceLeaf {
	containerEl: HTMLElement;
	app: App;
	view: unknown;
}

/** The parts of `Editor` the inline rewrite modal touches. */
export interface Editor {
	getSelection(): string;
	replaceSelection(replacement: string): void;
}

/** A view hosted in a workspace leaf. */
export class ItemView {
	app: App;
	leaf: WorkspaceLeaf;
	containerEl: HTMLElement;
	headerEl: HTMLElement;
	contentEl: HTMLElement;
	icon = "lucide-file";

	constructor(leaf: WorkspaceLeaf) {
		this.leaf = leaf;
		this.app = leaf.app;

		this.containerEl = leaf.containerEl.createDiv("workspace-leaf-content");
		this.containerEl.setAttribute("data-type", this.getViewType());

		this.headerEl = this.containerEl.createDiv("view-header");
		this.headerEl.createDiv("view-header-left");

		const navButtons = this.headerEl.createDiv("view-header-nav-buttons");
		const backButton = navButtons.createEl("button", "clickable-icon mod-back");
		setIcon(backButton, "arrow-left");
		const forwardButton = navButtons.createEl("button", "clickable-icon mod-forward");
		setIcon(forwardButton, "arrow-right");

		const titleContainer = this.headerEl.createDiv("view-header-title-container mod-at-start");
		titleContainer.createDiv("view-header-title-parent");
		titleContainer.createDiv("view-header-title");

		this.headerEl.createDiv("view-actions mod-raised");
		this.contentEl = this.containerEl.createDiv("view-content");
	}

	getViewType(): string {
		return "";
	}

	getDisplayText(): string {
		return "";
	}

	getIcon(): string {
		return this.icon;
	}

	onOpen(): void {}

	onClose(): void {}
}

/** Base class of the settings tabs. */
export class PluginSettingTab {
	app: App;
	plugin: unknown;
	containerEl: HTMLElement;
	navEl: HTMLElement | null = null;

	constructor(app: App, plugin: unknown) {
		this.app = app;
		this.plugin = plugin;
		this.containerEl = createEl("div", { cls: "vertical-tab-content" });
	}

	display(): void {}

	hide(): void {}
}

/** A modal dialog. */
export class Modal {
	app: App;
	containerEl: HTMLElement;
	modalEl: HTMLElement;
	bgEl: HTMLElement;
	headerEl: HTMLElement;
	headerButton: HTMLElement;
	titleEl: HTMLElement;
	contentEl: HTMLElement;
	isOpen = false;

	constructor(app: App) {
		this.app = app;

		this.containerEl = createEl("div", { cls: "modal-container" });
		this.bgEl = this.containerEl.createDiv("modal-bg");
		this.modalEl = this.containerEl.createDiv("modal");

		this.headerButton = this.modalEl.createDiv("modal-header-button mod-raised clickable-icon");
		setIcon(this.headerButton, "x");
		this.headerButton.addEventListener("click", () => this.close());

		this.headerEl = this.modalEl.createDiv("modal-header");
		this.titleEl = this.headerEl.createDiv("modal-title");
		this.contentEl = this.modalEl.createDiv("modal-content");
	}

	open(): void {
		if (this.isOpen) return;
		this.isOpen = true;
		document.body.appendChild(this.containerEl);
		this.onOpen();
	}

	close(): void {
		if (!this.isOpen) return;
		this.isOpen = false;
		this.onClose();
		this.containerEl.detach();
	}

	setTitle(title: string): this {
		this.titleEl.setText(title);
		return this;
	}

	onOpen(): void {}

	onClose(): void {}
}

/** A short lived message. The mockup never shows one. */
export class Notice {
	noticeEl: HTMLElement | null = null;

	constructor(_message: string | DocumentFragment, _duration?: number) {}

	hide(): void {}
}

/** A file in the vault. */
export class TFile {
	path = "";
	basename = "";
	extension = "";
	name = "";
	vault: unknown = null;
	parent: TFolder | null = null;
	stat = { ctime: 0, mtime: 0, size: 0 };
}

/** A folder in the vault. */
export class TFolder {
	path = "";
	name = "";
	vault: unknown = null;
	parent: TFolder | null = null;
	children: Array<TFile | TFolder> = [];
}

/** Normalises a vault path. */
export function normalizePath(path: string): string {
	return path
		.replace(/[\\/]+/g, "/")
		.replace(/(^\/+|\/+$)/g, "")
		.normalize("NFC");
}

/** The adapter of a vault stored on disk. */
export class FileSystemAdapter {
	getBasePath(): string {
		return "";
	}
}

/** Base class of every plugin. */
export class Plugin {
	app: App;
	manifest: { id: string; name: string };

	constructor(app: App, manifest: { id: string; name: string }) {
		this.app = app;
		this.manifest = manifest;
	}
}
