export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Chave GEMINI_API_KEY não configurada no servidor.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: 'JSON inválido.' });
    }
  }

  const p = body && body.perfil;
  const t = body && body.metas;
  if (!p || !t) {
    return res.status(400).json({ error: 'Dados do formulário incompletos.' });
  }

  const num = (v) => Number(v);
  const campos = [p.idade, p.peso, p.altura, t.tmb, t.get, t.kcal, t.proteina, t.agua, t.fibras];
  if (campos.some((v) => !Number.isFinite(num(v)) || num(v) <= 0)) {
    return res.status(400).json({ error: 'Valores numéricos inválidos.' });
  }

  const txt = (v, max = 300) => String(v || 'não informado').replace(/[\r\n]+/g, ' ').slice(0, max);

  const systemInstruction = `Você é um nutricionista clínico brasileiro, especialista em pacientes em uso de tirzepatida (Mounjaro/Monjaro). Seu foco é preservar massa magra durante a perda de peso, garantir proteína suficiente com apetite reduzido, evitar déficits agressivos, controlar efeitos gastrointestinais (náusea, constipação, refluxo, saciedade precoce) e manter hidratação.
Regras obrigatórias:
- Responda em português do Brasil, em Markdown simples (títulos com ##, listas com -, negrito com **).
- Use somente alimentos comuns no Brasil e porções em medidas caseiras e gramas.
- Respeite exatamente as metas calculadas de calorias e proteína recebidas; o cardápio somado deve ficar dentro de 5% dessas metas.
- Prefira refeições pequenas, densas em proteína, fracionadas e de fácil digestão; evite frituras e excesso de gordura, que pioram náuseas e refluxo.
- Se faltar proteína por baixa ingestão, sugira whey protein, colágeno com cautela, ou outro suplemento proteico, com dose em gramas, e creatina monohidratada apenas se fizer sentido; nunca prescreva medicamentos nem altere a dose da tirzepatida.
- Respeite restrições, alergias e preferências informadas.
- Inclua orientação de treino de força 2 a 4 vezes por semana como pilar de preservação muscular.
- Encerre com um aviso curto de que o plano é educativo e não substitui o acompanhamento do médico e do nutricionista, e liste sinais de alerta que exigem contato com o médico (vômitos persistentes, dor abdominal intensa, desidratação, tontura forte, perda de peso acima de 1% do peso corporal por semana).`;

  const prompt = `Monte o plano diário completo para este paciente.

PERFIL
- Sexo: ${txt(p.sexo, 20)}
- Idade: ${num(p.idade)} anos
- Peso: ${num(p.peso)} kg
- Altura: ${num(p.altura)} cm
- Nível de atividade: ${txt(p.atividadeLabel, 80)}
- Tempo de uso da tirzepatida: ${txt(p.tempoUso, 80)}
- Dose atual: ${txt(p.dose, 40)}
- Principal queixa digestiva: ${txt(p.sintomas, 120)}
- Restrições e alergias: ${txt(p.restricoes)}
- Alimentos que gosta ou evita: ${txt(p.preferencias)}
- Aceita suplementos: ${p.suplementos ? 'sim' : 'não'}

METAS CALCULADAS PELO APLICATIVO
- TMB: ${Math.round(num(t.tmb))} kcal
- GET: ${Math.round(num(t.get))} kcal
- Meta calórica diária (déficit controlado de ${Math.round(num(t.deficitPct))}%): ${Math.round(num(t.kcal))} kcal
- Meta de proteína: ${Math.round(num(t.proteina))} g por dia
- Meta de água: ${Math.round(num(t.agua))} copos de 250 ml
- Meta de fibras: ${Math.round(num(t.fibras))} g

ENTREGUE NESTA ORDEM
## Resumo da estratégia
## Cardápio do dia (6 refeições, com horário sugerido, porções, kcal e proteína de cada uma, e total do dia)
## Estratégia para bater a proteína com pouco apetite
## Suplementação sugerida (com dose e horário, ou explique por que não é necessária)
## Intestino e hidratação
## Treino de força
## Dicas para os dias de náusea ou saciedade extrema
## Sinais de alerta e aviso final`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55000);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, topP: 0.9, maxOutputTokens: 8192 }
      })
    });

    clearTimeout(timer);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const msg = (data && data.error && data.error.message) || 'Falha ao consultar a IA.';
      return res.status(response.status === 429 ? 429 : 502).json({ error: msg });
    }

    const parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
    const text = Array.isArray(parts) ? parts.map((x) => x.text || '').join('').trim() : '';

    if (!text) {
      return res.status(502).json({ error: 'A IA não retornou conteúdo. Tente novamente.' });
    }

    return res.status(200).json({ result: text });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      return res.status(504).json({ error: 'Tempo esgotado ao gerar o plano. Tente novamente.' });
    }
    return res.status(500).json({ error: 'Erro interno ao gerar o plano.' });
  }
}
