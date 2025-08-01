// Este es el código de nuestro "camarero" en Vercel
// Su trabajo es recibir una petición del juego, llamar a Google de forma segura,
// y devolverle el resultado al juego.

export default async function handler(request, response) {
  // 1. Cogemos las coordenadas que nos manda el juego desde la URL
  const { latlng } = request.query;

  // 2. Comprobamos que nos han mandado las coordenadas
  if (!latlng) {
    return response.status(400).json({ error: 'Faltan las coordenadas (latlng)' });
  }

  // 3. ¡La parte clave! Cogemos la API Key de forma segura.
  //    Esta variable la configuraremos en la web de Vercel, NUNCA estará en el código.
  const apiKey = process.env.GOOGLE_API_KEY;

  // 4. Construimos la URL para llamar a Google
  const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latlng}&key=${apiKey}`;

  try {
    // 5. Llamamos a Google desde nuestro servidor
    const googleResponse = await fetch(googleUrl);
    const data = await googleResponse.json();

    // 6. Le enviamos la respuesta de Google de vuelta a nuestro juego
    response.status(200).json(data);
  } catch (error) {
    // 7. Si algo va mal, enviamos un error
    response.status(500).json({ error: 'Error al contactar con la API de Google' });
  }
}