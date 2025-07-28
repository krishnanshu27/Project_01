"use client";
import { useState as useLocalState, useRef as useLocalRef, useCallback as useLocalCallback, useEffect as useLocalEffect } from "react";
import { useMotionValue as useLocalMotionValue } from "framer-motion";

import { Button as UIButton } from "@/components/ui/button";
import { cn as classNames } from "@/lib/utils";

import {
    Activity as ActivityIcon, Brain as BrainIcon, Heart as HeartIcon, Moon as MoonIcon, Sun as SunIcon, Plug as PlugIcon, PlugZap as PlugZapIcon, Zap as ZapIcon, Clock as ClockIcon, Target as TargetIcon,
    Signal as SignalIcon, TrendingUp as TrendingUpIcon, ActivitySquare as ActivitySquareIcon, Gauge as GaugeIcon, BarChart3 as BarChartIcon, BarChart3, Waves, Brain, Heart, Activity, Clock, Target, Zap, RotateCcw, Wifi, WifiOff, Maximize2, Settings, Download, Share2, Sun, Moon, Signal
} from 'lucide-react';
import { Card as UICard, CardContent as UICardContent, CardDescription as UICardDescription, CardHeader as UICardHeader, CardTitle as UICardTitle } from '@/components/ui/card';

import { Tabs as UITabs, TabsContent as UITabsContent, TabsList as UITabsList, TabsTrigger as UITabsTrigger } from '@/components/ui/tabs';

import { useBluetoothDataStream as useBluetoothStream } from './Bledata';
import WebglPlotCanvas from './WebglPlotCanvas';

import { WebglPlotCanvasHandle as PlotCanvasHandle } from "./WebglPlotCanvas";
import HeartRateVariabilityCanvas, { HeartRateVariabilityHandle as HRVCanvasHandle } from '@/components/Hrvwebglplot'
import { MoodDisplay, EmotionalState } from "./StateIndicator";
import { predictState as predictMentalState } from "@/lib/stateClassifier";
import { useRouter as useLocalRouter } from 'next/navigation';
import { Eye, EyeOff } from "lucide-react";
import StreamingDuration from "./StreamingDuration";

