'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useBluetoothDataStream } from './BluetoothDataHandler';
import { MeditationSession } from './MeditationTracker';
import MeditationWaveformVisualizer from './MeditationWaveformPlot';
import WebglPlotCanvas, { type WebglPlotCanvasHandle } from './SignalCanvasPlot';
import HeartRateVariabilityCanvas, { type HeartRateVariabilityHandle } from './Hrvwebglplot';
import { MoodDisplay, type EmotionalState } from './MentalStateIndicator';
import { predictState } from '@/lib/mentalStateClassifier';
import { getRandomQuote } from '@/quote.js';

import { Button } from '@/components/ui/AppButton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/InfoCard';
import { Badge } from '@/components/ui/StatusBadge';
import { Progress } from '@/components/ui/ProgressBar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/TabNavigation';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/ModalDialog';
import { Switch } from '@/components/ui/ToggleSwitch';

import { 
  Brain, 
  Heart, 
  Activity, 
  Wifi, 
  WifiOff, 
  Play, 
  Pause, 
  Settings, 
  TrendingUp,
  Zap,
  Eye,
  Waves,
  BarChart3,
  Monitor,
  Sparkles,
  Target,
  Timer,
  Award,
  Filter,
  Signal,
  Bluetooth,
  BluetoothConnected,
  Circle
} from 'lucide-react';

// Types
interface ProcessedData {
  counter: number;
  eeg0: number;
  eeg1: number;
  ecg: number;
}

interface BandPowers {
  smooth0: Record<string, number>;
  smooth1: Record<string, number>;
}

interface BPMData {
  bpm: number | null;
  hrv: number | null;
  sdnn: number | null;
  rmssd: number | null;
  pnn50: number | null;
}

interface SessionData {
  timestamp: number;
  alpha: number;
  beta: number;
  theta: number;
  delta: number;
  symmetry: number;
}

