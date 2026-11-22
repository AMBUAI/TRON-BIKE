import React from 'react';

const AVATAR_STYLES = [
  { name: 'Vortex', bg: '#15101A', primary: '#00F0FF', src: '/assets/avatars/helmet-0.png' },
  { name: 'Pulse', bg: '#181018', primary: '#FF2A85', src: '/assets/avatars/helmet-1.png' },
  { name: 'Solaris', bg: '#18140E', primary: '#FFB800', src: '/assets/avatars/helmet-2.png' },
  { name: 'Specter', bg: '#15101E', primary: '#A855F7', src: '/assets/avatars/helmet-3.png' },
  { name: 'Vector', bg: '#101812', primary: '#39FF14', src: '/assets/avatars/helmet-4.png' },
  { name: 'Cobalt', bg: '#101420', primary: '#3B82F6', src: '/assets/avatars/helmet-5.png' },
  { name: 'Crimson', bg: '#1A1014', primary: '#FF2442', src: '/assets/avatars/helmet-6.png' },
  { name: 'Prism', bg: '#14151A', primary: '#F1F5F9', src: '/assets/avatars/helmet-7.png' },
];

export const AvatarBadge: React.FC<{
  avatarId: number;
  size?: number;
  borderColor?: string;
}> = ({ avatarId, size = 40, borderColor }) => {
  const style = AVATAR_STYLES[Math.abs(avatarId) % AVATAR_STYLES.length];

  return (
    <div
      style={{
        width: size,
        height: size,
        backgroundColor: style.bg,
        borderColor: borderColor ?? style.primary,
      }}
      title={`${style.name} Helmet`}
      className="relative shrink-0 rounded-lg border flex items-center justify-center overflow-hidden"
    >
      <img
        src={style.src}
        alt={`${style.name} Rider Helmet`}
        className="w-full h-full object-cover select-none pointer-events-none"
        draggable={false}
      />
    </div>
  );
};

export const AVATAR_COUNT = AVATAR_STYLES.length;
