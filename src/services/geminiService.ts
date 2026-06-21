import { GoogleGenAI, Type } from "@google/genai";
import { UserProfile } from "../store/useStore";

/**
 * Consolidated pedagogical memory loaded from Firestore.
 * Used to inject long-term learning context into the system prompt.
 * Fields must contain only clean text — never audio, base64 or raw API objects.
 */
export interface LiveLearningMemory {
  lastUpdated: number;
  totalLiveSessions: number;
  generalSummary: string;
  currentLevelEstimate: 'Survivor' | 'Speaker' | 'Fluent' | 'Unassigned';
  preferredLanguageSupport?: string;
  recurringErrors?: { category: string; description: string; lastSeen: number }[];
  topicsMastered?: string[];
  learnedPhrases?: string[];
  pronunciationFocus?: string[];
  nextPedagogicalMilestone?: string;
  nextRecommendedStep?: string;
}

export function getAiInstance() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // If not found, try to see if it's under API_KEY (used for some paid flows)
    const altKey = (process.env as any).API_KEY;
    if (altKey) return new GoogleGenAI({ apiKey: altKey });
    
    throw new Error("Sistema temporariamente indisponível. Verifique a configuração interna.");
  }
  return new GoogleGenAI({ apiKey });
}

// Keep a default instance for backward compatibility where possible, but use getAiInstance() for new code
export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "dummy" });

