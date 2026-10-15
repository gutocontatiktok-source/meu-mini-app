export default async function handler(req, res) {
  // Permite apenas requisições do tipo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { age, weight, goal } = req.body;

  // Busca a chave de API salva nas variáveis de ambiente da Vercel
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Chave de API não configurada no servidor.' });
  }

  const prompt = `Atue como um nutricionista e personal trainer profissional. Crie uma sugestão resumida e direta de treino diário e meta calórica para uma pessoa de ${age} anos, ${weight}kg, cujo objetivo é: ${goal}. Formate em marcadores curtos e práticos.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7
      })
    });

    const data = await response.json();

    if (data.choices && data.choices[0]) {
      return res.status(200).json({ result: data.choices[0].message.content });
    } else {
      return res.status(500).json({ error: 'Erro ao gerar resposta da IA.' });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno no servidor: ' + err.message });
  }
}