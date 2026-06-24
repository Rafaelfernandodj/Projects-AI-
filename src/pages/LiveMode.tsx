import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "../store/useStore";
import { db } from "../lib/firebase";
import {
  collection,
  doc,
  updateDoc,
  increment,
  arrayUnion,
} from "firebase/firestore";
import { Mic, MicOff, Loader2, AlertTriangle, BookOpen } from "lucide-react";
import { ai, getSystemInstruction, getAiInstance } from "../services/geminiService";
import { Modality, LiveServerMessage } from "@google/genai";
import ReactMarkdown from "react-markdown";
import { LogoIcon } from "../components/ui/Logo";
import PlansModal from "../components/PlansModal";
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

function float32ToInt16(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16Array;
}

export default function LiveMode() {
  const { profile, user, activePlan } = useStore();
  const [isPlansOpen, setIsPlansOpen] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  
  // liveSessionState
  const [status, setStatus] = useState<
    "idle" | "connecting" | "listening" | "speaking" | "reconnecting" | "error"
  >("idle");
  const [transcript, setTranscript] = useState("");
  const [liamResponse, setLiamResponse] = useState("");

  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const sessionPromiseRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const nextPlaybackTimeRef = useRef<number>(0);
  
  const reconnectAttemptsRef = useRef(0);
  const isIntentionalStopRef = useRef(false);
  const keepAliveIntervalRef = useRef<number | null>(null);

  // New Voice Capture control refs
  const startRetryCountRef = useRef(0);
  const startTimeoutRef = useRef<number | null>(null);
  const isFullyActiveRef = useRef(false);
  
  // To restore context during reconnect
  const lastTranscriptRef = useRef("");
  const lastResponseRef = useRef("");

  const cleanupActiveSession = useCallback(() => {
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current
        .then((session: any) => session.close())
        .catch(() => {});
      sessionPromiseRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
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
    isFullyActiveRef.current = false;
  }, []);

  const stopSession = useCallback(() => {
    isIntentionalStopRef.current = true;
    if (startTimeoutRef.current) {
      clearTimeout(startTimeoutRef.current);
      startTimeoutRef.current = null;
    }
    cleanupActiveSession();
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
  }, [cleanupActiveSession]);

  // Setup Capacitor listeners and check unexpected reload
  useEffect(() => {
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

  const startVoiceCapture = async () => {
    console.log('[VOICE] Botão clicado');
    window.focus();
    const btn = document.getElementById('mic-button');
    if (btn) btn.focus();

    // Instant/immediate visual feedback
    setStatus("listening");
    console.log('[VOICE] Inicializando reconhecimento');

    startRetryCountRef.current = 0;
    isIntentionalStopRef.current = false;

    try {
      if (navigator.permissions && navigator.permissions.query) {
        const permissionStatus = await navigator.permissions.query({
          name: 'microphone' as any
        });
        console.log('[VOICE] Status da permissão de microfone:', permissionStatus.state);
        if (permissionStatus.state === 'granted') {
          // Permissão concedida, inicia a escuta imediatamente
          connectToGemini(false);
          return;
        }
      }
    } catch (err) {
      console.warn('[VOICE] Erro ao consultar permissão:', err);
    }

    // Se a permissão não estiver garantida ou se houver erro, tenta de qualquer forma
    connectToGemini(false);
  };

  const connectToGemini = async (isReconnect = false) => {
    try {
      isIntentionalStopRef.current = false;
      isFullyActiveRef.current = false;

      if (!isReconnect) {
        console.log("live_session_started");
        reconnectAttemptsRef.current = 0;
      } else {
        console.log("live_reconnect_started", `Attempt ${reconnectAttemptsRef.current}`);
        setStatus("reconnecting");
      }

      // Reinicialização automática em 5000ms
      if (!isReconnect) {
        if (startTimeoutRef.current) clearTimeout(startTimeoutRef.current);
        startTimeoutRef.current = window.setTimeout(() => {
          if (!isFullyActiveRef.current && !isIntentionalStopRef.current) {
            console.warn('[VOICE] Reconhecimento não iniciado em 5000ms. Tentando reinicializar...');
            cleanupActiveSession();
            
            if (startRetryCountRef.current < 2) {
              startRetryCountRef.current++;
              console.log(`[VOICE] Tentativa de inicialização ${startRetryCountRef.current + 1}...`);
              connectToGemini(false);
            } else {
              console.log('[VOICE] Erro ao iniciar reconhecimento');
              setStatus("error");
              stopSession();
            }
          }
        }, 5000);
      }

      // Cleanup prior contexts
      cleanupActiveSession();

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

      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });

      console.log('[VOICE] Microfone ativo');

      const source = micContextRef.current.createMediaStreamSource(
        mediaStreamRef.current,
      );
      sourceRef.current = source;

      processorRef.current = micContextRef.current.createScriptProcessor(
        4096,
        1,
        1,
      );

      processorRef.current.onaudioprocess = (e) => {
        if (!sessionPromiseRef.current || statusRef.current === "speaking") return;
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
        });
      };

      source.connect(processorRef.current);
      processorRef.current.connect(micContextRef.current.destination);

      let systemInstruction = getSystemInstruction(profile || undefined, true, undefined, activePlan);
      
      // Inject details if there is an active study plan selected
      if (activePlan) {
        systemInstruction += `\n\n[ATIVO: PLANO DE ESTUDOS PERSONALIZADO - ${activePlan.title}]\nCenário da Simulação: ${activePlan.scenario}\nInstruções de Roleplay: ${activePlan.instructions}\n`;
      }

      // 5. Cost Optimization: Strict conciseness rules for output audio token savings
      systemInstruction += `\n\n[CONCISÃO EXTREMA]: Fale no máximo 1 a 2 frases curtas por resposta. Isso reduz drasticamente o consumo de tokens de áudio de saída e mantém a dinâmica da conversa.\n`;
      
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
            if (sessionPromiseRef.current !== currentPromise) return;
            console.log("live_connected");

            isFullyActiveRef.current = true;
            if (startTimeoutRef.current) {
              clearTimeout(startTimeoutRef.current);
              startTimeoutRef.current = null;
            }

            if (isReconnect) {
              console.log("live_reconnect_success");
              console.log("live_session_restored");
            }
            setStatus("listening");
            
            reconnectAttemptsRef.current = 0; // reset on success

            const targetUserId = profile?.userId || user?.uid || profile?.email || user?.email || "";
            if (targetUserId && !isReconnect) {
              updateDoc(doc(db, "users", targetUserId), {
                points: increment(2),
                liveSessions: increment(1),
              }).catch((e) => console.error("[LIVE] Error updating live sessions points:", e));
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
          },
          onmessage: (message: any) => {
            if (isIntentionalStopRef.current || sessionPromiseRef.current !== currentPromise) return;

            if (message.clientContent?.modelTurn?.parts?.[0]?.text) {
              setTranscript(message.clientContent.modelTurn.parts[0].text);
            }
            if (message.serverContent?.modelTurn?.parts?.[0]?.text) {
              setLiamResponse(message.serverContent.modelTurn.parts[0].text);
            }

            const parts = message.serverContent?.modelTurn?.parts;
            if (parts) {
              parts.forEach((p: any) => {
                if (p.functionCall && p.functionCall.name === "save_student_error") {
                  const args = p.functionCall.args;
                  if (args) {
                    const targetUserId = profile?.userId || user?.uid || profile?.email || user?.email || "";
                    if (targetUserId) {
                      updateDoc(doc(db, "users", targetUserId), {
                        savedErrors: arrayUnion({
                          category: args.category,
                          description: args.description,
                          date: Date.now(),
                        }),
                      }).catch((e) => console.error("[LIVE] Error saving student error:", e));
                    }
                  }

                  if (sessionPromiseRef.current) {
                    sessionPromiseRef.current.then((session: any) => {
                      session.send({
                        toolResponse: {
                          functionResponses: [{
                            name: p.functionCall.name,
                            id: p.functionCall.id,
                            response: { result: "saved successfully" },
                          }],
                        },
                      });
                    }).catch(() => {});
                  }
                }
              });
            }

            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && audioContextRef.current) {
              if (audioContextRef.current.state === "suspended") {
                audioContextRef.current.resume();
              }
              setStatus("speaking");

              const buffer = base64ToArrayBuffer(base64Audio);
              const int16 = new Int16Array(buffer);
              const float32 = new Float32Array(int16.length);
              for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0;

              const audioBuffer = audioContextRef.current.createBuffer(1, float32.length, 24000);
              audioBuffer.getChannelData(0).set(float32);

              const pSource = audioContextRef.current.createBufferSource();
              pSource.buffer = audioBuffer;
              pSource.playbackRate.value = speed; // Apply speed setting
              pSource.connect(audioContextRef.current.destination);

              const currentTime = audioContextRef.current.currentTime;
              if (nextPlaybackTimeRef.current < currentTime) {
                nextPlaybackTimeRef.current = currentTime;
              }

              pSource.start(nextPlaybackTimeRef.current);
              nextPlaybackTimeRef.current += (audioBuffer.duration / speed); // Adjust timing based on playback speed

              pSource.onended = () => {
                if (!isIntentionalStopRef.current && audioContextRef.current &&
                    audioContextRef.current.currentTime >= nextPlaybackTimeRef.current - 0.2) {
                  setStatus("listening");
                }
              };
            }

            if (message.serverContent?.interrupted) {
              if (audioContextRef.current) {
                audioContextRef.current.close().catch(() => {});
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
                nextPlaybackTimeRef.current = 0;
              }
              setStatus("listening");
              setLiamResponse("");
            }
          },
          onerror: (err: any) => {
            if (isIntentionalStopRef.current || sessionPromiseRef.current !== currentPromise) return;
            console.error("live_error_caught", err);
            console.log('[VOICE] Erro ao iniciar reconhecimento');

            if (!isReconnect) {
              if (startRetryCountRef.current < 2) {
                startRetryCountRef.current++;
                console.log(`[VOICE] Retry due to error, attempt ${startRetryCountRef.current + 1}...`);
                connectToGemini(false);
              } else {
                setStatus("error");
                stopSession();
              }
            } else {
              handleUnexpectedDrop();
            }
          },
          onclose: () => {
            if (isIntentionalStopRef.current || sessionPromiseRef.current !== currentPromise) return;
            console.warn("live_connection_lost onClose called");
            handleUnexpectedDrop();
          },
        },
      });
      sessionPromiseRef.current = currentPromise;
    } catch (err) {
      console.error("live_error_caught connection failed", err);
      console.log('[VOICE] Erro ao iniciar reconhecimento');

      if (!isReconnect) {
        if (startRetryCountRef.current < 2) {
          startRetryCountRef.current++;
          console.log(`[VOICE] Retry due to error, attempt ${startRetryCountRef.current + 1}...`);
          connectToGemini(false);
        } else {
          setStatus("error");
          stopSession();
        }
      } else {
        handleUnexpectedDrop();
      }
    }
  };

  const handleUnexpectedDrop = () => {
    if (isIntentionalStopRef.current) return;
    
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

  const toggleSession = () => {
    const activeStates = ["connecting", "listening", "speaking", "reconnecting"];
    if (activeStates.includes(status)) {
      stopSession();
    } else {
      startVoiceCapture();
    }
  };

  return (
    <div translate="no" className="notranslate flex flex-col h-full min-h-[calc(100vh-4rem)] md:min-h-screen bg-brand-dark text-brand-text md:py-6 md:px-6">
      <div className="flex-1 max-w-3xl w-full mx-auto relative md:rounded-3xl overflow-hidden flex flex-col justify-between p-4 md:p-8 bg-brand-dark-light md:border border-brand-dark-border md:shadow-xl">
        
        {/* Header */}
        <div className="flex justify-between items-center relative z-10 w-full">
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
                {status === "listening" && "Ouvindo..."}
                {status === "speaking" && "Respondendo"}
                {status === "error" && "Falha na conexão"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setSpeed(prev => prev === 0.8 ? 1.0 : prev === 1.0 ? 1.2 : 0.8)}
              className="px-2.5 py-1.5 border border-brand-green/20 bg-brand-dark rounded-xl text-xs font-bold text-brand-green-glow hover:bg-brand-green/10 transition-all cursor-pointer"
              title="Ajustar velocidade da voz do Liam"
            >
              ⚡ {speed === 0.8 ? "0.8x (Devagar)" : speed === 1.2 ? "1.2x (Rápido)" : "1.0x (Normal)"}
            </button>

            <button
              onClick={() => setIsPlansOpen(true)}
              disabled={status !== "idle"}
              className={`px-3 py-1.5 border rounded-xl font-bold flex items-center gap-2 transition-all text-xs sm:text-sm shrink-0 ${
                status !== "idle"
                  ? "bg-gray-800/50 border-gray-700/50 text-gray-600 cursor-not-allowed opacity-50"
                  : "bg-brand-dark border-brand-green/30 text-brand-green-glow hover:bg-brand-green/10"
              }`}
            >
              <BookOpen size={15} /> 
              <span className="max-w-[125px] truncate font-sans">
                {activePlan ? activePlan.title : "Planos"}
              </span>
            </button>
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

          {liamResponse && status !== "idle" && status !== "error" && (
            <div className="max-w-2xl px-4 animate-in fade-in zoom-in-95 duration-500">
              <p className="text-brand-green-glow text-sm mb-2 uppercase tracking-wider font-bold">Liam</p>
              <div className="text-2xl md:text-3xl font-serif text-brand-text leading-relaxed prose prose-p:my-0">
                <ReactMarkdown>{liamResponse}</ReactMarkdown>
              </div>
            </div>
          )}

          {status === "reconnecting" && (
            <div className="py-12 flex flex-col items-center justify-center gap-4 text-brand-green/60 animate-pulse font-serif text-xl">
               Aguarde, recuperando a conexão...
            </div>
          )}
          
          {status === "error" && (
            <div className="py-12 flex flex-col items-center justify-center gap-4 text-red-500 font-serif text-xl bg-red-500/10 px-8 py-4 rounded-2xl border border-red-500/20">
               <AlertTriangle className="w-8 h-8 mx-auto" />
               A conexão falhou. Por favor, tente reconectar.
            </div>
          )}

          {(status === "speaking" || status === "listening") && (
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

        {/* Mic Controls */}
        <div className="flex justify-center pb-8 z-10 relative">
          <button
            id="mic-button"
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
      
      <PlansModal isOpen={isPlansOpen} onClose={() => setIsPlansOpen(false)} />
    </div>
  );
}