export const getSystemInstruction = (
  profile?: UserProfile,
  isLive?: boolean,
  memory?: LiveLearningMemory,
) => {
  if (!profile) {
    return "You are LIAM, an English Buddy native to California. Speak in English but keep it simple.";
  }

  // Common Language Constraints
  let languageConstraint = "";
  let roleplayInstruction = "";

  if (
    profile.level === "Survivor" ||
    profile.perceivedLevel === "muito iniciante" ||
    profile.perceivedLevel === "básico" ||
    profile.confidence === "Low"
  ) {
    languageConstraint = `
    - PROPORÇÃO DE IDIOMA: No nível Survivor, use português para traduções rápidas e dar instruções de suporte, MAS puxe ele OBRIGATORIAMENTE para produzir as respostas em inglês.
    - Fale DEVAGAR e USE FRASES BEM CURTAS. Exemplo: "Isso aí! Agora tenta falar: 'I want water'".
    - MÉTODOLOGIA: Apoio em PT-BR para explicar o que ele deve dizer, depois EXIJA que ele repita a frase em EN-US.
    - NUNCA o sobrecarregue, e NUNCA deixe a conversa inteiramente em português.
    `;
    roleplayInstruction =
      "Roleplays curtíssimos. Se ele não souber dizer, ensine a frase em inglês e peça para repetir.";
  } else if (profile.level === "Speaker") {
    languageConstraint = `
    - PROPORÇÃO DE IDIOMA: Use o inglês quase o tempo todo (80%), usando português SOMENTE se ele errar feio uma estrutura para explicar.
    - FOCO: Correção de conectivos reais (btw, actually), estrutura gramatical (passado, futuro) e cobrança de repetição.
    `;
    roleplayInstruction =
      "Cenários práticos estruturados. Exija gramática firme. Faça ele corrigir seus próprios erros se possível.";
  } else if (profile.level === "Fluent") {
    languageConstraint = `
    - PROPORÇÃO DE IDIOMA: INGLÊS 100%. SEM PORTUGUÊS.
    - FOCO: Correção minuciosa de nuances, sotaque e palavras idiomáticas incorretas.
    `;
    roleplayInstruction =
      "Debates complexos e nuances de nativo. Cobrança de nível máximo.";
  }

  if (profile.languageProportion && profile.level !== "Fluent") {
    languageConstraint += `\n- PREFERÊNCIA AVALIADA: "${profile.languageProportion}". Use como base, mas **NÃO permita que ele fuja do inglês**.`;
  }

  // Recurring errors memory
  let savedErrorsStr = "";
  if (profile.savedErrors && profile.savedErrors.length > 0) {
    savedErrorsStr = `\nRECORRÊNCIA DE ERROS DO ALUNO (FOQUE EM VERIFICAR SE ELE MELHOROU ISSO):\n${profile.savedErrors.map((e) => `- [${e.category}] ${e.description}`).join("\n")}`;
  }

  let modeRules = "";
  if (isLive) {
    modeRules = `
### REGRAS CRÍTICAS DA FUNÇÃO LIVE (AULA ATIVA) ###

1. SE O ALUNO NÃO ENTENDER (Extrema Importância!):
Se o aluno disser coisas como "não entendi", "não sei", "tá difícil", "não consigo" ou estiver muito confuso:
- VOCÊ DEVE IMEDIATAMENTE FALAR EM PORTUGUÊS.
- Diga frases como: "Calma, eu te explico.", "Vamos por partes.", "Tranquilo, eu te ajudo."
- Explique o erro ou o que ele precisa dizer em português claro e simples.
- Dê EXATAMENTE o modelo em inglês: "O que eu quero que você diga é isso em inglês: 'I went to school'."
- Quebre a frase se for grande.
- Por fim, EXIJA que ele repita a frase em inglês: "Agora tenta repetir essa parte em inglês."

2. DIDÁTICA PRÉVIA PARA INICIANTES (NÍVEL SURVIVOR):
Para alunos de nível muito iniciante, NUNCA jogue a frase em inglês de surpresa. O fluxo deve OBRIGATORIAMENTE ser:
- Fale em português O QUE o aluno vai aprender ou a situação;
- Mostre a frase EM INGLÊS;
- Peça a repetição.
Exemplo: "Agora você vai aprender a dizer 'eu fui para a escola' em inglês. Em inglês, você fala: 'I went to school.' Agora repete em inglês: 'I went to school.'"

3. CORREÇÃO DE ERROS E PRONÚNCIA EM PORTUGUÊS (COM APOIO):
Ao corrigir gramática ou pronúncia:
- VOCÊ DEVE explicar o erro em PORTUGUÊS. Ex: "Quase! Em inglês isso não funciona assim." ou "Essa pronúncia não ficou muito boa."
- Mostre a forma correta em inglês e como falar (se for pronúncia, quebre a palavra: "THIR-ty").
- Após explicar e mostrar como se fala, termine EXIGINDO a repetição: "Agora repete comigo: 'I am 20 years old'."

4. TRAVA ANTI-PORTUGUÊS E TRANSIÇÃO RÁPIDA:
- O objetivo final SEMPRE é fazer o aluno falar em inglês. Use o português apenas como apoio, explique, resolva a dúvida e VOLTE PARA O INGLÊS no final exigindo a repetição.
- Se ele estiver falando português por preguiça (sem estar confuso), interrompa-o e force: "Olha como fala isso em inglês: [frase]. Agora tenta de novo em inglês!"

5. REGRA DE BLOQUEIO ABSOLUTO (MANTIDA):
- NÃO AVANCE a conversa ou o exercício se o aluno não tiver REPETIDO a frase corrigida. O passaporte para seguir é o aluno falar o certo.

6. TIPO DE FALA:
Áudio realista de professor firme mas incrível, amigo paciente. Foco total em treino guiado, NÃO é conversa livre. Você está num treino prático.
- NOTA SOBRE FERRAMENTAS: Use a ferramenta 'save_student_error' SEMPRE que o aluno insistir repetidas vezes no mesmo erro crítico.
`;
  } else {
    modeRules = `
### REGRAS DO MODO CHAT ###
- Siga a Metodologia Liam (Contexto curto -> Desafio -> Feedback).
- Se houver imagem ou upload anexado e o aluno pedir ajuda, priorize a imagem + legenda na sua resposta de forma altamente didática, ensinando o passo a passo.
- Não gere blocos pesados de texto. Use perguntas constantes.
- NUNCA invente mensagens de erro falsas do sistema ou de internet (ex: "pareço estar sem sinal", "estou offline"). Se você receber áudio vazio ou não entender o que foi dito, apenas diga: "I didn't quite catch that, can you say it again?" (Não entendi direito, pode repetir?) atuando normalmente como Liam.
`;
  }

  return `You are Liam AI, an ultra-fast, high-engagement conversational English coach for language schools. You act as a charismatic, highly effective, and slightly sarcastic ("Chic Amigável") coach. Keep motivation high but never tolerate lazy grammar.

[PEDAGOGICAL & STYLE RULES]
- Speak in English at all times. NEVER speak in Portuguese unless the student is explicitly classified as "Survivor" and indicates they are stuck or didn't understand.
- Never use action asterisks like *smiles* or *laughs*. Keep it pure dialogue.

[COMPUTATIONAL & TOKEN OPTIMIZATION RULES]
1. OUTPUT QUANTIZATION: Your responses MUST be concise. Limit every conversational turn to a MAXIMUM of 2 sentences or 25 words. Long sentences increase latency and API token costs. Be sharp, brief, and immediate.
2. ASYNCHRONOUS CORRECTIONS: Do not create separate evaluation paragraphs. Seamlessly correct errors within your reply, highlighted between single asterisks (e.g. "So you *went* to the movies?"), and immediately move the conversation forward with a direct question.
3. STRUCTURE: Your reply must always follow this strict token-saving structure: "Acknowledge/Correction + Contextual follow-up question."

STUDENT CONTEXT HEADER (Supplied by APP):
Student Name: ${profile.fullName || profile.displayName || "Friend"} (Prefers to be called: ${profile.displayName})
Current Level: ${profile.level} (Survivor / Speaker / Fluent)
Saved Errors Focus: ${savedErrorsStr || "None yet. Keep an eye out for patterns."}
Main Difficulties: ${profile.difficulties || "General speaking"}

${modeRules}

METODOLOGIA VITAL:
${languageConstraint}
- TIPO DE ROLEPLAY: ${roleplayInstruction}

COMANDOS PEDAGÓGICOS ("FRASES DE CHICOTE AMIGÁVEL"):
Use e abuse destas frases quando ele errar:
- "Now say that in English."
- "Good catch, but correct it first: [frase]"
- "We only move on after you say it correctly. Let's go:"
- "Say this sentence exactly: ..."
- "Not quite natural. Instead of 'X', say 'Y'. Repeat after me:"
- "Try again in English."

${memory ? buildMemoryPromptBlock(memory) : ''}`;
};

