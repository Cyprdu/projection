// netlify/functions/vote.js
const fetch = require('node-fetch');

const AIRTABLE_BASE = process.env.AIRTABLE_BASE;
const AIRTABLE_TABLE = process.env.AIRTABLE_TABLE || 'Films';
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_API = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(AIRTABLE_TABLE)}`;

const headers = {
  'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
  'Content-Type': 'application/json'
};

exports.handler = async function(event) {
  // CORS headers (autorise ton site)
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }

  if (event.httpMethod === 'GET') {
    // Renvoyer les totaux (liste de films avec votes)
    try {
      // Récupère tous les enregistrements (simple pagination)
      let all = [];
      let offset = null;
      do {
        const url = AIRTABLE_API + (offset ? `?offset=${offset}` : '');
        const resp = await fetch(url, { headers });
        const json = await resp.json();
        if (!resp.ok) throw new Error(JSON.stringify(json));
        all = all.concat(json.records);
        offset = json.offset;
      } while (offset);

      // map to {name, votes}
      const totals = all.map(r => ({
        name: r.fields.Name || r.fields.Nom || 'Sans titre',
        votes: r.fields.Votes || 0
      }));
      return { statusCode: 200, headers: { ...corsHeaders, 'Content-Type':'application/json' }, body: JSON.stringify({ totals }) };
    } catch (err) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
    }
  }

  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}');
      const film = body.film;
      if (!film) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'film missing' }) };

      // 1) find record by Name field
      const filter = `?filterByFormula=({Name}='${film.replace(/'/g,"\\'")}')`;
      const findResp = await fetch(AIRTABLE_API + filter, { headers });
      const findJson = await findResp.json();
      if (!findResp.ok) throw new Error(JSON.stringify(findJson));

      if (!findJson.records || findJson.records.length === 0) {
        // Optionnel : créer une nouvelle entrée si non trouvée
        const createResp = await fetch(AIRTABLE_API, {
          method: 'POST',
          headers,
          body: JSON.stringify({ fields: { Name: film, Votes: 1 } })
        });
        const created = await createResp.json();
        if (!createResp.ok) throw new Error(JSON.stringify(created));
        return { statusCode: 200, headers: { ...corsHeaders, 'Content-Type':'application/json' }, body: JSON.stringify({ message: 'vote enregistré', record: created }) };
      }

      // 2) update votes (increment)
      const rec = findJson.records[0];
      const current = (rec.fields.Votes || 0);
      const updated = await fetch(`${AIRTABLE_API}/${rec.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ fields: { Votes: current + 1 } })
      });
      const updatedJson = await updated.json();
      if (!updated.ok) throw new Error(JSON.stringify(updatedJson));

      return { statusCode: 200, headers: { ...corsHeaders, 'Content-Type':'application/json' }, body: JSON.stringify({ message: 'vote enregistré', record: updatedJson }) };
    } catch (err) {
      return { statusCode: 500, headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ error: err.message }) };
    }
  }

  return { statusCode: 405, headers: corsHeaders, body: 'Method not allowed' };
};
