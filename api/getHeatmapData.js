const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://hppzwfwtedghpsxfonoh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwcHp3Znd0ZWRnaHBzeGZvbm9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxMjQzNDMsImV4cCI6MjA2OTcwMDM0M30.BAh6i5iJ5YkDBoydfkC9azAD4eMdYBkEBdxws9kj5Hg';
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { type = 'global', user_id } = req.query;

    try {
        if (type === 'global') {
            // Obtener datos globales de toda la ciudad
            const { data: globalStats, error } = await supabase
                .from('game_stats')
                .select('correct_guesses, total_questions, created_at, user_id');

            if (error) throw error;

            // Procesar datos para mapa de calor global
            const heatmapData = processGlobalHeatmapData(globalStats);
            
            res.status(200).json({
                type: 'global',
                data: heatmapData,
                totalGames: globalStats.length,
                totalUsers: new Set(globalStats.map(s => s.user_id)).size
            });

        } else if (type === 'personal') {
            if (!user_id) {
                return res.status(400).json({ error: 'user_id required for personal heatmap' });
            }

            // Obtener datos personales del usuario
            const { data: userStats, error } = await supabase
                .from('game_stats')
                .select('correct_guesses, total_questions, created_at')
                .eq('user_id', user_id)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Procesar datos para mapa de calor personal
            const heatmapData = processPersonalHeatmapData(userStats);
            
            res.status(200).json({
                type: 'personal',
                data: heatmapData,
                totalGames: userStats.length
            });
        }

    } catch (error) {
        console.error('Error generating heatmap data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

function processGlobalHeatmapData(stats) {
    // Simular zonas de la ciudad con coordenadas de Badajoz
    const cityZones = [
        { lat: 38.8794, lng: -6.9706, name: "Centro Histórico" },
        { lat: 38.8850, lng: -6.9650, name: "San Roque" },
        { lat: 38.8750, lng: -6.9800, name: "Cerro de Reyes" },
        { lat: 38.8700, lng: -6.9600, name: "Valdepasillas" },
        { lat: 38.8900, lng: -6.9500, name: "Pardaleras" },
        { lat: 38.8650, lng: -6.9750, name: "Universidad" },
        { lat: 38.8950, lng: -6.9850, name: "Guadiana" },
        { lat: 38.8800, lng: -6.9900, name: "La Paz" }
    ];

    return cityZones.map(zone => {
        // Simular dificultad basada en los datos reales
        const relatedGames = stats.filter(() => Math.random() > 0.7); // Simular juegos en esa zona
        const totalAttempts = relatedGames.reduce((sum, game) => sum + game.total_questions, 0);
        const totalCorrect = relatedGames.reduce((sum, game) => sum + game.correct_guesses, 0);
        
        const difficultyScore = totalAttempts > 0 ? (totalCorrect / totalAttempts) : Math.random();
        const intensity = Math.min(relatedGames.length / 10, 1); // Normalizar intensidad
        
        return {
            ...zone,
            difficulty: difficultyScore,
            intensity: intensity,
            gamesPlayed: relatedGames.length,
            color: getHeatmapColor(difficultyScore, 'global'),
            opacity: Math.max(0.3, intensity)
        };
    });
}

function processPersonalHeatmapData(stats) {
    // Para datos personales, usar coordenadas simuladas pero con datos reales del usuario
    const personalZones = [];
    
    // Agrupar partidas por períodos temporales para simular zonas
    const timeGroups = groupGamesByTime(stats);
    
    timeGroups.forEach((games, index) => {
        const totalAttempts = games.reduce((sum, game) => sum + game.total_questions, 0);
        const totalCorrect = games.reduce((sum, game) => sum + game.correct_guesses, 0);
        
        if (totalAttempts > 0) {
            const accuracy = totalCorrect / totalAttempts;
            const gamesCount = games.length;
            
            // Coordenadas simuladas alrededor de Badajoz
            const lat = 38.8794 + (Math.random() - 0.5) * 0.1;
            const lng = -6.9706 + (Math.random() - 0.5) * 0.1;
            
            personalZones.push({
                lat: lat,
                lng: lng,
                accuracy: accuracy,
                gamesCount: gamesCount,
                totalCorrect: totalCorrect,
                totalAttempts: totalAttempts,
                color: getHeatmapColor(accuracy, 'personal'),
                opacity: calculatePersonalOpacity(accuracy, gamesCount),
                name: `Zona ${index + 1}`
            });
        }
    });
    
    return personalZones;
}

function groupGamesByTime(stats) {
    // Agrupar partidas en grupos de 3-5 para simular zonas
    const groups = [];
    const groupSize = 4;
    
    for (let i = 0; i < stats.length; i += groupSize) {
        groups.push(stats.slice(i, i + groupSize));
    }
    
    return groups;
}

function calculatePersonalOpacity(accuracy, gamesCount) {
    // Opacidad basada en cantidad de juegos y resultado
    const minOpacity = 0.2;
    const maxOpacity = 0.8;
    
    if (gamesCount === 1) {
        return minOpacity; // Primera vez = muy tenue
    }
    
    // Más juegos = más opaco, pero modulado por accuracy
    const countFactor = Math.min(gamesCount / 10, 1);
    const accuracyFactor = accuracy < 0.5 ? 1 : 0.7; // Fallos más visibles
    
    return minOpacity + (maxOpacity - minOpacity) * countFactor * accuracyFactor;
}

function getHeatmapColor(score, type) {
    if (type === 'global') {
        // Para global: rojo = difícil (muchos fallos), verde = fácil (pocos fallos)
        if (score >= 0.8) return '#22c55e'; // Verde - Zona fácil
        if (score >= 0.6) return '#eab308'; // Amarillo - Zona intermedia
        return '#ef4444'; // Rojo - Zona difícil
    } else {
        // Para personal: verde = dominada, rojo = a repasar
        if (score >= 0.8) return '#22c55e'; // Verde - Dominada
        if (score >= 0.6) return '#eab308'; // Amarillo - Regular
        return '#ef4444'; // Rojo - Necesita repaso
    }
}