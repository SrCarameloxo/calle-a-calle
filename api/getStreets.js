/// RUTA: /api/getStreets.js

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

// [CORRECCIÓN] Se mueve la función getDistance aquí, al nivel superior, para que sea accesible globalmente en el fichero.
const getDistance = (p1, p2) => {
    const R = 6371e3; // Radio de la Tierra en metros
    const φ1 = p1.lat * Math.PI / 180, φ2 = p2.lat * Math.PI / 180;
    const Δλ = (p2.lng - p1.lng) * Math.PI / 180;
    return Math.acos(Math.sin(φ1) * Math.sin(φ2) + Math.cos(φ1) * Math.cos(φ2) * Math.cos(Δλ)) * R;
};

function calculateOptimalSearch(zonePoints) {
  if (zonePoints.length === 0) return { center: { lat: 0, lng: 0 }, radius: 1500 };
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  zonePoints.forEach(p => {
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
  });
  const center = { lat: minLat + (maxLat - minLat) / 2, lng: minLng + (maxLng - minLng) / 2 };
  
  // Ya no se define getDistance aquí, usará la que está en el nivel superior.
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

/**
 * [NUEVA FUNCIÓN]
 * Compara dos nombres base de calles basándose en el número de palabras coincidentes.
 * @param {string} baseNameA El primer nombre base (ej: "SANTA INGRACIA").
 * @param {string} baseNameB El segundo nombre base (ej: "SANTA INGRACIA IISGUERO").
 * @returns {boolean} True si los nombres se consideran similares según la regla de coincidencia de palabras.
 */
function areNamesSimilarByWordCount(baseNameA, baseNameB) {
  if (!baseNameA || !baseNameB) return false;

  const wordsA = baseNameA.toUpperCase().split(' ').filter(Boolean);
  const wordsB = baseNameB.toUpperCase().split(' ').filter(Boolean);

  const setB = new Set(wordsB);
  const commonWordsCount = wordsA.filter(word => setB.has(word)).length;
  
  const totalWords = Math.max(wordsA.length, wordsB.length);

  // Si tiene 2 palabras, exigimos que ambas coincidan para evitar falsos positivos.
  if (totalWords === 2) {
    return commonWordsCount === 2;
  }

  // Si tiene 3 o más palabras, aplicamos la regla N-1.
  if (totalWords >= 3) {
    return commonWordsCount >= totalWords - 1;
  }
  
  return false; 
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

async function findPlaceId(streetName, center, apiKey) {
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(streetName)}&location=${center.lat},${center.lng}&radius=250&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 'OK' && data.results.length > 0) {
        const route = data.results.find(r => r.types.includes('route'));
        return route ? route.place_id : null;
    }
    return null;
}

