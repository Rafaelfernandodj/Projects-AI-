import React from "react";

export const LogoIcon = ({ className = "w-8 h-8" }: { className?: string }) => (
  <svg
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* Bubble Outline */}
    <path
      d="M58 20H35C24.5 20 16 28.5 16 39V65C16 75.5 24.5 84 35 84H65C75.5 84 84 75.5 84 65V32"
      stroke="#8B9D6E"
      strokeWidth="7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Bubble Tail */}
    <path
      d="M16 60V86L38 80"
      fill="#8B9D6E"
    />
    <path
      d="M16 60V86L38 80"
      stroke="#8B9D6E"
      strokeWidth="7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Dot */}
    <circle cx="82" cy="24" r="8" fill="#8B9D6E" />
    
    {/* Letter L */}
    <path
      d="M40 38V62C40 64.2091 41.7909 66 44 66H58"
      stroke="#FFFFFF"
      strokeWidth="11"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const Logo = ({ className = "h-12" }: { className?: string }) => (
  <div className={`flex flex-col items-center justify-center ${className}`}>
    <div className="flex items-center space-x-3">
      <LogoIcon className="w-10 h-10" />
      <span className="font-serif text-white text-4xl leading-none">Liam</span>
    </div>
    <span className="text-[#8B9D6E] text-[10px] tracking-widest font-semibold mt-1">
      YOUR AI ENGLISH BUDDY
    </span>
  </div>
);