/**
 * Builds a concise memory block to append to the system prompt.
 * Kept short to avoid token bloat — only clean text summaries.
 */
function buildMemoryPromptBlock(memory: LiveLearningMemory): string {
  const sections: string[] = [];

  sections.push('STUDENT PEDAGOGICAL MEMORY (from previous sessions):');

  if (memory.generalSummary) {
    sections.push(`- General Summary: ${memory.generalSummary}`);
  }
  if (memory.currentLevelEstimate) {
    sections.push(`- Estimated Level: ${memory.currentLevelEstimate}`);
  }
  if (memory.preferredLanguageSupport) {
    sections.push(`- Language Support Preference: ${memory.preferredLanguageSupport}`);
  }
  if (memory.recurringErrors && memory.recurringErrors.length > 0) {
    const errorsStr = memory.recurringErrors
      .slice(-5)
      .map(e => `[${e.category}] ${e.description}`)
      .join('; ');
    sections.push(`- Recurring Errors: ${errorsStr}`);
  }
  if (memory.topicsMastered && memory.topicsMastered.length > 0) {
    sections.push(`- Topics Mastered: ${memory.topicsMastered.slice(-10).join(', ')}`);
  }
  if (memory.learnedPhrases && memory.learnedPhrases.length > 0) {
    sections.push(`- Learned Phrases: ${memory.learnedPhrases.slice(-10).join(', ')}`);
  }
  if (memory.pronunciationFocus && memory.pronunciationFocus.length > 0) {
    sections.push(`- Pronunciation Focus: ${memory.pronunciationFocus.slice(-5).join(', ')}`);
  }
  if (memory.nextPedagogicalMilestone) {
    sections.push(`- Next Milestone: ${memory.nextPedagogicalMilestone}`);
  }
  if (memory.nextRecommendedStep) {
    sections.push(`- Recommended Next Step: ${memory.nextRecommendedStep}`);
  }

  sections.push('Use this memory silently to personalize the lesson. Do NOT recite it to the student.');

  return '\n\n' + sections.join('\n');
}

export const chatWithLiamMultimodal = async (
  messageParts: any[],
  history: { role: "user" | "model"; parts: any[] }[],
  profile?: UserProfile,
) => {
  const rawContents = [...history, { role: "user", parts: messageParts }];
  const contents: any[] = [];
  
  for (const item of rawContents) {
    if (contents.length > 0 && contents[contents.length - 1].role === item.role) {
       contents[contents.length - 1].parts.push(...item.parts);
    } else {
       contents.push({ role: item.role, parts: [...item.parts] });
    }
  }

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: contents,
    config: {
      systemInstruction: getSystemInstruction(profile),
      temperature: 0.7,
    },
  });

  return response;
};

export const transcribeAudio = async (base64Data: string, mimeType: string) => {
  const currentAi = getAiInstance();
  const response = await currentAi.models.generateContent({
    model: "gemini-3.5-flash",
    contents: [
      {
        parts: [
          {
            text: "Transcreva o áudio a seguir com precisão na língua que for falada. Retorne apenas o texto transcrito, sem aspas, notas ou introduções.",
          },
          { inlineData: { data: base64Data, mimeType } },
        ],
      },
    ],
  });
  return response.text?.trim() || "";
};

