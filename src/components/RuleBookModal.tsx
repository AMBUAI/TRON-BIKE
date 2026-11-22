import React from 'react';
import { BookOpen, X } from 'lucide-react';

const RULE_SECTIONS = [
  {
    title: '01. Objective of the Game',
    body: 'TRON BIKE is a 6-player last-player-standing light-cycle & cyber-car survival match. Outmaneuver rival riders, trap them with your glowing light wall, and be the final racer left standing on the grid.',
  },
  {
    title: '02. How to Join a Match',
    body: 'Tap JOIN GAME from the main menu, enter the 6-character alphanumeric Room Code shared by a host, and enter the lobby. You can also accept a direct invitation from a friend without typing a code.',
  },
  {
    title: '03. How to Host a Match',
    body: 'Tap HOST GAME to create a private multiplayer room with a unique 6-character code. Share the code or invite friends directly from your friends list. As host, you start the match once everyone is ready.',
  },
  {
    title: '04. How to Invite Friends',
    body: 'Inside the lobby, tap Invite Friends to send direct in-app room invitations to your online friends. Accepting an invitation brings them straight into your lobby—no room code required.',
  },
  {
    title: '05. Player Limit',
    body: 'Matches support 1 to 6 real online players. The host can launch solo or with up to 6 players, and a room locks permanently once the match countdown starts.',
  },
  {
    title: '06. Bike Movement Rules',
    body: 'Light cycles accelerate automatically and move forward continuously at constant speed. There is no brake, reverse, stop, or manual throttle.',
  },
  {
    title: '07. Swipe Steering Controls',
    body: 'Swipe left anywhere on the gameplay viewport to turn 90 degrees left, or swipe right to turn 90 degrees right. A brief turn cooldown prevents accidental 180-degree self-reversals.',
  },
  {
    title: '08. First-Person Camera',
    body: 'First-person view places the camera directly at the rider helmet visor, giving a high-speed cockpit view of the grid and incoming light walls ahead.',
  },
  {
    title: '09. Third-Person Camera',
    body: 'Third-person view tracks smoothly behind your light cycle so you can see your entire bike lean into turns and watch your neon trail form behind you.',
  },
  {
    title: '10. Eye Icon Camera Switching',
    body: 'Tap the Eye icon at the top of the gameplay screen at any time to switch between First-Person and Third-Person view immediately without interrupting steering or speed.',
  },
  {
    title: '11. Light-Trail Mechanics',
    body: 'Every living vehicle emits a solid, permanent vertical neon light wall matching its assigned color. Each match assigns up to 6 distinct neon colors across the riders.',
  },
  {
    title: '12. Collision Rules',
    body: 'Crashing into any active light trail—including your own trail or another living rider’s trail—instantly eliminates your motorcycle.',
  },
  {
    title: '13. Outer Energy Boundary Rules',
    body: 'The enormous open arena has no internal walls or obstacles. Only the tall glowing perimeter energy barrier bounds the grid. Touching or crossing it eliminates your bike.',
  },
  {
    title: '14. Elimination Rules',
    body: 'Elimination is permanent for that round. Upon elimination, your motorcycle explodes and your entire light trail disappears immediately so it can no longer block survivors.',
  },
  {
    title: '15. Simultaneous Elimination Rules',
    body: 'If two players collide with light trails within the authoritative simultaneous tolerance window, both are eliminated together, both trails vanish, and the arena announces: THEY KISSED THEIR DEATH.',
  },
  {
    title: '16. Spectator Mode',
    body: 'Eliminated players remain connected in the room and automatically switch to Spectator Mode until a winner is decided.',
  },
  {
    title: '17. Free Spectator Camera',
    body: 'As a spectator, drag anywhere to look around, use the movement controls to fly freely across the entire arena, or tap Next Rider to jump near surviving players.',
  },
  {
    title: '18. Last-Player-Standing Victory',
    body: 'There is no round timer or match time limit. The battle continues for as long as needed until only one survivor remains—or results in a draw if all remaining players crash simultaneously.',
  },
  {
    title: '19. Wheelie Victory Animation',
    body: 'When the final survivor wins, gameplay freezes and the camera orbits the winning motorcycle as it performs a celebratory wheelie stunt under the LAST SURVIVOR — WINNER banner.',
  },
  {
    title: '20. Rematch Rules',
    body: 'On the Results screen, press PLAY AGAIN to vote for a rematch. Once all remaining players in the room agree, trails and statuses reset completely with fresh random spawn positions and new random neon colors.',
  },
];

export const RuleBookModal: React.FC<{ onClose: () => void }> = ({
  onClose,
}) => {
  return (
    <div className="fixed inset-0 h-[100dvh] z-50 flex items-center justify-center bg-black/80 p-2 sm:p-4">
      <div className="flex flex-col w-full max-w-4xl max-h-[94dvh] rounded-xl border border-cyan-500/35 bg-[#080D1B] text-slate-100">
        <div className="flex items-center justify-between gap-4 px-4 py-2.5 sm:px-5 sm:py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-cyan-400 shrink-0" />
            <h2 className="font-display text-base sm:text-lg font-bold tracking-wide text-white">
              TRON BIKE Rule Book
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close rule book"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-white/15 text-slate-300 hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scroll p-3.5 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {RULE_SECTIONS.map((item) => (
            <div
              key={item.title}
              className="rounded-lg border border-white/10 bg-[#0D1528] p-3"
            >
              <h3 className="font-display text-xs sm:text-sm font-bold text-cyan-300">
                {item.title}
              </h3>
              <p className="mt-1 text-xs sm:text-sm text-slate-300 leading-relaxed">
                {item.body}
              </p>
            </div>
          ))}
        </div>

        <div className="px-4 py-2.5 sm:px-5 sm:py-3 border-t border-white/10 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] px-6 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-sm hover:bg-cyan-400 transition"
          >
            Return
          </button>
        </div>
      </div>
    </div>
  );
};
