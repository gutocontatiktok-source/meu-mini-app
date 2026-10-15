export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const limpar = (v) => String(v || '').trim().replace(/^["']|["']$/g, '');
  let supaUrl = limpar(process.env.SUPABASE_URL);
  const supaKey = limpar(process.env.SUPABASE_ANON_KEY);
  try {
    supaUrl = supaUrl ? new URL(supaUrl).origin : '';
  } catch {
    return res.status(500).json({ error: 'SUPABASE_URL está inválida nas variáveis do servidor.' });
  }
  if (supaUrl && supaKey) {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) {
      return res.status(401).json({ error: 'Faça login para gerar o plano.' });
    }
    try {
      const auth = await fetch(`${supaUrl}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${token}`, apikey: supaKey }
      });
      if (!auth.ok) {
        const detalhe = await auth.text().catch(() => '');
        console.error('Falha ao validar login no Supabase:', auth.status, detalhe.slice(0, 300));
        return res.status(401).json({ error: `Sessão inválida ou expirada. Entre novamente. (Supabase ${auth.status})` });
      }
    } catch {
      return res.status(502).json({ error: 'Não foi possível validar o seu login.' });
    }
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

  const systemInstruction = `Você é o assistente de nutrição do aplicativo Tirze Forte, cujo slogan é "Suas metas diárias para o uso da tirzepatida". Atue como nutricionista clínico brasileiro, especialista em pacientes em uso de tirzepatida (Mounjaro/Monjaro), com tom motivador, claro e profissional. Seu foco é preservar massa magra durante a perda de peso, garantir proteína suficiente com apetite reduzido, evitar déficits agressivos, controlar efeitos gastrointestinais (náusea, constipação, refluxo, saciedade precoce) e manter hidratação.
Regras obrigatórias:
- Responda em português do Brasil, em Markdown simples (títulos com ##, listas com -, negrito com **).
- Use somente alimentos comuns no Brasil e porções em medidas caseiras e gramas.
- Respeite exatamente as metas calculadas de calorias e proteína recebidas; o cardápio somado deve ficar dentro de 5% dessas metas.
- Prefira refeições pequenas, densas em proteína, fracionadas e de fácil digestão; evite frituras e excesso de gordura, que pioram náuseas e refluxo.
- Se faltar proteína por baixa ingestão, sugira whey protein, colágeno com cautela, ou outro suplemento proteico, com dose em gramas, e creatina monohidratada apenas se fizer sentido; nunca prescreva medicamentos nem altere a dose da tirzepatida.
- Respeite restrições, alergias e preferências informadas.
- Para a meta mensal de peso, sugira perda de 2% a 4% do peso inicial por mês (0,5% a 1% por semana), nunca mais que isso, e proponha também metas mensais de dias com proteína batida, dias com água batida, sessões de treino de força e dias registrados no app.
- Finalize o texto, depois do aviso, com o slogan do Tirze Forte em uma linha.
- Inclua orientação de treino de força 2 a 4 vezes por semana como pilar de preservação muscular.
- Encerre com um aviso curto de que o plano é educativo e não substitui o acompanhamento do médico e do nutricionista, e liste sinais de alerta que exigem contato com o médico (vômitos persistentes, dor abdominal intensa, desidratação, tontura forte, perda de peso acima de 1% do peso corporal por semana).`;

  const prompt = `Monte o plano diário completo do Tirze Forte para este paciente.

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
## Metas sugeridas para o primeiro mês (peso em kg com faixa mínima e máxima, dias com proteína batida, dias com água batida, treinos de força e dias registrados no app)
## Sinais de alerta e aviso final`;

  const modelos = [limpar(process.env.GEMINI_MODEL) || 'gemini-3.8-flash', limpar(process.env.GEMINI_FALLBACK_MODEL)].filter(Boolean);
  const corpo = JSON.stringify({
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.6, topP: 0.9, maxOutputTokens: 8192 }
  });
  const prazo = Date.now() + 55000;
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const temporario = (s) => s === 429 || s === 500 || s === 503 || s === 504;
  let ultimo = { status: 502, msg: 'Falha ao consultar a IA.' };

  try {
    for (const modelo of modelos) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        const restante = prazo - Date.now();
        if (restante < 5000) break;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), restante);
        let response;
        try {
          response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: corpo
          });
        } finally {
          clearTimeout(timer);
        }

        const data = await response.json().catch(() => ({}));

        if (response.ok) {
          const parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
          const text = Array.isArray(parts) ? parts.map((x) => x.text || '').join('').trim() : '';
          if (text) {
            return res.status(200).json({ result: text });
          }
          ultimo = { status: 502, msg: 'A IA não retornou conteúdo. Tente novamente.' };
        } else {
          ultimo = { status: response.status, msg: (data && data.error && data.error.message) || 'Falha ao consultar a IA.' };
          console.error('Gemini', modelo, response.status, ultimo.msg.slice(0, 200));
          if (!temporario(response.status)) break;
        }

        if (tentativa < 2) await espera(1500 * (tentativa + 1));
      }
    }

    if (temporario(ultimo.status)) {
      return res.status(503).json({ error: 'A IA está com alta demanda no momento. Aguarde alguns segundos e tente de novo.' });
    }
    return res.status(502).json({ error: ultimo.msg });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      return res.status(504).json({ error: 'Tempo esgotado ao gerar o plano. Tente novamente.' });
    }
    return res.status(500).json({ error: 'Erro interno ao gerar o plano.' });
  }
}
