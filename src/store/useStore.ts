import { create } from 'zustand';
import { User as FirebaseUser } from 'firebase/auth';

export interface CustomPlan {
  id: string;
  title: string;
  description: string;
  scenario: string;
  languagePreference: "portuguese" | "mixed" | "english";
  instructions: string;
  createdAt: number;
}

export type UserLevel = 'Survivor' | 'Speaker' | 'Fluent' | 'Unassigned';

export interface UserProfile {
  userId: string;
  email: string;
  displayName: string;
  schoolId: string;
  schoolName: string;
  level: UserLevel;
  points: number;
  streak: number;
  bestStreak: number;
  lastActiveDate: string;
  goal: string;
  difficulties: string;
  confidence: string;
  
  // New Onboarding Memory Fields
  fullName?: string;
  age?: string;
  studyTime?: string;
  perceivedLevel?: string;
  shameLevel?: string;
  englishUnderstanding?: string;
  preferredSituation?: string;
  learningPreference?: string;
  languageProportion?: string;
  practicalCheckAnswers?: Record<string, string>;
  savedErrors?: { category: string, description: string, date: number }[];

  textSessions: number;
  liveSessions: number;
  timeSpent: number;
  createdAt: number;
}

interface AppState {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  activePlan: CustomPlan | null;
  setUser: (user: FirebaseUser | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  setActivePlan: (plan: CustomPlan | null) => void;
}

export const useStore = create<AppState>((set) => ({
  user: null,
  profile: null,
  loading: true,
  activePlan: null,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ loading }),
  setActivePlan: (activePlan) => set({ activePlan }),
}));
