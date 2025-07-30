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
    const [sidebarOpen, setSidebarOpen] = useLocalState(false);

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
            <UICard className="flex flex-col items-center justify-center p-2 w-24 h-28 shadow">
                <div className="relative flex items-center justify-center w-12 h-12 mb-1">
                    <svg width="48" height="48">
                        <circle
                            cx="24"
                            cy="24"
                            r="20"
                            stroke="#22C55E"
                            strokeWidth="5"
                            fill="#F0FDF4"
                        />
                        <circle
                            cx="24"
                            cy="24"
                            r="20"
                            stroke="#22C55E"
                            strokeWidth="5"
                            fill="none"
                            strokeDasharray={2 * Math.PI * 20}
                            strokeDashoffset={2 * Math.PI * 20 * (1 - percent / 100)}
                            style={{ transition: "stroke-dashoffset 0.5s" }}
                        />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-green-700">
                        {percent}%
                    </span>
                </div>
                <span className="text-xs font-medium text-green-900">{label}</span>
            </UICard>
        );
    }

    return (
        <div className={classNames(
            "min-h-screen flex",
            isDarkMode ? "bg-gray-900" : "bg-slate-100"
        )}>
            {/* Mobile Hamburger */}
            <button
                className="fixed top-4 left-4 z-40 md:hidden bg-white dark:bg-slate-800 p-2 rounded-lg shadow"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
            >
                <svg className="h-6 w-6 text-slate-700 dark:text-slate-200" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
            </button>

            {/* Sidebar Navigation - Desktop */}
            <div className={classNames(
                "w-64 flex-shrink-0 border-r hidden md:block",
                isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-300"
            )}>
                <div className="p-6">
                    {/* Logo */}
                    <div className="flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                            <Brain className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900 dark:text-white">NeuralFlow</h1>
                            <p className="text-xs text-slate-500 dark:text-slate-400">v2.1.0</p>
                        </div>
                    </div>

                    {/* Connection Status */}
                    <div className={classNames(
                        "p-4 rounded-lg mb-6 border",
                        isDarkMode ? "bg-slate-700 border-slate-600" : "bg-gray-50 border-gray-200"
                    )}>
                        <div className="flex items-center gap-3 mb-2">
                            <div className={classNames(
                                "h-2 w-2 rounded-full",
                                isDeviceConnected ? "bg-green-400 animate-pulse" : "bg-red-400"
                            )} />
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                Device Status
                            </span>
                        </div>
                        <div className={classNames(
                            "text-xs font-bold uppercase tracking-wide",
                            isDeviceConnected ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                        )}>
                            {isDeviceConnected ? "Connected" : "Disconnected"}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            <StreamingDuration 
                                startTime={connectionStartTimeRef.current ?? Date.now()} 
                                isLive={isDeviceConnected} 
                            />
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="space-y-3">
                        <UIButton
                            onClick={isDeviceConnected ? disconnectDevice : connectDevice}
                            className={classNames(
                                "w-full justify-start px-4 py-3 text-sm font-medium text-white rounded-lg",
                                isDeviceConnected
                                    ? "bg-red-600 hover:bg-red-700"
                                    : "bg-blue-600 hover:bg-blue-700"
                            )}
                        >
                            {isDeviceConnected ? (
                                <>
                                    <PlugZapIcon className="h-4 w-4 mr-3" />
                                    Disconnect Device
                                </>
                            ) : (
                                <>
                                    <PlugIcon className="h-4 w-4 mr-3" />
                                    Connect Device
                                </>
                            )}
                        </UIButton>

                        <UIButton
                            onClick={() => setShowPlotting((v) => !v)}
                            className="w-full justify-start px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-600 hover:bg-slate-200 dark:hover:bg-slate-500 rounded-lg"
                        >
                            {showPlotting ? <EyeOff className="h-4 w-4 mr-3" /> : <Eye className="h-4 w-4 mr-3" />}
                            {showPlotting ? "Hide Signals" : "Show Signals"}
                        </UIButton>

                        <UIButton
                            onClick={() => setIsDarkMode(!isDarkMode)}
                            className="w-full justify-start px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-600 hover:bg-slate-200 dark:hover:bg-slate-500 rounded-lg"
                        >
                            {isDarkMode ? <Sun className="h-4 w-4 mr-3" /> : <Moon className="h-4 w-4 mr-3" />}
                            {isDarkMode ? "Light Mode" : "Dark Mode"}
                        </UIButton>
                    </div>

                    {/* Mental State Display */}
                    <div className={classNames(
                        "mt-8 p-4 rounded-lg border",
                        isDarkMode ? "bg-slate-700 border-slate-600" : "bg-gray-50 border-gray-200"
                    )}>
                        <div className="text-center">
                            <div className="flex items-center justify-center gap-2 mb-3">
                                <Heart className="h-4 w-4 text-red-400" />
                                <Brain className="h-4 w-4 text-blue-400" />
                            </div>
                            <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Mental State
                            </div>
                            <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                                <MoodDisplay state={currentMentalState} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Sidebar Navigation - Mobile Off-canvas */}
            <div className={classNames(
                "fixed inset-0 z-50 transition-transform transform md:hidden",
                sidebarOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                {/* Overlay */}
                <div
                    className="absolute inset-0 bg-black bg-opacity-40"
                    onClick={() => setSidebarOpen(false)}
                />
                {/* Drawer */}
                <div className={classNames(
                    "relative w-64 h-full bg-white dark:bg-slate-800 border-r border-gray-300 dark:border-slate-700 p-6"
                )}>
                    {/* Close button */}
                    <button
                        className="absolute top-4 right-4 text-slate-700 dark:text-slate-200"
                        onClick={() => setSidebarOpen(false)}
                        aria-label="Close sidebar"
                    >
                        <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>

                    {/* Logo */}
                    <div className="flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                            <Brain className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900 dark:text-white">NeuralFlow</h1>
                            <p className="text-xs text-slate-500 dark:text-slate-400">v2.1.0</p>
                        </div>
                    </div>

                    {/* Connection Status */}
                    <div className={classNames(
                        "p-4 rounded-lg mb-6 border",
                        isDarkMode ? "bg-slate-700 border-slate-600" : "bg-gray-50 border-gray-200"
                    )}>
                        <div className="flex items-center gap-3 mb-2">
                            <div className={classNames(
                                "h-2 w-2 rounded-full",
                                isDeviceConnected ? "bg-green-400 animate-pulse" : "bg-red-400"
                            )} />
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                Device Status
                            </span>
                        </div>
                        <div className={classNames(
                            "text-xs font-bold uppercase tracking-wide",
                            isDeviceConnected ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                        )}>
                            {isDeviceConnected ? "Connected" : "Disconnected"}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            <StreamingDuration 
                                startTime={connectionStartTimeRef.current ?? Date.now()} 
                                isLive={isDeviceConnected} 
                            />
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="space-y-3">
                        <UIButton
                            onClick={isDeviceConnected ? disconnectDevice : connectDevice}
                            className={classNames(
                                "w-full justify-start px-4 py-3 text-sm font-medium text-white rounded-lg",
                                isDeviceConnected
                                    ? "bg-red-600 hover:bg-red-700"
                                    : "bg-blue-600 hover:bg-blue-700"
                            )}
                        >
                            {isDeviceConnected ? (
                                <>
                                    <PlugZapIcon className="h-4 w-4 mr-3" />
                                    Disconnect Device
                                </>
                            ) : (
                                <>
                                    <PlugIcon className="h-4 w-4 mr-3" />
                                    Connect Device
                                </>
                            )}
                        </UIButton>

                        <UIButton
                            onClick={() => setShowPlotting((v) => !v)}
                            className="w-full justify-start px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-600 hover:bg-slate-200 dark:hover:bg-slate-500 rounded-lg"
                        >
                            {showPlotting ? <EyeOff className="h-4 w-4 mr-3" /> : <Eye className="h-4 w-4 mr-3" />}
                            {showPlotting ? "Hide Signals" : "Show Signals"}
                        </UIButton>

                        <UIButton
                            onClick={() => setIsDarkMode(!isDarkMode)}
                            className="w-full justify-start px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-600 hover:bg-slate-200 dark:hover:bg-slate-500 rounded-lg"
                        >
                            {isDarkMode ? <Sun className="h-4 w-4 mr-3" /> : <Moon className="h-4 w-4 mr-3" />}
                            {isDarkMode ? "Light Mode" : "Dark Mode"}
                        </UIButton>
                    </div>

                    {/* Mental State Display */}
                    <div className={classNames(
                        "mt-8 p-4 rounded-lg border",
                        isDarkMode ? "bg-slate-700 border-slate-600" : "bg-gray-50 border-gray-200"
                    )}>
                        <div className="text-center">
                            <div className="flex items-center justify-center gap-2 mb-3">
                                <Heart className="h-4 w-4 text-red-400" />
                                <Brain className="h-4 w-4 text-blue-400" />
                            </div>
                            <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Mental State
                            </div>
                            <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                                <MoodDisplay state={currentMentalState} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-auto">
                {/* Top Header Bar */}
                <div className={classNames(
                    "border-b px-8 py-4",
                    isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-300"
                )}>
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                                Live Monitoring Dashboard
                            </h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                Real-time neural and cardiac data visualization
                            </p>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="text-right">
                                <div className="text-sm text-slate-500 dark:text-slate-400">Session Time</div>
                                <div className="text-lg font-mono font-bold text-slate-700 dark:text-slate-300">
                                    <StreamingDuration 
                                        startTime={connectionStartTimeRef.current ?? Date.now()} 
                                        isLive={isDeviceConnected} 
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Dashboard Content */}
                <div className="p-8">
                    {/* Vital Signs Row */}
                    <div className="mb-8">
                        <div className="flex gap-8 mb-16">
                            {/* Heart Rate */}
                            <div className="flex-1">
                                <div className="flex items-baseline gap-2 mb-2">
                                    <Heart className={classNames(
                                        "h-5 w-5",
                                        heartbeatActive ? "text-red-500" : "text-red-400"
                                    )} />
                                    <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Heart Rate</span>
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-4xl font-bold text-red-600 dark:text-red-400" ref={bpmCurrentRef}>--</span>
                                    <span className="text-lg text-slate-500 dark:text-slate-400">BPM</span>
                                </div>
                                <div className="h-1 bg-gray-200 dark:bg-slate-700 rounded-full mt-2">
                                    <div className="h-1 bg-red-500 rounded-full" style={{ width: '65%' }}></div>
                                </div>
                            </div>

                            {/* HRV */}
                            <div className="flex-1">
                                <div className="flex items-baseline gap-2 mb-2">
                                    <Activity className="h-5 w-5 text-blue-500" />
                                    <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Heart Rate Variability</span>
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-4xl font-bold text-blue-600 dark:text-blue-400" ref={hrvCurrentRef}>--</span>
                                    <span className="text-lg text-slate-500 dark:text-slate-400">MS</span>
                                </div>
                                <div className="h-1 bg-gray-200 dark:bg-slate-700 rounded-full mt-2">
                                    <div className="h-1 bg-blue-500 rounded-full" style={{ width: '45%' }}></div>
                                </div>
                            </div>

                            {/* Mental Load */}
                            <div className="flex-1">
                                <div className="flex items-baseline gap-2 mb-2">
                                    <GaugeIcon className="h-5 w-5 text-orange-500" />
                                    <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Mental Load</span>
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-4xl font-bold text-orange-600 dark:text-orange-400">{mentalLoadIndex}</span>
                                    <span className="text-lg text-slate-500 dark:text-slate-400">INDEX</span>
                                </div>
                                <div className="h-1 bg-gray-200 dark:bg-slate-700 rounded-full mt-2">
                                    <div className="h-1 bg-orange-500 rounded-full" style={{ width: '75%' }}></div>
                                </div>
                            </div>

                            {/* Balance Score */}
                            <div className="flex-1">
                                <div className="flex items-baseline gap-2 mb-2">
                                    <BarChartIcon className="h-5 w-5 text-green-500" />
                                    <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Balance Score</span>
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-4xl font-bold text-green-600 dark:text-green-400">
                                        {mindBodyBalance !== null ? `${mindBodyBalance}` : "--"}
                                </span>
                                    <span className="text-lg text-slate-500 dark:text-slate-400">SCORE</span>
                                </div>
                                <div className="h-1 bg-gray-200 dark:bg-slate-700 rounded-full mt-2">
                                    <div className="h-1 bg-green-500 rounded-full" style={{ width: '60%' }}></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Brainwave Analysis */}
                    <div className="mb-8 ">
                       
                        <div className={classNames(
                            "p-6 rounded-xl border",
                            isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-300"
                        )}>
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6 justify-items-center">
                                {(radarCh0DataRef.current ?? []).map(({ subject, value }) => (
                                    <BrainwaveCircle key={subject} label={subject} value={value} />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Signal Visualization */}
                    {showPlotting && (
                        <div>
                          
                            <div className="space-y-6">
                                {/* EEG Channel 1 */}
                                <div className={classNames(
                                    "p-6 rounded-xl border",
                                    isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-300"
                                )}>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                            <h4 className="text-lg font-medium text-slate-900 dark:text-white">EEG Channel 1</h4>
                                        </div>
                                        <div className="text-sm text-slate-500 dark:text-slate-400">256 Hz</div>
                                    </div>
                                    <div className="h-32 rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-700">
                                        <WebglPlotCanvas
                                            ref={eeg1CanvasRef}
                                            channels={[1]}
                                            colors={{ 1: "#22C55E" }}
                                            gridnumber={10}
                                        />
                                    </div>
                                </div>

                                {/* EEG Channel 2 */}
                                <div className={classNames(
                                    "p-6 rounded-xl border",
                                    isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-300"
                                )}>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                                            <h4 className="text-lg font-medium text-slate-900 dark:text-white">EEG Channel 2</h4>
                                        </div>
                                        <div className="text-sm text-slate-500 dark:text-slate-400">256 Hz</div>
                                    </div>
                                    <div className="h-32 rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-700">
                                        <WebglPlotCanvas
                                            ref={eeg2CanvasRef}
                                            channels={[2]}
                                            colors={{ 2: "#3B82F6" }}
                                            gridnumber={10}
                                        />
                                    </div>
                                </div>

                                {/* ECG Signal */}
                                <div className={classNames(
                                    "p-6 rounded-xl border",
                                    isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-300"
                                )}>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                            <h4 className="text-lg font-medium text-slate-900 dark:text-white">ECG Signal</h4>
                                        </div>
                                        <div className="text-sm text-slate-500 dark:text-slate-400">500 Hz</div>
                                    </div>
                                    <div className="h-32 rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-700">
                                        <WebglPlotCanvas
                                            ref={ecgCanvasRef}
                                            channels={[3]}
                                            colors={{ 3: "#EF4444" }}
                                            gridnumber={10}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}