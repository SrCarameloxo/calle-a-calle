const { createClient } = require('@supabase/supabase-js');
const { createClient: createKvClient } = require('@vercel/kv');

// --- Clientes de Servicios ---
const kv = createKvClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);


// --- Funciones Auxiliares ---

function calculateOptimalSearch(zonePoints) {
  if (zonePoints.length === 0) return { center: { lat: 0, lng: 0 }, radius: 1500 };
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  zonePoints.forEach(p => {
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
  });
  const center = { lat: minLat + (maxLat - minLat) / 2, lng: minLng + (maxLng - minLng) / 2 };
  const getDistance = (p1, p2) => {
    const R = 6371e3; // Radio de la Tierra en metros
    const φ1 = p1.lat * Math.PI / 180, φ2 = p2.lat * Math.PI / 180;
    const Δλ = (p2.lng - p1.lng) * Math.PI / 180;
    return Math.acos(Math.sin(φ1) * Math.sin(φ2) + Math.cos(φ1) * Math.cos(φ2) * Math.cos(Δλ)) * R;
  };
  let maxDistance = 0;
  zonePoints.forEach(p => { maxDistance = Math.max(maxDistance, getDistance(center, p)); });
  return { center, radius: Math.round(maxDistance + 200) };
}

function levenshtein(a, b) {
  if (a.length === 0) return b.length; if (b.length === 0) return a.length;
  const matrix = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(null));
  for (let i = 0; i <= b.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= a.length; j++) matrix[j][0] = j;
  for (let j = 1; j <= a.length; j++) {
    for (let i = 1; i <= b.length; i++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[j][i] = Math.min(matrix[j][i - 1] + 1, matrix[j - 1][i] + 1, matrix[j - 1][i - 1] + cost);
    }
  }
  return matrix[a.length][b.length];
}

function getCityFromResult(result) {
    const cityComponent = result.address_components.find(c => c.types.includes('locality'));
    return cityComponent ? cityComponent.long_name : null;
}

