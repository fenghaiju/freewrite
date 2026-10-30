import type { RuntimeEvent } from "../types";

/**
 * Minimal HTTP client for the OpenCode server API.
 *
 * Only the endpoints freeWrite actually needs are implemented. All calls are
 * made against the loopback interface of the locally spawned server.
 */

export interface OpenCodeClientOptions {
	baseUrl: string;
	/** Injectable for tests. */
	fetchImpl?: typeof fetch;
}

export interface OpenCodeProviderInfo {
	id: string;
	name: string;
	/** Model ids exposed by the provider. */
	models: string[];
	/** True when OpenCode reports credentials for this provider. */
	connected: boolean;
}

export interface OpenCodeMessageResult {
	text: string;
	/** Cost reported by the server, when available. */
	cost?: number;
}

export class OpenCodeError extends Error {
	constructor(
		message: string,
		readonly status?: number,
	) {
		super(message);
		this.name = "OpenCodeError";
	}
}

interface RawPart {
	id?: string;
	sessionID?: string;
	messageID?: string;
	type?: string;
	text?: string;
	tool?: string;
	state?: { status?: string; input?: unknown; output?: string };
}

interface RawEvent {
	type?: string;
	properties?: Record<string, unknown>;
	payload?: unknown;
}

interface SessionMessage {
	info?: {
		id?: string;
		role?: string;
		time?: { created?: number; completed?: number };
		cost?: number;
	};
	parts?: Array<{ type?: string; text?: string }>;
}

/**
 * The messages of the turn the client is waiting for.
 *
 * The server broadcasts the events of every session on the same server, and a
 * stream that is opened for a session that already ran a turn replays the
 * events of that turn. The state keeps the two apart.
 */
interface TurnState {
	/** Messages of the user. Their parts are the echoed prompt. */
	userMessages: Set<string>;
	/** Messages of an earlier turn. Their parts belong to a previous answer. */
	staleMessages: Set<string>;
}

/** The answer of a turn, as the server recorded it. */
interface TurnResult {
	/** Text of the answer. */
	text: string;
	/** True when the answer belongs to the current turn. */
	current: boolean;
	/** Cost reported by the server. */
	cost?: number;
}

/** How often the recorded messages are read while waiting for the answer. */
const RESULT_ATTEMPTS = 8;
/** Delay between two reads of the recorded messages. */
const RESULT_DELAY_MS = 250;

export class OpenCodeClient {
	private readonly baseUrl: string;
	private readonly fetchImpl: typeof fetch;

	constructor(options: OpenCodeClientOptions) {
		this.baseUrl = options.baseUrl.replace(/\/$/, "");
		this.fetchImpl = options.fetchImpl ?? fetch;
	}

