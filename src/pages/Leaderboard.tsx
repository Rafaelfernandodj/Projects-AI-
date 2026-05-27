import { useState, useEffect } from 'react';
import { useStore, UserProfile } from '../store/useStore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, orderBy, getDocs, limit } from 'firebase/firestore';
import { Trophy, Medal, Flame } from 'lucide-react';

export default function Leaderboard() {
  const { profile } = useStore();
  const [leaders, setLeaders] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [indexError, setIndexError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    if ((profile.level as string) === 'Error') {
       setLoading(false);
       return;
    }
    const fetchLeaderboard = async () => {
      const currentSchoolName = profile.schoolName || 'Public';
      try {
        // Attempt optimal query (requires composite index)
        const q = query(
          collection(db, 'users'),
          where('schoolName', '==', currentSchoolName),
          orderBy('points', 'desc'),
          limit(50)
        );
        const snapshot = await getDocs(q);
        setLeaders(snapshot.docs.map(doc => doc.data() as UserProfile));
      } catch (err: any) {
        console.warn("Optimal leaderboard query failed, attempting safe fallback (in-memory sorting):", err);
        
        try {
          // Fallback query (only filters by schoolName, does not require composite index)
          const fallbackQ = query(
            collection(db, 'users'),
            where('schoolName', '==', currentSchoolName),
            limit(100)
          );
          const snapshot = await getDocs(fallbackQ);
          const fetchedLeaders = snapshot.docs.map(doc => doc.data() as UserProfile);
          
          // Sort descending in memory
          fetchedLeaders.sort((a, b) => (b.points || 0) - (a.points || 0));
          setLeaders(fetchedLeaders.slice(0, 50));
          
          if (err.message && err.message.includes('requires an index')) {
             setIndexError(err.message);
          }
        } catch (fallbackErr) {
          console.error("Leaderboard fallback query failed as well:", fallbackErr);
          handleFirestoreError(fallbackErr, OperationType.GET, 'users');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchLeaderboard();
  }, [profile]);

  if (!profile) return null;

  return (
    <div translate="no" className="notranslate p-4 sm:p-6 md:p-10 max-w-4xl mx-auto space-y-6 md:space-y-8 min-h-[100dvh] pb-24 md:pb-10 w-full overflow-x-hidden">
      
      {/* Header */}
      <div className="text-center space-y-2 md:space-y-3 pb-6 md:pb-8 border-b border-brand-dark-border">
        <div className="mx-auto w-12 h-12 md:w-16 md:h-16 bg-brand-green/20 text-brand-green-glow rounded-full flex items-center justify-center mb-2 md:mb-4">
          <Trophy className="w-6 h-6 md:w-8 md:h-8" />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-brand-text px-2 leading-tight">School Leaderboard</h1>
        <p className="text-sm md:text-base text-gray-400 font-medium px-4">
          See how you rank among students at <br className="md:hidden" /> {profile.schoolName}
        </p>
      </div>

      {indexError && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          <p className="font-bold mb-2">Atenção: Um índice no banco de dados é necessário.</p>
          <p className="mb-2">Por favor, clique no link abaixo para criar o índice no Firebase Console (é automático):</p>
          <a
             href={indexError.match(/(https:\/\/[^\s]+)/)?.[0]}
             target="_blank"
             rel="noreferrer"
             className="text-brand-green-glow hover:underline break-all block mt-2 p-3 bg-black/30 rounded-lg font-mono text-xs text-white"
          >
             Criar Índice no Firebase
          </a>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-12">
           <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-green-glow"></div>
        </div>
      ) : (
        <>
          {/* Mobile View: Cards */}
          <div className="md:hidden space-y-3">
            {leaders.map((student, idx) => {
              const isCurrentUser = student.userId === profile.userId;
              return (
                <div 
                  key={student.userId} 
                  className={`flex items-center justify-between p-4 rounded-2xl border ${
                    isCurrentUser 
                      ? 'bg-brand-green/10 border-brand-green/30' 
                      : 'bg-brand-dark-light border-brand-dark-border shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
                    <div className="flex-shrink-0 w-8 text-center">
                      {idx === 0 && <Medal className="inline text-yellow-500 mx-auto" size={24} />}
                      {idx === 1 && <Medal className="inline text-gray-400 mx-auto" size={24} />}
                      {idx === 2 && <Medal className="inline text-amber-600 mx-auto" size={24} />}
                      {idx > 2 && <span className="font-bold text-gray-500 text-lg">{idx + 1}</span>}
                    </div>
                    
                    <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-brand-dark font-bold ${
                        isCurrentUser ? 'bg-brand-green-glow' : 'bg-gray-500 text-white'
                    }`}>
                      {student.displayName?.charAt(0).toUpperCase() || 'S'}
                    </div>

                    <div className="min-w-0">
                      <div className="font-bold text-brand-text flex items-center gap-2 truncate">
                         <span className="truncate">{student.displayName}</span>
                         {isCurrentUser && <span className="flex-shrink-0 text-[10px] bg-brand-green text-brand-dark px-1.5 py-0.5 rounded uppercase tracking-wider font-bold">You</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs font-medium text-brand-green">{student.level}</span>
                        <div className="flex items-center gap-1 text-xs font-bold text-orange-500">
                           <Flame size={12} className="fill-orange-500" /> {student.streak}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex-shrink-0 text-right pl-2">
                     <span className="block font-black text-lg text-brand-green-glow leading-none">{student.points}</span>
                     <span className="text-[10px] tracking-wider uppercase text-gray-500 font-bold">pts</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop View: Table */}
          <div className="hidden md:block bg-brand-dark-light rounded-3xl border border-brand-dark-border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-brand-text">
                <thead>
                  <tr className="bg-brand-dark border-b border-brand-dark-border text-xs uppercase tracking-wider text-gray-400 font-semibold">
                    <th className="p-4 pl-6 w-16 text-center">Rank</th>
                    <th className="p-4">Student</th>
                    <th className="p-4">Level</th>
                    <th className="p-4 text-center">Streak</th>
                    <th className="p-4 pr-6 text-right w-24">Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-dark-border">
                  {leaders.map((student, idx) => {
                    const isCurrentUser = student.userId === profile.userId;
                    return (
                      <tr 
                        key={student.userId} 
                        className={`transition-colors hover:bg-brand-dark ${
                          isCurrentUser ? 'bg-brand-green/10' : ''
                        }`}
                      >
                        <td className="p-4 pl-6 text-center">
                          {idx === 0 && <Medal className="inline text-yellow-500" size={24} />}
                          {idx === 1 && <Medal className="inline text-gray-400" size={24} />}
                          {idx === 2 && <Medal className="inline text-amber-600" size={24} />}
                          {idx > 2 && <span className="font-bold text-gray-500">{idx + 1}</span>}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-brand-dark font-bold ${
                                isCurrentUser ? 'bg-brand-green-glow' : 'bg-gray-500 text-white'
                            }`}>
                              {student.displayName?.charAt(0).toUpperCase() || 'S'}
                            </div>
                            <div>
                              <div className="font-bold text-brand-text flex items-center gap-2">
                                 {student.displayName}{isCurrentUser && <span className="text-xs bg-brand-green/20 text-brand-green-glow px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">You</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-brand-dark border border-brand-dark-border text-brand-green">
                            {student.level}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-1.5 font-bold text-orange-500">
                             <Flame size={16} className="fill-orange-500" />
                             {student.streak}
                          </div>
                        </td>
                        <td className="p-4 pr-6 text-right">
                          <span className="font-black text-lg text-brand-green-glow">{student.points}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          
          {leaders.length === 0 && (
             <div className="p-12 text-center text-gray-500">
                No students found for this school.
             </div>
          )}
        </>
      )}
    </div>
  );
}
