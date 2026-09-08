function escapeCsv(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}

export function toCsv(rows) {
  if (!Array.isArray(rows)) rows = [rows];
  if (!rows.length) return "";
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [headers.join(","), ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(","))].join("\n") + "\n";
}

export function graphToGraphMl(graph) {
  const xml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
  return `<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns">
  <key id="type" for="node" attr.name="type" attr.type="string"/>
  <key id="label" for="node" attr.name="label" attr.type="string"/>
  <key id="relation" for="edge" attr.name="relation" attr.type="string"/>
  <graph id="rootcause-forensics" edgedefault="directed">
${graph.nodes.map((node) => `    <node id="${xml(node.id)}"><data key="type">${xml(node.type)}</data><data key="label">${xml(node.label)}</data></node>`).join("\n")}
${graph.edges.map((edge, index) => `    <edge id="e${index}" source="${xml(edge.source)}" target="${xml(edge.target)}"><data key="relation">${xml(edge.relation)}</data></edge>`).join("\n")}
  </graph>
</graphml>\n`;
}
