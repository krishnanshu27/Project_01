"use client";
import { useState as useLocalState, useRef as useLocalRef, useCallback as useLocalCallback, useEffect as useLocalEffect } from "react";
import { useMotionValue as useLocalMotionValue } from "framer-motion";

import { Button as UIButton } from "@/components/ui/button";
import { cn as classNames } from "@/lib/utils";

import {
    Activity as ActivityIcon, Brain as BrainIcon, Heart as HeartIcon, Moon as MoonIcon, Sun as SunIcon, Plug as PlugIcon, PlugZap as PlugZapIcon, Zap as ZapIcon, Clock as ClockIcon, Target as TargetIcon,
    Signal as SignalIcon, TrendingUp as TrendingUpIcon, ActivitySquare as ActivitySquareIcon, Gauge as GaugeIcon, BarChart3 as BarChartIcon, BarChart3, Waves, Brain, Heart, Activity, Clock, Target, Zap
} from 'lucide-react';
import { Card as UICard, CardContent as UICardContent, CardDescription as UICardDescription, CardHeader as UICardHeader, CardTitle as UICardTitle } from '@/components/ui/card';
import { Dialog as UIDialog, DialogContent as UIDialogContent, DialogHeader as UIDialogHeader, DialogTitle as UIDialogTitle, DialogTrigger as UIDialogTrigger } from '@/components/ui/dialog';
import { Badge as UIBadge } from '@/components/ui/badge';
import { Progress as UIProgress } from '@/components/ui/progress';
import { Separator as UISeparator } from '@/components/ui/separator';
import { ScrollArea as UIScrollArea } from '@/components/ui/scroll-area';
import { Tabs as UITabs, TabsContent as UITabsContent, TabsList as UITabsList, TabsTrigger as UITabsTrigger } from '@/components/ui/tabs';
import { Alert as UIAlert, AlertDescription as UIAlertDescription } from '@/components/ui/alert';

import { useBluetoothDataStream as useBluetoothStream } from '../components/Bledata';
import WebglPlotCanvas from '../components/WebglPlotCanvas';

