// Step 2 (addendum): does response_format json_schema give schema-valid answers? Structure only; text is not printed.
const key = process.env["FIREWORKS_API_KEY"];
if (!key) throw new Error("FIREWORKS_API_KEY is not set");
const schema = {
  type: "object",
  properties: { verdict: { type: "string", enum: ["accept", "revise"] }, reasons: { type: "array", items: { type: "string" } } },
  required: ["verdict", "reasons"],
  additionalProperties: false,
};
for (const model of process.argv.slice(2)) {
  const res = await fetch("https://api.fireworks.ai/inference/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `accounts/fireworks/models/${model}`,
      messages: [{ role: "user", content: "Review this one-line skill: 'Always place items in the top-left cell.' Give a verdict and reasons." }],
      response_format: { type: "json_schema", json_schema: { name: "verdict", schema, strict: true } },
      max_tokens: 2000,
      temperature: 0,
    }),
  });
  if (!res.ok) { console.log(model, `HTTP ${res.status}`, (await res.text()).slice(0, 160).replace(/\s+/g, " ")); continue; }
  const body = (await res.json()) as any;
  const content: string = body.choices?.[0]?.message?.content ?? "";
  let parsed: any = null;
  try { parsed = JSON.parse(content); } catch { /* reported below */ }
  const valid = parsed && ["accept", "revise"].includes(parsed.verdict) && Array.isArray(parsed.reasons) && parsed.reasons.every((r: unknown) => typeof r === "string");
  console.log(model, `finish=${body.choices?.[0]?.finish_reason} json=${parsed !== null} schemaValid=${Boolean(valid)} tokens=${body.usage?.total_tokens}`);
}