export default function BrainSignalVisualizer() {
    const [isDarkMode, setIsDarkMode] = useLocalState(false);
    const eeg1CanvasRef = useLocalRef<PlotCanvasHandle>(null);
    const eeg2CanvasRef = useLocalRef<PlotCanvasHandle>(null);
    const ecgCanvasRef = useLocalRef<PlotCanvasHandle>(null);
    const eeg0BufferRef = useLocalRef<number[]>([]);
    const eeg1BufferRef = useLocalRef<number[]>([]);
    const radarCh0DataRef = useLocalRef<{ subject: string; value: number }[]>([]);
    const radarCh1DataRef = useLocalRef<{ subject: string; value: number }[]>([]);
    const bandWorkerRef = useLocalRef<Worker | null>(null);
    const dataWorkerRef = useLocalRef<Worker | null>(null);
    const [heartbeatActive, setHeartbeatActive] = useLocalState(false);
    const [currentMentalState, setCurrentMentalState] = useLocalState<EmotionalState>("no_data");
    const stateHistoryRef = useLocalRef<{ state: EmotionalState; timestamp: number }[]>([]);
    const lastMentalStateUpdateRef = useLocalRef<number>(0);
    const connectionStartTimeRef = useLocalRef<number | null>(null);
    const [sessionSummary, setSessionSummary] = useLocalState<{
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
    const bpmCurrentRef = useLocalRef<HTMLDivElement>(null);
    const bpmHighRef = useLocalRef<HTMLDivElement>(null);
    const bpmLowRef = useLocalRef<HTMLDivElement>(null);
    const bpmAvgRef = useLocalRef<HTMLDivElement>(null);
    const bpmWorkerRef = useLocalRef<Worker | null>(null);
    const prevSampleCounterRef = useLocalRef<number | null>(null);
    const hrvCurrentRef = useLocalRef<HTMLDivElement>(null);
    const hrvHighRef = useLocalRef<HTMLDivElement>(null);
    const hrvLowRef = useLocalRef<HTMLDivElement>(null);
    const hrvAvgRef = useLocalRef<HTMLDivElement>(null);
    const [hrvHistory, setHrvHistory] = useLocalState<{ time: number; hrv: number }[]>([]);
    const hrvCanvasRef = useLocalRef<HRVCanvasHandle>(null);
    const router = useLocalRouter();
    const leftBetaMV = useLocalMotionValue(0);
    const rightBetaMV = useLocalMotionValue(0);
    const ecgBufferRef = useLocalRef<number[]>([]);
    const [dashboardMode, setDashboardMode] = useLocalState<"radar" | "meditation">("radar");
    const [goalSelected, setGoalSelected] = useLocalState<"anxiety" | "meditation" | "sleep">("anxiety");
    const [resultsVisible, setResultsVisible] = useLocalState(false);
    const goalSelectedRef = useLocalRef(goalSelected);
    const [relaxScore, setRelaxScore] = useLocalState<number | null>(null);
    const sessionDataRef = useLocalRef<{ timestamp: number; alpha: number; beta: number; theta: number; delta: number, symmetry: number }[]>([]);
    const isSessionActiveRef = useLocalRef(false);
    const isMeditatingRef = useLocalRef(false);
    const SAMPLES_PER_SECOND = 500;
    const FFT_WINDOW_SIZE = 256;
    const sampleIndexRef = useLocalRef(0);
    const [mentalLoadIndex, setMentalLoadIndex] = useLocalState<"Stressed/Fatigued" | "Normal">("Normal");
    const [mindBodyBalance, setMindBodyBalance] = useLocalState<number | null>(null);
    const [showPlotting, setShowPlotting] = useLocalState(true);

    useLocalEffect(() => {
        goalSelectedRef.current = goalSelected;
    }, [goalSelected]);

    useLocalEffect(() => {
        const interval = setInterval(() => {
            setHeartbeatActive(true);
            setTimeout(() => setHeartbeatActive(false), 200);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const handleDataStream = useLocalCallback((data: number[]) => {
        dataWorkerRef.current?.postMessage({
            command: "process",
            rawData: {
                counter: data[0],
                raw0: data[1],
                raw1: data[2],
                raw2: data[3],
            },
        });
    }, []);

    const { connected: isDeviceConnected, connect: connectDevice, disconnect: disconnectDevice } = useBluetoothStream(handleDataStream);

    const channelPalette: Record<string, string> = {
        ch0: "#C29963",
        ch1: "#548687",
        ch2: "#9A7197",
    };

    const brainBands = [
        { subject: "Delta", value: 0 },
        { subject: "Theta", value: 0 },
        { subject: "Alpha", value: 0 },
        { subject: "Beta", value: 0 },
        { subject: "Gamma", value: 0 },
    ];

    useLocalEffect(() => {
        const worker = new Worker(
            new URL("../webworker/dataProcessor.worker.ts", import.meta.url),
            { type: "module" }
        );
        worker.onmessage = (e) => {
            if (e.data.type === "processedData") {
                const { counter, eeg0, eeg1, ecg } = e.data.data;
                eeg1CanvasRef.current?.updateData([counter, eeg0, 1]);
                eeg2CanvasRef.current?.updateData([counter, eeg1, 2]);
                ecgCanvasRef.current?.updateData([counter, ecg, 3]);
                handleNewSample(eeg0, eeg1);
            }
        };
        dataWorkerRef.current = worker;
        return () => worker.terminate();
    }, []);

    useLocalEffect(() => {
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
            leftBetaMV.set(smooth0.beta);
            rightBetaMV.set(smooth1.beta);

            function capitalize(subject: string): string {
                return subject.charAt(0).toUpperCase() + subject.slice(1);
            }

            radarCh0DataRef.current = Object.entries(smooth0).map(
                ([subject, value]) => ({ subject: capitalize(subject), value })
            );

            radarCh1DataRef.current = Object.entries(smooth1).map(
                ([subject, value]) => ({ subject: capitalize(subject), value })
            );

            let score = 0;
            const goal = goalSelectedRef.current;

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

            if (isSessionActiveRef.current) {
                sessionDataRef.current.push(currentData);
            }

            setRelaxScore(score);
        };

        bandWorkerRef.current = w;
        return () => {
            w.terminate();
        };
    }, []);

    const handleNewSample = useLocalCallback((eeg0: number, eeg1: number) => {
        eeg0BufferRef.current.push(eeg0);
        eeg1BufferRef.current.push(eeg1);
        sampleIndexRef.current++;

        if (eeg0BufferRef.current.length > FFT_WINDOW_SIZE) {
            eeg0BufferRef.current.shift();
            eeg1BufferRef.current.shift();
        }

        if (sampleIndexRef.current % 10 === 0 && eeg0BufferRef.current.length === FFT_WINDOW_SIZE) {
            bandWorkerRef.current?.postMessage({
                eeg0: [...eeg0BufferRef.current],
                eeg1: [...eeg1BufferRef.current],
                sampleRate: SAMPLES_PER_SECOND,
                fftSize: FFT_WINDOW_SIZE,
            });
        }
    }, []);

    const handleNewECG = useLocalCallback((ecg: number) => {
        ecgBufferRef.current.push(ecg);
        if (ecgBufferRef.current.length > 2500) {
            ecgBufferRef.current.shift();
        }
        if (ecgBufferRef.current.length % 500 === 0) {
            bpmWorkerRef.current?.postMessage({
                ecgBuffer: [...ecgBufferRef.current],
                sampleRate: 500,
            });
        }
    }, []);

    useLocalEffect(() => {
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
                hrvCanvasRef.current?.addHRVData(hrv);
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
                if (bpmCurrentRef.current) bpmCurrentRef.current.textContent = `${Math.round(displayedBPM)}`;
            } else {
                bpmWindow.length = 0;
                displayedBPM = null;
                if (bpmCurrentRef.current) bpmCurrentRef.current.textContent = "--";
            }

            if (bpmHighRef.current) bpmHighRef.current.textContent = high !== null ? `${high}` : "--";
            if (bpmLowRef.current) bpmLowRef.current.textContent = low !== null ? `${low}` : "--";
            if (bpmAvgRef.current) bpmAvgRef.current.textContent = avg !== null ? `${avg}` : "--";

            if (hrvCurrentRef.current) hrvCurrentRef.current.textContent = hrv !== null ? `${hrv}` : "--";
            if (hrvHighRef.current) hrvHighRef.current.textContent = hrvHigh !== null ? `${hrvHigh}` : "--";
            if (hrvLowRef.current) hrvLowRef.current.textContent = hrvLow !== null ? `${hrvLow}` : "--";
            if (hrvAvgRef.current) hrvAvgRef.current.textContent = hrvAvg !== null ? `${hrvAvg}` : "--";

            const detectedState = predictMentalState({ sdnn, rmssd, pnn50 });
            const now = Date.now();

            if (connectionStartTimeRef.current === null) {
                connectionStartTimeRef.current = now;
                lastMentalStateUpdateRef.current = now;
            }

            stateHistoryRef.current.push({
                state: detectedState,
                timestamp: now
            });

            const STATE_UPDATE_INTERVAL = 5000;
            const fiveSecondsAgo = now - STATE_UPDATE_INTERVAL;
            stateHistoryRef.current = stateHistoryRef.current.filter(
                item => item.timestamp >= fiveSecondsAgo
            );

            const timeSinceLastUpdate = now - lastMentalStateUpdateRef.current;
            const timeSinceConnection = now - connectionStartTimeRef.current;

            if (timeSinceConnection < STATE_UPDATE_INTERVAL) {
                setCurrentMentalState("no_data");
            } else if (timeSinceLastUpdate >= STATE_UPDATE_INTERVAL) {
                if (stateHistoryRef.current.length > 0) {
                    const stateCounts: Record<string, number> = {};
                    stateHistoryRef.current.forEach(item => {
                        stateCounts[item.state] = (stateCounts[item.state] || 0) + 1;
                    });

                    const dominantState = Object.entries(stateCounts).reduce((a, b) =>
                        a[1] > b[1] ? a : b
                    )[0] as EmotionalState;

                    setCurrentMentalState(dominantState);
                    lastMentalStateUpdateRef.current = now;
                }
            }

            // Get latest beta value (from radarCh0DataRef or radarCh1DataRef)
            const beta =
                (radarCh0DataRef.current.find(d => d.subject === "Beta")?.value ?? 0) +
                (radarCh1DataRef.current.find(d => d.subject === "Beta")?.value ?? 0);

            // Simple thresholds (adjust as needed)
            const isHighBeta = beta > 0.6;
            const isHighHR = (bpm ?? 0) > 90;
            const isLowHRV = (hrv ?? 100) < 40;

            if (isHighBeta && isHighHR && isLowHRV) {
                setMentalLoadIndex("Stressed/Fatigued");
            } else {
                setMentalLoadIndex("Normal");
            }

            // Get latest alpha and theta values (from radarCh0DataRef and radarCh1DataRef)
            const alpha =
                (radarCh0DataRef.current.find(d => d.subject === "Alpha")?.value ?? 0) +
                (radarCh1DataRef.current.find(d => d.subject === "Alpha")?.value ?? 0);
            const theta =
                (radarCh0DataRef.current.find(d => d.subject === "Theta")?.value ?? 0) +
                (radarCh1DataRef.current.find(d => d.subject === "Theta")?.value ?? 0);

            // Normalize EEG and HRV values (adjust denominator as needed for your data range)
            const normEEG = (alpha + theta) / 2; // assuming values are 0-1
            const normHRV = rmssd / 100; // or sdnn / 100, adjust scaling as needed

            // Combine for Mind-Body Balance Score (simple average, adjust formula as needed)
            const balanceScore = Math.round(((normEEG + normHRV) / 2) * 100); // 0-100 scale

            setMindBodyBalance(balanceScore);
        };

        bpmWorkerRef.current = worker;
        return () => {
            worker.terminate();
        };
    }, []);

    useLocalEffect(() => {
        isSessionActiveRef.current = dashboardMode === "meditation";
    }, [dashboardMode]);

    useLocalEffect(() => {
        if (isDeviceConnected) {
            connectionStartTimeRef.current = Date.now();
            lastMentalStateUpdateRef.current = Date.now();
            stateHistoryRef.current = [];
            setCurrentMentalState("no_data");
        } else {
            connectionStartTimeRef.current = null;
            lastMentalStateUpdateRef.current = 0;
            stateHistoryRef.current = [];
            setCurrentMentalState("no_data");
        }
    }, [isDeviceConnected]);

    useLocalEffect(() => {
        const dp = dataWorkerRef.current!;
        const handler = (e: MessageEvent) => {
            if (e.data.type === "processedData") {
                const { eeg0, eeg1, ecg } = e.data.data;
                handleNewSample(eeg0, eeg1);
                handleNewECG(ecg);
            }
        };
        dp.addEventListener("message", handler);
        return () => {
            dp.removeEventListener("message", handler);
        };
    }, [handleNewSample, handleNewECG]);

    function BrainwaveCircle({ label, value }: { label: string; value: number }) {
        // Clamp value to 0-100 for percent
        const percent = Math.round(Math.max(0, Math.min(100, value * 100)));
        return (
            <UICard className="flex flex-col items-center justify-center p-4 w-32 h-43 shadow">
                <div className="relative flex items-center justify-center w-16 h-16 mb-2">
                    <svg width="64" height="64">
                        <circle
                            cx="32"
                            cy="32"
                            r="28"
                            stroke="#22C55E"
                            strokeWidth="6"
                            fill="#F0FDF4"
                        />
                        <circle
                            cx="32"
                            cy="32"
                            r="28"
                            stroke="#22C55E"
                            strokeWidth="6"
                            fill="none"
                            strokeDasharray={2 * Math.PI * 28}
                            strokeDashoffset={2 * Math.PI * 28 * (1 - percent / 100)}
                            style={{ transition: "stroke-dashoffset 0.5s" }}
                        />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-xl font-bold text-green-700">
                        {percent}%
                    </span>
                </div>
                <span className="text-sm font-medium text-green-900">{label}</span>
            </UICard>
        );
    }

    return (
        <div className={classNames(
            "min-h-screen transition-all duration-500 overflow-x-hidden",
            isDarkMode
                ? "bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950"
                : "bg-gradient-to-br from-slate-50 via-white to-slate-100"
        )}>
            {/* Enhanced Background Pattern */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 left-0 w-full h-full opacity-30">
                    <div className="absolute top-20 left-20 w-72 h-72 rounded-full bg-gradient-to-br from-blue-400/10 to-purple-600/10 blur-3xl animate-pulse"></div>
                    <div className="absolute bottom-20 right-20 w-72 h-72 rounded-full bg-gradient-to-br from-cyan-400/10 to-teal-600/10 blur-3xl animate-pulse delay-1000"></div>
                    <div className="absolute top-1/2 left-1/2 w-96 h-96 rounded-full bg-gradient-to-br from-violet-400/5 to-pink-600/5 blur-3xl animate-pulse delay-2000"></div>
                </div>
            </div>

            {/* Improved Header */}
            <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 dark:bg-slate-900/80 border-b border-slate-200/50 dark:border-slate-700/50 shadow-lg">
                <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        {/* Enhanced Logo Section */}
                        <div className="flex items-center gap-4 " style={{ padding: "0.5rem 1rem" }}>

                            <div>
                                <h1 className="text-2xl lg:text-3xl font-black bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 bg-clip-text text-transparent ">
                                    Neural<span className="text-teal-500">Flow</span>
                                </h1>
                                <p className="text-sm lg:text-base text-slate-600 dark:text-slate-300 font-medium">
                                    Advanced Brain Monitoring System
                                </p>
                            </div>
                        </div>



                        {/* Enhanced Controls with Better Padding */}
                        <div className="flex items-center gap-4 px-6 py-4">
                            {/* Connection Status Indicator with Enhanced Padding */}
                            <div className={classNames(
                                "flex items-center gap-4 px-6 py-4 rounded-xl transition-all duration-300 shadow-lg",
                                isDeviceConnected
                                    ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-2 border-emerald-200 dark:border-emerald-700"
                                    : "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-2 border-red-200 dark:border-red-700"
                            )}>
                                <div className={classNames(
                                    "h-4 w-4 rounded-full shadow-lg flex-shrink-0",
                                    isDeviceConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                                )} />
                                <span className="text-sm font-bold hidden sm:inline px-2" style={{ padding: "0.4rem" }}>
                                    {isDeviceConnected ? "Connected" : "Disconnected"}
                                </span>
                            </div>
                            {/* Toggle plotting button */}
                            <div className="flex justify-end mb-4">
                                <UIButton
                                    onClick={() => setShowPlotting((v) => !v)}
                                    className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-green-900 bg-green-100 hover:bg-green-200 shadow transition-all"
                                >
                                    {showPlotting ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                    {showPlotting ? "Hide Plotting" : "Show Plotting"}
                                </UIButton>
                            </div>
                            <div className="rounded-2xl bg-white border border-green-200 py-3 shadow hover:shadow-lg transition-all duration-300 flex flex-col justify-between" >
                                <StreamingDuration startTime={connectionStartTimeRef.current ?? Date.now()} isLive={isDeviceConnected} />
                            </div>

                            {/* Action Button with Enhanced Padding */}
                            <UIButton
                                onClick={isDeviceConnected ? disconnectDevice : connectDevice}
                                className={classNames(
                                    "gap-3 px-8 py-4 rounded-xl font-bold text-white shadow-xl transition-all duration-300 transform hover:scale-105 min-w-[160px]", // Increased min-width
                                    isDeviceConnected
                                        ? "bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700"
                                        : "bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                                )}
                            >
                                {isDeviceConnected ? (
                                    <div className="flex items-center gap-3 px-3 py-1"> {/* Increased internal padding */}
                                        <PlugZapIcon className="h-5 w-5 flex-shrink-0" />
                                        <span className="hidden sm:inline whitespace-nowrap">Disconnect</span> {/* Added whitespace-nowrap */
                                        }
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3 px-3 py-1"> {/* Increased internal padding */}
                                        <PlugIcon className="h-5 w-5 flex-shrink-0" />
                                        <span className="hidden sm:inline whitespace-nowrap">Connect</span> {/* Added whitespace-nowrap */}
                                    </div>
                                )}
                            </UIButton>

                            {/* Theme Toggle with Enhanced Padding */}
                            <UIButton
                                onClick={() => setIsDarkMode(!isDarkMode)}
                                variant="ghost"
                                size="icon"
                                className="rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 shadow-lg transition-all duration-300 h-14 w-14 p-4"
                            >
                                {isDarkMode ? <Sun className="h-6 w-6" /> : <Moon className="h-6 w-6" />}
                            </UIButton>
                        </div>
                    </div>
                </div>
            </header>

            {/* Improved Main Content */}
            <main className="w-full mx-auto px-4 sm:px-8 lg:px-16 py-8 space-y-10">
                {/* Stats Grid - White & Green Theme */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    {/* Device Status */}
                    <div className="rounded-2xl bg-white border border-green-200 p-6 shadow hover:shadow-lg transition-all duration-300 flex flex-col justify-between" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
                        <div className="flex items-center justify-between mb-4">
                            <div className="p-3 rounded-full bg-green-100">
                                <Signal className="h-7 w-7 text-green-600" />
                            </div>
                            <div className={classNames(
                                "px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wide",
                                isDeviceConnected
                                    ? "bg-green-200 text-green-700"
                                    : "bg-gray-100 text-gray-500"
                            )}>
                                {isDeviceConnected ? "ONLINE" : "OFFLINE"}
                            </div>
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-green-900">Device Status</h3>
                            <p className="text-sm text-green-700">Neural interface connection</p>
                        </div>
                    </div>

                    {/* Heart Rate */}
                    <div className="rounded-2xl bg-white border border-green-200 p-6 shadow hover:shadow-lg transition-all duration-300 flex flex-col justify-between" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
                        <div className="flex items-center justify-between mb-4">
                            <div className="p-3 rounded-full bg-green-100">
                                <Heart className={classNames(
                                    "h-7 w-7 transition-all duration-300",
                                    heartbeatActive ? "text-green-500 scale-125" : "text-green-600"
                                )} />
                            </div>
                            <div className="text-right">
                                <div className="text-3xl font-black text-green-900" ref={bpmCurrentRef}>--</div>
                                <div className="text-sm font-medium text-green-700">BPM</div>
                            </div>
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-green-900">Heart Rate</h3>
                            <p className="text-sm text-green-700">Cardiovascular monitoring</p>
                        </div>
                    </div>

                    {/* HRV */}
                    <div className="rounded-2xl bg-white border border-green-200 p-6 shadow hover:shadow-lg transition-all duration-300 flex flex-col justify-between" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
                        <div className="flex items-center justify-between mb-4">
                            <div className="p-3 rounded-full bg-green-100">
                                <Activity className="h-7 w-7 text-green-600" />
                            </div>
                            <div className="text-right">
                                <div className="text-3xl font-black text-green-900" ref={hrvCurrentRef}>--</div>
                                <div className="text-sm font-medium text-green-700">MS</div>
                            </div>
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-green-900">Heart Rate Variability</h3>
                            <p className="text-sm text-green-700">Autonomic nervous system</p>
                        </div>
                    </div>

                    {/* Mental State */}
                    <div className="rounded-2xl bg-white border border-green-200 p-6 shadow hover:shadow-lg transition-all duration-300 flex flex-col justify-between" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
                        {/* Heart & Mind Animation Card */}
                        <div className="flex items-center justify-center gap-8 mb-4">
                            {/* Animated Heart */}
                            <div className="p-3 rounded-full bg-green-100 animate-pulse">
                                <Heart className="h-10 w-10 text-green-500" />
                            </div>
                            {/* Animated Brain */}
                            <div className="p-3 rounded-full bg-green-100 animate-bounce">
                                <Brain className="h-10 w-10 text-green-600" />
                            </div>
                        </div>
                        <div className="text-center">
                            <h3 className="text-xl font-bold text-green-900 mb-2">Heart & Mind Sync</h3>
                            <p className="text-sm text-green-700">Visualizing heart and mind connection</p>

                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-green-900">Mental State</h3>
                            <div className="text-lg font-bold text-green-700">
                                <MoodDisplay state={currentMentalState} />
                            </div>
                        </div>
                    </div>

                    {/* Mental Load Index */}
                    <div className="rounded-2xl bg-white border border-green-200 p-6 shadow hover:shadow-lg transition-all duration-300 flex flex-col justify-between" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
                        <div className="flex items-center justify-between mb-4">
                            <div className="p-3 rounded-full bg-green-100">
                                <GaugeIcon className="h-7 w-7 text-green-600" />
                            </div>
                            <div className="px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wide bg-green-200 text-green-700">
                                INDEX
                            </div>
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-green-900">Mental Load Index</h3>
                            <div className="text-lg font-bold text-green-700">
                                {mentalLoadIndex}
                            </div>
                            <p className="text-sm text-green-700">High beta + high HR + low HRV = stressed/fatigued</p>
                        </div>
                    </div>

                    {/* Mind-Body Balance Score */}
                    <div className="rounded-2xl bg-white border border-green-200 p-6 shadow hover:shadow-lg transition-all duration-300 flex flex-col justify-between" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
                        <div className="flex items-center justify-between mb-4">
                            <div className="p-3 rounded-full bg-green-100">
                                <BarChartIcon className="h-7 w-7 text-green-600" />
                            </div>
                            <div className="px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wide bg-green-200 text-green-700">
                                SCORE
                            </div>
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-green-900">Mind-Body Balance</h3>
                            <div className="text-lg font-bold text-green-700">
                                {mindBodyBalance !== null ? `${mindBodyBalance}` : "--"}
                            </div>
                            <p className="text-sm text-green-700">Normalized (Alpha + Theta) vs HRV (RMSSD)</p>
                        </div>
                    </div>
                    {/* Brainwave Circles Section */}
                    <div className="w-full md:col-span-2 lg:col-span-2">
                        <div className="flex flex-wrap md:flex-nowrap gap-4 w-full justify-center items-center overflow-x-auto md:overflow-visible">
                            {(radarCh0DataRef.current ?? []).map(({ subject, value }) => (
                                <BrainwaveCircle key={subject} label={subject} value={value} />
                            ))}
                        </div>
                    </div>
                </div>


                {/* Signal Visualization - White & Green */}
                {showPlotting && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                        {/* EEG Channel 1 */}
                        <div className="rounded-2xl bg-white border border-green-200 p-8 shadow hover:shadow-lg transition-all duration-300">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-4 h-4 rounded-full bg-green-500 shadow-lg"></div>
                                    <h3 className="text-2xl font-bold text-green-900">EEG Channel 1</h3>
                                </div>

                            </div>
                            <div className="relative h-48 rounded-2xl  overflow-hidden shadow-inner">
                                <WebglPlotCanvas
                                    ref={eeg1CanvasRef}
                                    channels={[1]}
                                    colors={{ 1: "#22C55E" }}
                                    gridnumber={10}
                                />
                            </div>
                        </div>

                        {/* EEG Channel 2 */}
                        <div className="rounded-2xl bg-white border border-green-200 p-8 shadow hover:shadow-lg transition-all duration-300">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-4 h-4 rounded-full bg-green-500 shadow-lg"></div>
                                    <h3 className="text-2xl font-bold text-green-900">EEG Channel 2</h3>
                                </div>
                            </div>
                            <div className="relative h-48 rounded-2xl border-2 border-green-200 overflow-hidden shadow-inner">
                                <WebglPlotCanvas
                                    ref={eeg2CanvasRef}
                                    channels={[2]}
                                    colors={{ 2: "#22C55E" }}
                                    gridnumber={10}
                                />
                            </div>
                        </div>

                        {/* ECG Signal */}
                        <div className="rounded-2xl bg-white border border-green-200 p-8 shadow hover:shadow-lg transition-all duration-300">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-4 h-4 rounded-full bg-green-500 shadow-lg"></div>
                                    <h3 className="text-2xl font-bold text-green-900">ECG Signal</h3>
                                </div>
                            </div>
                            <div className="relative h-48 rounded-2xl  border-2 border-green-200 overflow-hidden shadow-inner">
                                <WebglPlotCanvas
                                    ref={ecgCanvasRef}
                                    channels={[3]}
                                    colors={{ 3: "#22C55E" }}
                                    gridnumber={10}
                                />
                            </div>
                        </div>
                    </div>
                )}

            </main>
        </div>
    );
}