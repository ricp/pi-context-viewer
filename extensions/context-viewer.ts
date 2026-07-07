import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ponytail: ring buffer over the last N provider payloads; /context opens the latest
// in $PAGER or dumps the last one / one-by-index into the chat. Skipped: persistent
// log file (state lives in memory; /reload resets it), TUI viewer (pager does it
// better for big payloads), per-message diff (one payload = one LLM call, eyeball
// two /contexts side by side). Add a persistent log + TUI viewer if you hit the cap
// or want to step through turns in-app.
const MAX = 50;
const payloads: { ts: number; payload: unknown }[] = [];
let total = 0;
let turns = 0;
let providerHits = 0;

export default function (pi: ExtensionAPI) {
	pi.on("session_start", () => {
		// Beacon: if you don't see this on startup, the extension didn't load.
		console.log("[context-viewer] loaded; awaiting provider payloads");
	});

	pi.on("turn_start", () => {
		turns++;
	});

	pi.on("before_provider_request", (event) => {
		providerHits++;
		payloads.push({ ts: Date.now(), payload: event.payload });
		if (payloads.length > MAX) payloads.shift();
		total++;
	});

	pi.registerCommand("context", {
		description: "Show the last provider payload (LLM context). Args: latest | <n> | count | clear | breakdown",
		handler: async (args, ctx) => {
			const arg = args.trim();
			if (arg === "count" || arg === "") {
				ctx.ui.notify(
					`turns: ${turns} · provider hits: ${providerHits} · buffered: ${payloads.length}/${MAX} · total: ${total}`,
					"info",
				);
				return;
			}
			if (arg === "clear") {
				payloads.length = 0;
				total = 0;
				ctx.ui.notify("context buffer cleared", "info");
				return;
			}
			if (arg === "breakdown" || arg.startsWith("breakdown ")) {
				const idx = arg === "breakdown"
					? payloads.length - 1
					: Number(arg.slice("breakdown ".length).trim()) - 1;
				if (!Number.isInteger(idx) || idx < 0 || idx >= payloads.length) {
					ctx.ui.notify(`out of range: have ${payloads.length} payloads`, "error");
					return;
				}
				const p = payloads[idx].payload as Record<string, unknown> | undefined;
				const messages = Array.isArray(p?.messages) ? (p!.messages as unknown[]) : [];
				const lines: string[] = [];
				let total = 0;
				for (let i = 0; i < messages.length; i++) {
					const m = messages[i] as Record<string, unknown>;
					const content = m?.content;
					const size = JSON.stringify(m).length;
					total += size;
					const role = String(m?.role ?? "?");
					let extra = "";
					if (Array.isArray(content)) {
						const kinds = (content as unknown[])
							.map((c) => (c as Record<string, unknown>)?.type ?? "?")
							.join("+");
						if (kinds) extra = ` [${kinds}]`;
					} else if (typeof content === "string") {
						extra = ` [text ${(content as string).length}ch]`;
					}
					lines.push(`#${i} ${role.padEnd(9)} ${String(size).padStart(7)} chars${extra}`);
				}
				const sysKey = Array.isArray(p?.system)
					? "system"
					: typeof p?.system === "string"
						? "system"
						: "instructions";
				const sys = p?.[sysKey];
				const sysSize = sys == null ? 0 : JSON.stringify(sys).length;
				lines.push(`--- system (${sysKey}): ${sysSize} chars`);
				lines.push(`=== total: ${total + sysSize} chars (${messages.length} messages + system)`);
				ctx.ui.notify(lines.join("\n"), "info");
				return;
			}
			const idx = arg === "latest" ? payloads.length - 1 : Number(arg) - 1;
			if (!Number.isInteger(idx) || idx < 0 || idx >= payloads.length) {
				ctx.ui.notify(
					`out of range: have ${payloads.length} payloads (1..${payloads.length}, or 'latest')`,
					"error",
				);
				return;
			}
			const text = JSON.stringify(payloads[idx].payload, null, 2);
			const pager = process.env.PAGER;
			if (pager) {
				const { spawnSync } = await import("node:child_process");
				const r = spawnSync(pager, [], {
					input: text,
					stdio: ["pipe", "inherit", "inherit"],
				});
				if (r.status !== 0) ctx.ui.notify(`${pager} exited ${r.status ?? r.signal}`, "error");
			} else {
				ctx.ui.notify(
					text.length > 4000 ? text.slice(0, 4000) + "\n…(truncated; set $PAGER for full)" : text,
					"info",
				);
			}
		},
	});
}