export const chatWithLiam = async (
  message: string,
  history: { role: "user" | "model"; parts: [{ text: string }] }[],
  profile?: UserProfile,
) => {
  const currentAi = getAiInstance();
  const chat = currentAi.chats.create({
    model: "gemini-3.5-flash",
    config: {
      systemInstruction: getSystemInstruction(profile),
      temperature: 0.7,
    },
    history: history as any,
  });

  return await chat.sendMessage({ message });
};

export const generateLiamResponseWithHistory = async (
  message: string,
  rawHistory: { role: string; content: string }[],
  profile?: UserProfile,
) => {
  const currentAi = getAiInstance();
  const history = rawHistory.map((r) => ({
    role: r.role === "model" ? "model" : "user",
    parts: [{ text: r.content }],
  }));

  const chat = currentAi.chats.create({
    model: "gemini-3.5-flash",
    config: {
      systemInstruction: getSystemInstruction(profile),
      temperature: 0.7,
    },
    // We can optionally cast the history to the right type:
    history: history as any,
  });

  const response = await chat.sendMessage({ message });
  return response.text;
};

export const evaluateOnboarding = async (
  answers: string,
): Promise<{
  level: "Survivor" | "Speaker" | "Fluent";
  difficulties: string;
  confidence: string;
  goal: string;
}> => {
  const currentAi = getAiInstance();
  const response = await currentAi.models.generateContent({
    model: "gemini-3.5-flash",
    contents: `Analyze the following onboarding answers from a student: \n\n${answers}\n\nBased on their answers and English responses, determine:
        1. Their level (Survivor, Speaker, Fluent)
           - Survivor: Basic, lots of Portuguese, short broken English.
           - Speaker: Intermediate, can communicate but makes grammar mistakes.
           - Fluent: Advanced, good vocabulary.
        2. Their main difficulties.
        3. Their confidence level.
        4. Their goal.
        Return as JSON.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          level: { type: Type.STRING, enum: ["Survivor", "Speaker", "Fluent"] },
          difficulties: { type: Type.STRING },
          confidence: { type: Type.STRING },
          goal: { type: Type.STRING },
        },
        required: ["level", "difficulties", "confidence", "goal"],
      },
    },
  });

  return JSON.parse(response.text as string);
};

// We will also use text-to-speech for Liam's live mode.
const createWavHeader = (pcmLength: number, sampleRate: number): Uint8Array => {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeString = (v: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      v.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + pcmLength, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, pcmLength, true);
  return new Uint8Array(header);
};

export const generateLiamVoice = async (text: string) => {
  const currentAi = getAiInstance();
  const response = await currentAi.models.generateContent({
    model: "gemini-3.1-flash-tts-preview",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: "Puck" }, // Puck is a confident male voice
        },
      },
    },
  });

  const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (inlineData) {
    let base64Data = inlineData.data;
    let finalMimeType = inlineData.mimeType || "audio/wav";

    let pcmDataStr = "";
    try {
      pcmDataStr = window.atob(base64Data);
    } catch (e: any) {
      if (typeof atob !== "undefined") pcmDataStr = atob(base64Data);
      else pcmDataStr = Buffer.from(base64Data, "base64").toString("binary");
    }

    // If it isn't already a WAV file (checking for RIFF header)
    if (!pcmDataStr.startsWith("RIFF")) {
      const pcmLength = pcmDataStr.length;
      const pcmBuffer = new Uint8Array(pcmLength);
      for (let i = 0; i < pcmLength; i++) {
        pcmBuffer[i] = pcmDataStr.charCodeAt(i);
      }
      // Standard TTS from Gemini API uses 24000 sample rate
      const header = createWavHeader(pcmLength, 24000);
      const combined = new Uint8Array(header.length + pcmBuffer.length);
      combined.set(header);
      combined.set(pcmBuffer, header.length);

      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < combined.length; i += chunkSize) {
        binary += String.fromCharCode.apply(
          null,
          Array.from(combined.subarray(i, i + chunkSize)),
        );
      }
      try {
        base64Data = window.btoa(binary);
      } catch (e) {
        if (typeof btoa !== "undefined") base64Data = btoa(binary);
        else base64Data = Buffer.from(binary, "binary").toString("base64");
      }
      finalMimeType = "audio/wav";
    }

    return {
      data: base64Data, // standard WAV base64 string
      mimeType: finalMimeType,
    };
  }
  return null;
};
