'use client';

import Image from 'next/image';

interface BizaflowLogoProps {
  size?: number;
  rounded?: boolean;
  showGlow?: boolean;
  alt?: string;
}

export default function BizaflowLogo({
  size = 72,
  rounded = true,
  showGlow = true,
  alt = 'Logo Bizaflow',
}: BizaflowLogoProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: rounded ? Math.max(12, Math.floor(size * 0.26)) : 0,
        overflow: 'hidden',
        margin: '0 auto',
        boxShadow: showGlow ? '0 8px 32px rgba(6, 182, 212, 0.25)' : 'none',
        border: '1px solid rgba(6, 182, 212, 0.25)',
        background: '#000',
      }}
    >
      <Image
        src="/logo_bizaflow.png"
        alt={alt}
        width={size}
        height={size}
        priority
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  );
}
