'use strict';
// components/MentalStateIndicator.tsx
import React from "react";
import { cn } from "@/lib/helpers";

const emotionIcons = {
  stressed: "😰",
  relaxed: "😌",
  happy: "😄",
  focused: "🧠",
  neutral: "😐",
  mild_stress: "😟",
  no_data: "⏳"
};

const emotionStyles = {
  stressed: "text-red-800",
  relaxed: "text-blue-800",
  happy: "text-green-800",
  focused: "text-yellow-800",
  neutral: "text-gray-800",
  mild_stress: "text-orange-800",
  no_data: "text-white animate-pulse"
};

export type EmotionalState = keyof typeof emotionIcons;

interface MoodDisplayProps {
  state: EmotionalState;
}

export function MoodDisplay({ state }: MoodDisplayProps) {
  const formattedLabel = state === "no_data" ? "Analyzing..." : state.replace("_", " ");
  
  return (
    <div className={cn(
      "px-2 rounded-lg flex items-center space-x-2",
      emotionStyles[state]
    )}>
      <span className="">{emotionIcons[state]}</span>
      <span className="font-semibold capitalize text-[0.3em] sm:text-[0.4em] md:text-[0.8em]">
        {formattedLabel}
      </span>
    </div>
  );
}

