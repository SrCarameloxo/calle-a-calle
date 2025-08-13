// --- importador.js (VERSIÓN FINAL) ---

const { createClient } = require('@supabase/supabase-js');
const { GeoPackageAPI } = require('@ngageoint/geopackage');
const path = require('path');

// --- CONFIGURACIÓN ---
const SUPABASE_URL = 'https://hppzwfwtedghpsxfonoh.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwcHp3Znd0ZWRnaHBzeGZvbm9oIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDEyNDM0MywiZXhwIjoyMDY5NzAwMzQzfQ.fxcBXU6Hpa24wmADzdxzlKaIeyF4HdOietPukFTcEBc';
const GPKG_FILE_NAME = 'callejero_badajoz.gpkg';

// --- NO TOCAR DE AQUÍ PARA ABAJO ---
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const GPKG_FILE_PATH = path.resolve(__dirname, GPKG_FILE_NAME);
const wasmPath = path.resolve(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');


async function importarDatos() {
    console.log('--- Iniciando la importación (Versión Final) ---');
    console.log(`Leyendo el archivo: ${GPKG_FILE_PATH}`);

    try {
        const geoPackage = await GeoPackageAPI.open(GPKG_FILE_PATH, {
            sqlJsConfig: { locateFile: () => wasmPath }
        });
        console.log('Archivo GeoPackage abierto correctamente.');

        // **** ¡AQUÍ ESTÁ EL CAMBIO PRINCIPAL! ****
        // Usamos el nombre de la tabla correcto que descubrimos: 'Callejero_Badajoz'
        const lineTableName = 'Callejero_Badajoz'; 
        
        console.log(`Buscando la tabla de features: "${lineTableName}"`);
        const iterator = geoPackage.iterateGeoJSONFeatures(lineTableName);
        
        const waysParaSubir = [];
        for (const geojson of iterator) {
            const properties = geojson.properties;
            const geom = geojson.geometry;
            
            // Filtro de seguridad: Nos aseguramos de que solo importamos calles (LineString)
            // y no puntos o polígonos que puedan venir en el archivo.
            if (!geom || geom.type !== 'LineString' || !properties.osm_id) {
                continue;
            }
            
            const coordinates = geom.coordinates;
            // Creamos el formato de texto que entiende PostGIS
            const wkt = `LINESTRING(${coordinates.map(p => `${p[0]} ${p[1]}`).join(', ')})`;
            
            let tags = {};
            if (properties.other_tags) {
                properties.other_tags.split('","').forEach(tag => {
                    const [key, value] = tag.replace(/"/g, '').split('=>');
                    if (key && value) tags[key] = value;
                });
            }
            if (properties.name && !tags.name) tags.name = properties.name;

            waysParaSubir.push({
                id: properties.osm_id,
                geom: wkt,
                tags: tags
            });
        }
        
        console.log(`Se han encontrado y procesado ${waysParaSubir.length} calles (ways) para subir a Supabase.`);

        if (waysParaSubir.length === 0) {
            console.error('¡Error! No se encontró ninguna calle válida en el archivo. Revisa el archivo descargado.');
            return;
        }

        // Subimos los datos en lotes de 100 para no sobrecargar la API
        const batchSize = 100;
        console.log('--- Empezando subida a Supabase ---');
        for (let i = 0; i < waysParaSubir.length; i += batchSize) {
            const batch = waysParaSubir.slice(i, i + batchSize);
            const { error } = await supabase.from('osm_ways').insert(batch);
            if (error) {
                console.error('Error al subir un lote:', error);
                throw error;
            }
            console.log(`Subido lote ${Math.floor(i / batchSize) + 1} de ${Math.ceil(waysParaSubir.length / batchSize)}`);
        }

        console.log('--- ¡¡¡IMPORTACIÓN COMPLETADA CON ÉXITO!!! ---');
        
    } catch (error) {
        console.error('Ha ocurrido un error durante la importación:', error);
    }
}

importarDatos();