	/** Performs a JSON request against the server. */
	private async request<T>(method: string, endpoint: string, body?: unknown): Promise<T> {
		const response = await this.fetchImpl(`${this.baseUrl}${endpoint}`, {
			method,
			headers: body === undefined ? {} : { "content-type": "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body),
		});
		if (!response.ok) {
			const text = await response.text().catch(() => "");
			throw new OpenCodeError(
				`OpenCode request failed (${response.status}) ${method} ${endpoint}${text ? `: ${text.slice(0, 400)}` : ""}`,
				response.status,
			);
		}
		if (response.status === 204) return undefined as T;
		const text = await response.text();
		if (!text) return undefined as T;
		try {
			return JSON.parse(text) as T;
		} catch {
			return text as unknown as T;
		}
	}

	/** Checks that the server is reachable. */
	async health(): Promise<{ healthy: boolean; version: string }> {
		return this.request("GET", "/global/health");
	}

	/** Creates a new session and returns its id. */
	async createSession(title?: string): Promise<string> {
		const session = await this.request<{ id: string }>("POST", "/session", title ? { title } : {});
		return session.id;
	}

	/** Lists the providers OpenCode knows about, with their model ids. */
	async listProviders(): Promise<OpenCodeProviderInfo[]> {
		const response = await this.request<{
			all?: Array<{ id: string; name: string; models?: Record<string, unknown> }>;
			connected?: string[];
		}>("GET", "/provider");
		const connected = new Set(response.connected ?? []);
		return (response.all ?? []).map((provider) => ({
			id: provider.id,
			name: provider.name,
			models: Object.keys(provider.models ?? {}),
			connected: connected.has(provider.id),
		}));
	}

	/** Stores credentials for a provider inside OpenCode's own auth store. */
	async setAuth(providerId: string, apiKey: string): Promise<void> {
		await this.request("PUT", `/auth/${encodeURIComponent(providerId)}`, { type: "api", key: apiKey });
	}

	/**
	 * Sends a prompt and streams the assistant's output.
	 *
	 * The event stream is opened before the prompt is sent. The server only
	 * broadcasts the events that happen while a subscriber is connected, so a
	 * stream that is opened afterwards misses the whole answer.
	 *
	 * @param sessionId - Session to send the prompt to.
	 * @param prompt - Prompt text.
	 * @param options - Model, agent and system prompt overrides.
	 */
	async *prompt(
		sessionId: string,
		prompt: string,
		options: { model?: string; agent?: string; system?: string } = {},
	): AsyncGenerator<RuntimeEvent, OpenCodeMessageResult, void> {
		const body: Record<string, unknown> = {
			parts: [{ type: "text", text: prompt }],
		};
		if (options.model) body.model = parseModel(options.model);
		if (options.agent) body.agent = options.agent;
		if (options.system) body.system = options.system;

		const turn = { since: Date.now() };
		const connection = await this.connectEventStream();

		try {
			// The async endpoint returns immediately; the event stream carries the output.
			await this.request("POST", `/session/${sessionId}/prompt_async`, body);

			let text = "";

			for await (const event of this.readEvents(connection, sessionId, turn)) {
				if (event.type === "text") {
					text += event.text;
					yield event;
				} else if (event.type === "done") {
					const result = await this.readTurnResult(sessionId, turn, text);
					// The idle may belong to an earlier turn of a reused session.
					if (!result.current) continue;
					return { text: result.text, cost: result.cost };
				} else if (event.type === "error") {
					throw new OpenCodeError(event.message);
				} else {
					yield event;
				}
			}

			const result = await this.readTurnResult(sessionId, turn, text);
			return { text: result.text, cost: result.cost };
		} finally {
			connection.controller.abort();
			connection.reader.cancel().catch(() => undefined);
		}
	}

	/** An open connection to the server event stream. */
	private async connectEventStream(): Promise<{
		reader: ReadableStreamDefaultReader<Uint8Array>;
		controller: AbortController;
	}> {
		const controller = new AbortController();
		const response = await this.fetchImpl(`${this.baseUrl}/event`, {
			headers: { accept: "text/event-stream" },
			signal: controller.signal,
		});
		if (!response.ok || !response.body) {
			controller.abort();
			throw new OpenCodeError(`Unable to open the OpenCode event stream (${response.status})`, response.status);
		}
		return { reader: response.body.getReader(), controller };
	}

	/**
	 * Reads the event stream and yields the normalised events of the turn.
	 *
	 * @param connection - The open stream.
	 * @param sessionId - Only events for this session are forwarded.
	 * @param turn - The turn the events have to belong to.
	 */
	private async *readEvents(
		connection: { reader: ReadableStreamDefaultReader<Uint8Array> },
		sessionId: string,
		turn: { since: number },
	): AsyncGenerator<RuntimeEvent, void, void> {
		const { reader } = connection;
		const decoder = new TextDecoder();
		let buffer = "";
		// Text parts arrive cumulatively; track how much of each part was shown.
		const emitted = new Map<string, number>();
		const turnState: TurnState = {
			userMessages: new Set(),
			staleMessages: new Set(),
		};

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });

