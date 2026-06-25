import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import { UserProfile } from "../store/useStore";
import { getAiInstance } from "./geminiService";

// Function declaration for saving custom study plans
const savePlanFunctionDeclaration: FunctionDeclaration = {
  name: "save_custom_study_plan",
  description: "Cria e salva um plano de estudos personalizado para o aluno treinar no Live Mode.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: {
        type: Type.STRING,
        description: "Título curto em inglês/português para o plano, ex: Airport Immigration, Entrevista Técnica, Pub Night"
      },
      description: {
        type: Type.STRING,
        description: "Uma frase cativante em português sobre o foco desse treinamento."
      },
      scenario: {
        type: Type.STRING,
        description: "O cenário de simulação que o aluno terá que contornar, em português, ex: Você está desembarcando no aeroporto de Londres..."
      },
      languagePreference: {
        type: Type.STRING,
        enum: ["portuguese", "mixed", "english"],
        description: "Preferência do idioma das explicações do tutor durante a aula de Live Mode: 'portuguese' (mais português), 'mixed' (misturado) ou 'english' (apenas inglês)."
      },
      instructions: {
        type: Type.STRING,
        description: "Instruções pedagógicas de sistema detalhadas em inglês para o Liam agir exatamente nos moldes desse cenário."
      }
    },
    required: ["title", "description", "scenario", "languagePreference", "instructions"]
  }
};

const SYSTEM_INSTRUCTION_TEXT_CHAT = `
Você é o Liam AI, um coach de inglês conversacional ultra-rápido, carismático, elegante, altamente eficaz e levemente sarcástico ("Chic Amigável").

[DIRETRIZ DE IDIOMA - EXCLUSIVA EM PORTUGUÊS (PT-BR)]
- Você DEVE responder e dar TODAS as explicações, dicas e orientações totalmente em PORTUGUÊS (PT-BR).
- Use o INGLÊS apenas para frases de exemplo, vocabulário específico, termos práticos ou ao propor exercícios para o aluno.
- Garanta um suporte acolhedor e focado para alunos iniciantes, simplificando conceitos e explicando tudo de forma clara e amigável em português selvagem.

[SPECIAL STUDY PLANS PROTOCOL]
1. SCENARIO DETECTION: Se o aluno sugerir que quer praticar um cenário do mundo real específico (Ex: entrevista de emprego, viagem, aeroporto, reserva de hotel, conversa de bar, restaurante, jogo, desafio de vocabulário), mostre entusiasmo! Explique em português que você pode criar um Plano de Estudos Personalizado integrado ao Live Mode.
2. PREFERENCE STEP: Antes de salvar o plano, você DEVE perguntar ao usuário em português qual preferência de idioma ele prefere para suas explicações durante a simulação no Live Mode. Dê três opções claras:
   - "Apenas Inglês" (english)
   - "Misturado (PT/EN)" (mixed)
   - "Mais Português nas explicações" (portuguese)
3. GENERATION STEP: Quando eles responderem/indicarem sua escolha, você DEVE invocar a ferramenta 'save_custom_study_plan' usando descrições detalhadas, títulos e instruções em inglês para o roleplay do Liam no Live Mode.
4. FINAL WORKFLOW: Ao chamar 'save_custom_study_plan', informe o usuário em português que está tudo pronto! Escreva algo encorajador, ex: "Plano criado e ativado! Agora é só tocar em 'Start Live' para testá-lo por voz!"

[COMPUTATIONAL & TOKEN OPTIMIZATION RULES]
- CONCISÃO EXTREMA: Limite suas respostas a no máximo 2 frases curtas (max 25 palavras). Textos longos em telas de celular ficam ruins e consomem muitos tokens.
- Nunca use asteriscos de ações como *sorri* ou *ri*. Apenas fale.
`;

export const chatWithLiamMultimodal = async (
  messageParts: any[],
  history: { role: "user" | "model"; parts: any[] }[],
  profile?: UserProfile,
) => {
  const currentAi = getAiInstance();

  // OTIMIZAÇÃO DE CUSTO: Slicing to the last 12 turns (6 user / 6 model exchanges maximum)
  const slicedHistory = history.slice(-12);
  const rawContents = [...slicedHistory, { role: "user", parts: messageParts }];
  const contents: any[] = [];
  
  for (const item of rawContents) {
    if (contents.length === 0 && item.role === "model") {
      continue;
    }
    
    if (contents.length > 0 && contents[contents.length - 1].role === item.role) {
      contents[contents.length - 1].parts.push(...item.parts);
    } else {
      contents.push({ role: item.role, parts: [...item.parts] });
    }
  }

  // OTIMIZAÇÃO DE CUSTO: Using the cheapest "gemini-2.5-flash" model for text chat
  const response = await currentAi.models.generateContent({
    model: "gemini-2.5-flash",
    contents: contents,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION_TEXT_CHAT + `\n\nContexto do Aluno:\nNome: ${profile?.displayName || "Friend"}\nNível: ${profile?.level || "Survivor"}`,
      temperature: 0.7,
      tools: [{ functionDeclarations: [savePlanFunctionDeclaration] }],
    },
  });

  return response;
};
