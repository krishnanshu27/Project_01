// components/MeditationSession.tsx
"use client";

import { useState, useRef, useEffect } from 'react';
import { useBluetoothDataStream } from '../components/Bledata';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { 
    Play, 
    Pause, 
    Timer, 
    Brain, 
    Heart, 
    Activity, 
    Sparkles, 
    Moon, 
    Sun,
    CheckCircle,
    Clock,
    Target,
    Zap
} from 'lucide-react';

export const MeditationSession = ({
    onStartSession,
    connected,
    setShowResults,
    onEndSession,
    sessionData,
    sessionResults,
    setSessionResults,
    darkMode,
    renderSessionResults
}: {
    onStartSession: () => void;
    onEndSession: () => void;
    sessionData: { timestamp: number; alpha: number; beta: number; theta: number; delta: number; symmetry: number }[];
    darkMode: boolean;
    connected: boolean;
    setShowResults: React.Dispatch<React.SetStateAction<boolean>>;
    sessionResults?: {
        duration: number;
        averages: {
            alpha: number;
            beta: number;
            theta: number;
            delta: number;
            symmetry: number;
        };
        mentalState: string;
        stateDescription: string;
        focusScore: string;
        symmetry: string;
        data: {
            timestamp: number;
            alpha: number;
            beta: number;
            theta: number;
            delta: number;
            symmetry: number;
        }[];
        dominantBands: Record<string, number>;
        mostFrequent: string;
        convert: (ticks: number) => string;
        avgSymmetry: string;
        formattedDuration: string;
        statePercentages: Record<string, string>;
        goodMeditationPct: string;
        weightedEEGScore: number;
    } | null;

    setSessionResults: React.Dispatch<React.SetStateAction<{
        duration: number;
        averages: {
            alpha: number;
            beta: number;
            theta: number;
            delta: number;
            symmetry: number;
        };
        mentalState: string;
        stateDescription: string;
        focusScore: string;
        symmetry: string;
        data: {
            timestamp: number;
            alpha: number;
            beta: number;
            theta: number;
            delta: number;
            symmetry: number;
        }[];
        dominantBands: Record<string, number>;
        mostFrequent: string;
        convert: (ticks: number) => string;
        avgSymmetry: string;
        formattedDuration: string;
        statePercentages: Record<string, string>;
        goodMeditationPct: string;
        weightedEEGScore: number;
    } | null>>;

    renderSessionResults?: (results: {
        dominantBands: Record<string, number>;
        mostFrequent: string;
        convert: (ticks: number) => string;
        avgSymmetry: string;
        duration: string;
        averages: {
            alpha: number;
            beta: number;
            theta: number;
            delta: number;
            symmetry: number;
        };
        focusScore: string;
        statePercentages: Record<string, string>;
        goodMeditationPct: string;
    }) => React.ReactNode;
}) => {
    const [isMeditating, setIsMeditating] = useState(false);
    const [duration, setDuration] = useState(3);
    const [timeLeft, setTimeLeft] = useState(0);
    const sessionStartTime = useRef<number | null>(null);
    const selectedGoalRef = useRef<string>('meditation');

    const startMeditation = () => {
        setIsMeditating(true);
        setTimeLeft(duration * 60);
        sessionStartTime.current = Date.now();
        onStartSession();
    };

    const stopMeditation = () => {
        setIsMeditating(false);
        const frozenData = sessionData.filter(d => sessionStartTime.current && d.timestamp >= sessionStartTime.current);
        analyzeSession(frozenData);
        onEndSession();
    };

    const analyzeSession = (data: typeof sessionData) => {
        if (!data.length) return;

        const sessionDurationMs = data[data.length - 1].timestamp - data[0].timestamp;
        const sessionDuration = sessionDurationMs > 60000
            ? `${Math.round(sessionDurationMs / 60000)} min`
            : `${Math.round(sessionDurationMs / 1000)} sec`;

        const convert = (ticks: number) => ((ticks * 0.5) / 60).toFixed(2);

        const avgSymmetry = (
            data.reduce((sum, d) => sum + (d.symmetry ?? 0), 0) / data.length
        ).toFixed(3);

        const averages = {
            alpha: data.reduce((sum, d) => sum + d.alpha, 0) / data.length,
            beta: data.reduce((sum, d) => sum + d.beta, 0) / data.length,
            theta: data.reduce((sum, d) => sum + d.theta, 0) / data.length,
            delta: data.reduce((sum, d) => sum + d.delta, 0) / data.length,
            symmetry: data.reduce((sum, d) => sum + d.symmetry, 0) / data.length,
        };

        const totalPower = averages.alpha + averages.beta + averages.theta + averages.delta;

        const statePercentages = {
            Relaxed: ((averages.alpha / totalPower) * 100).toFixed(1),
            Focused: ((averages.beta / totalPower) * 100).toFixed(1),
            "Meditation": ((averages.theta / totalPower) * 100).toFixed(1),
            Drowsy: ((averages.delta / totalPower) * 100).toFixed(1),
        };

        const goodMeditationPct = (
            ((averages.alpha + averages.theta) / totalPower) * 100
        ).toFixed(1);

        const mostFrequent = Object.entries(averages)
            .filter(([key]) => key !== "symmetry")
            .sort((a, b) => b[1] - a[1])[0][0];

        let mentalState = '';
        let stateDescription = '';

        if (mostFrequent === 'alpha') {
            mentalState = 'Relaxed';
            stateDescription = 'Your mind was in a calm and relaxed state, ideal for meditation.';
        } else if (mostFrequent === 'beta') {
            mentalState = 'Focused';
            stateDescription = 'Your mind was highly alert or active. Try to slow down your breath to enter a calmer state.';
        } else if (mostFrequent === 'theta') {
            mentalState = 'Meditation';
            stateDescription = 'You entered a deeply meditative state—excellent work.';
        } else if (mostFrequent === 'delta') {
            mentalState = 'Drowsy';
            stateDescription = 'Your brain was in a very slow-wave state, indicating deep rest or sleepiness.';
        }

        const EEG_WEIGHTS: Record<string, Partial<Record<'alpha' | 'theta' | 'beta' | 'delta', number>>> = {
            meditation: { alpha: 0.4, theta: 0.6 },
            relaxation: { alpha: 0.7, theta: 0.3 },
            focus: { beta: 0.8, alpha: 0.2 },
            sleep: { delta: 1.0 },
        };

        const goal = selectedGoalRef.current;
        const goalWeights = EEG_WEIGHTS[goal] || {};
        const weightedEEGScore = Object.entries(goalWeights).reduce(
            (sum, [band, weight]) => sum + (weight ?? 0) * (averages[band as keyof typeof averages] || 0),
            0
        );
        const focusScore = ((averages.alpha + averages.theta) / (averages.beta + 0.001)).toFixed(2);

        setSessionResults({
            duration: sessionDurationMs / 1000,
            averages,
            mentalState,
            stateDescription,
            focusScore,
            symmetry: averages.symmetry > 0 ? 'Left hemisphere dominant' :
                averages.symmetry < 0 ? 'Right hemisphere dominant' : 'Balanced',
            data,
            dominantBands: {
                alpha: Math.round(averages.alpha * 1000),
                beta: Math.round(averages.beta * 1000),
                theta: Math.round(averages.theta * 1000),
                delta: Math.round(averages.delta * 1000),
            },
            mostFrequent,
            convert,
            avgSymmetry: avgSymmetry,
            formattedDuration: sessionDuration,
            statePercentages,
            goodMeditationPct,
            weightedEEGScore,
        });
    };

    useEffect(() => {
        if (!isMeditating || timeLeft <= 0) return;

        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    stopMeditation();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [isMeditating, timeLeft]);

    const progressPercentage = isMeditating ? ((duration * 60 - timeLeft) / (duration * 60)) * 100 : 0;

    return (
        <div className="h-full w-full min-h-0 overflow-hidden relative flex flex-col">
            {!isMeditating ? (
                !sessionResults ? (
                    // Start Session UI - Modern Design
                    <div className="flex-1 flex flex-col p-6 space-y-8">
                        {/* Header */}
                        <div className="text-center space-y-4">
                            <div className="flex justify-center">
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                                    <Brain className="h-8 w-8 text-white" />
                                </div>
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                                    Ready to Meditate?
                                </h2>
                                <p className="text-muted-foreground mt-2">
                                    Choose your session duration and begin your mindfulness journey
                                </p>
                            </div>
                        </div>

                        {/* Duration Selection */}
                        <Card className="border-0 shadow-lg bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800">
                            <CardHeader className="text-center pb-4">
                                <CardTitle className="flex items-center justify-center gap-2 text-lg">
                                    <Timer className="h-5 w-5 text-indigo-600" />
                                    Session Duration
                                </CardTitle>
                                <CardDescription>
                                    Select how long you'd like to meditate
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-2 gap-3">
                                    {[3, 5, 10, 15].map((val) => (
                                        <Button
                                            key={val}
                                            onClick={() => setDuration(val)}
                                            disabled={!connected}
                                            variant={duration === val ? "default" : "outline"}
                                            className={`h-16 text-lg font-semibold transition-all duration-300 ${
                                                duration === val 
                                                    ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg" 
                                                    : "hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 dark:hover:from-indigo-950 dark:hover:to-purple-950"
                                            } ${!connected ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        >
                                            <div className="flex flex-col items-center">
                                                <span className="text-2xl font-bold">{val}</span>
                                                <span className="text-xs opacity-80">minutes</span>
                                            </div>
                                        </Button>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Connection Status */}
                        <Card className={`border-2 ${connected ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950' : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'}`}>
                            <CardContent className="p-4">
                                <div className="flex items-center justify-center gap-3">
                                    <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                                    <span className="text-sm font-medium">
                                        {connected ? 'Device Connected' : 'Device Disconnected'}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Start Button */}
                        <div className="flex justify-center pt-4">
                            <Button
                                disabled={!connected}
                                onClick={startMeditation}
                                size="lg"
                                className="w-full max-w-xs h-14 text-lg font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-300"
                            >
                                <Play className="mr-2 h-5 w-5" />
                                Begin Meditation
                            </Button>
                        </div>
                    </div>
                ) : (
                    // Session Results UI - Modern Design
                    <div className="flex-1 flex flex-col p-6 space-y-6">
                        {/* Results Header */}
                        <div className="text-center space-y-4">
                            <div className="flex justify-center">
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                                    <CheckCircle className="h-8 w-8 text-white" />
                                </div>
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                                    Session Complete
                                </h2>
                                <p className="text-muted-foreground mt-2">
                                    Great job! Here's your meditation summary
                                </p>
                            </div>
                        </div>

                        {/* Quick Stats */}
                        <div className="grid grid-cols-2 gap-4">
                            <Card className="border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950 dark:to-cyan-950">
                                <CardContent className="p-4 text-center">
                                    <Clock className="h-6 w-6 mx-auto mb-2 text-blue-600" />
                                    <p className="text-xs font-semibold uppercase tracking-wide mb-1 text-blue-600 dark:text-blue-400">
                                        Duration
                                    </p>
                                    <p className="text-lg font-bold text-blue-700 dark:text-blue-300">
                                        {sessionResults.formattedDuration}
                                    </p>
                                </CardContent>
                            </Card>

                            <Card className="border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950 dark:to-pink-950">
                                <CardContent className="p-4 text-center">
                                    <Target className="h-6 w-6 mx-auto mb-2 text-purple-600" />
                                    <p className="text-xs font-semibold uppercase tracking-wide mb-1 text-purple-600 dark:text-purple-400">
                                        State
                                    </p>
                                    <p className="text-lg font-bold capitalize text-purple-700 dark:text-purple-300">
                                        {sessionResults.mostFrequent}
                                    </p>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Results Content */}
                        <div className="flex-1 min-h-0 overflow-y-auto">
                            {renderSessionResults && renderSessionResults({
                                dominantBands: sessionResults.dominantBands,
                                mostFrequent: sessionResults.mostFrequent,
                                convert: sessionResults.convert,
                                avgSymmetry: sessionResults.avgSymmetry,
                                duration: sessionResults.formattedDuration,
                                averages: sessionResults.averages,
                                focusScore: sessionResults.focusScore,
                                statePercentages: sessionResults.statePercentages,
                                goodMeditationPct: sessionResults.goodMeditationPct
                            })}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-3 pt-4">
                            <Button
                                onClick={() => setShowResults(true)}
                                size="lg"
                                className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg"
                            >
                                <Activity className="mr-2 h-5 w-5" />
                                View Full Results
                            </Button>
                            <Button
                                onClick={() => {
                                    setSessionResults(null);
                                    setIsMeditating(false);
                                }}
                                variant="outline"
                                size="lg"
                                className="flex-1"
                            >
                                <Sparkles className="mr-2 h-5 w-5" />
                                New Session
                            </Button>
                        </div>
                    </div>
                )
            ) : (
                // Active Meditation UI - Modern Design
                <div className="flex-1 flex flex-col justify-center items-center p-6 space-y-8">
                    {/* Timer Display */}
                    <div className="relative">
                        {/* Outer Ring */}
                        <div className="w-48 h-48 rounded-full border-4 border-slate-200 dark:border-slate-700 flex items-center justify-center relative">
                            {/* Progress Ring */}
                            <div className="absolute inset-0 rounded-full border-4 border-transparent">
                                <div 
                                    className="w-full h-full rounded-full border-4 border-indigo-500"
                                    style={{
                                        background: `conic-gradient(from 0deg, #3b82f6 ${progressPercentage * 3.6}deg, transparent ${progressPercentage * 3.6}deg)`
                                    }}
                                />
                            </div>
                            
                            {/* Timer Text */}
                            <div className="text-center z-10">
                                <div className="text-4xl font-bold font-mono text-slate-800 dark:text-slate-200">
                                    {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                                </div>
                                <div className="text-sm text-muted-foreground mt-1">
                                    remaining
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Status Indicators */}
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-sm font-medium text-green-600 dark:text-green-400">
                                Recording
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Brain className="h-4 w-4 text-indigo-600" />
                            <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                                Brain Activity
                            </span>
                        </div>
                    </div>

                    {/* End Session Button */}
                    <Button
                        onClick={stopMeditation}
                        size="lg"
                        variant="destructive"
                        className="px-8 py-3 text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-300"
                    >
                        <Pause className="mr-2 h-5 w-5" />
                        End Session
                    </Button>
                </div>
            )}
        </div>
    );
};