async function getPlaceDetails(placeId, apiKey) {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry,types&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 'OK' && data.result && data.result.geometry) {
        return {
            location: data.result.geometry.location,
            types: data.result.types
        };
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
            const cacheKey = `street_v18:${currentCity}:${entity.id.replace(/\s/g, '_')}`;
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
                    // --- INICIO: ALGORITMO "CONFIANZA PROGRESIVA" CON "RUEDA DE RECONOCIMIENTO" ---
                    let finalName = null;
                    const samplePoints = geometries.flatMap(g => g.points).filter((_, i, arr) => i % Math.max(1, Math.floor(arr.length / 6)) === 0).slice(0, 6).map(p => ({ lat: p[0], lng: p[1] }));
                    
                    const geocodeResults = await Promise.all(samplePoints.map(pt => geocode(pt, process.env.GOOGLE_API_KEY)));
                    const geocodedNames = geocodeResults.filter(Boolean).map(geo => geo.name);

                    if (geocodedNames.length > 0) {
                        const nameCounts = geocodedNames.reduce((acc, name) => { acc[name] = (acc[name] || 0) + 1; return acc; }, {});
                        const googleWinnerName = Object.keys(nameCounts).reduce((a, b) => nameCounts[a] > nameCounts[b] ? a : b);

                        // --- [INICIO SECCIÓN MODIFICADA] Encrucijada de 3 Vías ---
                        const osmParts = extractNameParts(mainOsmName);
                        const googleParts = extractNameParts(googleWinnerName);
                        
                        // Condición 1: Corrección de typos a nivel de caracteres
                        const isTypoCorrection = osmParts.type === googleParts.type && levenshtein(osmParts.baseName, googleParts.baseName) <= 2;
                        
                        // Condición 2: Coincidencia por recuento de palabras (tu nueva lógica)
                        const isWordCountMatch = osmParts.type === googleParts.type && areNamesSimilarByWordCount(osmParts.baseName, googleParts.baseName);

                        if (mainOsmName.toUpperCase() === googleWinnerName) {
                            // Vía Rápida #1: Coincidencia Perfecta
                            finalName = googleWinnerName;
                        } else if (isTypoCorrection || isWordCountMatch) {
                            // Vía Rápida #2: Corrección de Alta Confianza (cubre typos Y diferencias de palabras)
                            finalName = googleWinnerName;
                        } else {
                            // Vía Lenta y Segura: Rueda de Reconocimiento Geográfica
                            const googlePlaceId = await findPlaceId(`${googleWinnerName}, ${currentCity}`, center, process.env.GOOGLE_PLACES_API_KEY);
                            const osmPlaceId = await findPlaceId(`${mainOsmName}, ${currentCity}`, center, process.env.GOOGLE_PLACES_API_KEY);

                            if (googlePlaceId && osmPlaceId) {
                                if (googlePlaceId === osmPlaceId) {
                                    finalName = googleWinnerName; // Éxito por Identidad
                                } else {
                                    const googlePlaceDetails = await getPlaceDetails(googlePlaceId, process.env.GOOGLE_PLACES_API_KEY);
                                    if (googlePlaceDetails) {
                                        // Usamos el centroide de la geometría de OSM para la comparación
                                        const allPoints = geometries.flatMap(g => g.points);
                                        let avgLat = 0, avgLng = 0;
                                        allPoints.forEach(p => { avgLat += p[0]; avgLng += p[1]; });
                                        const osmCenter = { lat: avgLat / allPoints.length, lng: avgLng / allPoints.length };
                                        
                                        const distance = getDistance(osmCenter, googlePlaceDetails.location); // Esta línea ahora funcionará
                                        if (distance < 6) {
                                            finalName = googleWinnerName; // Éxito por Proximidad
                                        } else {
                                            console.warn(`[Fallback] Rueda: '${googleWinnerName}' y '${mainOsmName}' son lugares distintos (${Math.round(distance)}m). Usando OSM.`);
                                            finalName = mainOsmName.toUpperCase();
                                        }
                                    } else {
                                        finalName = mainOsmName.toUpperCase();
                                    }
                                 }
                            } else if (googlePlaceId && !osmPlaceId) {
                                // Regla de Fallo Inteligente
                                console.warn(`Rueda: Google no conoce '${mainOsmName}', pero la votación encontró '${googleWinnerName}'. Confiando en la votación.`);
                                finalName = googleWinnerName;
                            } else {
                                // Fallback por falta de evidencia
                                console.warn(`[Fallback] Rueda: No se encontró Place ID para '${googleWinnerName}' o '${mainOsmName}'. Usando OSM.`);
                                finalName = mainOsmName.toUpperCase();
                            }
                        }
                        // --- [FIN SECCIÓN MODIFICADA] ---
                    }

                    processedStreet.displayName = finalName || mainOsmName.toUpperCase();
                    // --- FIN: ALGORITMO ---
                }
                
                streetData = processedStreet;
                if(streetData.geometries && streetData.geometries.length > 0) {
                    await kv.set(cacheKey, streetData, { ex: 60 * 60 * 24 * 180 });
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
    
    // --- INICIO: ENSAMBLADOR DE CALLES ---
    const callesEnsambladas = new Map();
    for (const calle of finalStreetList) {
        if (callesEnsambladas.has(calle.googleName)) {
            callesEnsambladas.get(calle.googleName).geometries.push(...calle.geometries);
        } else {
            callesEnsambladas.set(calle.googleName, { ...calle });
        }
    }
    const assembledStreetList = Array.from(callesEnsambladas.values());
    // --- FIN: ENSAMBLADOR DE CALLES ---
    
    assembledStreetList.sort(() => Math.random() - 0.5);
    response.status(200).json({ streets: assembledStreetList });

  } catch (error) {
    console.error('Error en getStreets:', error);
    response.status(500).json({ error: 'Error interno del servidor.', details: error.message });
  }
};