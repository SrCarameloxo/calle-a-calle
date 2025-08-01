import { createClient } from '@vercel/kv';

// Esta es la línea que faltaba. Define la conexión a la base de datos.
const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

async function geocode(pt) {
  const apiKey = process.env.GOOGLE_API_KEY;
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${pt.lat},${pt.lng}&key=${apiKey}`);
  const js = await res.json();
  if (js.status !== 'OK' || js.results.length === 0) return null;
  const result = js.results[0];
  const routeComp = result.address_components.find(c => c.types.includes('route'));
  if (routeComp) return { name: routeComp.long_name.toUpperCase(), loc: result.geometry.location };
  const nameFromAddress = result.formatted_address.split(',')[0].toUpperCase();
  const forbiddenNames = ['BADAJOZ', 'ESPAÑA', '06001', '06002', '06003', '06004', '06005', '06006', '06007', '06008', '06009', '06010', '06011', '06012'];
  if (nameFromAddress && !forbiddenNames.some(fn => nameFromAddress.includes(fn))) {
     return { name: nameFromAddress, loc: result.geometry.location };
  }
  return null;
}

function extractNameParts(name) {
    const streetTypeWords = new Set(['AV', 'AV.', 'AVDA', 'AVENIDA', 'CALLE', 'C', 'C.', 'C/', 'PASEO', 'Pº', 'P°', 'PLAZA', 'PL.', 'PZ', 'PUENTE', 'CAMINO', 'CAÑADA', 'CALLEJA', 'CALLEJON', 'PARQUE', 'JARDIN', 'POLIGONO', 'URBANIZACION', 'RONDA']);
    const typeSynonymMap = { 'C': 'CALLE', 'C.': 'CALLE', 'C/': 'CALLE', 'AV': 'AVENIDA', 'AV.': 'AVENIDA', 'AVDA': 'AVENIDA', 'Pº': 'PASEO', 'P°': 'PASEO', 'PL': 'PLAZA', 'PL.': 'PLAZA', 'PZ': 'PLAZA' };
    const stopWords = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'Y']);
    const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    const words = normalized.split(/[^A-Z0-9]+/).filter(Boolean);
    const foundType = words.find(w => streetTypeWords.has(w)) || null;
    let canonicalType = foundType;
    if (foundType && typeSynonymMap[foundType]) {
        canonicalType = typeSynonymMap[foundType];
    }
    const baseWords = words.filter(w => !streetTypeWords.has(w) && !stopWords.has(w));
    return { type: canonicalType, baseName: baseWords.join(' ') };
}

export default async function handler(request, response) {
  const { zonePoints } = request.body;
  if (!zonePoints || zonePoints.length < 3) {
    return response.status(400).json({ error: 'Faltan los puntos de la zona.' });
  }

  try {
    const coords = zonePoints.map(p => `${p.lat} ${p.lng}`).join(' ');
    let query = `[out:json][timeout:25]; way(poly:"${coords}")["name"]; out tags;`;
    let res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query });
    if (!res.ok) throw new Error(`Overpass API error 1: ${res.statusText}`);
    let js = await res.json();
    const streetNamesInPoly = new Set(js.elements.map(el => el.tags.name));
    
    let streetList = [];
    const seenGoogleNames = new Set();
    const center = { lat: zonePoints[0].lat, lng: zonePoints[0].lng };

    for (const osmName of streetNamesInPoly) {
      const cacheKey = `street:${osmName.toUpperCase().replace(/\s/g, '_')}`;
      let cachedStreet = await kv.get(cacheKey);

      if (cachedStreet) {
        if (!seenGoogleNames.has(cachedStreet.googleName)) {
          seenGoogleNames.add(cachedStreet.googleName);
          streetList.push(cachedStreet);
        }
      } else {
        query = `[out:json][timeout:25]; way["name"="${osmName}"](around:1500, ${center.lat}, ${center.lng}); out body; >; out skel qt;`;
        res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query });
        if (!res.ok) throw new Error(`Overpass API error 2: ${res.statusText}`);
        js = await res.json();
        
        const elementsById = js.elements.reduce((acc, el) => { acc[el.id] = el; return acc; }, {});
        const geometries = js.elements.filter(el => el.type === 'way').map(el => {
            const nodes = (el.nodes || []).map(id => elementsById[id]).filter(Boolean);
            const points = nodes.map(n => [n.lat, n.lon]);
            const isClosed = nodes.length > 2 && nodes[0]?.id === nodes[nodes.length - 1]?.id;
            return { points, isClosed };
        }).filter(g => g.points.length > 1);

        if (geometries.length > 0) {
            const samplePoints = [];
            const allPoints = geometries.flatMap(g => g.points);
            const step = Math.max(1, Math.floor(allPoints.length / 5));
            for (let i = 0; i < allPoints.length; i += step) {
                samplePoints.push({ lat: allPoints[i][0], lng: allPoints[i][1] });
            }

            const geocodedResults = await Promise.all(samplePoints.map(pt => geocode(pt)));
            const geocodedNames = geocodedResults.filter(Boolean).map(geo => geo.name);

            if (geocodedNames.length > 0) {
                const nameCounts = geocodedNames.reduce((acc, name) => { acc[name] = (acc[name] || 0) + 1; return acc; }, {});
                const mostCommonGoogleName = Object.keys(nameCounts).reduce((a, b) => nameCounts[a] > nameCounts[b] ? a : b);
                
                const osmParts = extractNameParts(osmName);
                const googleParts = extractNameParts(mostCommonGoogleName);

                if (osmParts.baseName && osmParts.baseName === googleParts.baseName) {
                    if (!seenGoogleNames.has(mostCommonGoogleName)) {
                        const newStreet = { googleName: mostCommonGoogleName, geometries: geometries };
                        seenGoogleNames.add(newStreet.googleName);
                        streetList.push(newStreet);
                        await kv.set(cacheKey, newStreet, { ex: 60 * 60 * 24 * 30 }); // Cache for 30 days
                    }
                }
            }
        }
      }
    }
    
    response.status(200).json({ streets: streetList });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: 'Error al procesar las calles.', details: error.message });
  }
}