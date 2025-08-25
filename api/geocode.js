// API multifuncional: Geocoding y Mapa de Calor
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://hppzwfwtedghpsxfonoh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwcHp3Znd0ZWRnaHBzeGZvbm9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxMjQzNDMsImV4cCI6MjA2OTcwMDM0M30.BAh6i5iJ5YkDBoydfkC9azAD4eMdYBkEBdxws9kj5Hg';
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(request, response) {
  const { latlng, action = 'geocode', type = 'global', user_id } = request.query;

  try {
    if (action === 'geocode') {
      // === FUNCIONALIDAD ORIGINAL DE GEOCODING ===
      if (!latlng) {
        return response.status(400).json({ error: 'Faltan las coordenadas (latlng)' });
      }

      const apiKey = process.env.GOOGLE_API_KEY;
      const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latlng}&key=${apiKey}`;

      const googleResponse = await fetch(googleUrl);
      const data = await googleResponse.json();
      response.status(200).json(data);

    } else if (action === 'heatmap') {
      // === NUEVA FUNCIONALIDAD DE MAPA DE CALOR ===
      if (type === 'global') {
        // Obtener datos globales de toda la ciudad
        const { data: globalStats, error } = await supabase
          .from('game_stats')
          .select('correct_guesses, total_questions, created_at, user_id');

        if (error) throw error;

        const heatmapData = processGlobalHeatmapData(globalStats || []);
        
        response.status(200).json({
          type: 'global',
          data: heatmapData,
          totalGames: globalStats?.length || 0,
          totalUsers: new Set((globalStats || []).map(s => s.user_id)).size
        });

      } else if (type === 'personal') {
        if (!user_id) {
          return response.status(400).json({ error: 'user_id required for personal heatmap' });
        }

        const { data: userStats, error } = await supabase
          .from('game_stats')
          .select('correct_guesses, total_questions, created_at')
          .eq('user_id', user_id)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const heatmapData = processPersonalHeatmapData(userStats || []);
        
        response.status(200).json({
          type: 'personal',
          data: heatmapData,
          totalGames: userStats?.length || 0
        });
      }
    } else {
      response.status(400).json({ error: 'Action not supported' });
    }

  } catch (error) {
    console.error('Error in geocode/heatmap API:', error);
    response.status(500).json({ error: 'Internal server error' });
  }
}

function processGlobalHeatmapData(stats) {
  // Zonas simuladas de Badajoz con coordenadas reales
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
    // Simular dificultad basada en datos reales con algo de aleatoriedad
    const relatedGames = stats.filter(() => Math.random() > 0.6);
    const totalAttempts = relatedGames.reduce((sum, game) => sum + game.total_questions, 0);
    const totalCorrect = relatedGames.reduce((sum, game) => sum + game.correct_guesses, 0);
    
    const difficultyScore = totalAttempts > 0 ? (totalCorrect / totalAttempts) : (0.3 + Math.random() * 0.7);
    const intensity = Math.min(relatedGames.length / 15, 1);
    
    return {
      ...zone,
      accuracy: difficultyScore,
      intensity: Math.max(0.4, intensity),
      gamesPlayed: relatedGames.length,
      color: getHeatmapColor(difficultyScore, 'global'),
      opacity: Math.max(0.3, Math.min(0.8, intensity + 0.3))
    };
  });
}

function processPersonalHeatmapData(stats) {
  if (stats.length === 0) return [];

  const personalZones = [];
  const timeGroups = groupGamesByTime(stats);
  
  timeGroups.forEach((games, index) => {
    const totalAttempts = games.reduce((sum, game) => sum + game.total_questions, 0);
    const totalCorrect = games.reduce((sum, game) => sum + game.correct_guesses, 0);
    
    if (totalAttempts > 0) {
      const accuracy = totalCorrect / totalAttempts;
      const gamesCount = games.length;
      
      // Coordenadas distribuidas alrededor de Badajoz
      const baseCoords = [
        [38.8794, -6.9706], [38.8850, -6.9650], [38.8750, -6.9800],
        [38.8700, -6.9600], [38.8900, -6.9500], [38.8650, -6.9750]
      ];
      
      const coordIndex = index % baseCoords.length;
      const [baseLat, baseLng] = baseCoords[coordIndex];
      const lat = baseLat + (Math.random() - 0.5) * 0.02;
      const lng = baseLng + (Math.random() - 0.5) * 0.02;
      
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
  const groups = [];
  const groupSize = 4;
  
  for (let i = 0; i < stats.length; i += groupSize) {
    groups.push(stats.slice(i, i + groupSize));
  }
  
  return groups;
}

function calculatePersonalOpacity(accuracy, gamesCount) {
  const minOpacity = 0.25;
  const maxOpacity = 0.8;
  
  if (gamesCount === 1) {
    return minOpacity; // Primera vez = muy tenue
  }
  
  // Más juegos = más opaco, fallos más visibles
  const countFactor = Math.min(gamesCount / 8, 1);
  const accuracyFactor = accuracy < 0.5 ? 1.2 : 0.8; // Fallos más visibles
  
  return Math.min(maxOpacity, minOpacity + (maxOpacity - minOpacity) * countFactor * accuracyFactor);
}

function getHeatmapColor(score, type) {
  if (type === 'global') {
    // Global: rojo = difícil (muchos fallos), verde = fácil (pocos fallos)
    if (score >= 0.75) return '#10b981'; // Verde - Zona fácil
    if (score >= 0.55) return '#f59e0b'; // Amarillo - Zona intermedia
    return '#ef4444'; // Rojo - Zona difícil
  } else {
    // Personal: verde = dominada, rojo = a repasar
    if (score >= 0.8) return '#10b981'; // Verde - Dominada
    if (score >= 0.6) return '#f59e0b'; // Amarillo - Regular
    return '#ef4444'; // Rojo - Necesita repaso
  }
}