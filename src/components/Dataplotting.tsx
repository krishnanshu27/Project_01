"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { useMotionValue } from "framer-motion";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    ResponsiveContainer,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    Radar,
} from 'recharts';
import { 
    Activity, Brain, Heart, Moon, Sun, Plug, PlugZap, Zap, Clock, Target,
    Signal, TrendingUp, ActivitySquare, Gauge, BarChart3, Waves
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { useBleStream } from '../components/Bledata';
import WebglPlotCanvas from '../components/WebglPlotCanvas';
import Contributors from './Contributors';
import { WebglPlotCanvasHandle } from "../components/WebglPlotCanvas";
import HRVPlotCanvas, { HRVPlotCanvasHandle } from '@/components/Hrvwebglplot'
import { StateIndicator, State } from "@/components/StateIndicator";
import MeditationWaveform from "../components/MeditationWaveform";
import { predictState } from "@/lib/stateClassifier";
import { useRouter } from 'next/navigation';
import { MeditationSession } from '../components/MeditationSession';
import QuoteCard from './QuoteCard';
import Link from "next/link";

const CHANNEL_COLORS: Record<string, string> = {
    ch0: "#C29963",
    ch1: "#63A2C2", 
    ch2: "#E4967E",
};

export default function SignalVisualizer() {
    const [darkMode, setDarkMode] = useState(false);
    const canvaseeg1Ref = useRef<WebglPlotCanvasHandle>(null);
    const canvaseeg2Ref = useRef<WebglPlotCanvasHandle>(null);
    const canvasecgRef = useRef<WebglPlotCanvasHandle>(null);
    const buf0Ref = useRef<number[]>([]);
    const buf1Ref = useRef<number[]>([]);
    const radarDataCh0Ref = useRef<{ subject: string; value: number }[]>([]);
    const radarDataCh1Ref = useRef<{ subject: string; value: number }[]>([]);
    const workerRef = useRef<Worker | null>(null);
    const dataProcessorWorkerRef = useRef<Worker | null>(null);
    const [isBeating, setIsBeating] = useState(false);
    const [displayState, setDisplayState] = useState<State>("no_data");
    const stateWindowRef = useRef<{ state: State; timestamp: number }[]>([]);
    const lastStateUpdateRef = useRef<number>(0);
    const connectionStartRef = useRef<number | null>(null);
    const [sessionResults, setSessionResults] = useState<{
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
        data: typeof sessionDataRef.current;
        dominantBands: Record<string, number>;
        mostFrequent: string;
        convert: (ticks: number) => string;
        avgSymmetry: string;
        formattedDuration: string;
        statePercentages: Record<string, string>;
        goodMeditationPct: string;
        weightedEEGScore: number;
    } | null>(null);
    const currentRef = useRef<HTMLDivElement>(null);
    const highRef = useRef<HTMLDivElement>(null);
    const lowRef = useRef<HTMLDivElement>(null);
    const avgRef = useRef<HTMLDivElement>(null);
    const bpmWorkerRef = useRef<Worker | null>(null);
    const previousCounterRef = useRef<number | null>(null);
    const hrvRef = useRef<HTMLDivElement>(null);
    const hrvHighRef = useRef<HTMLDivElement>(null);
    const hrvLowRef = useRef<HTMLDivElement>(null);
    const hrvAvgRef = useRef<HTMLDivElement>(null);
    const [hrvData, setHrvData] = useState<{ time: number; hrv: number }[]>([]);
    const hrvplotRef = useRef<HRVPlotCanvasHandle>(null);
    const router = useRouter();
    const leftMV = useMotionValue(0);
    const rightMV = useMotionValue(0);
    const ecgBufRef = useRef<number[]>([]);
    const [viewMode, setViewMode] = useState<"radar" | "meditation">("radar");
    const [selectedGoal, setSelectedGoal] = useState<"anxiety" | "meditation" | "sleep">("anxiety");
    const [showResults, setShowResults] = useState(false);
    const selectedGoalRef = useRef(selectedGoal);
    const [calmScore, setCalmScore] = useState<number | null>(null);
    const sessionDataRef = useRef<{ timestamp: number; alpha: number; beta: number; theta: number; delta: number, symmetry: number }[]>([]);
    const isMeditatingRef = useRef(false);
    const SAMPLE_RATE = 500;
    const FFT_SIZE = 256;
    const sampleCounterRef = useRef(0);

    useEffect(() => {
        selectedGoalRef.current = selectedGoal;
    }, [selectedGoal]);

    useEffect(() => {
        const interval = setInterval(() => {
            setIsBeating(true);
            setTimeout(() => setIsBeating(false), 200);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const datastream = useCallback((data: number[]) => {
        dataProcessorWorkerRef.current?.postMessage({
            command: "process",
            rawData: {
                counter: data[0],
                raw0: data[1],
                raw1: data[2],
                raw2: data[3],
            },
        });
    }, []);

    const { connected, connect, disconnect } = useBleStream(datastream);

    const channelColors: Record<string, string> = {
        ch0: "#C29963",
        ch1: "#548687",
        ch2: "#9A7197",
    };

    const bandData = [
        { subject: "Delta", value: 0 },
        { subject: "Theta", value: 0 },
        { subject: "Alpha", value: 0 },
        { subject: "Beta", value: 0 },
        { subject: "Gamma", value: 0 },
    ];

    useEffect(() => {
        const worker = new Worker(
            new URL("../webworker/dataProcessor.worker.ts", import.meta.url),
            { type: "module" }
        );
        worker.onmessage = (e) => {
            if (e.data.type === "processedData") {
                const { counter, eeg0, eeg1, ecg } = e.data.data;
                canvaseeg1Ref.current?.updateData([counter, eeg0, 1]);
                canvaseeg2Ref.current?.updateData([counter, eeg1, 2]);
                canvasecgRef.current?.updateData([counter, ecg, 3]);
                onNewSample(eeg0, eeg1);
            }
        };
        dataProcessorWorkerRef.current = worker;
        return () => worker.terminate();
    }, []);

    useEffect(() => {
        const w = new Worker(
            new URL("../webworker/bandPower.worker.ts", import.meta.url),
            { type: "module" }
        );

        w.onmessage = (
            e: MessageEvent<{
                smooth0: Record<string, number>;
                smooth1: Record<string, number>;
            }>
        ) => {
            const { smooth0, smooth1 } = e.data;
            leftMV.set(smooth0.beta);
            rightMV.set(smooth1.beta);

            function capitalize(subject: string): string {
                return subject.charAt(0).toUpperCase() + subject.slice(1);
            }

            radarDataCh0Ref.current = Object.entries(smooth0).map(
                ([subject, value]) => ({ subject: capitalize(subject), value })
            );

            radarDataCh1Ref.current = Object.entries(smooth1).map(
                ([subject, value]) => ({ subject: capitalize(subject), value })
            );

            let score = 0;
            const goal = selectedGoalRef.current;

            if (goal === "anxiety") {
                score = (Number(smooth0.alpha) + Number(smooth1.alpha)) / (Number(smooth0.beta) + Number(smooth1.beta) + 0.001);
            } else if (goal === "meditation") {
                score = (smooth0.theta + smooth1.theta) / 2;
            } else if (goal === "sleep") {
                score = (smooth0.delta + smooth1.delta) / 2;
            }

            const currentData = {
                timestamp: Date.now(),
                alpha: (smooth0.alpha + smooth1.alpha) / 2,
                beta: (smooth0.beta + smooth1.beta) / 2,
                theta: (smooth0.theta + smooth1.theta) / 2,
                delta: (smooth0.delta + smooth1.delta) / 2,
                symmetry: Math.abs(smooth0.alpha - smooth1.alpha),
            };

            if (isMeditatingRef.current) {
                sessionDataRef.current.push(currentData);
            }

            setCalmScore(score);
        };

        workerRef.current = w;
        return () => {
            w.terminate();
        };
    }, []);

    const onNewSample = useCallback((eeg0: number, eeg1: number) => {
        buf0Ref.current.push(eeg0);
        buf1Ref.current.push(eeg1);
        sampleCounterRef.current++;

        if (buf0Ref.current.length > FFT_SIZE) {
            buf0Ref.current.shift();
            buf1Ref.current.shift();
        }

        if (sampleCounterRef.current % 10 === 0 && buf0Ref.current.length === FFT_SIZE) {
            workerRef.current?.postMessage({
                eeg0: [...buf0Ref.current],
                eeg1: [...buf1Ref.current],
                sampleRate: SAMPLE_RATE,
                fftSize: FFT_SIZE,
            });
        }
    }, []);

    const onNewECG = useCallback((ecg: number) => {
        ecgBufRef.current.push(ecg);
        if (ecgBufRef.current.length > 2500) {
            ecgBufRef.current.shift();
        }
        if (ecgBufRef.current.length % 500 === 0) {
            bpmWorkerRef.current?.postMessage({
                ecgBuffer: [...ecgBufRef.current],
                sampleRate: 500,
            });
        }
    }, []);

    useEffect(() => {
        const worker = new Worker(
            new URL("../webworker/bpm.worker.ts", import.meta.url),
            { type: "module" }
        );

        const bpmWindow: number[] = [];
        const windowSize = 5;
        let displayedBPM: number | null = null;
        const maxChange = 2;

        worker.onmessage = (
            e: MessageEvent<{
                bpm: number | null;
                high: number | null;
                low: number | null;
                avg: number | null;
                peaks: number[];
                hrv: number | null;
                hrvHigh: number | null;
                hrvLow: number | null;
                hrvAvg: number | null;
                sdnn: number;
                rmssd: number;
                pnn50: number;
            }>
        ) => {
            const { bpm, high, low, avg, hrv, hrvHigh, hrvLow, hrvAvg, sdnn, rmssd, pnn50 } = e.data;

            if (hrv !== null && !isNaN(hrv)) {
                hrvplotRef.current?.updateHRV(hrv);
            }

            if (bpm !== null) {
                bpmWindow.push(bpm);
                if (bpmWindow.length > windowSize) bpmWindow.shift();
                const avgBPM = bpmWindow.reduce((a, b) => a + b, 0) / bpmWindow.length;
                if (displayedBPM === null) displayedBPM = avgBPM;
                else {
                    const diff = avgBPM - displayedBPM;
                    displayedBPM += Math.sign(diff) * Math.min(Math.abs(diff), maxChange);
                }
                if (currentRef.current) currentRef.current.textContent = `${Math.round(displayedBPM)}`;
            } else {
                bpmWindow.length = 0;
                displayedBPM = null;
                if (currentRef.current) currentRef.current.textContent = "--";
            }

            if (highRef.current) highRef.current.textContent = high !== null ? `${high}` : "--";
            if (lowRef.current) lowRef.current.textContent = low !== null ? `${low}` : "--";
            if (avgRef.current) avgRef.current.textContent = avg !== null ? `${avg}` : "--";

            if (hrvRef.current) hrvRef.current.textContent = hrv !== null ? `${hrv}` : "--";
            if (hrvHighRef.current) hrvHighRef.current.textContent = hrvHigh !== null ? `${hrvHigh}` : "--";
            if (hrvLowRef.current) hrvLowRef.current.textContent = hrvLow !== null ? `${hrvLow}` : "--";
            if (hrvAvgRef.current) hrvAvgRef.current.textContent = hrvAvg !== null ? `${hrvAvg}` : "--";

            const currentState = predictState({ sdnn, rmssd, pnn50 });
            const now = Date.now();

            if (connectionStartRef.current === null) {
                connectionStartRef.current = now;
                lastStateUpdateRef.current = now;
            }

            stateWindowRef.current.push({
                state: currentState,
                timestamp: now
            });

            const STATE_UPDATE_INTERVAL = 5000;
            const fiveSecondsAgo = now - STATE_UPDATE_INTERVAL;
            stateWindowRef.current = stateWindowRef.current.filter(
                item => item.timestamp >= fiveSecondsAgo
            );

            const timeSinceLastUpdate = now - lastStateUpdateRef.current;
            const timeSinceConnection = now - connectionStartRef.current;

            if (timeSinceConnection < STATE_UPDATE_INTERVAL) {
                setDisplayState("no_data");
            } else if (timeSinceLastUpdate >= STATE_UPDATE_INTERVAL) {
                if (stateWindowRef.current.length > 0) {
                    const stateCounts: Record<string, number> = {};
                    stateWindowRef.current.forEach(item => {
                        stateCounts[item.state] = (stateCounts[item.state] || 0) + 1;
                    });

                    const dominantState = Object.entries(stateCounts).reduce((a, b) =>
                        a[1] > b[1] ? a : b
                    )[0] as State;

                    setDisplayState(dominantState);
                    lastStateUpdateRef.current = now;
                }
            }
        };

        bpmWorkerRef.current = worker;
        return () => {
            worker.terminate();
        };
    }, []);

    useEffect(() => {
        isMeditatingRef.current = viewMode === "meditation";
    }, [viewMode]);

    useEffect(() => {
        if (connected) {
            connectionStartRef.current = Date.now();
            lastStateUpdateRef.current = Date.now();
            stateWindowRef.current = [];
            setDisplayState("no_data");
        } else {
            connectionStartRef.current = null;
            lastStateUpdateRef.current = 0;
            stateWindowRef.current = [];
            setDisplayState("no_data");
        }
    }, [connected]);

    useEffect(() => {
        const dp = dataProcessorWorkerRef.current!;
        const handler = (e: MessageEvent) => {
            if (e.data.type === "processedData") {
                const { eeg0, eeg1, ecg } = e.data.data;
                onNewSample(eeg0, eeg1);
                onNewECG(ecg);
            }
        };
        dp.addEventListener("message", handler);
        return () => {
            dp.removeEventListener("message", handler);
        };
    }, [onNewSample, onNewECG]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
            {/* Header */}
            <header className="sticky top-0 z-50 w-full border-b bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl">
                <div className="container mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
                                <Brain className="h-6 w-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                                    Neural<span className="text-blue-600 dark:text-blue-400">Sense</span>
                                </h1>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Real-time brain monitoring
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                                <div className={cn(
                                    "h-2 w-2 rounded-full",
                                    connected ? "bg-green-500 animate-pulse" : "bg-slate-400"
                                )} />
                                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                                    {connected ? "Connected" : "Disconnected"}
                                </span>
                            </div>

                            {!connected ? (
                                <Button onClick={connect} className="gap-2">
                                    <Plug className="h-4 w-4" />
                                    Connect
                                </Button>
                            ) : (
                                <Button onClick={disconnect} variant="destructive" className="gap-2">
                                    <PlugZap className="h-4 w-4" />
                                    Disconnect
                                </Button>
                            )}

                            <Button
                                onClick={() => setDarkMode(!darkMode)}
                                variant="ghost"
                                size="icon"
                                className="rounded-lg"
                            >
                                {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                            </Button>

                            <Contributors darkMode={darkMode} />
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="container mx-auto px-4 py-6 space-y-6">
             
                {/* Main Dashboard */}
                <Tabs defaultValue="overview" className="space-y-6">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                      
                        <TabsTrigger value="meditation">Meditation</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-6">
                        {/* Status Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">Connection</CardTitle>
                                    <Activity className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">
                                        {connected ? "Active" : "Inactive"}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Device status
                                    </p>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">Heart Rate</CardTitle>
                                    <Heart className={cn("h-4 w-4", isBeating ? "text-red-500 scale-125" : "text-muted-foreground")} />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold" ref={currentRef}>--</div>
                                    <p className="text-xs text-muted-foreground">bpm</p>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">HRV</CardTitle>
                                    <ActivitySquare className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold" ref={hrvRef}>--</div>
                                    <p className="text-xs text-muted-foreground">ms</p>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">Mental State</CardTitle>
                                    <Brain className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">
                                        <StateIndicator state={displayState} />
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Current state
                                    </p>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Brain Activity Overview */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <BarChart3 className="h-3 w-5" />
                                    Brain Activity Overview
                                </CardTitle>
                                <CardDescription>
                                    Real-time brainwave analysis from both hemispheres
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    {/* Left Hemisphere */}
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <div className="h-3 w-3 rounded-full bg-gradient-to-r from-blue-500 to-purple-600" />
                                            <h3 className="font-semibold">Left Hemisphere</h3>
                                        </div>
                                        <div className="space-y-2">
                                            {["Delta", "Theta", "Alpha", "Beta", "Gamma"].map((band, index) => {
                                                const value = radarDataCh0Ref.current.find((d) => d.subject === band)?.value ?? 0;
                                                const colors = ["bg-purple-500", "bg-blue-500", "bg-green-500", "bg-yellow-500", "bg-red-500"];
                                                return (
                                                    <div key={band} className="space-y-2">
                                                        <div className="flex justify-between text-sm">
                                                            <span className="font-medium">{band}</span>
                                                            <span className="text-muted-foreground">{value.toFixed(1)}%</span>
                                                        </div>
                                                        <Progress value={Math.min(value, 100)} className="h-2" />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Right Hemisphere */}
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <div className="h-3 w-3 rounded-full bg-gradient-to-r from-green-500 to-cyan-600" />
                                            <h3 className="font-semibold">Right Hemisphere</h3>
                                        </div>
                                        <div className="space-y-2">
                                            {["Delta", "Theta", "Alpha", "Beta", "Gamma"].map((band, index) => {
                                                const value = radarDataCh1Ref.current.find((d) => d.subject === band)?.value ?? 0;
                                                const colors = ["bg-purple-500", "bg-blue-500", "bg-green-500", "bg-yellow-500", "bg-red-500"];
                                                return (
                                                    <div key={band} className="space-y-2">
                                                        <div className="flex justify-between text-sm">
                                                            <span className="font-medium">{band}</span>
                                                            <span className="text-muted-foreground">{value.toFixed(1)}%</span>
                                                        </div>
                                                        <Progress value={Math.min(value, 100)} className="h-2" />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Radar Chart */}
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <Waves className="h-5 w-5" />
                                            <h3 className="font-semibold">Radar Analysis</h3>
                                        </div>
                                        <div className="h-48">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <RadarChart data={radarDataCh0Ref.current}>
                                                    <PolarGrid />
                                                    <PolarAngleAxis dataKey="subject" />
                                                    <PolarRadiusAxis />
                                                    <Radar
                                                        name="Left Hemisphere"
                                                        dataKey="value"
                                                        stroke="#3b82f6"
                                                        fill="#3b82f6"
                                                        fillOpacity={0.3}
                                                    />
                                                </RadarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Signal Plots */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-sm">EEG Channel 1</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-32">
                                        <WebglPlotCanvas 
                                            ref={canvaseeg1Ref} 
                                            channels={[1]} 
                                            colors={{1: "#C29963"}} 
                                            gridnumber={10} 
                                        />
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-sm">EEG Channel 2</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-32">
                                        <WebglPlotCanvas 
                                            ref={canvaseeg2Ref} 
                                            channels={[2]} 
                                            colors={{2: "#63A2C2"}} 
                                            gridnumber={10} 
                                        />
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-sm">ECG Signal</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-32">
                                        <WebglPlotCanvas 
                                            ref={canvasecgRef} 
                                            channels={[3]} 
                                            colors={{3: "#E4967E"}} 
                                            gridnumber={10} 
                                        />
                                    </div>
                                </CardContent>
                            </Card>
                          
                        </div>
                    </TabsContent>

                   

                    <TabsContent value="meditation" className="space-y-6">
                        {/* Hero Section */}
                        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 dark:from-indigo-950 dark:via-purple-950 dark:to-pink-950 border border-indigo-200 dark:border-indigo-800">
                            <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:60px_60px]" />
                            <div className="relative p-8">
                                <div className="flex items-center justify-between mb-6">
                                    <div>
                                        <h2 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                                            Mindfulness Journey
                                        </h2>
                                        <p className="text-muted-foreground mt-2">
                                            Discover inner peace through guided meditation
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="flex -space-x-2">
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                                                <Brain className="h-4 w-4 text-white" />
                                            </div>
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                                                <Heart className="h-4 w-4 text-white" />
                                            </div>
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center">
                                                <Activity className="h-4 w-4 text-white" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <MeditationSession
                                    connected={connected}
                                    onStartSession={() => {
                                        sessionDataRef.current = [];
                                        isMeditatingRef.current = true;
                                    }}
                                    onEndSession={() => {
                                        isMeditatingRef.current = false;
                                    }}
                                    sessionData={sessionDataRef.current}
                                    darkMode={darkMode}
                                    setShowResults={setShowResults}
                                    setSessionResults={setSessionResults}
                                    sessionResults={sessionResults}
                                    renderSessionResults={(results) => (
                                        <div className="mt-6">
                                            <Dialog>
                                                <DialogTrigger asChild>
                                                    <Button 
                                                        size="lg"
                                                        className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-300"
                                                    >
                                                        <Activity className="mr-2 h-5 w-15" />
                                                        View Session Insights
                                                    </Button>
                                                </DialogTrigger>
                                                
                                                <DialogContent className="max-w-[98vw] max-h-[98vh] p-0 bg-white/98 dark:bg-slate-900/98 backdrop-blur-xl border-0 shadow-2xl rounded-2xl">
                                                    <DialogHeader className="px-10 py-8 bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 dark:from-indigo-950 dark:via-purple-950 dark:to-pink-950 border-b border-indigo-200 dark:border-indigo-800 rounded-t-2xl">
                                                        <DialogTitle className="flex items-center gap-4 text-3xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                                                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-600 flex items-center justify-center shadow-lg">
                                                                <Brain className="h-8 w-8 text-white" />
                                                            </div>
                                                            <div>
                                                                <div>Session Complete</div>
                                                                <div className="text-lg font-normal text-muted-foreground">Deep Insights & Analysis</div>
                                                            </div>
                                                        </DialogTitle>
                                                    </DialogHeader>
                                                    
                                                    <ScrollArea className="max-h-[calc(98vh-140px)]">
                                                        <div className="p-10">
                                                            <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
                                                                {/* Left Column - Waveform */}
                                                                <div className="xl:col-span-5">
                                                                    <Card className="border-0 shadow-xl bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 dark:from-indigo-950 dark:via-purple-950 dark:to-pink-950 overflow-hidden">
                                                                        <CardHeader className="bg-gradient-to-r from-indigo-100 to-purple-100 dark:from-indigo-900 dark:to-purple-900">
                                                                            <CardTitle className="flex items-center gap-3 text-xl font-bold text-indigo-700 dark:text-indigo-300">
                                                                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                                                                                    <Waves className="h-5 w-5 text-white" />
                                                                                </div>
                                                                                Brainwave Activity
                                                                            </CardTitle>
                                                                            <CardDescription className="text-indigo-600 dark:text-indigo-400">
                                                                                Real-time brainwave patterns during your session
                                                                            </CardDescription>
                                                                        </CardHeader>
                                                                        <CardContent className="p-6">
                                                                            <MeditationWaveform
                                                                                data={sessionDataRef.current}
                                                                                sessionDuration={
                                                                                    sessionDataRef.current.length > 1
                                                                                        ? Math.round(
                                                                                            (sessionDataRef.current.at(-1)!.timestamp! -
                                                                                                sessionDataRef.current[0].timestamp!) /
                                                                                            60000
                                                                                        )
                                                                                        : 0
                                                                                }
                                                                                darkMode={darkMode}
                                                                            />
                                                                        </CardContent>
                                                                    </Card>
                                                                </div>

                                                                {/* Right Column - Results */}
                                                                <div className="xl:col-span-7 space-y-8">
                                                                    {/* Mental State Card */}
                                                                    <Card className="border-0 shadow-xl bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50 dark:from-purple-950 dark:via-pink-950 dark:to-rose-950 overflow-hidden">
                                                                        <CardContent className="p-10">
                                                                            <div className="text-center">
                                                                                <div className="text-8xl mb-6 animate-pulse">
                                                                                    {results.mostFrequent === 'alpha' ? '🧘‍♀️' :
                                                                                        results.mostFrequent === 'theta' ? '🛌' :
                                                                                        results.mostFrequent === 'beta' ? '🎯' :
                                                                                        results.mostFrequent === 'delta' ? '💤' : '⚪'}
                                                                                </div>
                                                                                <h3 className="text-3xl font-bold mb-3 bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 bg-clip-text text-transparent">
                                                                                    {results.mostFrequent === 'alpha' ? 'Deep Relaxation' :
                                                                                        results.mostFrequent === 'theta' ? 'Profound Meditation' :
                                                                                        results.mostFrequent === 'beta' ? 'Active Focus' :
                                                                                        results.mostFrequent === 'delta' ? 'Restful State' : 'Balanced State'}
                                                                                </h3>
                                                                                <p className="text-lg text-muted-foreground">
                                                                                    Your primary mental state during this session
                                                                                </p>
                                                                            </div>
                                                                        </CardContent>
                                                                    </Card>

                                                                    {/* Stats Grid */}
                                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                                        <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950 dark:to-cyan-950 overflow-hidden">
                                                                            <CardContent className="p-8 text-center">
                                                                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 mx-auto mb-4 flex items-center justify-center shadow-lg">
                                                                                    <Target className="h-8 w-8 text-white" />
                                                                                </div>
                                                                                <p className="text-sm font-semibold uppercase tracking-wide mb-3 text-blue-600 dark:text-blue-400">
                                                                                    Dominant State
                                                                                </p>
                                                                                <p className="text-xl font-bold capitalize text-blue-700 dark:text-blue-300">
                                                                                    {results.mostFrequent}
                                                                                </p>
                                                                            </CardContent>
                                                                        </Card>

                                                                        <Card className="border-0 shadow-lg bg-gradient-to-br from-cyan-50 to-teal-50 dark:from-cyan-950 dark:to-teal-950 overflow-hidden">
                                                                            <CardContent className="p-8 text-center">
                                                                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-600 mx-auto mb-4 flex items-center justify-center shadow-lg">
                                                                                    <Clock className="h-8 w-8 text-white" />
                                                                                </div>
                                                                                <p className="text-sm font-semibold uppercase tracking-wide mb-3 text-cyan-600 dark:text-cyan-400">
                                                                                    Duration
                                                                                </p>
                                                                                <p className="text-xl font-bold text-cyan-700 dark:text-cyan-300">
                                                                                    {results.duration}
                                                                                </p>
                                                                            </CardContent>
                                                                        </Card>

                                                                        <Card className="border-0 shadow-lg bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950 dark:to-green-950 overflow-hidden">
                                                                            <CardContent className="p-8 text-center">
                                                                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 mx-auto mb-4 flex items-center justify-center shadow-lg">
                                                                                    <Zap className="h-8 w-8 text-white" />
                                                                                </div>
                                                                                <p className="text-sm font-semibold uppercase tracking-wide mb-3 text-emerald-600 dark:text-emerald-400">
                                                                                    Brain Balance
                                                                                </p>
                                                                                <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">
                                                                                    {Math.abs(Number(results.avgSymmetry)) < 0.1
                                                                                        ? 'Balanced'
                                                                                        : Number(results.avgSymmetry) > 0
                                                                                            ? 'Left Dominant'
                                                                                            : 'Right Dominant'}
                                                                                </p>
                                                                            </CardContent>
                                                                        </Card>
                                                                    </div>

                                                                    {/* Brainwave Analysis */}
                                                                    <Card className="border-0 shadow-xl bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-950 dark:to-gray-950">
                                                                        <CardHeader className="bg-gradient-to-r from-slate-100 to-gray-100 dark:from-slate-900 dark:to-gray-900">
                                                                            <CardTitle className="flex items-center gap-3 text-xl font-bold text-slate-700 dark:text-slate-200">
                                                                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-500 to-gray-600 flex items-center justify-center">
                                                                                    <BarChart3 className="h-5 w-5 text-white" />
                                                                                </div>
                                                                                Brainwave Analysis
                                                                            </CardTitle>
                                                                            <CardDescription className="text-slate-600 dark:text-slate-400">
                                                                                Detailed breakdown of your brainwave patterns
                                                                            </CardDescription>
                                                                        </CardHeader>
                                                                        <CardContent className="p-8">
                                                                            <div className="space-y-6">
                                                                                {Object.entries(results.statePercentages).map(([state, pct]) => (
                                                                                    <div key={state} className="space-y-3">
                                                                                        <div className="flex justify-between items-center">
                                                                                            <span className="text-base font-semibold text-slate-700 dark:text-slate-300">
                                                                                                {state}
                                                                                            </span>
                                                                                            <Badge variant="secondary" className="text-slate-700 dark:text-slate-300 px-3 py-1">
                                                                                                {pct}%
                                                                                            </Badge>
                                                                                        </div>
                                                                                        <Progress value={Number(pct)} className="h-4" />
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </CardContent>
                                                                    </Card>

                                                                    {/* Performance Indicator */}
                                                                    <Card className={`border-0 shadow-xl overflow-hidden ${
                                                                        Number(results.goodMeditationPct) >= 75 
                                                                            ? 'bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 dark:from-green-950 dark:via-emerald-950 dark:to-teal-950' 
                                                                            : Number(results.goodMeditationPct) >= 50 
                                                                                ? 'bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50 dark:from-yellow-950 dark:via-amber-950 dark:to-orange-950'
                                                                                : 'bg-gradient-to-br from-orange-50 via-red-50 to-pink-50 dark:from-orange-950 dark:via-red-950 dark:to-pink-950'
                                                                    }`}>
                                                                        <CardContent className="p-10 text-center">
                                                                            <div className="text-6xl mb-6 animate-bounce">
                                                                                {Number(results.goodMeditationPct) >= 75 ? '🌟' :
                                                                                    Number(results.goodMeditationPct) >= 50 ? '🌿' : '⚠️'}
                                                                            </div>
                                                                            <h3 className={`text-2xl font-bold mb-4 ${
                                                                                Number(results.goodMeditationPct) >= 75 
                                                                                    ? 'text-green-700 dark:text-green-300' 
                                                                                    : Number(results.goodMeditationPct) >= 50 
                                                                                        ? 'text-yellow-700 dark:text-yellow-300'
                                                                                        : 'text-orange-700 dark:text-orange-300'
                                                                            }`}>
                                                                                {Number(results.goodMeditationPct) >= 75
                                                                                    ? 'Excellent Session!'
                                                                                    : Number(results.goodMeditationPct) >= 50
                                                                                        ? 'Great Progress!'
                                                                                        : 'Keep Practicing!'}
                                                                            </h3>
                                                                            <p className="text-base text-muted-foreground leading-relaxed">
                                                                                {Number(results.goodMeditationPct) >= 75
                                                                                    ? `You spent ${Math.round(Number(results.goodMeditationPct))}% in a strong meditative state.`
                                                                                    : Number(results.goodMeditationPct) >= 50
                                                                                        ? `You spent ${Math.round(Number(results.goodMeditationPct))}% in a good meditation state.`
                                                                                        : `You're building your meditation foundation. Keep going!`}
                                                                            </p>
                                                                        </CardContent>
                                                                    </Card>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </ScrollArea>
                                                </DialogContent>
                                            </Dialog>
                                        </div>
                                    )}
                                />
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>
            </main>
        </div>
    );
}