const EEGDataPlot: React.FC = () => {
  // State management
  const [isRecording, setIsRecording] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [showResults, setShowResults] = useState(false);
  const [currentQuote] = useState(() => getRandomQuote());
  const [signalQuality, setSignalQuality] = useState<'excellent' | 'good' | 'poor' | 'none'>('none');
  const [sessionData, setSessionData] = useState<SessionData[]>([]);
  const [sessionResults, setSessionResults] = useState<any>(null);
  const [currentMood, setCurrentMood] = useState<EmotionalState>('no_data');
  const [bandPowers, setBandPowers] = useState<BandPowers>({
    smooth0: { alpha: 0, beta: 0, theta: 0, delta: 0, gamma: 0 },
    smooth1: { alpha: 0, beta: 0, theta: 0, delta: 0, gamma: 0 }
  });
  const [bpmData, setBpmData] = useState<BPMData>({
    bpm: null,
    hrv: null,
    sdnn: null,
    rmssd: null,
    pnn50: null
  });

  // Refs
  const eegCanvasRef = useRef<WebglPlotCanvasHandle>(null);
  const hrvCanvasRef = useRef<HeartRateVariabilityHandle>(null);
  const dataProcessorRef = useRef<Worker | null>(null);
  const bandPowerWorkerRef = useRef<Worker | null>(null);
  const bpmWorkerRef = useRef<Worker | null>(null);
  const eegBufferRef = useRef<{ eeg0: number[]; eeg1: number[] }>({ eeg0: [], eeg1: [] });
  const ecgBufferRef = useRef<number[]>([]);

  // Initialize workers
  useEffect(() => {
    dataProcessorRef.current = new Worker(new URL('@/webworker/dataProcessor.worker.ts', import.meta.url));
    bandPowerWorkerRef.current = new Worker(new URL('@/webworker/bandPower.worker.ts', import.meta.url));
    bpmWorkerRef.current = new Worker(new URL('@/webworker/bpm.worker.ts', import.meta.url));

    // Setup worker message handlers
    dataProcessorRef.current.onmessage = (e) => {
      if (e.data.type === 'processedData') {
        handleProcessedData(e.data.data);
      }
    };

    bandPowerWorkerRef.current.onmessage = (e) => {
      setBandPowers(e.data);
      updateSessionData(e.data);
    };

    bpmWorkerRef.current.onmessage = (e) => {
      setBpmData(e.data);
      updateMoodState(e.data);
      if (e.data.hrv) {
        hrvCanvasRef.current?.addHRVData(e.data.hrv);
      }
    };

    return () => {
      dataProcessorRef.current?.terminate();
      bandPowerWorkerRef.current?.terminate();
      bpmWorkerRef.current?.terminate();
    };
  }, []);

  // Data processing functions
  const handleRawData = useCallback((rawData: number[]) => {
    if (rawData.length >= 4) {
      const processedRawData = {
        counter: rawData[0],
        raw0: rawData[1],
        raw1: rawData[2],
        raw2: rawData[3]
      };
      dataProcessorRef.current?.postMessage({
        command: 'process',
        rawData: processedRawData
      });
    }
  }, []);

  const handleProcessedData = useCallback((data: ProcessedData) => {
    // Update signal quality
    const amplitude = Math.abs(data.eeg0) + Math.abs(data.eeg1);
    if (amplitude > 0.1) setSignalQuality('excellent');
    else if (amplitude > 0.05) setSignalQuality('good');
    else if (amplitude > 0.01) setSignalQuality('poor');
    else setSignalQuality('none');

    // Update EEG canvas
    eegCanvasRef.current?.updateData([data.counter, data.eeg0, data.eeg1, data.ecg]);

    // Buffer data for analysis
    eegBufferRef.current.eeg0.push(data.eeg0);
    eegBufferRef.current.eeg1.push(data.eeg1);
    ecgBufferRef.current.push(data.ecg);

    const bufferSize = 256;
    if (eegBufferRef.current.eeg0.length > bufferSize) {
      eegBufferRef.current.eeg0.shift();
      eegBufferRef.current.eeg1.shift();
    }
    if (ecgBufferRef.current.length > 2000) {
      ecgBufferRef.current.shift();
    }

    // Process band powers every 32 samples
    if (eegBufferRef.current.eeg0.length === bufferSize) {
      bandPowerWorkerRef.current?.postMessage({
        eeg0: [...eegBufferRef.current.eeg0],
        eeg1: [...eegBufferRef.current.eeg1],
        sampleRate: 500,
        fftSize: bufferSize
      });
    }

    // Process BPM every 100 samples
    if (ecgBufferRef.current.length >= 500 && ecgBufferRef.current.length % 100 === 0) {
      bpmWorkerRef.current?.postMessage({
        ecgBuffer: [...ecgBufferRef.current],
        sampleRate: 500
      });
    }
  }, []);

  const updateSessionData = useCallback((powers: BandPowers) => {
    if (!isRecording) return;

    const avgPowers = {
      alpha: (powers.smooth0.alpha + powers.smooth1.alpha) / 2,
      beta: (powers.smooth0.beta + powers.smooth1.beta) / 2,
      theta: (powers.smooth0.theta + powers.smooth1.theta) / 2,
      delta: (powers.smooth0.delta + powers.smooth1.delta) / 2,
      symmetry: powers.smooth0.alpha - powers.smooth1.alpha
    };

    setSessionData(prev => [...prev, {
      timestamp: Date.now(),
      ...avgPowers
    }]);
  }, [isRecording]);

  const updateMoodState = useCallback((bpm: BPMData) => {
    if (bpm.sdnn !== null && bpm.rmssd !== null && bpm.pnn50 !== null) {
      const mood = predictState({
        sdnn: bpm.sdnn,
        rmssd: bpm.rmssd,
        pnn50: bpm.pnn50
      });
      setCurrentMood(mood);
    }
  }, []);

  // Bluetooth connection
  const bluetooth = useBluetoothDataStream(handleRawData);

  // Session management
  const handleStartSession = () => {
    setIsRecording(true);
    setSessionData([]);
    setSessionResults(null);
  };

  const handleEndSession = () => {
    setIsRecording(false);
  };

  // Render session results
  const renderSessionResults = (results: any) => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="text-center p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950">
          <div className="text-lg font-bold text-emerald-600">{results.goodMeditationPct}%</div>
          <div className="text-xs text-muted-foreground">Quality</div>
        </div>
        <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-950">
          <div className="text-lg font-bold text-blue-600">{results.focusScore}</div>
          <div className="text-xs text-muted-foreground">Focus</div>
        </div>
      </div>
      <div className="space-y-2">
        {Object.entries(results.statePercentages).map(([state, percentage]) => (
          <div key={state} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="capitalize">{state}</span>
              <span>{percentage}%</span>
            </div>
            <Progress value={parseFloat(percentage)} className="h-1" />
          </div>
        ))}
      </div>
    </div>
  );

  const getSignalQualityColor = () => {
    switch (signalQuality) {
      case 'excellent': return 'text-green-500';
      case 'good': return 'text-yellow-500';
      case 'poor': return 'text-orange-500';
      default: return 'text-red-500';
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-50 dark:bg-slate-900 flex flex-col">
      {/* Minimal Header */}
      <div className="flex-none h-16 px-6 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="h-full flex items-center justify-between">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Brain className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900 dark:text-white">HealthFit</h1>
            </div>
          </div>

          {/* Status Bar */}
          <div className="flex items-center gap-4">
            {/* Connection */}
            <div className="flex items-center gap-2">
              <Circle className={`h-2 w-2 ${bluetooth.connected ? 'fill-green-500 text-green-500' : 'fill-red-500 text-red-500'}`} />
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {bluetooth.connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>

            {/* Signal Quality */}
            <div className="flex items-center gap-2">
              <Signal className={`h-4 w-4 ${getSignalQualityColor()}`} />
              <span className="text-sm text-slate-600 dark:text-slate-400 capitalize">{signalQuality}</span>
            </div>

            {/* Recording Status */}
            {isRecording && (
              <div className="flex items-center gap-2">
                <Circle className="h-2 w-2 fill-red-500 text-red-500 animate-pulse" />
                <span className="text-sm text-red-600">Recording</span>
              </div>
            )}

            {/* Connect Button */}
            <Button
              onClick={bluetooth.connected ? bluetooth.disconnect : bluetooth.connect}
              size="sm"
              variant={bluetooth.connected ? "destructive" : "default"}
            >
              {bluetooth.connected ? 'Disconnect' : 'Connect'}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 p-4">
        <div className="h-full grid grid-cols-12 gap-4">
          {/* Left Panel - Visualizations */}
          <div className="col-span-8 flex flex-col gap-4">
            {/* EEG Signal */}
            <div className="flex-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="h-12 px-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Waves className="h-4 w-4 text-blue-600" />
                  <span className="font-medium text-slate-900 dark:text-white">EEG Signal</span>
                </div>
                <Badge variant="secondary" className="text-xs">Live</Badge>
              </div>
              <div className="h-[calc(100%-3rem)]">
                <WebglPlotCanvas
                  ref={eegCanvasRef}
                  channels={[0]}
                  colors={{ 0: '#3b82f6' }}
                  gridnumber={10}
                />
              </div>
            </div>

            {/* HRV Signal */}
            <div className="flex-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="h-12 px-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Heart className="h-4 w-4 text-red-600" />
                  <span className="font-medium text-slate-900 dark:text-white">Heart Rate Variability</span>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {bpmData.bpm ? `${bpmData.bpm} BPM` : 'No Signal'}
                </Badge>
              </div>
              <div className="h-[calc(100%-3rem)]">
                <HeartRateVariabilityCanvas
                  ref={hrvCanvasRef}
                  dataPointCount={2000}
                  lineColor="#ef4444"
                  isDarkTheme={false}
                />
              </div>
            </div>
          </div>

          {/* Right Panel - Controls & Data */}
          <div className="col-span-4 flex flex-col gap-4">
            {/* Meditation Session */}
            <div className="flex-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="h-12 px-4 border-b border-slate-200 dark:border-slate-700 flex items-center">
                <Target className="h-4 w-4 text-purple-600 mr-2" />
                <span className="font-medium text-slate-900 dark:text-white">Meditation</span>
              </div>
              <div className="h-[calc(100%-3rem)] p-4">
                <MeditationSession
                  onStartSession={handleStartSession}
                  onEndSession={handleEndSession}
                  sessionData={sessionData}
                  connected={bluetooth.connected}
                  setShowResults={setShowResults}
                  sessionResults={sessionResults}
                  setSessionResults={setSessionResults}
                  darkMode={false}
                  renderSessionResults={renderSessionResults}
                />
              </div>
            </div>

            {/* Current State */}
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="h-4 w-4 text-emerald-600" />
                <span className="font-medium text-slate-900 dark:text-white">Current State</span>
              </div>
              <div className="text-center">
                <MoodDisplay state={currentMood} />
              </div>
            </div>

            {/* Biometrics */}
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-blue-600" />
                <span className="font-medium text-slate-900 dark:text-white">Biometrics</span>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="text-center p-2 rounded bg-red-50 dark:bg-red-950">
                  <div className="text-lg font-bold text-red-600">{bpmData.bpm || '--'}</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">BPM</div>
                </div>
                <div className="text-center p-2 rounded bg-orange-50 dark:bg-orange-950">
                  <div className="text-lg font-bold text-orange-600">{bpmData.hrv || '--'}</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">HRV</div>
                </div>
              </div>
              
              {/* Brain Waves */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Brain Waves</div>
                {Object.entries(bandPowers.smooth0).slice(0, 4).map(([band, power]) => (
                  <div key={band} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="capitalize">{band}</span>
                      <span>{(power * 100).toFixed(1)}%</span>
                    </div>
                    <Progress value={power * 100} className="h-1" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Results Modal */}
      <Dialog open={showResults} onOpenChange={setShowResults}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Session Results</DialogTitle>
            <DialogDescription>Your meditation session analysis</DialogDescription>
          </DialogHeader>
          {sessionResults && renderSessionResults(sessionResults)}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EEGDataPlot;