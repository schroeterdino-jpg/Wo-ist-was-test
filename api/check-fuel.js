export default async function handler(req, res) {
    try {
        // 1. Einstellungen aus den Vercel-Umgebungsvariablen auslesen
        const targetPrice = parseFloat(process.env.FUEL_TARGET_PRICE || "1.90");
        const fuelType = process.env.FUEL_TYPE || "diesel";
        const lat = process.env.LOCATION_LAT || "53.5029"; // Schwarzenbek
        const lng = process.env.LOCATION_LNG || "10.4777";
        const tankerkoenigApiKey = process.env.TANKERKOENIG_API_KEY;

        const refresh_token = process.env.GOOGLE_REFRESH_TOKEN;
        const client_id = process.env.GOOGLE_CLIENT_ID;
        const client_secret = process.env.GOOGLE_CLIENT_SECRET;

        if (!tankerkoenigApiKey || !refresh_token || !client_id || !client_secret) {
            return res.status(500).json({ error: "Fehlende Umgebungsvariablen in Vercel." });
        }

        // 2. Spritpreise über Tankerkönig API abfragen
        const fuelRes = await fetch(`https://creativecommons.tankerkoenig.de/json/list.php?lat=${lat}&lng=${lng}&rad=5&sort=price&type=${fuelType}&apikey=${tankerkoenigApiKey}`);
        const fuelData = await fuelRes.json();

        if (!fuelData.ok || !fuelData.stations || fuelData.stations.length === 0) {
            return res.status(200).json({ status: "Keine Tankstellendaten empfangen." });
        }

        const cheapestStation = fuelData.stations[0];
        const currentPrice = cheapestStation.price;

        // 3. Preis mit Wunschpreis vergleichen
        if (currentPrice <= targetPrice) {

            // 4. Frischen Google Access Token holen
            const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: client_id,
                    client_secret: client_secret,
                    refresh_token: refresh_token,
                    grant_type: 'refresh_token'
                })
            });
            const tokenData = await tokenRes.json();

            if (!tokenData.access_token) {
                return res.status(500).json({ error: "Google Access Token konnte nicht erneuert werden." });
            }

            // 5. Automatischen Termin in den Google Kalender eintragen
            const now = new Date();
            const startISO = now.toISOString();
            const endISO = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

            const eventBody = {
                summary: `⛽ Sprit-Alarm: ${cheapestStation.name} (${currentPrice.toFixed(2)} €)`,
                description: `Spritpreis-Alarm für ${fuelType.toUpperCase()}!\nAktueller Preis: ${currentPrice.toFixed(2)} € bei ${cheapestStation.name} (${cheapestStation.street}, ${cheapestStation.place}).\nDein Limit lag bei ${targetPrice.toFixed(2)} €.`,
                start: { dateTime: startISO },
                end: { dateTime: endISO },
                reminders: {
                    useDefault: false,
                    overrides: [{ method: 'popup', minutes: 0 }]
                }
            };

            const calRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${tokenData.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(eventBody)
            });

            const calData = await calRes.json();
            return res.status(200).json({ success: true, message: "Kalender-Alarm erfolgreich gesendet!", event: calData });
        }

        return res.status(200).json({ status: "Preis liegt über dem Limit.", currentPrice, targetPrice });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

