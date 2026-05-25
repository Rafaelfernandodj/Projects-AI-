import { GoogleGenAI } from "@google/genai";
import { UserProfile } from "../store/useStore";
import { getSystemInstruction, getAiInstance } from "./geminiService";

export const chatWithLiamMultimodal = async (
  messageParts: any[],
  history: { role: "user" | "model"; parts: any[] }[],
  profile?: UserProfile,
) => {
  const currentAi = getAiInstance();
  const rawContents = [...history, { role: "user", parts: messageParts }];
  const contents: any[] = [];
  
  for (const item of rawContents) {
    if (contents.length === 0 && item.role === "model") {
      // Gemini API requires the conversation to start with 'user'. Skip leading 'model' messages.
      continue;
    }
    
    if (contents.length > 0 && contents[contents.length - 1].role === item.role) {
      contents[contents.length - 1].parts.push(...item.parts);
    } else {
      contents.push({ role: item.role, parts: [...item.parts] });
    }
  }

  const response = await currentAi.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: contents,
    config: {
      systemInstruction: getSystemInstruction(profile),
      temperature: 0.7,
    },
  });

  return response;
};
