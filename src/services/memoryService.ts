import { db } from "../lib/firebase";
import { doc, getDoc, setDoc, addDoc, collection, updateDoc, arrayUnion } from "firebase/firestore";
import { CustomPlan } from "../store/useStore";

/**
 * Interface representing a qualitative recurring error committed by the student.
 */
export interface LearningError {
  category: "grammar" | "pronunciation" | "vocabulary" | string;
  description: string;
  reoccurrenceCount: number;
  lastSeenAt: number; // UTC Unix Timestamp in ms
}

/**
 * Interface representing the complete live learning memory document schema.
 * Document Location: /users/{userId}/memory/liveLearningMemory
 */
export interface LiveLearningMemory {
  userId: string;
  lastUpdated: number;
  errors: LearningError[];
}

/**
 * Interface representing a qualitative Live Session document.
 * CRITICAL SAFETY MEMENTO: This document contains only pure textual qualitative data.
 * Under NO circumstances does it store raw PCM audio, base64 strings, or large binary structures.
 * Document Location: /users/{userId}/liveSessions/{sessionId}
 */
export interface LiveSessionRecord {
  sessionId?: string;
  userId: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  transcript: string; // The text conversation log accumulated during the session
  pedagogicalInsights: {
    errorsLoggedCount: number;
    summary: string;
    levelAssessed: string;
    recommendations?: string;
  };
}

/**
 * Loads the pedagogical student memory from Firestore.
 * Standardized path: users/{userId}/memory/liveLearningMemory
 */
export async function loadStudentLearningMemory(userId: string): Promise<LiveLearningMemory | null> {
  if (!userId) return null;
  try {
    const memoryDocRef = doc(db, "users", userId, "memory", "liveLearningMemory");
    const memorySnap = await getDoc(memoryDocRef);
    if (memorySnap.exists()) {
      return memorySnap.data() as LiveLearningMemory;
    }
  } catch (error) {
    console.error("[MEMORY] Failed to load student learning memory:", error);
  }
  return null;
}

/**
 * Saves or completely replaces the pedagogical student memory document.
 * Standardized path: users/{userId}/memory/liveLearningMemory
 */
export async function saveStudentLearningMemory(userId: string, memory: LiveLearningMemory): Promise<void> {
  if (!userId) return;
  try {
    const memoryDocRef = doc(db, "users", userId, "memory", "liveLearningMemory");
    await setDoc(memoryDocRef, {
      ...memory,
      lastUpdated: Date.now(),
    });
    console.log("[MEMORY] Student learning memory saved successfully");
  } catch (error) {
    console.error("[MEMORY] Failed to save student learning memory:", error);
  }
}

/**
 * Appends a new qualitative pedagogical error to the student's liveLearningMemory,
 * or increments the counter and updates the timestamp if the error is already recorded.
 */
export async function addStudentErrorToMemory(
  userId: string,
  category: string,
  description: string
): Promise<void> {
  if (!userId) return;
  try {
    const memory = await loadStudentLearningMemory(userId) || {
      userId,
      lastUpdated: Date.now(),
      errors: [],
    };

    const existingErrorIndex = memory.errors.findIndex(
      (e) => e.category.toLowerCase() === category.toLowerCase() &&
             e.description.toLowerCase().trim() === description.toLowerCase().trim()
    );

    if (existingErrorIndex >= 0) {
      // Increment existing error
      memory.errors[existingErrorIndex].reoccurrenceCount += 1;
      memory.errors[existingErrorIndex].lastSeenAt = Date.now();
    } else {
      // Add new error
      memory.errors.push({
        category,
        description,
        reoccurrenceCount: 1,
        lastSeenAt: Date.now(),
      });
    }

    await saveStudentLearningMemory(userId, memory);
  } catch (error) {
    console.error("[MEMORY] Failed to append student error to memory:", error);
  }
}

/**
 * Saves a qualitative session history record under /users/{userId}/liveSessions/
 * Returns the created Firestore document ID.
 */
export async function saveLiveSessionRecord(
  userId: string,
  sessionRecord: Omit<LiveSessionRecord, "sessionId">
): Promise<string> {
  if (!userId) throw new Error("userId is required to save session history");
  try {
    // Validate that no raw voice buffer or binary data slipped into the records
    if (/^data:audio|base64/i.test(sessionRecord.transcript)) {
      console.warn("[MEMORY] Warning: Transcript appears to contain base64 audio data. Stripping binary markers.");
      sessionRecord.transcript = "[Qualitative transcript sanitized to protect user privacy]";
    }

    const sessionsCollectionRef = collection(db, "users", userId, "liveSessions");
    const docRef = await addDoc(sessionsCollectionRef, {
      ...sessionRecord,
      createdAt: Date.now(),
    });
    console.log("[MEMORY] Qualitative live session saved. Document ID:", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("[MEMORY] Failed to save live session:", error);
    throw error;
  }
}

/**
 * Saves a dynamically generated custom study plan under users/{userId}/customPlans
 */
export async function saveCustomStudyPlan(
  userId: string,
  plan: Omit<CustomPlan, "id" | "createdAt">
): Promise<CustomPlan> {
  if (!userId) throw new Error("userId is required to save a study plan");
  try {
    const plansCollectionRef = collection(db, "users", userId, "customPlans");
    const docData = {
      ...plan,
      createdAt: Date.now()
    };
    const docRef = await addDoc(plansCollectionRef, docData);
    console.log("[MEMORY] Custom study plan saved. ID:", docRef.id);
    return {
      id: docRef.id,
      ...docData
    };
  } catch (error) {
    console.error("[MEMORY] Failed to save custom study plan:", error);
    throw error;
  }
}
