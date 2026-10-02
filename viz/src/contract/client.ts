import {
  frameSchema, manifestSchema, parseCatalog, resultSchema, traceLineSchema,
  type BundleData, type Catalog, type CatalogEntry,
} from "../../../src/viz/contract.ts";

export type LoadError =
  | { kind: "unsupported-format"; format: unknown }
  | { kind: "invalid"; message: string }
  | { kind: "network"; message: string }
  | { kind: "http"; status: number; url: string };

export type Loaded<T> = { ok: true; value: T } | { ok: false; error: LoadError };

/** The part of `fetch` the client uses. Every address it passes is relative, so one build runs against any supplier. */
export type FetchText = (url: string) => Promise<Response>;

const fail = <T>(error: LoadError): Loaded<T> => ({ ok: false, error });

async function text(fetchFn: FetchText, url: string, missingIsEmpty = false): Promise<Loaded<string>> {
  let res: Response;
  try {
    res = await fetchFn(url);
  } catch (e) {
    return fail({ kind: "network", message: e instanceof Error ? e.message : "the request failed" });
  }
  if (res.status === 404 && missingIsEmpty) return { ok: true, value: "" };
  if (!res.ok) return fail({ kind: "http", status: res.status, url });
  return { ok: true, value: await res.text() };
}

function json(source: string): Loaded<unknown> {
  try {
    return { ok: true, value: JSON.parse(source) as unknown };
  } catch {
    return fail({ kind: "invalid", message: "not valid JSON" });
  }
}

const issues = (e: { issues: { path: PropertyKey[]; message: string }[] }): string => e.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");

/** Reads the catalog and a run's bundle over the contract. Never throws: every failure comes back typed. */
export function createClient(fetchFn: FetchText = (url) => fetch(url)) {
  return {
    async catalog(): Promise<Loaded<Catalog>> {
      const t = await text(fetchFn, "catalog.json");
      if (!t.ok) return t;
      const j = json(t.value);
      if (!j.ok) return j;
      const parsed = parseCatalog(j.value);
      if (parsed.ok) return { ok: true, value: parsed.catalog };
      return parsed.error === "unsupported-format" ? fail({ kind: "unsupported-format", format: parsed.format }) : fail({ kind: "invalid", message: parsed.message });
    },

    async bundle(entry: CatalogEntry): Promise<Loaded<BundleData>> {
      if (entry.status !== "ready" || entry.bundle === undefined) return fail({ kind: "invalid", message: "this run has no bundle to open" });
      const base = entry.bundle;
      const [manifest, frames, trace, score] = await Promise.all([
        text(fetchFn, `${base}bundle.json`),
        text(fetchFn, `${base}frames.jsonl`),
        text(fetchFn, `${base}trace.jsonl`, true),
        text(fetchFn, `${base}score.json`),
      ]);
      for (const part of [manifest, frames, trace, score]) if (!part.ok) return part;

      const m = json((manifest as { value: string }).value);
      if (!m.ok) return m;
      if (typeof m.value === "object" && m.value !== null && "format" in m.value && (m.value as { format: unknown }).format !== 1) {
        return fail({ kind: "unsupported-format", format: (m.value as { format: unknown }).format });
      }
      const mp = manifestSchema.safeParse(m.value);
      if (!mp.success) return fail({ kind: "invalid", message: `bundle.json: ${issues(mp.error)}` });

      const lines = (source: string) => source.split("\n").filter((l) => l !== "");
      const frameList = [];
      for (const [i, line] of lines((frames as { value: string }).value).entries()) {
        const j = json(line);
        if (!j.ok) return fail({ kind: "invalid", message: `frames.jsonl line ${i + 1}: not valid JSON` });
        const p = frameSchema.safeParse(j.value);
        if (!p.success) return fail({ kind: "invalid", message: `frames.jsonl line ${i + 1}: ${issues(p.error)}` });
        if (p.data.seq !== i) return fail({ kind: "invalid", message: `frames.jsonl: expected seq ${i} on line ${i + 1}` });
        frameList.push(p.data);
      }
      if (frameList.length === 0) return fail({ kind: "invalid", message: "frames.jsonl has no frames" });

      const traceList = [];
      for (const [i, line] of lines((trace as { value: string }).value).entries()) {
        const j = json(line);
        const p = j.ok ? traceLineSchema.safeParse(j.value) : undefined;
        if (!p?.success) return fail({ kind: "invalid", message: `trace.jsonl line ${i + 1}: not a trace line` });
        traceList.push(p.data);
      }

      const r = json((score as { value: string }).value);
      if (!r.ok) return r;
      const rp = resultSchema.safeParse(r.value);
      if (!rp.success) return fail({ kind: "invalid", message: `score.json: ${issues(rp.error)}` });

      return { ok: true, value: { manifest: mp.data, frames: frameList, trace: traceList, result: rp.data } };
    },
  };
}

export type Client = ReturnType<typeof createClient>;
