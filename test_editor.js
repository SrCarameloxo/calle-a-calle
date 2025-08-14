// --- test_editor.js (Versión Módulo) ---
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const statusDiv = document.getElementById('status');
function log(message) {
    console.log(message);
    statusDiv.textContent += `\n${message}`;
}

const SUPABASE_URL = 'https://hppzwfwtedghpsxfonoh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwcHp3Znd0ZWRnaHBzeGZvbm9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxMjQzNDMsImV4cCI6MjA2OTcwMDQ0M30.BAh6i5iJ5YkDBoydfkC9azAD4eMdYBkEBdxws9kj5Hg';

try {
    log("Script iniciado como módulo. Creando cliente de Supabase...");
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    log("Cliente de Supabase creado. Esperando evento de autenticación...");

    supabase.auth.onAuthStateChange(async (event, session) => {
        log(`Evento de Auth recibido: ${event}`);
        if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && session) {
            log(`Sesión encontrada. Verificando rol para el usuario: ${session.user.id}`);
            const { data: profile, error } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
            if (error) {
                log(`ERROR al obtener el perfil: ${error.message}`);
            } else if (profile) {
                log(`¡ÉXITO! Perfil encontrado. Rol: ${profile.role}`);
            } else {
                log(`AVISO: No se encontró un perfil para este usuario.`);
            }
        }
    });
} catch (e) {
    log(`ERROR FATAL en el script: ${e.message}`);
}