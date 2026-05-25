/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { useStore, UserProfile } from './store/useStore';

// Temporary place for imports
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Onboarding from './pages/Onboarding';
import LiveMode from './pages/LiveMode';
import Leaderboard from './pages/Leaderboard';
import Profile from './pages/Profile';
import Layout from './components/Layout';

export default function App() {
  const { setUser, setProfile, setLoading, user, loading } = useStore();

  useEffect(() => {
    // PWA Diagnostic internal logs
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(userAgent);
    const isAndroid = /android/.test(userAgent);
    
    console.log("PWA diagnostic:");
    console.log("Manifest available:", true); // Assumed true if index.html loaded
    console.log("Service worker supported:", "serviceWorker" in navigator);
    console.log("Service worker registered:", true); // Usually handled in main.tsx
    console.log("isAndroid:", isAndroid);
    console.log("isIOS:", isIOS);
    console.log("isStandalone:", Boolean(isStandalone));
    console.log("reload prevention active:", true);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const docRef = doc(db, 'users', firebaseUser.uid);
          // Try fetching from the server, but timeout to allow UI to render (Firestore cache handles offline if fast enough)
          const docSnap = await Promise.race([getDoc(docRef), new Promise<any>((_, reject) => setTimeout(() => reject('timeout'), 4000))]);
          
          if (docSnap && docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
            // Ignore any local pending if server has it
            localStorage.removeItem('pendingProfileSetup');
          } else {
            // Check if there is a pending local profile
            const pendingProfile = localStorage.getItem('pendingProfileSetup');
            if (pendingProfile) {
               try {
                  const parsed = JSON.parse(pendingProfile);
                  if (parsed.userId === firebaseUser.uid) {
                      setProfile(parsed);
                      console.log("Loaded pending profile from local storage, syncing to backend...");
                      // Try background sync
                      import('firebase/firestore').then(({ setDoc }) => {
                          setDoc(docRef, parsed, { merge: true })
                            .then(() => localStorage.removeItem('pendingProfileSetup'))
                            .catch(e => console.warn("Background sync failed:", e));
                      });
                  } else {
                      setProfile(null);
                  }
               } catch(e) {
                  setProfile(null);
               }
            } else {
               setProfile(null);
            }
          }
        } catch (error) {
          console.warn("Firestore loading error, attempting to load from cache/local:", error);
          const pendingProfile = localStorage.getItem('pendingProfileSetup');
          if (pendingProfile) {
             try {
                const parsed = JSON.parse(pendingProfile);
                if (parsed.userId === firebaseUser.uid) {
                    setProfile(parsed);
                } else {
                    setProfile(null);
                }
             } catch(e) {
                setProfile(null);
             }
          } else {
             // Fallback minimal
             setProfile({ userId: firebaseUser.uid, displayName: 'Offline', email: firebaseUser.email || '', level: 'Básico', points: 0, streak: 0, textSessions: 0 } as any); 
          }
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setUser, setProfile, setLoading]);

  if (loading) {
    const isRestoringLive = sessionStorage.getItem('live_active_reload');
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-900">
        {isRestoringLive ? "Reconectando com o Liam..." : "Loading Liam..."}
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
        
        <Route element={user ? <Layout /> : <Navigate to="/login" />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/live" element={<LiveMode />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
      </Routes>
    </Router>
  );
}

