import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "../store/useStore";
import { db } from "../lib/firebase";
import {
  collection,
  doc,
  updateDoc,
  increment,
  arrayUnion,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { Mic, MicOff, Loader2, AlertTriangle, Minus, Plus, RotateCcw, Eye, EyeOff } from "lucide-react";
import { ai, getSystemInstruction, getAiInstance } from "../services/geminiService";
import { Modality, LiveServerMessage } from "@google/genai";
import ReactMarkdown from "react-markdown";
import { LogoIcon } from "../components/ui/Logo";
import { App } from "@capacitor/app";

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64: string) {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

function pcm16ToAudioBuffer(arrayBuffer: ArrayBuffer, sampleRate: number, audioContext: AudioContext) {
  const pcmData = new Int16Array(arrayBuffer);
  const audioBuffer = audioContext.createBuffer(1, pcmData.length, sampleRate);
  const channelData = audioBuffer.getChannelData(0);

  for (let i = 0; i < pcmData.length; i++) {
    channelData[i] = pcmData[i] / 32768;
  }

  return audioBuffer;
}

function pcm16ToAudioBufferSafe(arrayBuffer: ArrayBuffer, sampleRate: number, audioContext: AudioContext) {
  const dataView = new DataView(arrayBuffer);
  const sampleCount = arrayBuffer.byteLength / 2;
  const audioBuffer = audioContext.createBuffer(1, sampleCount, sampleRate);
  const channelData = audioBuffer.getChannelData(0);

  for (let i = 0; i < sampleCount; i++) {
    const sample = dataView.getInt16(i * 2, true);
    channelData[i] = sample / 32768;
  }

  return audioBuffer;
}

function calculateRms(audioBuffer: AudioBuffer) {
  const data = audioBuffer.getChannelData(0);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i] * data[i];
  }
  return Math.sqrt(sum / data.length);
}

function normalizeTranscriptText(text: string): string {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
}

function getSmartVisibleText(fullText: string): string {
  const safe = normalizeTranscriptText(fullText);

  if (!safe) return "";

  // Se houver frase entre aspas, priorizar a última frase que o aluno deve repetir.
  const quotedMatches = safe.match(/"([^"]+)"/g);

  if (quotedMatches && quotedMatches.length) {
    const lastQuoted = quotedMatches[quotedMatches.length - 1].replaceAll('"', "").trim();

    if (lastQuoted.length <= 60) {
      return lastQuoted;
    }

    return lastQuoted.slice(0, 60).trim() + "...";
  }

  // Caso não tenha aspas, mostrar apenas a última frase curta.
  const sentences = safe.match(/[^.!?]+[.!?]*/g) || [safe];
  const lastSentence = sentences[sentences.length - 1].trim();

  if (lastSentence.length <= 60) {
    return lastSentence;
  }

  return lastSentence.slice(0, 60).trim() + "...";
}

function extractRepeatTarget(text: string): string {
  const safe = String(text || "");
  const quotedMatches = safe.match(/"([^"]+)"/g);

  if (!quotedMatches || !quotedMatches.length) return "";

  return quotedMatches[quotedMatches.length - 1].replaceAll('"', "").trim();
}

function extractMeaning(text: string): string {
  const safe = String(text || "");
  const match = safe.match(/significa[:\s]+["“]?([^."”]+)["”]?/i);

  return match ? match[1].trim() : "";
}

function buildStudentContext(profile: any) {
  return {
    name: profile?.name || profile?.displayName || "student",
    level: profile?.englishLevel || profile?.level || "beginner",
    goal: profile?.objective || profile?.goal || profile?.learningGoal || "",
    nativeLanguage: profile?.nativeLanguage || "Portuguese",
    difficulty: profile?.difficulty || "",
    hasStudiedEnglish: profile?.hasStudiedEnglish || "",
    interests: profile?.interests || "",
    profession: profile?.profession || ""
  };
}

function buildLiamStudentProfileContext(profile: any) {
  return {
    name: profile?.fullName || profile?.name || profile?.displayName || "aluno",
    currentSchool: profile?.currentSchool || profile?.school || "",
    mainGoal: profile?.mainGoal || profile?.goal || profile?.objective || profile?.learningGoal || "",
    mainDifficulty: profile?.mainDifficulty || profile?.difficulty || "",
    englishLevel: profile?.englishLevel || profile?.level || "",
    nativeLanguage: profile?.nativeLanguage || "Portuguese",
    speakingConfidence: profile?.speakingConfidence || "",
    grammarBase: profile?.grammarBase || "",
    vocabularyBase: profile?.vocabularyBase || "",
    onboardingAnswers: profile?.onboardingAnswers || {}
  };
}

function buildLiamStudentPromptContext(studentProfile: any) {
  return `
Student profile:

Name: ${studentProfile.name}
Current English school: ${studentProfile.currentSchool}
Main goal: ${studentProfile.mainGoal}
Main difficulty: ${studentProfile.mainDifficulty}
English level: ${studentProfile.englishLevel}
Native language: ${studentProfile.nativeLanguage}
Speaking confidence: ${studentProfile.speakingConfidence}
Grammar base: ${studentProfile.grammarBase}
Vocabulary base: ${studentProfile.vocabularyBase}

Use this profile to personalize every Live Mode interaction.
`.trim();
}

function studentNeedsPortuguese(text: string): boolean {
  const safe = String(text || "").toLowerCase();

  return [
    "não entendi",
    "nao entendi",
    "não sei",
    "nao sei",
    "explica",
    "em português",
    "em portugues",
    "fala português",
    "fala portugues",
    "traduz",
    "tradução",
    "traducao",
    "o que significa",
    "não consegui",
    "nao consegui",
    "calma",
    "devagar"
  ].some(term => safe.includes(term));
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: "",
      email: ""
    },
    operationType,
    path
  };
  console.error('[Live] Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function createLiveSession(userEmail: string): Promise<string> {
  const sessionId = crypto.randomUUID();
  const path = `users/${userEmail}/liveSessions/${sessionId}`;

  try {
    const sessionRef = doc(db, "users", userEmail, "liveSessions", sessionId);
    await setDoc(sessionRef, {
      sessionId,
      userId: userEmail,
      userEmail,
      startedAt: Date.now(),
      endedAt: null,
      status: "active",
      transcript: [],
      learnedPhrases: [],
      mistakes: [],
      corrections: [],
      topics: [],
      summary: "",
      nextRecommendedStep: "",
      updatedAt: Date.now()
    });
    console.log("[Live] Sessão Live criada no Firestore com ID:", sessionId);
    return sessionId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    return sessionId;
  }
}

async function saveLiveMessage({
  userEmail,
  sessionId,
  role,
  text,
  visibleText,
  repeatTarget,
  meaning
}: {
  userEmail: string;
  sessionId: string;
  role: "student" | "liam";
  text: string;
  visibleText?: string;
  repeatTarget?: string;
  meaning?: string;
}) {
  const cleanText = String(text || "").trim();
  if (!cleanText || !sessionId || !userEmail) return;

  const path = `users/${userEmail}/liveSessions/${sessionId}`;
  try {
    const message = {
      role,
      text: cleanText,
      visibleText: String(visibleText || "").trim(),
      repeatTarget: String(repeatTarget || "").trim(),
      meaning: String(meaning || "").trim(),
      createdAt: Date.now()
    };

    const sessionRef = doc(db, "users", userEmail, "liveSessions", sessionId);
    await updateDoc(sessionRef, {
      transcript: arrayUnion(message),
      updatedAt: Date.now()
    });
    console.log(`[Live] Mensagem de ${role} salva na sessão ${sessionId}`);
  } catch (error) {
    console.error("[Live] Erro ao salvar mensagem no Firestore:", error);
  }
}

function generateLocalSessionSummary(transcript: any[]) {
  const allText = transcript.map(m => `${m.role}: ${m.text}`).join("\n");

  const learnedPhrases = transcript
    .filter(m => m.role === "liam" && m.repeatTarget)
    .map(m => m.repeatTarget);

  const topics: string[] = [];
  if (/name|nome|my name/i.test(allText)) topics.push("personal introduction");
  if (/work|trabalho|worked/i.test(allText)) topics.push("work routine");
  if (/today|hoje/i.test(allText)) topics.push("daily conversation");
  if (/english|inglês|learn/i.test(allText)) topics.push("english goals");

  return {
    summary: allText.slice(0, 1500),
    learnedPhrases: Array.from(new Set(learnedPhrases)).slice(-20),
    mistakes: [],
    corrections: [],
    topics: Array.from(new Set(topics)),
    nextRecommendedStep: "Continue practicing basic English conversation and personal introductions with LIAM."
  };
}

