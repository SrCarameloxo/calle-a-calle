// --- importador.js (VERSIÓN INTERACTIVA) ---

const { createClient } = require('@supabase/supabase-js');
const { GeoPackageAPI } = require('@ngageoint/geopackage');
const path = require('path');
const inquirer = require('inquirer'); // <-- CAMBIO: Importamos la nueva librería

// --- CONFIGURACIÓN ---
const SUPABASE_URL = 'https://hppzwfwtedghpsxfonoh.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwcHp3Znd0ZWRnaHBzeGZvbm9oIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDEyNDM0MywiZXhwIjoyMDY5NzAwMzQzfQ.fxcBXU6Hpa24wmADzdxzlKaIeyF4HdOietPukFTcEBc';
// const GPKG_FILE_NAME = 'callejero_badajoz.gpkg'; // <-- CAMBIO: Eliminamos esta línea fija

// --- NO TOCAR DE AQUÍ PARA ABAJO ---
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const wasmPath = path.resolve(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');


// <-- CAMBIO: Envolvemos toda la lógica en una función asíncrona para poder usar await con inquirer -->
async function runImporter() {
    console.log('--- Asistente de Importación de Callejeros ---');

    // <-- CAMBIO: Hacemos las preguntas al usuario -->
    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'cityName',
            message: '¿Qué ciudad vas a importar? (Ej: Córdoba)',
            validate: function (value) {
                if (value.length) {
                    return true;
                }
                return 'Por favor, introduce el nombre de la ciudad.';
            }
        },
        {
            type: 'input',
            name: 'gpkgFileName',
            message: '¿Cuál es el nombre del archivo GeoPackage?',
            // Sugerimos un nombre de archivo basado en la respuesta anterior
            default: (answers) => `callejero_${answers.cityName.toLowerCase().replace(/ /g, '_')}.gpkg`,
        }
    ]);

    const { cityName, gpkgFileName } = answers;
    const GPKG_FILE_PATH = path.resolve(__dirname, gpkgFileName);

    console.log('\n--- Iniciando la importación ---');
    console.log(`Ciudad: ${cityName}`);
    console.log(`Leyendo el archivo: ${GPKG_FILE_PATH}`);

    try {
        const geoPackage = await GeoPackageAPI.open(GPKG_FILE_PATH, {
            sqlJsConfig: { locateFile: () => wasmPath }
        });
        console.log('Archivo GeoPackage abierto correctamente.');
        
        // Obtenemos el nombre de la primera tabla de features, que suele ser el correcto.
        const featureTables = geoPackage.getFeatureTables();
        if (featureTables.length === 0) {
            console.error('¡Error! No se encontraron tablas de features en el archivo GeoPackage.');
            return;
        }
        const lineTableName = featureTables[0];
        
        console.log(`Usando la tabla de features: "${lineTableName}"`);
        const iterator = geoPackage.iterateGeoJSONFeatures(lineTableName);
        
        const waysParaSubir = [];
        for (const geojson of iterator) {
            const properties = geojson.properties;
            const geom = geojson.geometry;
            
            if (!geom || geom.type !== 'LineString' || !properties.osm_id) {
                continue;
            }
            
            const coordinates = geom.coordinates;
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
                tags: tags,
                city: cityName // <-- CAMBIO: Usamos la ciudad introducida por el usuario
            });
        }
        
        console.log(`Se han encontrado y procesado ${waysParaSubir.length} calles (ways) para subir a Supabase.`);

        if (waysParaSubir.length === 0) {
            console.error('¡Error! No se encontró ninguna calle válida en el archivo. Revisa el archivo descargado.');
            return;
        }

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
        if (error.code === 'ENOENT') {
            console.error(`Error: No se encuentra el archivo "${gpkgFileName}". Asegúrate de que está en la misma carpeta que el script.`);
        }
    }
}

// <-- CAMBIO: Ejecutamos la función principal que acabamos de crear -->
runImporter();