async function geocode(pt, apiKey) {
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${pt.lat},${pt.lng}&key=${apiKey}`);
  const js = await res.json();
  if (js.status !== 'OK' || js.results.length === 0) return null;
  const result = js.results[0];
  const routeComp = result.address_components.find(c => c.types.includes('route'));
  if (routeComp) return { name: routeComp.long_name.toUpperCase(), city: getCityFromResult(result) };
  
  const nameFromAddress = result.formatted_address.split(',')[0].toUpperCase();
  const forbiddenNames = ['BADAJOZ', 'ESPAÑA', '06001', '06002', '06003', '06004', '06005', '06006', '06007', '06008', '06009', '06010', '06011', '06012'];
  if (nameFromAddress && !forbiddenNames.some(fn => nameFromAddress.includes(fn))) {
     return { name: nameFromAddress, city: getCityFromResult(result) };
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

// --- Handler Principal ---
module.exports = async (request, response) => {
  try {
    const { zone, includePOI } = request.query; // <- 1. LEEMOS EL NUEVO PARÁMETRO
    if (!zone) return response.status(400).json({ error: 'Faltan los puntos de la zona.' });
    
    const POIsAllowed = includePOI === 'true'; // Convertimos el string a booleano

    const zonePoints = zone.split(';').map(pair => {
      const [lat, lng] = pair.split(',');
      return { lat: parseFloat(lat), lng: parseFloat(lng) };
    });

    const { center, radius } = calculateOptimalSearch(zonePoints);

    const geoResult = await geocode(center, process.env.GOOGLE_API_KEY);
    const currentCity = geoResult ? geoResult.city : null;

    const overrideRules = new Map();
    if (currentCity) {
        const { data: overrides, error } = await supabaseAdmin.from('street_overrides').select('osm_name, display_name').eq('city', currentCity);
        if (error) console.warn("No se pudieron cargar las reglas de anulación:", error.message);
        else overrides.forEach(rule => overrideRules.set(rule.osm_name, rule));
    }

    const coords = zonePoints.map(p => `${p.lat} ${p.lng}`).join(' ');
    let query = `[out:json][timeout:25]; way(poly:"${coords}")["name"]; out tags;`;
    let res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query });
    if (!res.ok) throw new Error(`Overpass API error 1: ${res.statusText}`);
    let js = await res.json();
    const streetNamesInPoly = new Set(js.elements.map(el => el.tags.name));
    
    let streetList = [];
    const seenFinalNames = new Set();
    const allOsmBaseNames = new Set(Array.from(streetNamesInPoly).map(name => extractNameParts(name).baseName));

    for (const osmName of streetNamesInPoly) {
      const rule = overrideRules.get(osmName);
      
      const cacheKey = `street_v4:${osmName.toUpperCase().replace(/\s/g, '_')}`;
      let cachedStreet = await kv.get(cacheKey);

      if (cachedStreet && !rule) {
        if (!seenFinalNames.has(cachedStreet.googleName)) {
            seenFinalNames.add(cachedStreet.googleName);
            streetList.push(cachedStreet);
        }
        continue;
      }
      
      query = `[out:json][timeout:25]; way["name"="${osmName}"](around:${radius}, ${center.lat}, ${center.lng}); out body; >; out skel qt;`;
      res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query });
      js = await res.json();
      const elementsById = js.elements.reduce((acc, el) => { acc[el.id] = el; return acc; }, {});
      const geometries = js.elements.filter(el => el.type === 'way').map(el => {
          const nodes = (el.nodes || []).map(id => elementsById[id]).filter(Boolean);
          return { points: nodes.map(n => [n.lat, n.lon]), isClosed: nodes.length > 2 && nodes[0]?.id === nodes[nodes.length - 1]?.id };
      }).filter(g => g.points.length > 1);

      if (geometries.length === 0) continue;

      // --- INICIO: REGLA DE SELECCIÓN (FILTRO POR MODO DE JUEGO) ---
      const hasClosedArea = geometries.some(g => g.isClosed);
      // Si el modo es "solo calles" (POIsAllowed = false) y el lugar contiene un área cerrada, lo descartamos.
      if (!POIsAllowed && hasClosedArea) {
          continue;
      }
      // --- FIN: REGLA DE SELECCIÓN ---


      // --- INICIO: REGLA DE VISUALIZACIÓN (FILTRO "PASEO FLUVIAL") ---
      let geometriesToUse = geometries;
      const hasLines = geometries.some(g => !g.isClosed);
      // Si un lugar tiene a la vez líneas y áreas, usamos solo las líneas para dibujarlo.
      if (hasLines && hasClosedArea) {
          geometriesToUse = geometries.filter(g => !g.isClosed);
      }
      // --- FIN: REGLA DE VISUALIZACIÓN ---


      let finalStreet = null;

      if (rule) {
          finalStreet = { googleName: rule.display_name.toUpperCase(), geometries: geometriesToUse };
      } else {
          const samplePoints = geometries.flatMap(g => g.points).filter((_, i, arr) => i % Math.max(1, Math.floor(arr.length / 5)) === 0).map(p => ({ lat: p[0], lng: p[1] }));
          const geocodedResults = await Promise.all(samplePoints.map(pt => geocode(pt, process.env.GOOGLE_API_KEY)));
          const geocodedNames = geocodedResults.filter(Boolean).map(geo => geo.name);

          if (geocodedNames.length > 0) {
              const nameCounts = geocodedNames.reduce((acc, name) => { acc[name] = (acc[name] || 0) + 1; return acc; }, {});
              const mostCommonGoogleName = Object.keys(nameCounts).reduce((a, b) => nameCounts[a] > nameCounts[b] ? a : b);
              
              const osmParts = extractNameParts(osmName);
              const googleParts = extractNameParts(mostCommonGoogleName);
              
              let isMatch = false;
              let finalNameToUse = mostCommonGoogleName;

              // Nivel 1: Coincidencia Exacta
              if (osmParts.baseName && osmParts.baseName === googleParts.baseName) {
                isMatch = true;
              }
              // Nivel 2: Coincidencia por Similitud
              else if (osmParts.baseName && googleParts.baseName) {
                  const distance = levenshtein(osmParts.baseName, googleParts.baseName);
                  const similarity = 1 - distance / Math.max(osmParts.baseName.length, googleParts.baseName.length);
                  if (similarity > 0.85) isMatch = true;
              }
              // Nivel 3: Confusión en Intersección
              if (!isMatch && allOsmBaseNames.has(googleParts.baseName)) {
                  isMatch = true;
                  finalNameToUse = osmName.toUpperCase();
              }

              if (isMatch) {
                  finalStreet = { googleName: finalNameToUse, geometries: geometriesToUse };
              }
          }
      }

      if (finalStreet && !seenFinalNames.has(finalStreet.googleName)) {
          seenFinalNames.add(finalStreet.googleName);
          streetList.push(finalStreet);
          await kv.set(cacheKey, finalStreet, { ex: 60 * 60 * 24 * 30 });
      }
    }
    
    response.status(200).json({ streets: streetList });
  } catch (error) {
    console.error('Error en getStreets:', error);
    response.status(500).json({ error: 'Error interno del servidor.', details: error.message });
  }
};