async function updateStudentLearningMemory(userEmail: string, sessionSummary: any) {
  const path = `users/${userEmail}/memory/liveLearningMemory`;
  try {
    const memoryRef = doc(db, "users", userEmail, "memory", "liveLearningMemory");
    const existing = await getDoc(memoryRef);
    const oldMemory = existing.exists() ? existing.data() : {};

    const updatedLearnedPhrases = [
      ...(oldMemory.learnedPhrases || []),
      ...(sessionSummary.learnedPhrases || [])
    ];

    const updatedTopics = [
      ...(oldMemory.topics || []),
      ...(sessionSummary.topics || [])
    ];

    await setDoc(memoryRef, {
      lastUpdatedAt: Date.now(),
      totalLiveSessions: (oldMemory.totalLiveSessions || 0) + 1,
      lastSessionAt: Date.now(),
      learnedPhrases: Array.from(new Set(updatedLearnedPhrases)).slice(-100),
      topics: Array.from(new Set(updatedTopics)).slice(-50),
      recurringMistakes: oldMemory.recurringMistakes || [],
      strengths: oldMemory.strengths || [],
      preferredLanguageSupport: oldMemory.preferredLanguageSupport || "mostly_portuguese",
      conversationSummary: [
        oldMemory.conversationSummary || "",
        sessionSummary.summary || ""
      ].join("\n").slice(-3000),
      nextRecommendedStep: sessionSummary.nextRecommendedStep || oldMemory.nextRecommendedStep || ""
    }, { merge: true });
    
    console.log("[Live] Memória de aprendizado do aluno atualizada com sucesso.");
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

async function finishLiveSession(userEmail: string, sessionId: string) {
  if (!userEmail || !sessionId) return;
  const path = `users/${userEmail}/liveSessions/${sessionId}`;
  try {
    const sessionRef = doc(db, "users", userEmail, "liveSessions", sessionId);
    const sessionDoc = await getDoc(sessionRef);
    if (!sessionDoc.exists()) {
      console.warn("[Live] Documento da sessão não encontrado ao finalizar.");
      return;
    }

    const transcript = sessionDoc.data()?.transcript || [];
    const sessionSummary = generateLocalSessionSummary(transcript);

    await updateDoc(sessionRef, {
      endedAt: Date.now(),
      status: "completed",
      summary: sessionSummary.summary,
      learnedPhrases: sessionSummary.learnedPhrases,
      mistakes: sessionSummary.mistakes,
      corrections: sessionSummary.corrections,
      topics: sessionSummary.topics,
      nextRecommendedStep: sessionSummary.nextRecommendedStep,
      updatedAt: Date.now()
    });

    console.log("[Live] Sessão Live finalizada no Firestore:", sessionId);
    await updateStudentLearningMemory(userEmail, sessionSummary);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

async function loadStudentLearningMemory(userEmail: string): Promise<any> {
  const path = `users/${userEmail}/memory/liveLearningMemory`;
  try {
    const memoryRef = doc(db, "users", userEmail, "memory", "liveLearningMemory");
    const snap = await getDoc(memoryRef);
    if (snap.exists()) {
      console.log("[Live] Memória do aluno carregada com sucesso.");
      return snap.data();
    }
    console.log("[Live] Nenhuma memória anterior do aluno encontrada.");
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

function buildMemoryPromptContext(memory: any) {
  if (!memory) {
    return "This is the student's first recorded Live Mode session.";
  }

  return `
Student learning memory:

Total previous live sessions: ${memory.totalLiveSessions || 0}

Previously learned phrases:
${(memory.learnedPhrases || []).slice(-20).join(", ")}

Recurring mistakes:
${(memory.recurringMistakes || []).slice(-10).join(", ")}

Topics already practiced:
${(memory.topics || []).slice(-10).join(", ")}

Previous conversation summary:
${memory.conversationSummary || ""}

Recommended next step:
${memory.nextRecommendedStep || ""}
`.trim();
}

function buildProfessionalLiamPrompt(profile: any, memoryContext?: string) {
  const studentProfile = buildLiamStudentProfileContext(profile);
  const studentProfileContext = buildLiamStudentPromptContext(studentProfile);
  
  const memorySection = memoryContext ? `
Student Previous History and Learning Memory:
${memoryContext}

Pedagogical memory guidelines:
- You have memory of this student's previous Live Mode practice.
- Use the student's learning memory to continue naturally from previous sessions.
- Do not act as if every session is the first session.
- Review previous phrases when useful.
- If the student already practiced a phrase, either review it briefly or move to the next small step.
- Use recurring mistakes to personalize corrections.
- Never overwhelm the student with the full memory.
- Use memory silently to guide the lesson.
` : "This is the student's first recorded Live Mode session.";

  return `You are LIAM, a premium AI English tutor.

You are teaching a specific student, not a generic user.

Use the student's profile to personalize the class.

Student profile:
${studentProfileContext}

${memorySection}

Teaching rules:

1. Never ask if the student wants to continue, pause, or stop.
   The student will stop by turning off Live Mode manually.

2. Always continue the lesson with the next useful practice step.

3. If the student is beginner, absolute beginner, has weak vocabulary, weak grammar, or fear of speaking, use mostly Portuguese for explanations.

4. For beginner students, teach one tiny phrase at a time.

5. Always explain the meaning of the English phrase in Portuguese.

6. When asking the student to repeat, the target phrase must be in English.

7. Do not overwhelm the student with grammar theory.

8. Do not give long answers.

9. Do not ask many questions at once.

10. Use the student’s goal to choose examples.

11. Use the student’s difficulty to adjust the pace.

12. If the student is embarrassed or afraid to speak, be calm and encouraging.

13. If the student’s goal is personal introductions, prioritize:
- My name is...
- I am from...
- I live in...
- I work with...
- I study English.
- I want to learn English.
- Nice to meet you.
- How are you?
- I’m fine.
- I worked today.

14. If the student says they do not understand, explain in Portuguese and give one simple English phrase.

15. Keep the class active until the user turns off Live Mode.

Important Constraints (Strict):
- You must NEVER end the lesson by yourself.
- Never say the lesson is over.
- Never say "that's all for today" or "por hoje é só".
- Never tell the student to come back another day.
- Never stop giving practice unless the user manually turns off Live Mode.
- After each exercise, correction, or answer, continue with one short next step. Always keep the conversation alive with another small practice opportunity.
- You must NEVER ask student whether they want to continue, stop, take a break or pause. Do not ask "Quer fazer uma pausa?", "Deseja parar?", "Quer continuar?", "Quer tentar mais uma?", "Vamos parar?", "Do you want to continue?", "Should we stop?" etc.
- If the student seems tired, you may say: "Se quiser parar, toque no botão de desligar. Eu posso continuar praticando com você.", but do NOT ask them questions about it and do NOT end the session yourself.
- Keep every spoken response under 25 words whenever possible, keep paragraphs short, and teach one single phrase at a time.`;
}

function sanitizeLiamContinuationText(text: string): string {
  let safe = String(text || "").trim();
  if (!safe) return "";

  const forbiddenPatterns = [
    /quer continuar\??/gi,
    /você quer continuar\??/gi,
    /voce quer continuar\??/gi,
    /quer fazer uma pausa\??/gi,
    /deseja fazer uma pausa\??/gi,
    /quer parar\??/gi,
    /vamos parar\??/gi,
    /vamos encerrar\??/gi,
    /por hoje é só/gi,
    /por hoje e só/gi,
    /até amanhã/gi,
    /ate amanhã/gi,
    /ate amanha/gi,
    /volte outro dia/gi,
    /terminamos por hoje/gi,
    /vamos parar por aqui/gi,
    /encerramos a sessão/gi,
    /aula acabou/gi,
    /sua aula acabou/gi,
    /continua outro dia/gi,
    /continue outro dia/gi,
    /that'?s all for today/gi,
    /come back tomorrow/gi,
    /see you next time/gi,
    /lesson is over/gi,
    /we are done for today/gi,
    /quer praticar mais\??/gi,
    /quer tentar mais uma\??/gi,
    /do you want to continue\??/gi,
    /would you like to continue\??/gi,
    /do you want to take a break\??/gi,
    /should we stop\??/gi
  ];

  let triggered = false;
  forbiddenPatterns.forEach((pattern) => {
    if (pattern.test(safe)) {
      triggered = true;
      safe = safe.replace(pattern, "vamos para a próxima prática");
    }
  });

  if (triggered) {
    console.log("[Live] Frase de encerramento bloqueada e substituída por próxima prática.");
  }

  // Se a resposta ficar vazia, ou estranha/incompleta após sanitização
  if (triggered && (safe.length < 5 || (safe.toLowerCase().includes("vamos para a próxima prática") && safe.length < 40))) {
    safe = "Boa. Vamos para a próxima prática: 'I am ready.' Significa: 'Eu estou pronto.'";
  }

  return safe;
}

function sanitizeLiamEnding(text: string): string {
  return sanitizeLiamContinuationText(text);
}

function float32ToInt16(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16Array;
}

function extractLiamText(response: any): string {
  if (!response) return "";
  return String(
    response.text ||
    response.message ||
    response.reply ||
    response.content ||
    response.transcript ||
    response.output ||
    response.response ||
    ""
  ).trim();
}

const SPEEDS = [0.7, 0.85, 1.0, 1.15, 1.3];

export default function LiveMode() {
  const { profile, user } = useStore();
  
  // liveSessionState
  const [status, setStatus] = useState<
    "idle" | "connecting" | "listening" | "speaking" | "reconnecting" | "error"
  >("idle");
  const [transcript, setTranscript] = useState("");
  const [liamResponse, setLiamResponse] = useState("");
  const [visibleLiamText, setVisibleLiamText] = useState("");

  const [visibleLiveText, setVisibleLiveText] = useState("");
  const [fullLastLiamText, setFullLastLiamText] = useState("");
  const [sessionTranscript, setSessionTranscript] = useState<any[]>([]);
  const [repeatTargetText, setRepeatTargetText] = useState("");
  const [meaningText, setMeaningText] = useState("");
  const [showTranscriptPanel, setShowTranscriptPanel] = useState(false);

  const currentTurnFullTextRef = useRef("");
  const sessionTranscriptRef = useRef<any[]>([]);

  const [voiceSpeed, setVoiceSpeed] = useState<number>(() => {
    const saved = localStorage.getItem("liam_voice_speed");
    return saved ? parseFloat(saved) : 1.0;
  });
  const [isThinking, setIsThinking] = useState(false);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);

  const sessionPromiseRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const nextPlaybackTimeRef = useRef<number>(0);
  
  const reconnectAttemptsRef = useRef(0);
  const isIntentionalStopRef = useRef(false);
  const keepAliveIntervalRef = useRef<number | null>(null);

  const pcmQueueRef = useRef<{ base64: string; mimeType: string }[]>([]);
  const isPlayingQueueRef = useRef<boolean>(false);
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const lastPcmBase64Ref = useRef<string>("");
  const lastPcmMimeTypeRef = useRef<string>("");
  
  const isAiTurnCompleteRef = useRef<boolean>(false);
  const currentTurnPcmChunksRef = useRef<{ base64: string; mimeType: string }[]>([]);
  const lastPcmChunksRef = useRef<{ base64: string; mimeType: string }[]>([]);
  const currentTurnTextRef = useRef<string>("");
  const isPcmPlayingRef = useRef<boolean>(false);
  
  const lastPcmChunkAtRef = useRef<number>(0);
  const turnCompleteFallbackRef = useRef<any>(null);
  const nextPcmStartTimeRef = useRef<number>(0);
  
  const accumulatedAudioBuffersRef = useRef<Float32Array[]>([]);
  const responseTimeoutRef = useRef<number | null>(null);
  
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const activePcmSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const speedChangeInProgressRef = useRef<boolean>(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const isSpeakingRef = useRef<boolean>(false);
  const lastLiamTextRef = useRef<string>("");
  const lastAudioUrlRef = useRef<string>("");
  const playbackIdRef = useRef<number>(0);
  const voiceSpeedRef = useRef<number>(
    parseFloat(localStorage.getItem("liam_voice_speed") || "1.0")
  );
  const lastPlayRequestAtRef = useRef<number>(0);
  const isReleasedRef = useRef<boolean>(true);
  const isConnectingRef = useRef<boolean>(false);
  
  const currentLiveSessionIdRef = useRef<string>("");
  const studentMemoryContextRef = useRef<string>("");

  const canStartPlayback = () => {
    const now = Date.now();
    if (now - lastPlayRequestAtRef.current < 300) {
      console.warn("[Live] Reprodução bloqueada por debounce.");
      return false;
    }
    lastPlayRequestAtRef.current = now;
    return true;
  };

  const releaseMicrophoneIfNeeded = () => {
    if (!isThinking && !isSpeakingRef.current) {
      if (!isReleasedRef.current) {
        isReleasedRef.current = true;
        console.log("[Live] Microfone liberado");
      }
    }
  };

  const stopAllLiamAudio = () => {
    console.log("[Live] Parando áudio anterior");
    
    playbackIdRef.current += 1;

    // Reset PCM states
    pcmQueueRef.current = [];
    isPcmPlayingRef.current = false;
    isPlayingQueueRef.current = false;
    nextPcmStartTimeRef.current = 0;
    lastPcmChunkAtRef.current = 0;

    if (turnCompleteFallbackRef.current) {
      clearTimeout(turnCompleteFallbackRef.current);
      turnCompleteFallbackRef.current = null;
    }

    // Stop all Web Audio active sources
    if (activeSourcesRef.current.length > 0) {
      activeSourcesRef.current.forEach((src) => {
        try {
          src.stop();
        } catch (e) {
          // Ignore
        }
      });
      activeSourcesRef.current = [];
    }
    activePcmSourcesRef.current.clear();

    if (currentAudioSourceRef.current) {
      try {
        currentAudioSourceRef.current.stop();
      } catch (e) {}
      try {
        currentAudioSourceRef.current.disconnect();
      } catch (e) {}
      currentAudioSourceRef.current = null;
    }

    // Stop any HTMLAudioElement references if any are introduced
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        currentAudioRef.current.onended = null;
        currentAudioRef.current.onerror = null;
        currentAudioRef.current.src = "";
      } catch (e) {}
      currentAudioRef.current = null;
    }

    // Cancel SpeechSynthesis
    if (window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }

    currentUtteranceRef.current = null;
    isSpeakingRef.current = false;
  };

  const finalizeLiamTurn = () => {
    console.log("[Live] Finalizando turno do LIAM.");

    const rawText = normalizeTranscriptText(currentTurnFullTextRef.current);
    const fullText = sanitizeLiamEnding(rawText);
    if (fullText) {
      lastLiamTextRef.current = fullText;
      setFullLastLiamText(fullText);

      sessionTranscriptRef.current.push({
        role: "liam",
        text: fullText,
        visibleText: getSmartVisibleText(fullText),
        createdAt: Date.now()
      });
      setSessionTranscript([...sessionTranscriptRef.current]);
      console.log("[Live] Transcrição completa salva no histórico.");

      const targetEmailAddress = profile?.email || user?.email || "";
      if (targetEmailAddress && currentLiveSessionIdRef.current) {
        saveLiveMessage({
          userEmail: targetEmailAddress,
          sessionId: currentLiveSessionIdRef.current,
          role: "liam",
          text: fullText,
          visibleText: getSmartVisibleText(fullText),
          repeatTarget: extractRepeatTarget(fullText),
          meaning: extractMeaning(fullText)
        }).catch((e) => console.error("[Live] Erro ao salvar mensagem do LIAM:", e));
      }
    }

    lastPcmChunksRef.current = [...currentTurnPcmChunksRef.current];

    currentTurnFullTextRef.current = "";
    currentTurnPcmChunksRef.current = [];
    currentTurnTextRef.current = "";
    isAiTurnCompleteRef.current = false;

    isSpeakingRef.current = false;
    setStatus("listening");

    releaseMicrophoneIfNeeded();
    console.log("[Live] Turno finalizado.");
    console.log("[Live] Aguardando próxima fala do aluno.");
  };

  const playSinglePcmChunk = async (base64: string, mimeType: string, speed = 1): Promise<void> => {
    try {
      const rateMatch = String(mimeType || "").match(/rate=(\d+)/);
      const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;

      const audioContext = audioContextRef.current || new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = audioContext;

      if (audioContext.state === "suspended") {
        await audioContext.resume().catch((err) => console.error("[Audio] Erro ao retomar AudioContext:", err));
      }

      console.log("[Live] AudioContext state:", audioContext.state);
      if (audioContext.state !== "running") {
        console.warn("[Live] AudioContext não está ativo. Som pode não sair.");
      }

      const arrayBuffer = base64ToArrayBuffer(base64);
      // Use the safe DataView conversion!
      const audioBuffer = pcm16ToAudioBufferSafe(arrayBuffer, sampleRate, audioContext);

      // Analyze RMS Volume
      const rms = calculateRms(audioBuffer);
      console.log("[Live] PCM analisado:", {
        duration: audioBuffer.duration,
        rms,
        sampleRate
      });

      if (audioBuffer.duration < 0.05 || rms < 0.001) {
        console.warn("[Live] PCM recebido muito curto ou volume silencioso, ignorando chunk silencioso.", audioBuffer.duration, rms);
        return;
      }

      // Save to currentTurnPcmChunks
      currentTurnPcmChunksRef.current.push({ base64, mimeType });

      // Accumulate Float32 values for replay/repeat button
      const channelData = audioBuffer.getChannelData(0);
      const float32Clone = new Float32Array(channelData);
      accumulatedAudioBuffersRef.current.push(float32Clone);

      // Save last PCM info
      lastPcmMimeTypeRef.current = mimeType || "audio/pcm;rate=24000";
      lastPcmBase64Ref.current = base64;

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = speed;

      activePcmSourcesRef.current.add(source);

      // Create Gain Node to amplify by 1.5x as requested in PART 7
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 1.5;

      source.connect(gainNode);
      gainNode.connect(audioContext.destination);

      currentAudioSourceRef.current = source;
      isSpeakingRef.current = true;
      setStatus("speaking");
      isReleasedRef.current = false;

      source.onended = () => {
        activePcmSourcesRef.current.delete(source);
        activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
        if (currentAudioSourceRef.current === source) {
          currentAudioSourceRef.current = null;
        }
        
        // If everything has completed playing, clean up the turn
        if (activeSourcesRef.current.length === 0 && pcmQueueRef.current.length === 0 && isAiTurnCompleteRef.current) {
          console.log("[Live] Todos os chunks finalizaram a reprodução física. Finalizando turno do LIAM.");
          finalizeLiamTurn();
        }
      };

      if (Array.isArray(activeSourcesRef.current)) {
        activeSourcesRef.current.push(source);
      }

      // Schedule gapless timeline playback as requested in PART 9
      const now = audioContext.currentTime;
      const startAt = Math.max(now, nextPcmStartTimeRef.current);
      
      source.start(startAt);
      nextPcmStartTimeRef.current = startAt + (audioBuffer.duration / speed);
      
      console.log("[Live] PCM chunk agendado para tocar no AudioContext em:", startAt);
    } catch (err) {
      console.error("[Live] Erro ao reproduzir playSinglePcmChunk:", err);
    }
  };

  const playPcmBase64Audio = async (base64: string, mimeType: string, speed = 1) => {
    await playSinglePcmChunk(base64, mimeType, speed);
  };

  const processPcmQueue = async () => {
    if (isPlayingQueueRef.current) return;
    isPlayingQueueRef.current = true;

    try {
      while (pcmQueueRef.current.length > 0) {
        const nextChunk = pcmQueueRef.current.shift();
        if (nextChunk) {
          await playSinglePcmChunk(nextChunk.base64, nextChunk.mimeType, voiceSpeedRef.current);
        }
      }
      
      // If the queue is depleted, check if the turn is complete but no source is active/playing
      if (pcmQueueRef.current.length === 0 && isAiTurnCompleteRef.current && activeSourcesRef.current.length === 0) {
        console.log("[Live] Fila vazia e turno concluído pelo turnComplete.");
        finalizeLiamTurn();
      }
    } catch (error) {
      console.error("[Live] Erro ao processar fila PCM:", error);
    } finally {
      isPlayingQueueRef.current = false;
    }
  };

  const playLiamSpeech = async (options: { text?: string; audioUrl?: string; reason?: string } = {}) => {
    const text = options.text;
    const audioUrl = options.audioUrl;
    const reason = options.reason || "normal";

    const safeText = String(text || "").trim();
    const safeAudioUrl = String(audioUrl || "").trim();

    console.log("[Live] playLiamSpeech chamado:", {
      hasText: Boolean(safeText),
      textLength: safeText.length,
      hasAudioUrl: Boolean(safeAudioUrl),
      reason,
      accumulatedBuffers: accumulatedAudioBuffersRef.current.length
    });

    if (!safeText && !safeAudioUrl && accumulatedAudioBuffersRef.current.length === 0) {
      console.warn("[Live] Nenhum texto ou áudio disponível para reproduzir.");
      return;
    }

    if (!canStartPlayback()) {
      return;
    }

    if (safeText) {
      lastLiamTextRef.current = safeText;
    }
    if (safeAudioUrl) {
      lastAudioUrlRef.current = safeAudioUrl;
    }

    stopAllLiamAudio();

    const thisPlaybackId = ++playbackIdRef.current;
    isSpeakingRef.current = true;
    isReleasedRef.current = false;
    setStatus("speaking");

    const speed = voiceSpeedRef.current || 1;
    console.log(`[Live] Reproduzindo fala do LIAM na velocidade ${speed}x. Motivo: ${reason}`);
    console.log("[Live] Texto extraído para fala:", safeText);
    console.log("[Live] Audio URL extraído:", safeAudioUrl);

    // CASE 1: HTML Audio URL (if some other files use it)
    if (safeAudioUrl) {
      try {
        const audio = new Audio(safeAudioUrl);
        currentAudioRef.current = audio;
        audio.playbackRate = speed;
        audio.volume = 1;
        audio.muted = false;

        audio.onloadedmetadata = () => {
          console.log("[Live] Áudio carregado:", {
            duration: audio.duration,
            src: audio.src
          });
        };

        audio.onplay = () => {
          console.log("[Live] Áudio realmente começou a tocar.");
        };

        audio.onended = () => {
          if (thisPlaybackId !== playbackIdRef.current) return;
          console.log("[Live] Reprodução finalizada");
          isSpeakingRef.current = false;
          currentAudioRef.current = null;
          setStatus("listening");
          releaseMicrophoneIfNeeded();
        };

        audio.onerror = (error) => {
          console.error("[Live] Erro real ao tocar áudio:", error);
          if (thisPlaybackId !== playbackIdRef.current) return;
          isSpeakingRef.current = false;
          currentAudioRef.current = null;
          setStatus("listening");
          releaseMicrophoneIfNeeded();
        };

        try {
          await audio.play();
        } catch (error) {
          console.error("[Live] audio.play() falhou:", error);
          if (thisPlaybackId !== playbackIdRef.current) return;
          isSpeakingRef.current = false;
          currentAudioRef.current = null;
          setStatus("listening");
          releaseMicrophoneIfNeeded();
        }
        return;
      } catch (err) {
        console.error("[Live] Falha ao reproduzir HTML Audio:", err);
      }
    }

    // CASE 2: Web Audio API accumulated audio buffers
    if (accumulatedAudioBuffersRef.current.length > 0) {
      try {
        if (!audioContextRef.current || audioContextRef.current.state === "closed") {
          audioContextRef.current = new (
            window.AudioContext || (window as any).webkitAudioContext
          )({ sampleRate: 24000 });
        }
        if (audioContextRef.current.state === "suspended") {
          await audioContextRef.current.resume();
        }

        const chunks = accumulatedAudioBuffersRef.current;
        const totalLength = chunks.reduce((acc, val) => acc + val.length, 0);
        const concatenated = new Float32Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          concatenated.set(chunk, offset);
          offset += chunk.length;
        }

        const audioBuffer = audioContextRef.current.createBuffer(1, concatenated.length, 24000);
        audioBuffer.getChannelData(0).set(concatenated);

        const pSource = audioContextRef.current.createBufferSource();
        pSource.buffer = audioBuffer;
        pSource.playbackRate.value = speed;
        pSource.connect(audioContextRef.current.destination);

        activeSourcesRef.current.push(pSource);

        console.log("[Live] PCM áudio realmente começou a tocar", {
          sampleRate: 24000,
          duration: audioBuffer.duration,
          speed
        });
        pSource.start(0);

        pSource.onended = () => {
          activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== pSource);
          if (thisPlaybackId === playbackIdRef.current) {
            isSpeakingRef.current = false;
            setStatus("listening");
            console.log("[Live] Reprodução finalizada");
            releaseMicrophoneIfNeeded();
          }
        };
        return;
      } catch (err) {
        console.error("[Live] Falha ao reproduzir buffer acumulado:", err);
      }
    }

    // CASE 3: Speech Synthesis fallback
    if (safeText && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
        const cleanText = safeText.replace(/[*#_`~[\]()]/g, "");
        const utterance = new SpeechSynthesisUtterance(cleanText);
        currentUtteranceRef.current = utterance;

        utterance.lang = "en-US";
        utterance.rate = speed;
        utterance.pitch = 1;
        utterance.volume = 1;

        utterance.onstart = () => {
          console.log("[Live] SpeechSynthesis realmente começou a falar.");
        };

        utterance.onend = () => {
          if (thisPlaybackId !== playbackIdRef.current) return;
          console.log("[Live] SpeechSynthesis finalizado.");
          isSpeakingRef.current = false;
          currentUtteranceRef.current = null;
          setStatus("listening");
          releaseMicrophoneIfNeeded();
        };

        utterance.onerror = (error) => {
          console.error("[Live] Erro no SpeechSynthesis:", error);
          if (thisPlaybackId !== playbackIdRef.current) return;
          isSpeakingRef.current = false;
          currentUtteranceRef.current = null;
          setStatus("listening");
          releaseMicrophoneIfNeeded();
        };

        console.log("[Live] Usando SpeechSynthesis com texto:", safeText);
        window.speechSynthesis.speak(utterance);
        return;
      } catch (err) {
        console.error("[Live] SpeechSynthesis error:", err);
      }
    }

    console.warn("[Live] Nenhum método de fala disponível.");
    setStatus("listening");
    isSpeakingRef.current = false;
    releaseMicrophoneIfNeeded();
  };

  const updateVoiceSpeed = (newSpeed: number) => {
    speedChangeInProgressRef.current = true;
    const speed = Math.max(0.7, Math.min(1.3, newSpeed));

    voiceSpeedRef.current = speed;
    setVoiceSpeed(speed);
    localStorage.setItem("liam_voice_speed", String(speed));

    console.log(`[Live] Velocidade alterada para ${speed}x`);

    // Se estiver tocando HTMLAudioElement, aplicar em tempo real
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.playbackRate = speed;
      } catch {}
      console.log("[Live] PlaybackRate aplicado em tempo real no áudio atual");
    }

    // Aplicar em todos os chunks atuais/agendados
    activePcmSourcesRef.current.forEach((source) => {
      try {
        source.playbackRate.setValueAtTime(
          speed,
          audioContextRef.current?.currentTime || 0
        );
      } catch {
        try {
          source.playbackRate.value = speed;
        } catch {}
      }
    });

    console.log("[Live] Velocidade aplicada nos chunks ativos/agendados.");

    setTimeout(() => {
      speedChangeInProgressRef.current = false;
    }, 300);
  };

  const decreaseSpeed = () => {
    try {
      const currentSpeed = voiceSpeedRef.current;
      if (typeof currentSpeed !== "number" || isNaN(currentSpeed)) {
        console.warn("[Live] currentSpeed is not a number", currentSpeed);
        return;
      }
      if (Array.isArray(SPEEDS)) {
        const val = typeof currentSpeed === "number" ? currentSpeed : Number(currentSpeed);
        const currentIndex = !isNaN(val) ? SPEEDS.indexOf(val) : -1;
        if (currentIndex > 0) {
          const newSpeed = SPEEDS[currentIndex - 1];
          updateVoiceSpeed(newSpeed);
        }
      }
    } catch (error) {
      console.error("[Live] Erro no decreaseSpeed:", error);
    }
  };

  const increaseSpeed = () => {
    try {
      const currentSpeed = voiceSpeedRef.current;
      if (typeof currentSpeed !== "number" || isNaN(currentSpeed)) {
        console.warn("[Live] currentSpeed is not a number", currentSpeed);
        return;
      }
      if (Array.isArray(SPEEDS)) {
        const val = typeof currentSpeed === "number" ? currentSpeed : Number(currentSpeed);
        const currentIndex = !isNaN(val) ? SPEEDS.indexOf(val) : -1;
        if (currentIndex < SPEEDS.length - 1) {
          const newSpeed = SPEEDS[currentIndex + 1];
          updateVoiceSpeed(newSpeed);
        }
      }
    } catch (error) {
      console.error("[Live] Erro no increaseSpeed:", error);
    }
  };

  // To restore context during reconnect
  const lastTranscriptRef = useRef("");
  const lastResponseRef = useRef("");

  const stopSession = useCallback(() => {
    console.log("[Live] Usuário desligou o modo Live manualmente.");
    console.log("[Live] Sessão Live encerrada pelo usuário.");
    isIntentionalStopRef.current = true;

    // Save history and finish session in Firestore
    const targetEmailAddress = profile?.email || user?.email || "";
    if (targetEmailAddress && currentLiveSessionIdRef.current) {
      console.log("[Live] Finalizando gravação da sessão e atualizando memória de aprendizado...");
      finishLiveSession(targetEmailAddress, currentLiveSessionIdRef.current)
        .then(() => {
          currentLiveSessionIdRef.current = "";
        })
        .catch((e) => console.error("[Live] Erro ao finalizar sessão no Firestore:", e));
    }

    if (responseTimeoutRef.current) {
      clearTimeout(responseTimeoutRef.current);
      responseTimeoutRef.current = null;
    }
    setIsThinking(false);
    accumulatedAudioBuffersRef.current = [];
    stopAllLiamAudio();
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current
        .then((session: any) => session.close())
        .catch(() => {});
      sessionPromiseRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (micContextRef.current) {
      micContextRef.current.close().catch(() => {});
      micContextRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current);
      keepAliveIntervalRef.current = null;
    }
    setStatus("idle");
    
    // Check if an update was paused
    if ((window as any).deferredSWUpdate) {
       console.log("Applying deferred PWA update...");
       (window as any).deferredSWUpdate();
       (window as any).deferredSWUpdate = null;
    }
  }, [profile, user]);

  // Alert message auto-cleanup
  useEffect(() => {
    if (alertMsg) {
      const timer = setTimeout(() => {
        setAlertMsg(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [alertMsg]);

  // Use page visibility API and Capacitor App state to avoid drops when tab is backgrounded
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
         console.log("App backgrounded. Pausing visual updates but keeping audio alive.");
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    
    // Capacitor specific listener
    let appStateListener: any = null;
    const setupCapacitor = async () => {
       try {
           appStateListener = await App.addListener('appStateChange', ({ isActive }) => {
              console.log('App state changed. Is active?', isActive);
              if (isActive) {
                 if (audioContextRef.current && audioContextRef.current.state === "suspended") {
                    audioContextRef.current.resume().catch(() => {});
                 }
              }
           });
       } catch (err) {
           console.log("Capacitor App plugin not available (probably running in browser).");
       }
    };
    setupCapacitor();
    
    // Check if there was an unexpected reload
    const didReload = sessionStorage.getItem("live_active_reload");
    if (didReload) {
      console.warn("live_unexpected_reload_detected");
      setStatus("reconnecting");
      setTimeout(() => {
          connectToGemini(true);
      }, 1000);
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (appStateListener) {
          appStateListener.remove().catch(() => {});
      }
      stopSession(); // Cleanup on unmount
    };
  }, [stopSession]);
  
  // Update last pointers for reconnections
  useEffect(() => {
    if (transcript) lastTranscriptRef.current = transcript;
    if (liamResponse) lastResponseRef.current = liamResponse;
  }, [transcript, liamResponse]);
  
  // Track state for unexpected reload detection
  useEffect(() => {
    if (status !== "idle" && status !== "error") {
      sessionStorage.setItem("live_active_reload", "true");
    } else {
      sessionStorage.removeItem("live_active_reload");
    }
  }, [status]);

  const connectToGemini = async (isReconnect = false) => {
    try {
      if (!isReconnect) {
        console.log("live_session_started");
        setStatus("connecting");
        reconnectAttemptsRef.current = 0;
      } else {
        console.log("live_reconnect_started", `Attempt ${reconnectAttemptsRef.current}`);
        setStatus("reconnecting");
      }
      
      isIntentionalStopRef.current = false;

      // Clean up previous contexts just in case
      if (sessionPromiseRef.current) {
         // Prevent onclose from triggering loop
         const oldPromise = sessionPromiseRef.current;
         oldPromise.then((session: any) => {
             // Nullify callbacks if possible, or we just rely on oldPromise check
             session.close();
         }).catch(() => {});
         sessionPromiseRef.current = null;
      }
      if (micContextRef.current) micContextRef.current.close().catch(() => {});
      if (processorRef.current) processorRef.current.disconnect();

      if (!audioContextRef.current || audioContextRef.current.state === "closed") {
        audioContextRef.current = new (
          window.AudioContext || (window as any).webkitAudioContext
        )({ sampleRate: 24000 });
      }
      if (audioContextRef.current.state === "suspended") {
          audioContextRef.current.resume();
      }
      nextPlaybackTimeRef.current = audioContextRef.current.currentTime;

      micContextRef.current = new (
        window.AudioContext || (window as any).webkitAudioContext
      )({ sampleRate: 16000 });

      if (!mediaStreamRef.current || !mediaStreamRef.current.active) {
         mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
           audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
         });
      }

      const source = micContextRef.current.createMediaStreamSource(
        mediaStreamRef.current,
      );
      processorRef.current = micContextRef.current.createScriptProcessor(
        4096,
        1,
        1,
      );

      processorRef.current.onaudioprocess = (e) => {
        try {
          if (!sessionPromiseRef.current || status === "speaking" || isThinking) return;
          const inputData = e.inputBuffer.getChannelData(0);
          const int16Data = float32ToInt16(inputData);
          const base64Data = arrayBufferToBase64(int16Data.buffer as ArrayBuffer);

          sessionPromiseRef.current.then((session: any) => {
            try {
              session.sendRealtimeInput({
                audio: { data: base64Data, mimeType: "audio/pcm;rate=16000" },
              });
            } catch (error) {
                // Ignore standard sending errors unless connection is closed
            }
          }).catch(() => {});
        } catch (error) {
          console.error("[Live] Erro no onaudioprocess:", error);
        }
      };

      source.connect(processorRef.current);
      processorRef.current.connect(micContextRef.current.destination);

      let systemInstruction = buildProfessionalLiamPrompt(profile, studentMemoryContextRef.current);
      
      // Inject context if we are reconnecting
      if (isReconnect && (lastTranscriptRef.current || lastResponseRef.current)) {
          systemInstruction += `\n\n[SYSTEM NOTICE: The connection was briefly interrupted. Pick up where we left off. The user's last message was "${lastTranscriptRef.current}". Your last response was "${lastResponseRef.current}". Do not apologize for the disconnection.]\n`;
      }

      const currentAi = getAiInstance();
      const currentPromise = currentAi.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } },
          },
          systemInstruction: systemInstruction,
          tools: [
            {
              functionDeclarations: [
                {
                  name: "save_student_error",
                  description:
                    "Saves a recurring error from the student (grammar, pronunciation, or vocabulary).",
                  parameters: {
                    type: "OBJECT" as any,
                    properties: {
                      category: {
                        type: "STRING" as any,
                        description: "grammar, pronunciation, or vocabulary",
                      },
                      description: {
                        type: "STRING" as any,
                        description: "Detailed description of the error.",
                      },
                    },
                    required: ["category", "description"],
                  },
                },
              ],
            },
          ],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            try {
              if (sessionPromiseRef.current !== currentPromise) return;
              console.log("live_connected");
              if (isReconnect) {
                  console.log("live_reconnect_success");
                  console.log("live_session_restored");
              }
              setStatus("listening");
              console.log("[Live] Sessão live conectada");
              console.log("[Live] Aguardando fala do aluno");
              
              reconnectAttemptsRef.current = 0; // reset on success

              const targetUserId = profile?.userId || user?.uid || profile?.email || user?.email || "";
              if (targetUserId && targetUserId.trim() !== "" && !isReconnect) {
                updateDoc(doc(db, "users", targetUserId), {
                  points: increment(2),
                  liveSessions: increment(1),
                }).catch((e) => console.error("[Live] Erro ao incrementar estatísticas do usuário:", e));
              } else {
                console.warn("[Live] Não foi possível atualizar estatísticas: targetUserId inválido ou nulo");
              }
              
              // Setup Keep-Alive heartbeat
              if (keepAliveIntervalRef.current) clearInterval(keepAliveIntervalRef.current);
              keepAliveIntervalRef.current = window.setInterval(() => {
                  if (sessionPromiseRef.current === currentPromise && mediaStreamRef.current?.active) {
                      console.log("live_keep_alive_ok");
                  } else if (!isIntentionalStopRef.current && sessionPromiseRef.current === currentPromise) {
                      console.warn("live_connection_lost heartbeat mismatch");
                      handleUnexpectedDrop();
                  }
              }, 25000);
            } catch (error) {
              console.error("[Live] Erro interno no callback onopen:", error);
            }
          },
          onmessage: (message: any) => {
            try {
              if (isIntentionalStopRef.current || sessionPromiseRef.current !== currentPromise) return;

              const textVal = message?.clientContent?.modelTurn?.parts?.[0]?.text;
              if (textVal) {
                const safeTextVal = String(textVal || "");
                setTranscript(safeTextVal);
                console.log("[Live] Áudio capturado:", safeTextVal);
                console.log("[Live] Enviando mensagem para IA");

                // Save student's turn into session transcript
                sessionTranscriptRef.current.push({
                  role: "student",
                  text: safeTextVal,
                  createdAt: Date.now()
                });
                setSessionTranscript([...sessionTranscriptRef.current]);

                const targetEmailAddress = profile?.email || user?.email || "";
                if (targetEmailAddress && currentLiveSessionIdRef.current) {
                  saveLiveMessage({
                    userEmail: targetEmailAddress,
                    sessionId: currentLiveSessionIdRef.current,
                    role: "student",
                    text: safeTextVal
                  }).catch((e) => console.error("[Live] Erro ao salvar mensagem do aluno:", e));
                }
                
                // Prepare for new response
                setLiamResponse("");
                setVisibleLiamText("");
                setVisibleLiveText("");
                setRepeatTargetText("");
                setMeaningText("");
                accumulatedAudioBuffersRef.current = [];
                lastLiamTextRef.current = "";
                lastAudioUrlRef.current = "";
                isReleasedRef.current = false;
                setIsThinking(true);

                isAiTurnCompleteRef.current = false;
                currentTurnPcmChunksRef.current = [];
                currentTurnTextRef.current = "";
                currentTurnFullTextRef.current = "";
                pcmQueueRef.current = [];
                nextPcmStartTimeRef.current = 0; // Reset scheduling timeline for new turn
                
                if (turnCompleteFallbackRef.current) {
                  clearTimeout(turnCompleteFallbackRef.current);
                  turnCompleteFallbackRef.current = null;
                }

                // Clear previous timeout
                if (responseTimeoutRef.current) {
                  clearTimeout(responseTimeoutRef.current);
                }
                
                // Start 20s timeout
                responseTimeoutRef.current = window.setTimeout(() => {
                  try {
                    console.warn("[Live] Timeout de resposta");
                    console.log("[Live] Microfone liberado após erro");
                    setIsThinking(false);
                    setStatus("listening");
                    setAlertMsg("Demorou um pouco. Tente falar novamente.");
                    if (responseTimeoutRef.current) {
                      clearTimeout(responseTimeoutRef.current);
                      responseTimeoutRef.current = null;
                    }
                  } catch (timeoutErr) {
                    console.error("[Live] Erro no timeout handler:", timeoutErr);
                  }
                }, 20000);
              }

              const serverContent = message?.serverContent;
              if (serverContent) {
                // Save output transcription text if provided
                const partialText = String(serverContent?.outputTranscription?.text || "").trim();
                if (partialText) {
                  const rawAppended1 = normalizeTranscriptText(
                    currentTurnFullTextRef.current + " " + partialText
                  );
                  currentTurnFullTextRef.current = sanitizeLiamEnding(rawAppended1);

                  currentTurnTextRef.current = currentTurnFullTextRef.current;
                  lastLiamTextRef.current = currentTurnFullTextRef.current;
                  setFullLastLiamText(currentTurnFullTextRef.current);

                  const smartVis = getSmartVisibleText(currentTurnFullTextRef.current);
                  setVisibleLiveText(smartVis);
                  setVisibleLiamText(smartVis);
                  setLiamResponse(smartVis);

                  const repeatTarget = extractRepeatTarget(currentTurnFullTextRef.current);
                  setRepeatTargetText(repeatTarget);

                  const meaning = extractMeaning(currentTurnFullTextRef.current);
                  setMeaningText(meaning);

                  console.log("[Live] Texto completo interno atualizado:", currentTurnFullTextRef.current);
                  console.log("[Live] Texto visível curto:", smartVis);
                  if (repeatTarget) console.log("[Live] Frase para repetir:", repeatTarget);
                  if (meaning) console.log("[Live] Significado:", meaning);
                }

                const isTurnComplete = serverContent?.turnComplete === true;
                if (isTurnComplete) {
                  console.log("[Live] Turno finalizado por turnComplete");
                  isAiTurnCompleteRef.current = true;
                  processPcmQueue();
                }
              }

              if (message?.serverContent?.modelTurn) {
                // Received something from server, so clear the timeout & thinking spinner
                if (responseTimeoutRef.current) {
                  clearTimeout(responseTimeoutRef.current);
                  responseTimeoutRef.current = null;
                }
                setIsThinking(false);

                const parts = message?.serverContent?.modelTurn?.parts;
                if (parts && Array.isArray(parts)) {
                  parts.forEach((p: any) => {
                    try {
                      // 1. Accumulate text from any part
                      if (p?.text) {
                        const safeModelText = String(p.text || "");
                        const rawAppended2 = normalizeTranscriptText(
                          currentTurnFullTextRef.current + " " + safeModelText
                        );
                        currentTurnFullTextRef.current = sanitizeLiamEnding(rawAppended2);

                        currentTurnTextRef.current = currentTurnFullTextRef.current;
                        lastLiamTextRef.current = currentTurnFullTextRef.current;
                        setFullLastLiamText(currentTurnFullTextRef.current);

                        const smartVis = getSmartVisibleText(currentTurnFullTextRef.current);
                        setVisibleLiveText(smartVis);
                        setVisibleLiamText(smartVis);
                        setLiamResponse(smartVis);

                        const repeatTarget = extractRepeatTarget(currentTurnFullTextRef.current);
                        setRepeatTargetText(repeatTarget);

                        const meaning = extractMeaning(currentTurnFullTextRef.current);
                        setMeaningText(meaning);

                        console.log("[Live] Texto completo interno atualizado (part):", currentTurnFullTextRef.current);
                        console.log("[Live] Texto visível curto:", smartVis);
                        if (repeatTarget) console.log("[Live] Frase para repetir:", repeatTarget);
                        if (meaning) console.log("[Live] Significado:", meaning);
                      }

                      // 2. Handle tool calls (save_student_error) from any part
                      if (p?.functionCall && p.functionCall.name === "save_student_error") {
                        const args = p.functionCall.args;
                        const targetUserId = profile?.userId || user?.uid || profile?.email || user?.email || "";
                        if (args && targetUserId && targetUserId.trim() !== "") {
                          updateDoc(doc(db, "users", targetUserId), {
                            savedErrors: arrayUnion({
                              category: args.category,
                              description: args.description,
                              date: Date.now(),
                            }),
                          }).catch((e) => console.error("[Live] Erro ao salvar erro do aluno no Firebase:", e));
                        } else {
                          console.warn("[Live] Não foi possível salvar erro do aluno - ID inválido:", targetUserId);
                        }

                        if (sessionPromiseRef.current) {
                          sessionPromiseRef.current.then((session: any) => {
                            try {
                              session.send({
                                toolResponse: {
                                  functionResponses: [{
                                      name: p.functionCall.name,
                                      id: p.functionCall.id,
                                      response: { result: "saved successfully" },
                                    }],
                                  },
                                });
                            } catch (sendErr) {
                              console.error("[Live] Erro ao enviar resposta da ferramenta:", sendErr);
                            }
                          }).catch(() => {});
                        }
                      }

                      // 3. Play base64 audio stream chunk from any part
                      const base64Audio = p?.inlineData?.data;
                      if (base64Audio) {
                        console.log("[Live] Chunk PCM recebido");
                        pcmQueueRef.current.push({
                          base64: base64Audio,
                          mimeType: p?.inlineData?.mimeType || "audio/pcm;rate=24000"
                        });
                        
                        // Update last chunk timestamp
                        lastPcmChunkAtRef.current = Date.now();
                        
                        // Silence timeout fallback to finalize turn (Part 11)
                        if (turnCompleteFallbackRef.current) {
                          clearTimeout(turnCompleteFallbackRef.current);
                        }
                        
                        turnCompleteFallbackRef.current = window.setTimeout(() => {
                          if (pcmQueueRef.current.length === 0 && activeSourcesRef.current.length === 0) {
                            console.log("[Live] Turno finalizado por fallback de silêncio.");
                            finalizeLiamTurn();
                          }
                        }, 1200);

                        processPcmQueue();
                      }
                    } catch (pErr) {
                      console.error("[Live] Erro ao iterar no part:", pErr);
                    }
                  });
                }
              }

              if (message?.serverContent?.interrupted) {
                console.log("[Live] Cancelando reprodução atual devido a interrupção.");
                pcmQueueRef.current = [];
                isPlayingQueueRef.current = false;
                stopAllLiamAudio();
                
                if (audioContextRef.current) {
                  audioContextRef.current.close().catch(() => {});
                  audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
                  nextPcmStartTimeRef.current = 0;
                }
                
                if (turnCompleteFallbackRef.current) {
                  clearTimeout(turnCompleteFallbackRef.current);
                  turnCompleteFallbackRef.current = null;
                }
                
                setStatus("listening");
                setLiamResponse("");
                setVisibleLiamText("");
                setVisibleLiveText("");
                setRepeatTargetText("");
                setMeaningText("");
                currentTurnFullTextRef.current = "";
                accumulatedAudioBuffersRef.current = [];

                isAiTurnCompleteRef.current = false;
                currentTurnPcmChunksRef.current = [];
                currentTurnTextRef.current = "";
                isPcmPlayingRef.current = false;
              }
            } catch (error) {
              console.error("[Live] Erro interno no processamento de mensagens:", error);
            }
          },
          onerror: (err: any) => {
            try {
              if (isIntentionalStopRef.current || sessionPromiseRef.current !== currentPromise) return;
              console.error("live_error_caught", err);
              handleUnexpectedDrop();
            } catch (error) {
              console.error("[Live] Erro interno no callback onerror:", error);
            }
          },
          onclose: () => {
            try {
              if (isIntentionalStopRef.current || sessionPromiseRef.current !== currentPromise) return;
              console.warn("live_connection_lost onClose called");
              handleUnexpectedDrop();
            } catch (error) {
              console.error("[Live] Erro interno no callback onclose:", error);
            }
          },
        },
      });
      sessionPromiseRef.current = currentPromise;
    } catch (err) {
      console.error("live_error_caught connection failed", err);
      handleUnexpectedDrop();
    }
  };

  const handleUnexpectedDrop = () => {
      if (isIntentionalStopRef.current) return;
      
      // Stop current processors but keep it simple
      if (processorRef.current) {
         processorRef.current.disconnect();
         processorRef.current = null;
      }
      
      if (reconnectAttemptsRef.current < 3) {
          reconnectAttemptsRef.current++;
          setStatus("reconnecting");
          setTimeout(() => {
              if (!isIntentionalStopRef.current) {
                  connectToGemini(true);
              }
          }, 2000 * reconnectAttemptsRef.current); // Backoff 2s, 4s, 6s
      } else {
          console.warn("live_reconnect_failed after 3 attempts");
          setStatus("error");
          stopSession();
      }
  };

  const replayLastLiamSpeech = () => {
    console.log("[Live] Repetir clicado");

    if (speedChangeInProgressRef.current) {
      console.warn("[Live] Replay bloqueado porque a ação foi apenas mudança de velocidade.");
      return;
    }

    const text = (lastLiamTextRef.current || "").trim();
    const audioUrl = (lastAudioUrlRef.current || "").trim();

    // Prioritize playing the saved sequential PCM chunks from last turn
    if (lastPcmChunksRef.current.length > 0) {
      console.log("[Live] Repetindo usando chunks PCM salvos.");
      // Stop any other sound and reset queue state safely
      stopAllLiamAudio();
      pcmQueueRef.current = [...lastPcmChunksRef.current];
      isAiTurnCompleteRef.current = true;
      isPcmPlayingRef.current = false;
      isPlayingQueueRef.current = false;
      processPcmQueue();
      return;
    }

    // Prioritize playing the accumulated PCM base64 / Float32 buffers
    if (accumulatedAudioBuffersRef.current.length > 0) {
      console.log("[Live] Repetindo usando buffers PCM acumulados.");
      playLiamSpeech({
        text,
        audioUrl,
        reason: "repeat"
      });
      return;
    }

    if (lastPcmBase64Ref.current) {
      console.log("[Live] Repetindo usando lastPcmBase64Ref.");
      playPcmBase64Audio(
        lastPcmBase64Ref.current,
        lastPcmMimeTypeRef.current,
        voiceSpeedRef.current
      );
      return;
    }

    if (!text && !audioUrl) {
      console.warn("[Live] Nenhuma fala registrada para repetir.");
      setAlertMsg("Nenhuma fala para repetir ainda.");
      return;
    }

    playLiamSpeech({
      text,
      audioUrl,
      reason: "repeat"
    });
  };

  const resetLiveModeBeforeStart = () => {
    console.log("[Live] Resetando sessão anterior");
    
    // 1. Parar todos os áudios
    stopAllLiamAudio();

    // 2. Cancelar speech synthesis
    if (window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }

    // 3. Parar gravação / processamento anterior
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {}
      processorRef.current = null;
    }

    // 4. Parar tracks antigas do microfone
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      } catch {}
      mediaStreamRef.current = null;
    }

    // 5. Fechar websocket / conexão live antiga
    if (sessionPromiseRef.current) {
      const p = sessionPromiseRef.current;
      sessionPromiseRef.current = null;
      p.then((session: any) => {
        try {
          session.close();
        } catch {}
      }).catch(() => {});
    }

    if (micContextRef.current) {
      try {
        micContextRef.current.close().catch(() => {});
      } catch {}
      micContextRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        audioContextRef.current.close().catch(() => {});
      } catch {}
      audioContextRef.current = null;
    }

    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current);
      keepAliveIntervalRef.current = null;
    }

    // 6. Resetar referências e buffers internos
    isSpeakingRef.current = false;
    isReleasedRef.current = true;
    accumulatedAudioBuffersRef.current = [];
    pcmQueueRef.current = [];
    isPlayingQueueRef.current = false;
    currentAudioSourceRef.current = null;
    lastLiamTextRef.current = "";
    lastAudioUrlRef.current = "";

    isAiTurnCompleteRef.current = false;
    currentTurnPcmChunksRef.current = [];
    lastPcmChunksRef.current = [];
    currentTurnTextRef.current = "";
    isPcmPlayingRef.current = false;

    // 7. Limpar estados visuais
    setIsThinking(false);
    setTranscript("");
    setLiamResponse("");
    setVisibleLiamText("");
  };

  const toggleSession = async () => {
    try {
      console.log("[Live] Clique no microfone recebido");
      
      if (isConnectingRef.current) {
        console.warn("[Live] Ignorando clique duplicado: conexão em andamento");
        return;
      }

      const activeStates = ["connecting", "listening", "speaking", "reconnecting"];
      if (activeStates.includes(status)) {
        console.log("[Live] Desconectando sessão ativa...");
        stopSession();
        console.log("[Live] Microfone liberado");
        return;
      }

      isConnectingRef.current = true;
      resetLiveModeBeforeStart();

      // Forçar inicialização da Web Audio API com interação do usuário para desbloquear reprodução (AÇÃO 4)
      try {
        if (!audioContextRef.current || audioContextRef.current.state === "closed") {
          audioContextRef.current = new (
            window.AudioContext || (window as any).webkitAudioContext
          )({ sampleRate: 24000 });
        }
        if (audioContextRef.current.state === "suspended") {
          audioContextRef.current.resume().catch((err) => console.error("[Audio] Erro ao destravar AudioContext:", err));
        }
        console.log("[Audio] AudioContext destravado com sucesso no clique do usuário.");
      } catch (audioUnlockErr) {
        console.error("[Audio] Erro ao inicializar/destravar AudioContext:", audioUnlockErr);
      }

      console.log("[Live] Iniciando Live limpo");
      console.log("[Live] Solicitando permissão do microfone");

      // Set status to connecting visual state immediately
      setStatus("connecting");

      // Verify and get media permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      mediaStreamRef.current = stream;
      console.log("[Live] Permissão concedida");

      console.log("[Live] Conectando sessão live");
      
      // Load memory and initialize session in Firestore
      const targetUserEmail = profile?.email || user?.email || "";
      if (targetUserEmail) {
        console.log("[Live] Carregando histórico e memória do aluno...");
        try {
          const memory = await loadStudentLearningMemory(targetUserEmail);
          studentMemoryContextRef.current = buildMemoryPromptContext(memory);
          
          const newSessionId = await createLiveSession(targetUserEmail);
          currentLiveSessionIdRef.current = newSessionId;
          console.log("[Live] Sessão iniciada e memória integrada no prompt.");
        } catch (memErr) {
          console.error("[Live] Erro ao carregar memória ou iniciar sessão:", memErr);
          studentMemoryContextRef.current = "";
          currentLiveSessionIdRef.current = "";
        }
      } else {
        console.warn("[Live] Nenhum e-mail de usuário identificado para salvar histórico.");
        studentMemoryContextRef.current = "";
        currentLiveSessionIdRef.current = "";
      }

      await connectToGemini(false);

    } catch (error) {
      console.error("[Live] Falha ao iniciar Live:", error);
      resetLiveModeBeforeStart();
      setStatus("error");
      setAlertMsg("Não consegui acessar o microfone. Verifique as permissões de áudio e tente novamente.");
    } finally {
      isConnectingRef.current = false;
    }
  };

  return (
    <div translate="no" className="notranslate flex flex-col min-h-[100dvh] h-[100dvh] overflow-y-auto overflow-x-hidden pb-[calc(110px+env(safe-area-inset-bottom))] box-border bg-brand-dark text-brand-text md:py-6 md:px-6 relative">
      {/* Floating Disconnect Button - visible when session is active and easily clickable on mobile */}
      {(status === "listening" || status === "speaking" || status === "connecting" || status === "reconnecting") && (
        <button
          onClick={stopSession}
          className="fixed top-[calc(12px+env(safe-area-inset-top))] right-4 z-[999] flex items-center gap-1.5 px-4.5 py-2.5 bg-red-600 hover:bg-red-700 active:scale-95 border border-red-500 rounded-full text-white font-bold text-xs shadow-lg shadow-red-600/30 transition duration-300 select-none cursor-pointer"
        >
          <MicOff size={14} className="text-white" />
          <span>Desligar</span>
        </button>
      )}

      <div className="flex-1 max-w-3xl w-full mx-auto relative md:rounded-3xl flex flex-col justify-between p-4 md:p-8 bg-brand-dark-light md:border border-brand-dark-border md:shadow-xl min-h-fit pb-16 md:pb-8">
        
        {/* Header */}
        <div className="flex justify-between items-center relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-brand-dark-light flex flex-shrink-0 items-center justify-center p-1.5 border border-brand-dark-border shadow-sm overflow-hidden">
              <LogoIcon className="w-full h-full text-brand-green" />
            </div>
            <div>
              <h2 className="font-bold text-xl text-brand-text font-serif">Liam Live</h2>
              <p className="text-sm font-medium text-brand-green flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  {status !== "idle" && status !== "error" && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-green-glow opacity-75"></span>
                  )}
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${status !== "idle" && status !== "error" ? "bg-brand-green-glow" : "bg-gray-400"}`}></span>
                </span>
                {status === "idle" && "Offline"}
                {status === "connecting" && "Conectando..."}
                {status === "reconnecting" && "Reconectando com o Liam..."}
                {status === "listening" && (isThinking ? "LIAM está pensando..." : "Ouvindo")}
                {status === "speaking" && "Respondendo"}
                {status === "error" && "Falha na conexão"}
              </p>
            </div>
          </div>
        </div>

        {/* Center Canvas / Text */}
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-8 z-10 my-8">
          
          <div className={`relative flex items-center justify-center transition-transform duration-500 ${status === "speaking" ? "scale-110" : "scale-100"}`}>
            <div className={`absolute inset-0 rounded-full bg-brand-green-glow/20 blur-2xl transition-opacity duration-500 scale-150 ${status === "speaking" ? "opacity-100" : "opacity-0"}`}></div>
            <div className={`w-24 h-24 md:w-32 md:h-32 rounded-full overflow-hidden border-4 bg-brand-dark transition-colors duration-500 relative z-10 p-3 flex justify-center items-center ${status === "speaking" ? "border-brand-green-glow shadow-lg shadow-brand-green-glow/30" : "border-brand-dark-border"}`}>
              <LogoIcon className="w-full h-full text-brand-green" />
            </div>
          </div>

          {transcript && status !== "idle" && status !== "error" && (
            <div className="bg-brand-dark-light backdrop-blur-md px-6 py-4 rounded-2xl max-w-lg border border-brand-dark-border animate-in fade-in slide-in-from-bottom-4">
              <p className="text-brand-green text-sm mb-1 uppercase tracking-wider font-bold">You said</p>
              <p className="text-lg text-brand-text">"{transcript}"</p>
            </div>
          )}

          {isThinking && (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-brand-green-glow animate-pulse font-serif text-lg">
               <Loader2 className="animate-spin w-8 h-8 text-brand-green" />
               LIAM está pensando...
            </div>
          )}

          {status !== "idle" && status !== "error" && !isThinking && (visibleLiveText || visibleLiamText) && (
            <div className="max-w-2xl px-4 animate-in fade-in zoom-in-95 duration-500 w-full space-y-4">
              <p className="text-brand-green-glow text-sm mb-1 uppercase tracking-wider font-bold">Liam</p>
              
              {repeatTargetText ? (
                <div className="space-y-4 w-full flex flex-col items-center">
                  {/* Discreet original caption */}
                  <div className="text-base md:text-lg font-serif text-gray-400 italic">
                    {visibleLiveText || visibleLiamText}
                  </div>
                  
                  {/* Huge neon outline highlight for target phrase to repeat */}
                  <div className="inline-block bg-brand-green/10 border-2 border-brand-green/35 px-8 py-5 rounded-3xl shadow-[0_4px_20px_rgba(34,197,94,0.15)] ring-4 ring-brand-green/5 max-w-full text-center">
                    <p className="text-brand-green text-[10px] uppercase font-bold tracking-widest mb-1.5 opacity-80">Repita esta frase:</p>
                    <p className="text-2xl md:text-3.5xl font-extrabold text-brand-green-glow tracking-tight font-sans whitespace-pre-wrap select-all">
                      "{repeatTargetText}"
                    </p>
                  </div>

                  {/* translation below */}
                  {meaningText && (
                    <div className="text-sm md:text-base text-gray-300 italic max-w-md mx-auto pt-1">
                      Significado: <span className="font-medium text-brand-text">"{meaningText}"</span>
                    </div>
                  )}
                </div>
              ) : (
                /* Standard caption */
                <div className="text-2xl md:text-3xl font-serif text-brand-text leading-relaxed prose prose-p:my-0">
                  <p>{visibleLiveText || visibleLiamText}</p>
                </div>
              )}
            </div>
          )}

          {status === "reconnecting" && (
            <div className="py-12 flex flex-col items-center justify-center gap-4 text-brand-green/60 animate-pulse font-serif text-xl">
               Aguarde, recuperando a conexão...
            </div>
          )}
          
          {status === "error" && (
            <div className="py-12 flex flex-col items-center justify-center gap-4 text-red-500 font-serif text-xl bg-red-500/10 px-8 py-4 rounded-2xl border border-red-500/20 font-sans">
               <AlertTriangle className="w-8 h-8 mx-auto text-red-500" />
               A conexão falhou. Por favor, tente reconectar.
            </div>
          )}

          {status === "speaking" && (
            <div className="flex justify-center items-center gap-2 h-20">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="w-3 bg-brand-green-glow rounded-full animate-pulse opacity-60"
                  style={{ height: `${Math.random() * 40 + 20}px`, animationDuration: `${Math.random() * 0.5 + 0.5}s` }}
                ></div>
              ))}
            </div>
          )}
        </div>

        {/* Separator / Transcript Controls */}
        <div className="w-full flex flex-col items-center gap-4 z-10 px-4 mb-4 animate-in fade-in duration-300">
          <button
            onClick={() => setShowTranscriptPanel(!showTranscriptPanel)}
            className="flex items-center gap-2 px-5 py-2.5 text-xs md:text-sm font-semibold rounded-full bg-brand-dark/50 hover:bg-brand-dark/80 border border-brand-dark-border text-gray-300 hover:text-brand-green-glow transition duration-300 shadow-md cursor-pointer select-none"
          >
            {showTranscriptPanel ? <EyeOff size={14} className="text-brand-green" /> : <Eye size={14} className="text-brand-green" />}
            <span>{showTranscriptPanel ? "Ocultar Transcrição" : "Ver Transcrição"}</span>
            {sessionTranscript.length > 0 && (
              <span className="bg-brand-green/20 text-brand-green-glow px-2 py-0.5 rounded-full text-[10px] font-bold">
                {sessionTranscript.length}
              </span>
            )}
          </button>

          {/* Collapsible Scrollable Transcript History List */}
          {showTranscriptPanel && (
            <div className="w-full max-w-2xl bg-brand-dark/65 border border-brand-dark-border/80 rounded-2xl p-4 max-h-48 overflow-y-auto space-y-3 shadow-inner custom-scrollbar animate-in zoom-in-95 duration-300 flex flex-col font-sans">
              {sessionTranscript.length === 0 ? (
                <p className="text-gray-400 text-xs italic text-center py-4">Nenhuma fala gravada no histórico ainda.</p>
              ) : (
                sessionTranscript.map((t, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col text-sm max-w-[85%] rounded-2xl px-4 py-2.5 animate-in fade-in slide-in-from-bottom-2 duration-300 ${
                      t.role === "liam"
                        ? "bg-brand-green/10 border border-brand-green/20 text-brand-text self-start"
                        : "bg-gray-800/60 border border-gray-700/40 text-brand-text self-end font-medium"
                    }`}
                  >
                    <span className={`text-[10px] uppercase tracking-wider font-bold mb-1 ${
                      t.role === "liam" ? "text-brand-green-glow" : "text-gray-400"
                    }`}>
                      {t.role === "liam" ? "Liam (Professor)" : "Você"}
                    </span>
                    <p className="leading-relaxed whitespace-pre-wrap">{t.text}</p>
                    {t.visibleText && t.visibleText !== t.text && (
                      <p className="text-[11px] text-gray-400 italic mt-1 border-t border-brand-dark-border/30 pt-1">
                        Resumo: "{t.visibleText}"
                      </p>
                    )}
                  </div>
                ))
              )}
              {/* Invisible anchor element to auto scroll to bottom on new item */}
              <div ref={(el) => el?.scrollIntoView({ behavior: "smooth" })} />
            </div>
          )}
        </div>

        {/* Voice Controls + Mic Controls */}
        <div className="flex flex-col items-center pb-8 z-10 relative space-y-6">
          
          {/* Custom Notification Toast */}
          {alertMsg && (
            <div className="absolute -top-12 bg-amber-500 text-brand-dark font-sans font-bold text-xs px-4 py-2 rounded-xl shadow-lg border border-amber-600 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {alertMsg}
            </div>
          )}

          {/* modern control bar */}
          <div className="flex items-center gap-3 bg-brand-dark/50 backdrop-blur-md px-4 py-2.5 rounded-full border border-brand-dark-border/65 shadow-[0_4px_24px_rgba(0,0,0,0.4)] select-none">
            {/* Speed down button */}
            <button
              onClick={decreaseSpeed}
              disabled={voiceSpeed <= 0.7}
              className="w-10 h-10 rounded-full flex items-center justify-center gap-0.5 text-gray-300 hover:text-white hover:bg-white/10 active:scale-95 transition disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer border border-transparent hover:border-white/10"
              title="Diminuir velocidade (🐢)"
            >
              <span className="text-[15px] select-none">🐢</span>
              <Minus size={13} className="text-gray-400" />
            </button>

            {/* Repeat button */}
            <button
              onClick={replayLastLiamSpeech}
              className="h-10 px-5 rounded-full flex items-center justify-center gap-2 bg-brand-green/20 hover:bg-brand-green/30 border border-brand-green/35 text-brand-green-glow text-sm font-semibold hover:scale-105 active:scale-95 transition cursor-pointer font-sans shadow-inner group"
              title="Repetir última fala"
            >
              <RotateCcw size={15} className="group-hover:rotate-[-45deg] transition duration-300 text-brand-green" />
              <span>Repetir</span>
            </button>

            {/* Speed up button */}
            <button
              onClick={increaseSpeed}
              disabled={voiceSpeed >= 1.3}
              className="w-10 h-10 rounded-full flex items-center justify-center gap-0.5 text-gray-300 hover:text-white hover:bg-white/10 active:scale-95 transition disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer border border-transparent hover:border-white/10"
              title="Aumentar velocidade (⚡)"
            >
              <span className="text-[15px] select-none">⚡</span>
              <Plus size={13} className="text-brand-green" />
            </button>

            {/* Divider */}
            <div className="h-6 w-[1px] bg-brand-dark-border/80 mx-1"></div>

            {/* Speed selection dropdown */}
            <div className="relative group flex items-center" title="Ajuste de velocidade">
              <select
                value={voiceSpeed}
                onChange={(e) => updateVoiceSpeed(parseFloat(e.target.value))}
                className="appearance-none bg-brand-dark/60 hover:bg-brand-dark/80 border border-brand-dark-border/70 text-brand-green font-mono font-bold text-xs pl-3 pr-7 py-1.5 rounded-full transition cursor-pointer outline-none shadow-md"
              >
                {SPEEDS.map((s) => (
                  <option key={s} value={s} className="bg-brand-dark text-brand-text">
                    {s.toFixed(2)}x
                  </option>
                ))}
              </select>
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-brand-green/60 text-[8px] select-none">
                ▼
              </div>
            </div>
          </div>

          <button
            onClick={toggleSession}
            disabled={status === "connecting" || status === "reconnecting"}
            className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 shadow-[0_10px_30px_rgba(34,197,94,0.3)] border-none cursor-pointer ${
              (status === "speaking" || status === "listening")
                ? "bg-red-500 hover:bg-red-600 shadow-red-500/50 hover:scale-105 animate-pulse text-white"
                : (status === "connecting" || status === "reconnecting")
                  ? "bg-brand-dark text-brand-green/50 cursor-not-allowed shadow-none border border-brand-dark-border"
                  : "bg-brand-green-glow text-white hover:brightness-110 hover:scale-105"
            }`}
          >
            {(status === "speaking" || status === "listening") ? (
              <MicOff size={36} />
            ) : (status === "connecting" || status === "reconnecting") ? (
              <Loader2 size={36} className="animate-spin" />
            ) : (
              <Mic size={36} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
