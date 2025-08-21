"use client";
import { useState as useLocalState, useRef as useLocalRef, useCallback as useLocalCallback, useEffect as useLocalEffect } from "react";
import { useMotionValue as useLocalMotionValue } from "framer-motion";
import { Button as UIButton } from "@/components/ui/button";
import { cn as classNames } from "@/lib/utils";
import {
    Activity as ActivityIcon, Brain as BrainIcon, Heart as HeartIcon, Moon as MoonIcon, Sun as SunIcon, Plug as PlugIcon, PlugZap as PlugZapIcon, Clock as ClockIcon, Target as TargetIcon,
    Gauge as GaugeIcon, BarChart3 as BarChartIcon, Waves, Brain, Heart, Activity, Clock, Target, Plug, PlugZap
} from 'lucide-react';
import { Card as UICard } from '@/components/ui/card';
import { useBluetoothDataStream as useBluetoothStream } from './Bledata';
import WebglPlotCanvas from './WebglPlotCanvas';
import { WebglPlotCanvasHandle as PlotCanvasHandle } from "./WebglPlotCanvas";
import { MoodDisplay, EmotionalState } from "./StateIndicator";
import { predictState as predictMentalState } from "@/lib/stateClassifier";
import StreamingDuration from "./StreamingDuration";
import { MeditationSession } from "@/components/MeditationSession";

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
    const hrvCurrentRef = useLocalRef<HTMLDivElement>(null);
    const [mentalLoadIndex, setMentalLoadIndex] = useLocalState<"Stressed/Fatigued" | "Normal">("Normal");
    const [mindBodyBalance, setMindBodyBalance] = useLocalState<number | null>(null);
    const [showPlotting, setShowPlotting] = useLocalState(true);
    const [sidebarOpen, setSidebarOpen] = useLocalState(false);
    const [dashboardMode, setDashboardMode] = useLocalState<"radar" | "meditation" | "anxiety" | "sleep">("radar");
    const sessionDataRef = useLocalRef<{ timestamp: number; alpha: number; beta: number; theta: number; delta: number, symmetry: number }[]>([]);
    const isSessionActiveRef = useLocalRef(false);
    const isMeditatingRef = useLocalRef(false);

    const SAMPLES_PER_SECOND = 500;
    const FFT_WINDOW_SIZE = 256;
    const sampleIndexRef = useLocalRef(0);

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
            radarCh0DataRef.current = Object.entries(smooth0).map(
                ([subject, value]) => ({ subject: subject.charAt(0).toUpperCase() + subject.slice(1), value })
            );
            radarCh1DataRef.current = Object.entries(smooth1).map(
                ([subject, value]) => ({ subject: subject.charAt(0).toUpperCase() + subject.slice(1), value })
            );

            let score = 0;
            if (dashboardMode === "anxiety") {
                score = (Number(smooth0.alpha) + Number(smooth1.alpha)) / (Number(smooth0.beta) + Number(smooth1.beta) + 0.001);
            } else if (dashboardMode === "meditation") {
                score = (smooth0.theta + smooth1.theta) / 2;
            } else if (dashboardMode === "sleep") {
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

    function BrainwaveCircle({ label, value }: { label: string; value: number }) {
        const percent = Math.round(Math.max(0, Math.min(100, value * 100)));
        return (
            <UICard className="flex flex-col items-center justify-center p-2 w-24 h-24 shadow">
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
            {/* Sidebar Navigation - Desktop */}
            <div className={classNames(
                "w-64 flex-shrink-0 border-r hidden md:block",
                isDarkMode ? "bg-green-900 border-green-800" : "bg-white border-green-200"
            )}>
                <div className="p-6 flex flex-col gap-6">
                    {/* Logo */}
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-700 rounded-lg flex items-center justify-center">
                            <Brain className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-green-900 dark:text-white">NeuralFlow</h1>
                            <p className="text-xs text-green-400 dark:text-green-300">v2.1.0</p>
                        </div>
                    </div>
                    <hr className={isDarkMode ? "border-green-800" : "border-green-200"} />
                    {/* Connection Status */}
                    <div className={classNames(
                        "p-4 rounded-lg border",
                        isDarkMode ? "bg-green-900 border-green-800" : "bg-green-50 border-green-200"
                    )}>
                        <div className="flex items-center gap-3 mb-2">
                            <div className={classNames(
                                "h-2 w-2 rounded-full",
                                isDeviceConnected ? "bg-green-400 animate-pulse" : "bg-red-400"
                            )} />
                            <span className="text-sm font-semibold text-green-700 dark:text-green-300">
                                Device Status
                            </span>
                        </div>
                        <div className={classNames(
                            "text-xs font-bold uppercase tracking-wide",
                            isDeviceConnected ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                        )}>
                            {isDeviceConnected ? "Connected" : "Disconnected"}
                        </div>
                    </div>
                    {/* Quick Actions */}
                    <div>
                        <UIButton
                            onClick={isDeviceConnected ? disconnectDevice : connectDevice}
                            className={classNames(
                                "w-full justify-start px-4 py-3 text-sm font-semibold rounded-lg transition-colors duration-200",
                                isDeviceConnected
                                    ? "bg-red-600 hover:bg-red-700 text-white"
                                    : "bg-green-600 hover:bg-green-700 text-white"
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
                    </div>
                    <hr className={isDarkMode ? "border-green-800" : "border-green-200"} />
                    {/* Mental State Display */}
                    <div className={classNames(
                        "p-4 rounded-lg border",
                        isDarkMode ? "bg-green-900 border-green-800" : "bg-green-50 border-green-200"
                    )}>
                        <div className="text-center">
                            <div className="flex items-center justify-center gap-2 mb-3">
                                <Heart className="h-4 w-4 text-green-500" />
                                <Brain className="h-4 w-4 text-green-700" />
                            </div>
                            <div className="text-sm font-semibold text-green-700 dark:text-green-300 mb-1">
                                Mental State
                            </div>
                            <div className="text-lg font-bold text-green-700 dark:text-green-400">
                                <MoodDisplay state={currentMentalState} />
                            </div>
                        </div>
                    </div>
                    <hr className={isDarkMode ? "border-green-800" : "border-green-200"} />
                    {/* Meditation Section */}
                    <div>
                        <MeditationSession
                            onStartSession={() => { isSessionActiveRef.current = true; isMeditatingRef.current = true; }}
                            onEndSession={() => { isSessionActiveRef.current = false; isMeditatingRef.current = false; }}
                            sessionData={sessionDataRef.current}
                            sessionResults={sessionSummary}
                            setSessionResults={setSessionSummary}
                            connected={isDeviceConnected}
                            setShowResults={setShowPlotting}
                            darkMode={isDarkMode}
                        />
                        {sessionSummary && sessionSummary.statePercentages && (
                            <div className="mt-4 p-3 rounded-lg border bg-green-50 dark:bg-green-900 border-green-200 dark:border-green-700">
                                <div className="font-semibold text-green-700 dark:text-green-300 mb-2">Session Results</div>
                                <div className="space-y-1 text-sm">
                                    <div>
                                        <span className="font-medium">Relaxed:</span> <span className="text-green-700 dark:text-green-300">{sessionSummary.statePercentages.Relaxed}%</span>
                                    </div>
                                    <div>
                                        <span className="font-medium">Focused:</span> <span className="text-green-700 dark:text-green-300">{sessionSummary.statePercentages.Focused}%</span>
                                    </div>
                                    <div>
                                        <span className="font-medium">Meditative:</span> <span className="text-green-700 dark:text-green-300">{sessionSummary.statePercentages["Meditation"]}%</span>
                                    </div>
                                    <div>
                                        <span className="font-medium">Drowsy:</span> <span className="text-green-700 dark:text-green-300">{sessionSummary.statePercentages.Drowsy}%</span>
                                    </div>
                                </div>
                            </div>
                        )}
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
                    className="absolute inset-0 bg-opacity-40 backdrop-blur-sm"
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
                        <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-700 rounded-lg flex items-center justify-center">
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
                        isDarkMode ? "bg-green-900 border-green-800" : "bg-green-50 border-green-200"
                    )}>
                        <div className="flex items-center gap-3 mb-2">
                            <div className={classNames(
                                "h-2 w-2 rounded-full",
                                isDeviceConnected ? "bg-green-400 animate-pulse" : "bg-red-400"
                            )} />
                            <span className="text-sm font-semibold text-green-700 dark:text-green-300">
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
                                "w-full justify-start px-4 py-3 text-sm font-semibold rounded-lg transition-colors duration-200",
                                isDeviceConnected
                                    ? "bg-red-600 hover:bg-red-700 text-white"
                                    : "bg-green-600 hover:bg-green-700 text-white"
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
                    </div>
                    {/* Mental State Display */}
                    <div className={classNames(
                        "mt-8 p-4 rounded-lg border",
                        isDarkMode ? "bg-green-900 border-green-800" : "bg-green-50 border-green-200"
                    )}>
                        <div className="text-center">
                            <div className="flex items-center justify-center gap-2 mb-3">
                                <Heart className="h-4 w-4 text-green-500" />
                               
                            </div>
                            <div className="text-sm font-semibold text-green-700 dark:text-green-300 mb-1">
                                physiological State
                            </div>
                            <div className="text-lg font-bold text-green-700 dark:text-green-400">
                                <MoodDisplay state={currentMentalState} />
                            </div>
                        </div>
                    </div>
                    {/* Meditation Section */}
                    <div className="mt-8">
                        <MeditationSession
                            onStartSession={() => { isSessionActiveRef.current = true; isMeditatingRef.current = true; }}
                            onEndSession={() => { isSessionActiveRef.current = false; isMeditatingRef.current = false; }}
                            sessionData={sessionDataRef.current}
                            sessionResults={sessionSummary}
                            setSessionResults={setSessionSummary}
                            connected={isDeviceConnected}
                            setShowResults={setShowPlotting}
                            darkMode={isDarkMode}
                        />
                        {sessionSummary && sessionSummary.statePercentages && (
                            <div className="mt-4 p-3 rounded-lg border bg-green-50 dark:bg-green-900 border-green-200 dark:border-green-700">
                                <div className="font-semibold text-green-700 dark:text-green-300 mb-2">Session Results</div>
                                <div className="space-y-1 text-sm">
                                    <div>
                                        <span className="font-medium">Relaxed:</span> <span className="text-green-700 dark:text-green-300">{sessionSummary.statePercentages.Relaxed}%</span>
                                    </div>
                                    <div>
                                        <span className="font-medium">Focused:</span> <span className="text-green-700 dark:text-green-300">{sessionSummary.statePercentages.Focused}%</span>
                                    </div>
                                    <div>
                                        <span className="font-medium">Meditative:</span> <span className="text-green-700 dark:text-green-300">{sessionSummary.statePercentages["Meditation"]}%</span>
                                    </div>
                                    <div>
                                        <span className="font-medium">Drowsy:</span> <span className="text-green-700 dark:text-green-300">{sessionSummary.statePercentages.Drowsy}%</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {/* Main Content Area */}
            <div className="flex-1 overflow-auto">
                {/* Top Header Bar */}
                <div
                    className={classNames(
                        "border-b px-8 py-4 flex items-center justify-between",
                        isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-300"
                    )}
                >
                    {/* Hamburger for mobile */}
                    <button
                        className="md:hidden bg-white dark:bg-slate-800 p-2 rounded-lg shadow mr-4"
                        onClick={() => setSidebarOpen(true)}
                        aria-label="Open sidebar"
                    >
                        <svg className="h-6 w-6 text-slate-700 dark:text-slate-200" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
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
                {/* Dashboard Content */}
                <div className="p-4">
                    {/* Vital Signs Row */}
                    <div className="mb-2">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
                            {/* Heart Rate */}
                            <div className="p-2 flex flex-col items-center">
                                <Heart className="h-6 w-6 text-green-600 mb-1" />
                                <span className="text-sm font-semibold text-green-700 dark:text-green-300 mb-1">Heart Rate</span>
                                <span className="text-3xl md:text-4xl font-bold text-green-700 dark:text-green-300" ref={bpmCurrentRef}>--</span>
                                <span className="text-xs text-green-600 dark:text-green-400 mt-1">BPM</span>
                            </div>
                            {/* Heart Rate Variability */}
                            <div className="p-4 flex flex-col items-center">
                                <Activity className="h-6 w-6 text-green-600 mb-2" />
                                <span className="text-sm font-semibold text-green-700 dark:text-green-300 mb-1">Heart Rate Variability</span>
                                <span className="text-3xl md:text-4xl font-bold text-green-700 dark:text-green-300" ref={hrvCurrentRef}>--</span>
                                <span className="text-xs text-green-600 dark:text-green-400 mt-1">MS</span>
                            </div>
                            {/* Mental Load */}
                            <div className="p-4 flex flex-col items-center">
                                <GaugeIcon className="h-6 w-6 text-green-600 mb-2" />
                                <span className="text-sm font-semibold text-green-700 dark:text-green-300 mb-1">Mental Load</span>
                                <span className="text-3xl md:text-4xl font-bold text-green-700 dark:text-green-300">{mentalLoadIndex}</span>
                                <span className="text-xs text-green-600 dark:text-green-400 mt-1">INDEX</span>
                            </div>
                            {/* Balance Score */}
                            <div className="p-4 flex flex-col items-center">
                                <BarChartIcon className="h-6 w-6 text-green-600 mb-2" />
                                <span className="text-sm font-semibold text-green-700 dark:text-green-300 mb-1">Balance Score</span>
                                <span className="text-3xl md:text-4xl font-bold text-green-700 dark:text-green-300">
                                    {mindBodyBalance !== null ? `${mindBodyBalance}` : "--"}
                                </span>
                                <span className="text-xs text-green-600 dark:text-green-400 mt-1">SCORE</span>
                            </div>
                        </div>
                    </div>
                    {/* Brainwave Analysis - Always Visible */}
                    <div className="mb-2">
                        <div className={classNames(
                            "p-4 rounded-xl border",
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