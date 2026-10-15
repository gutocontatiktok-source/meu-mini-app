export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { age, weight, goal } = req.body;

  // Busca a chave da API do Gemini salva nas variáveis da Vercel
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Chave do Gemini não configurada no servidor.' });
  }

  const prompt = `Atue como um nutricionista e personal trainer profissional. Crie uma sugestão resumida e direta de treino diário e meta calórica para uma pessoa de ${age} anos, ${weight}kg, cujo objetivo é: ${goal}. Formate em marcadores curtos e práticos.`;

  try {
    // Chamada para a API do Google Gemini (modelo gemini-1.5-flash)
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ]
      })
    });

    const data = await response.json();

    if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
      const resultText = data.candidates[0].content.parts[0].text;
      return res.status(200).json({ result: resultText });
    } else {
      return res.status(500).json({ error: 'Erro ao obter resposta da API do Gemini.' });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno no servidor: ' + err.message });
  }
}