			let newlineIndex = buffer.indexOf("\n");
			while (newlineIndex !== -1) {
				const line = buffer.slice(0, newlineIndex).trim();
				buffer = buffer.slice(newlineIndex + 1);
				newlineIndex = buffer.indexOf("\n");

				if (!line.startsWith("data:")) continue;
				const payload = line.slice(5).trim();
				if (!payload) continue;

				let parsed: unknown;
				try {
					parsed = JSON.parse(payload);
				} catch {
					continue;
				}

				const normalised = this.normaliseEvent(parsed, sessionId, emitted, turnState, turn);
				if (normalised) yield normalised;
			}
		}
	}

	/**
	 * Converts a raw server event into a runtime event.
	 *
	 * Text parts are cumulative on the wire, so only the part that has not been
	 * emitted yet is forwarded.
	 *
	 * @param emitted - Tracks how many characters of each part were already sent.
	 * @param turnState - The messages known so far.
	 * @param turn - The turn the events have to belong to.
	 * @returns The event, or null when the event is not relevant for display.
	 */
	private normaliseEvent(
		raw: unknown,
		sessionId: string,
		emitted: Map<string, number>,
		turnState: TurnState,
		turn: { since: number },
	): RuntimeEvent | null {
		if (typeof raw !== "object" || raw === null) return null;
		const envelope = raw as RawEvent;

		// The global stream wraps events in { directory, payload }.
		const event = (envelope.payload ?? raw) as RawEvent;
		const type = event.type;
		if (!type) return null;

		const properties = event.properties ?? {};

		switch (type) {
			case "message.updated": {
				// The role arrives before the parts of the message, so the messages
				// of the turn are known by the time their parts show up.
				const info = properties.info as
					| { id?: string; role?: string; time?: { created?: number; completed?: number } }
					| undefined;
				if (!info?.id) return null;

				// A stream that is opened for a session that already ran a turn
				// replays the events of that turn. Only the messages that were
				// created after the turn started belong to this turn.
				if ((info.time?.created ?? 0) < turn.since) {
					turnState.staleMessages.add(info.id);
					return null;
				}
				if (info.role === "user") {
					turnState.userMessages.add(info.id);
				}
				return null;
			}
			case "message.part.updated": {
				const part = properties.part as RawPart | undefined;
				if (!part) return null;
				if (part.sessionID && part.sessionID !== sessionId) return null;

				const key = part.id ?? "";

				// The server echoes the prompt back as a part of the user
				// message, and a reused session replays the parts of the earlier
				// answers. Neither belongs to this turn.
				if (
					part.messageID &&
					(turnState.userMessages.has(part.messageID) || turnState.staleMessages.has(part.messageID))
				) {
					return null;
				}

				if (part.type === "text" && typeof part.text === "string" && part.text.length > 0) {
					const sent = emitted.get(key) ?? 0;
					if (part.text.length <= sent) return null;
					const delta = part.text.slice(sent);
					emitted.set(key, part.text.length);
					return { type: "text", text: delta };
				}
				if (part.type === "reasoning" && typeof part.text === "string" && part.text.length > 0) {
					const sent = emitted.get(key) ?? 0;
					if (part.text.length <= sent) return null;
					const delta = part.text.slice(sent);
					emitted.set(key, part.text.length);
					return { type: "reasoning", text: delta };
				}
				if (part.type === "tool") {
					const toolState = part.state ?? {};
					return {
						type: "tool",
						name: part.tool ?? "tool",
						status: toolState.status ?? "unknown",
						input: toolState.input ? JSON.stringify(toolState.input) : undefined,
						output: toolState.output,
					};
				}
				return null;
			}
			case "session.error": {
				const error = properties.error as { data?: { message?: string } } | undefined;
				return { type: "error", message: error?.data?.message ?? "The OpenCode session reported an error" };
			}
			case "session.idle": {
				const eventSession = properties.sessionID as string | undefined;
				if (eventSession && eventSession !== sessionId) return null;
				return { type: "done", text: "" };
			}
			default:
				return null;
		}
	}

	/**
	 * Reads the answer of the turn from the server.
	 *
	 * The server records the messages of a session, so the recorded answer is
	 * used instead of the streamed text. That keeps the result correct when a
	 * part was missed on the stream.
	 *
	 * @param sessionId - The session the turn ran in.
	 * @param turn - The turn the answer has to belong to.
	 * @param streamed - The text that was received on the stream.
	 * @returns The answer and whether it belongs to the current turn.
	 */
	private async readTurnResult(sessionId: string, turn: { since: number }, streamed: string): Promise<TurnResult> {
		for (let attempt = 0; attempt < RESULT_ATTEMPTS; attempt += 1) {
			let messages: SessionMessage[] = [];
			try {
				const response = await this.request<SessionMessage[]>("GET", `/session/${sessionId}/message`);
				messages = Array.isArray(response) ? response : [];
			} catch {
				return { text: streamed, current: true };
			}

			const assistants = messages.filter((message) => message.info?.role === "assistant");
			// A finished answer carries the time it was completed at.
			const finished = assistants.filter((message) => message.info?.time?.completed);
			const current = finished.filter((message) => (message.info?.time?.created ?? 0) >= turn.since);

			if (current.length > 0) {
				const chosen = current[current.length - 1];
				const text = (chosen.parts ?? [])
					.filter((part) => part.type === "text" && typeof part.text === "string")
					.map((part) => part.text)
					.join("");
				return { text: text.trim() ? text : streamed, current: true, cost: chosen.info?.cost };
			}

			// A session that never produced an answer at all is over.
			if (assistants.length === 0) {
				return { text: streamed, current: true };
			}

			await new Promise((resolve) => setTimeout(resolve, RESULT_DELAY_MS));
		}

		// The idle belonged to an earlier turn, the answer of this turn is still
		// on its way.
		return { text: streamed, current: false };
	}

	/** Aborts the running turn in a session. */
	async abort(sessionId: string): Promise<void> {
		await this.request("POST", `/session/${sessionId}/abort`);
	}

	/** Deletes a session. */
	async deleteSession(sessionId: string): Promise<void> {
		await this.request("DELETE", `/session/${sessionId}`);
	}
}

/**
 * Splits a `provider/model` id into the object the server expects.
 *
 * The server takes the provider and the model as separate fields, while the
 * settings keep them together as `provider/model`. Only the first slash
 * separates the two, because a model id can contain slashes itself, as in
 * `openrouter/anthropic/claude-sonnet-4`.
 *
 * @param model - Model id in `provider/model` form.
 * @returns The provider and the model id.
 */
export function parseModel(model: string): { providerID: string; modelID: string } {
	const trimmed = model.trim();
	const slash = trimmed.indexOf("/");

	if (slash === -1) {
		throw new OpenCodeError(`The model must be in provider/model form, got "${trimmed}".`);
	}

	return {
		providerID: trimmed.slice(0, slash),
		modelID: trimmed.slice(slash + 1),
	};
}