import { WebglPlotCanvasHandle as PlotCanvasHandle } from "../components/WebglPlotCanvas";
import HeartRateVariabilityCanvas, { HeartRateVariabilityHandle as HRVCanvasHandle } from '@/components/Hrvwebglplot'
import { MoodDisplay, EmotionalState } from "./StateIndicator";
import MeditationWaveform from "../components/MeditationWaveform";
import { predictState as predictMentalState } from "@/lib/stateClassifier";
import { useRouter as useLocalRouter } from 'next/navigation';
import { MeditationSession as MindSession } from '../components/MeditationSession';
import UILink from "next/link";



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

    // Show/hide the session results dialog
    function setShowResults(value: React.SetStateAction<boolean>): void {
        setResultsVisible(value);
    }

    function setSessionResults(value: React.SetStateAction<{
        duration: number;
        averages: { alpha: number; beta: number; theta: number; delta: number; symmetry: number; };
        mentalState: string;
        stateDescription: string;
        focusScore: string;
        symmetry: string;
        data: { timestamp: number; alpha: number; beta: number; theta: number; delta: number; symmetry: number; }[];
        dominantBands: Record<string, number>;
        mostFrequent: string;
        convert: (ticks: number) => string;
        avgSymmetry: string;
        formattedDuration: string;
        statePercentages: Record<string, string>;
        goodMeditationPct: string;
        weightedEEGScore: number;
    } | null>): void {
        setSessionSummary(value);
    }

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
                                <div className={classNames(
                                    "h-2 w-2 rounded-full",
                                    isDeviceConnected ? "bg-green-500 animate-pulse" : "bg-slate-400"
                                )} />
                                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                                    {isDeviceConnected ? "Connected" : "Disconnected"}
                                </span>
                            </div>

                            {!isDeviceConnected ? (
                                <UIButton onClick={connectDevice} className="gap-2">
                                    <PlugIcon className="h-4 w-4" />
                                    Connect
                                </UIButton>
                            ) : (
                                <UIButton onClick={disconnectDevice} variant="destructive" className="gap-2">
                                    <PlugZapIcon className="h-4 w-4" />
                                    Disconnect
                                </UIButton>
                            )}

                            <UIButton
                                onClick={() => setIsDarkMode(!isDarkMode)}
                                variant="ghost"
                                size="icon"
                                className="rounded-lg"
                            >
                                {isDarkMode ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
                            </UIButton>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="container mx-auto px-4 py-6 space-y-6">
                {/* Main Dashboard */}
                <UITabs defaultValue="overview" className="space-y-6">
                    <UITabsList className="grid w-full grid-cols-3">
                        <UITabsTrigger value="overview">Overview</UITabsTrigger>
                       
                    </UITabsList>

                    <UITabsContent value="overview" className="space-y-6">
                        {/* Status Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <UICard>
                                <UICardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <UICardTitle className="text-sm font-medium">Connection</UICardTitle>
                                    <ActivityIcon className="h-4 w-4 text-muted-foreground" />
                                </UICardHeader>
                                <UICardContent>
                                    <div className="text-2xl font-bold">
                                        {isDeviceConnected ? "Active" : "Inactive"}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Device status
                                    </p>
                                </UICardContent>
                            </UICard>

                            <UICard>
                                <UICardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <UICardTitle className="text-sm font-medium">Heart Rate</UICardTitle>
                                    <HeartIcon className={classNames("h-4 w-4", heartbeatActive ? "text-red-500 scale-125" : "text-muted-foreground")} />
                                </UICardHeader>
                                <UICardContent>
                                    <div className="text-2xl font-bold" ref={bpmCurrentRef}>--</div>
                                    <p className="text-xs text-muted-foreground">bpm</p>
                                </UICardContent>
                            </UICard>

                            <UICard>
                                <UICardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <UICardTitle className="text-sm font-medium">HRV</UICardTitle>
                                    <ActivitySquareIcon className="h-4 w-4 text-muted-foreground" />
                                </UICardHeader>
                                <UICardContent>
                                    <div className="text-2xl font-bold" ref={hrvCurrentRef}>--</div>
                                    <p className="text-xs text-muted-foreground">ms</p>
                                </UICardContent>
                            </UICard>

                            <UICard>
                                <UICardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <UICardTitle className="text-sm font-medium">Mental State</UICardTitle>
                                    <BrainIcon className="h-4 w-4 text-muted-foreground" />
                                </UICardHeader>
                                <UICardContent>
                                    <div className="text-2xl font-bold">
                                       <MoodDisplay state={currentMentalState} />
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Current state
                                    </p>
                                </UICardContent>
                            </UICard>
                        </div>

                        {/* Brain Activity Overview */}
                        <UICard>
                            <UICardHeader>
                                <UICardTitle className="flex items-center gap-2">
                                    <BarChartIcon className="h-3 w-5" />
                                    Brain Activity Overview
                                </UICardTitle>
                                <UICardDescription>
                                    Real-time brainwave analysis from both hemispheres
                                </UICardDescription>
                            </UICardHeader>
                            <UICardContent>
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    {/* Left Hemisphere */}
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <div className="h-3 w-3 rounded-full bg-gradient-to-r from-blue-500 to-purple-600" />
                                            <h3 className="font-semibold">Left Hemisphere</h3>
                                        </div>
                                        <div className="space-y-2">
                                            {["Delta", "Theta", "Alpha", "Beta", "Gamma"].map((band, index) => {
                                                const value = radarCh0DataRef.current.find((d) => d.subject === band)?.value ?? 0;
                                                const colors = ["bg-purple-500", "bg-blue-500", "bg-green-500", "bg-yellow-500", "bg-red-500"];
                                                return (
                                                    <div key={band} className="space-y-2">
                                                        <div className="flex justify-between text-sm">
                                                            <span className="font-medium">{band}</span>
                                                            <span className="text-muted-foreground">{value.toFixed(1)}%</span>
                                                        </div>
                                                        <UIProgress value={Math.min(value, 100)} className="h-2" />
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
                                                const value = radarCh1DataRef.current.find((d) => d.subject === band)?.value ?? 0;
                                                const colors = ["bg-purple-500", "bg-blue-500", "bg-green-500", "bg-yellow-500", "bg-red-500"];
                                                return (
                                                    <div key={band} className="space-y-2">
                                                        <div className="flex justify-between text-sm">
                                                            <span className="font-medium">{band}</span>
                                                            <span className="text-muted-foreground">{value.toFixed(1)}%</span>
                                                        </div>
                                                        <UIProgress value={Math.min(value, 100)} className="h-2" />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>


                                </div>
                            </UICardContent>
                        </UICard>

                        {/* Signal Plots */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <UICard>
                                <UICardHeader>
                                    <UICardTitle className="text-sm">EEG Channel 1</UICardTitle>
                                </UICardHeader>
                                <UICardContent>
                                    <div className="h-32">
                                        <WebglPlotCanvas
                                            ref={eeg1CanvasRef}
                                            channels={[1]}
                                            colors={{ 1: "#C29963" }}
                                            gridnumber={10}
                                        />
                                    </div>
                                </UICardContent>
                            </UICard>

                            <UICard>
                                <UICardHeader>
                                    <UICardTitle className="text-sm">EEG Channel 2</UICardTitle>
                                </UICardHeader>
                                <UICardContent>
                                    <div className="h-32">
                                        <WebglPlotCanvas
                                            ref={eeg2CanvasRef}
                                            channels={[2]}
                                            colors={{ 2: "#63A2C2" }}
                                            gridnumber={10}
                                        />
                                    </div>
                                </UICardContent>
                            </UICard>

                            <UICard>
                                <UICardHeader>
                                    <UICardTitle className="text-sm">ECG Signal</UICardTitle>
                                </UICardHeader>
                                <UICardContent>
                                    <div className="h-32">
                                        <WebglPlotCanvas
                                            ref={ecgCanvasRef}
                                            channels={[3]}
                                            colors={{ 3: "#E4967E" }}
                                            gridnumber={10}
                                        />
                                    </div>
                                </UICardContent>
                            </UICard>

                        </div>
                    </UITabsContent>

                </UITabs>
            </main>
        </div>
    );
}