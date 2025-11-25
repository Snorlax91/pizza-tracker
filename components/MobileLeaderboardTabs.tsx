'use client';

import { useState } from 'react';
import { FriendsLeaderboard } from './FriendsLeaderboard';
import { GroupLeaderboard } from './GroupLeaderboard';

export function MobileLeaderboardTabs({ userId }: { userId: string }) {
  const [activeTab, setActiveTab] = useState<'friends' | 'group'>('friends');

  return (
    <div className="bg-slate-800/70 border border-slate-700 rounded-2xl overflow-hidden">
      {/* Tab switcher */}
      <div className="flex border-b border-slate-700">
        <button
          onClick={() => setActiveTab('friends')}
          className={`flex-1 px-3 py-2 text-xs font-semibold transition-colors hover:bg-slate-800/50 border-r border-slate-700 ${
            activeTab === 'friends' ? 'bg-slate-800/70 text-slate-100' : 'text-slate-400'
          }`}
        >
          🏆 Amici
        </button>
        <button
          onClick={() => setActiveTab('group')}
          className={`flex-1 px-3 py-2 text-xs font-semibold transition-colors hover:bg-slate-800/50 ${
            activeTab === 'group' ? 'bg-slate-800/70 text-slate-100' : 'text-slate-400'
          }`}
        >
          👥 Gruppo
        </button>
      </div>
      
      {/* Content - le componenti già hanno i propri Link, quindi non li wrappano qui */}
      <div>
        {activeTab === 'friends' ? (
          <FriendsLeaderboard userId={userId} />
        ) : (
          <GroupLeaderboard userId={userId} />
        )}
      </div>
    </div>
  );
}
