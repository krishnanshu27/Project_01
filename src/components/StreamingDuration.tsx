import React, { useEffect, useState } from "react";

interface StreamingDurationProps {
    startTime: number | null;
    isLive: boolean;
}

function formatDuration(ms: number) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [
        hours.toString().padStart(2, "0"),
        minutes.toString().padStart(2, "0"),
        seconds.toString().padStart(2, "0"),
    ].join(":");
}

export default function StreamingDuration({ startTime, isLive }: StreamingDurationProps) {
    const [duration, setDuration] = useState(0);

    useEffect(() => {
        if (!isLive || !startTime) {
            setDuration(0);
            return;
        }
        const interval = setInterval(() => {
            setDuration(Date.now() - startTime);
        }, 1000);
        return () => clearInterval(interval);
    }, [startTime, isLive]);

    if (!isLive || !startTime) return null;

    return (
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-50 text-green-700 font-bold shadow">
            <span>Live for {formatDuration(duration)}</span>
        </div>
    );
}