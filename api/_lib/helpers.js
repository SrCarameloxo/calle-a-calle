function extractNameParts(name) {
    const streetTypeWords = new Set(['AV', 'AV.', 'AVDA', 'AVENIDA', 'CALLE', 'C', 'C.', 'C/', 'PASEO', 'Pº', 'P°', 'PLAZA', 'PL.', 'PZ', 'PUENTE', 'CAMINO', 'CAÑADA', 'CALLEJA', 'CALLEJON', 'PARQUE', 'JARDIN', 'POLIGONO', 'URBANIZACION', 'RONDA', 'GLORIETA', 'GTA']);
    const typeSynonymMap = { 'C': 'CALLE', 'C.': 'CALLE', 'C/': 'CALLE', 'AV': 'AVENIDA', 'AV.': 'AVENIDA', 'AVDA': 'AVENIDA', 'Pº': 'PASEO', 'P°': 'PASEO', 'PL': 'PLAZA', 'PL.': 'PLAZA', 'PZ': 'PLAZA', 'GTA': 'GLORIETA' };
    const stopWords = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'Y', 'I']);
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

module.exports = { extractNameParts };