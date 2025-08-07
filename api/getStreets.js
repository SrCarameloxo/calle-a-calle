// RUTA: /api/getStreets.js

const { createClient } = require('@supabase/supabase-js');
const { createClient: createKvClient } = require('@vercel/kv');
const { extractNameParts } = require('./_lib/helpers.js');

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

// --- Handler Principal ---
module.exports = async (request, response) => {
  try {
    const { zone, includePOI } = request.query;
    if (!zone) return response.status(400).json({ error: 'Faltan los puntos de la zona.' });
    
    const POIsAllowed = includePOI === 'true';

    const zonePoints = zone.split(';').map(pair => {
      const [lat, lng] = pair.split(',');
      return { lat: parseFloat(lat), lng: parseFloat(lng) };
    });

    const { center, radius } = calculateOptimalSearch(zonePoints);
    const geoResult = await geocode(center, process.env.GOOGLE_API_KEY);
    const currentCity = geoResult ? geoResult.city : null;

    const overrideRules = new Map();
    const blockedNames = new Set();

    if (currentCity) {
        const { data: overrides, error } = await supabaseAdmin.from('street_overrides').select('osm_name, display_name').eq('city', currentCity);
        if (!error) overrides.forEach(rule => overrideRules.set(rule.osm_name, rule));
        
        const { data: blocked, error: blockedError } = await supabaseAdmin.from('street_blocklist').select('osm_name').eq('city', currentCity);
        if (!blockedError) blocked.forEach(rule => blockedNames.add(rule.osm_name));
    }

    const coords = zonePoints.map(p => `${p.lat} ${p.lng}`).join(' ');
    const initialQuery = `[out:json][timeout:25]; way(poly:"${coords}")["name"]; out tags;`;
    let res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: initialQuery });
    if (!res.ok) throw new Error(`Overpass API error: ${res.statusText}`);
    let initialData = await res.json();
    
    const initialOsmNames = new Set(initialData.elements.map(el => el.tags.name));
    const streetNamesInPoly = [...initialOsmNames].filter(name => !blockedNames.has(name));
    
    const groupedByBaseName = new Map();
    for (const osmName of streetNamesInPoly) {
        const parts = extractNameParts(osmName);
        if (!parts.baseName) continue;
        if (!groupedByBaseName.has(parts.baseName)) {
            groupedByBaseName.set(parts.baseName, []);
        }
        groupedByBaseName.get(parts.baseName).push({ osmName, parts });
    }

    let finalStreetList = [];
    const seenIds = new Set();
    const LINE_TYPES = new Set(['CALLE', 'AVENIDA', 'PASEO', 'RONDA', 'CAMINO', 'CAÑADA', 'CALLEJA', 'CALLEJON']);
    const AREA_TYPES = new Set(['PLAZA', 'PARQUE', 'JARDIN', 'GLORIETA']);

    for (const [baseName, group] of groupedByBaseName.entries()) {
        const groupTypes = new Set(group.map(item => item.parts.type));
        
        let shouldSplit = false;
        if (groupTypes.size > 1) {
            const hasAreaType = [...groupTypes].some(type => AREA_TYPES.has(type));
            const hasLineType = [...groupTypes].some(type => LINE_TYPES.has(type) || type === null);
            if (hasAreaType && hasLineType) {
                shouldSplit = true;
            }
            if (!hasAreaType && new Set([...groupTypes].filter(t => t !== null)).size > 1) {
                shouldSplit = true;
            }
        }

        let entitiesToProcess = [];
        if (shouldSplit) {
            entitiesToProcess = group.map(item => ({
                id: `${item.parts.type || 'WAY'}_${item.parts.baseName}`,
                osmNames: [item.osmName]
            }));
        } else {
            entitiesToProcess = [{
                id: baseName,
                osmNames: group.map(item => item.osmName)
            }];
        }
        
        for (const entity of entitiesToProcess) {
            let streetData = null;

            if (seenIds.has(entity.id)) continue;
            
            const mainOsmName = entity.osmNames[0];
            const cacheKey = `street_v11:${currentCity}:${entity.id.replace(/\s/g, '_')}`;
            streetData = await kv.get(cacheKey);

            if (!streetData) {
                let processedStreet = {};
                const rule = entity.osmNames.reduce((acc, name) => acc || overrideRules.get(name), null);

                const queryNames = entity.osmNames.map(n => `way["name"="${n}"](around:${radius}, ${center.lat}, ${center.lng});`).join('');
                const geometryQuery = `[out:json][timeout:25]; (${queryNames}); out body; >; out skel qt;`;
                res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: geometryQuery });
                const geomData = await res.json();
                const elementsById = geomData.elements.reduce((acc, el) => { acc[el.id] = el; return acc; }, {});
                const geometries = geomData.elements.filter(el => el.type === 'way').map(el => ({
                    points: (el.nodes || []).map(id => elementsById[id]).filter(Boolean).map(n => [n.lat, n.lon]),
                    isClosed: (el.nodes || []).length > 2 && el.nodes[0] === el.nodes[el.nodes.length - 1]
                })).filter(g => g.points.length > 1);

                if (geometries.length === 0) continue;
                
                processedStreet.geometries = geometries;

                if (rule) {
                    processedStreet.displayName = rule.display_name.toUpperCase();
                } else {
                    const samplePoints = geometries.flatMap(g => g.points).filter((_, i, arr) => i % Math.max(1, Math.floor(arr.length / 5)) === 0).map(p => ({ lat: p[0], lng: p[1] }));
                    const geocodedResults = await Promise.all(samplePoints.map(pt => geocode(pt, process.env.GOOGLE_API_KEY)));
                    const geocodedNames = geocodedResults.filter(Boolean).map(geo => geo.name);

                    if (geocodedNames.length > 0) {
                        const nameCounts = geocodedNames.reduce((acc, name) => { acc[name] = (acc[name] || 0) + 1; return acc; }, {});
                        const mostCommonGoogleName = Object.keys(nameCounts).reduce((a, b) => nameCounts[a] > nameCounts[b] ? a : b);
                        
                        const osmParts = extractNameParts(mainOsmName);
                        const googleParts = extractNameParts(mostCommonGoogleName);
                        
                        const osmBaseName = osmParts.baseName;
                        const googleBaseName = googleParts.baseName;

                        const distance = levenshtein(osmBaseName, googleBaseName);
                        const threshold = Math.max(osmBaseName.length, googleBaseName.length) * 0.5;

                        if (distance > threshold) {
                            processedStreet.displayName = mainOsmName.toUpperCase();
                        } else {
                            processedStreet.displayName = mostCommonGoogleName;
                        }

                    } else {
                        processedStreet.displayName = mainOsmName.toUpperCase();
                    }
                }
                
                streetData = processedStreet;
                if(streetData.geometries && streetData.geometries.length > 0) {
                    await kv.set(cacheKey, streetData, { ex: 60 * 60 * 24 * 30 });
                } else {
                    streetData = null;
                }
            }

            if (!streetData) continue;
            
            const hasLines = streetData.geometries.some(g => !g.isClosed);
            const hasAreas = streetData.geometries.some(g => g.isClosed);
            if (hasLines && hasAreas) {
                streetData.geometries = streetData.geometries.filter(g => !g.isClosed);
            }
            const finalGeomHasArea = streetData.geometries.some(g => g.isClosed);
            if (!POIsAllowed && finalGeomHasArea) {
                continue;
            }

            seenIds.add(entity.id);
            finalStreetList.push({
                googleName: streetData.displayName,
                geometries: streetData.geometries
            });
        }
    }
    
    finalStreetList.sort(() => Math.random() - 0.5);
    response.status(200).json({ streets: finalStreetList });

  } catch (error) {
    console.error('Error en getStreets:', error);
    response.status(500).json({ error: 'Error interno del servidor.', details: error.message });
  }
};