// api/memory.js
// Reiner Verbindungs-Dummy, damit der Internet-Test der App grün wird.
export default async function handler(req, res) {
  return res.status(200).json({ status: "online", message: "Verbindung steht." });
}
