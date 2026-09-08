function event(source, timestamp, input, index) {
  const parsed = new Date(timestamp);
  if (!timestamp || Number.isNaN(parsed.getTime())) return null;
  return {
    id: source + "-" + index,
    timestamp: parsed.toISOString(),
    source,
    reference: input.internal_id || input.id || input.tx_hash || input.txHash || null,
    description: input.description || input.event || input.status || source + " event",
    data: input,
    epistemic_level: source === "blockchain" ? "observed-fact" : "reported-record"
  };
}

export function buildForensicTimeline({ ledger = [], application = [], exchange = [], blockchain = [] }) {
  const groups = [
    ["ledger", ledger, (item) => item.timestamp || item.ledger_timestamp],
    ["application", application, (item) => item.timestamp || item.application_timestamp],
    ["exchange", exchange, (item) => item.timestamp || item.exchange_timestamp],
    ["blockchain", blockchain, (item) => item.timestamp]
  ];
  const events = groups.flatMap(([source, entries, timestamp]) => entries.map((item, index) => event(source, timestamp(item), item, index))).filter(Boolean);
  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.source.localeCompare(b.source));
  return {
    events,
    sources: Object.fromEntries(groups.map(([source]) => [source, events.filter((item) => item.source === source).length])),
    first_event: events[0]?.timestamp || null,
    last_event: events.at(-1)?.timestamp || null,
    caveat: "Los timestamps de sistemas internos y exchanges son registros aportados; sólo el timestamp blockchain proviene de evidencia on-chain."
  };
}
