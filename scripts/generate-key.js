import crypto from "node:crypto";

console.log("ROOTCAUSE_DATA_KEY=" + crypto.randomBytes(32).toString("base64"));
console.error(
  "Guarda este valor en un gestor de secretos o archivo local protegido. No lo agregues al repositorio."
);
