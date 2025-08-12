// Este módulo contiene la lógica para el Modo Revancha.
// Exporta una función principal que 'main.js' puede importar y llamar.

// Se asume que 'supabaseClient' y 'loaderContainer' son variables globales
// accesibles desde 'main.js'. Una refactorización futura podría pasarlas como argumentos.

export async function startRevanchaGame(hooks) {
    // hooks es un objeto que permite a este módulo comunicarse con main.js
    // Por ejemplo: hooks.startGame(streetList)

    const loader = document.getElementById('loader-container');
    loader.classList.remove('hidden');

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            alert("Necesitas estar conectado para jugar al Modo Revancha.");
            return;
        }

        const response = await fetch('/api/getRevanchaStreets', {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'No se pudieron cargar las calles para la revancha.');
        }
        
        const data = await response.json();
        
        if (data.streets.length === 0) {
            alert("¡Felicidades! No tienes ninguna calle pendiente en el modo revancha.");
            return;
        }

        // Si tenemos calles, llamamos al hook proporcionado por main.js para iniciar la partida
        hooks.startGame(data.streets);

    } catch (error) {
        console.error("Error al iniciar el Modo Revancha:", error);
        alert(error.message);
    } finally {
        loader.classList.add('hidden');
    }
}