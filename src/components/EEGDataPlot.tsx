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
  BluetoothConnected
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
    <div className="space-y-6">
      {/* Performance Overview */}
      <Card className="border-2 border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950 dark:to-green-950">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
            <Award className="h-5 w-5" />
            Session Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {results.goodMeditationPct}%
              </div>
              <div className="text-sm text-muted-foreground">Meditation Quality</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {results.focusScore}
              </div>
              <div className="text-sm text-muted-foreground">Focus Score</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Brain Wave Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-600" />
            Brain Wave Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.entries(results.statePercentages).map(([state, percentage]) => (
              <div key={state} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="capitalize">{state}</span>
                  <span className="font-medium">{percentage}%</span>
                </div>
                <Progress value={parseFloat(percentage)} className="h-2" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Session Visualization */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-blue-600" />
            Session Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48">
            <MeditationWaveformVisualizer
              data={sessionData}
              sessionDuration={results.duration / 60}
              darkMode={false}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const getSignalQualityColor = () => {
    switch (signalQuality) {
      case 'excellent': return 'bg-green-500';
      case 'good': return 'bg-yellow-500';
      case 'poor': return 'bg-orange-500';
      default: return 'bg-red-500';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-400/20 to-purple-600/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-emerald-400/20 to-blue-600/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-br from-purple-400/10 to-pink-600/10 rounded-full blur-3xl animate-pulse delay-2000"></div>
      </div>

      <div className="relative z-10 p-6 space-y-6">
        {/* Enhanced Header */}
        <Card className="border-0 shadow-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg">
                  <Brain className="h-8 w-8 text-white" />
                </div>
                <div>
                  <CardTitle className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    HealthFit Pro
                  </CardTitle>
                  <CardDescription className="text-lg text-muted-foreground">
                    Advanced EEG & Biometric Analysis
                  </CardDescription>
                </div>
              </div>

              {/* Enhanced Status Indicators */}
              <div className="flex items-center gap-4">
                {/* Connection Status */}
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700">
                  {bluetooth.connected ? (
                    <>
                      <BluetoothConnected className="h-5 w-5 text-blue-600" />
                      <span className="text-sm font-medium text-blue-600">Connected</span>
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                    </>
                  ) : (
                    <>
                      <Bluetooth className="h-5 w-5 text-red-500" />
                      <span className="text-sm font-medium text-red-500">Disconnected</span>
                    </>
                  )}
                </div>

                {/* Signal Quality */}
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700">
                  <Signal className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                  <span className="text-sm font-medium capitalize">{signalQuality}</span>
                  <div className={`w-2 h-2 rounded-full ${getSignalQualityColor()}`}></div>
                </div>

                {/* Recording Status */}
                {isRecording && (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-red-100 to-pink-100 dark:from-red-900 dark:to-pink-900">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                    <span className="text-sm font-medium text-red-600 dark:text-red-400">Recording</span>
                  </div>
                )}
              </div>
            </div>

            {/* Enhanced Control Panel */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-4">
                <Button
                  onClick={bluetooth.connected ? bluetooth.disconnect : bluetooth.connect}
                  size="lg"
                  className={`px-6 py-3 text-lg font-semibold shadow-lg transition-all duration-300 ${
                    bluetooth.connected 
                      ? 'bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700' 
                      : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700'
                  }`}
                >
                  {bluetooth.connected ? (
                    <>
                      <WifiOff className="mr-2 h-5 w-5" />
                      Disconnect
                    </>
                  ) : (
                    <>
                      <Wifi className="mr-2 h-5 w-5" />
                      Connect Device
                    </>
                  )}
                </Button>

                <div className="flex items-center gap-2">
                  <Filter className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                  <span className="text-sm font-medium">Show Filters</span>
                  <Switch checked={showFilters} onCheckedChange={setShowFilters} />
                </div>
              </div>

              {/* Quote Display */}
              <div className="max-w-md text-right">
                <p className="text-sm italic text-slate-600 dark:text-slate-400">
                  "{currentQuote.text}"
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                  — {currentQuote.author}
                </p>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Enhanced Main Content */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left Column - Visualizations */}
          <div className="xl:col-span-2 space-y-6">
            {/* EEG Signal Display */}
            <Card className="border-0 shadow-xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Waves className="h-6 w-6 text-blue-600" />
                  EEG Signal Monitor
                  <Badge variant="secondary" className="ml-auto">
                    Real-time
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                  <WebglPlotCanvas
                    ref={eegCanvasRef}
                    channels={[0]}
                    colors={{ 0: '#3b82f6' }}
                    gridnumber={10}
                  />
                </div>
              </CardContent>
            </Card>

            {/* HRV Display */}
            <Card className="border-0 shadow-xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Heart className="h-6 w-6 text-red-600" />
                  Heart Rate Variability
                  <Badge variant="secondary" className="ml-auto">
                    {bpmData.bpm ? `${bpmData.bpm} BPM` : 'No Signal'}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                  <HeartRateVariabilityCanvas
                    ref={hrvCanvasRef}
                    dataPointCount={2000}
                    lineColor="#ef4444"
                    isDarkTheme={false}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Analytics & Controls */}
          <div className="space-y-6">
            {/* Meditation Session */}
            <Card className="border-0 shadow-xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Target className="h-6 w-6 text-purple-600" />
                  Meditation Session
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
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
              </CardContent>
            </Card>

            {/* Enhanced Biometric Dashboard */}
            <Card className="border-0 shadow-xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Activity className="h-6 w-6 text-emerald-600" />
                  Biometric Dashboard
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Current Mood */}
                <div className="text-center p-4 rounded-xl bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950">
                  <div className="text-sm font-medium text-muted-foreground mb-2">Current State</div>
                  <MoodDisplay state={currentMood} />
                </div>

                {/* HRV Metrics */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 rounded-lg bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-950 dark:to-pink-950">
                    <Heart className="h-5 w-5 mx-auto mb-1 text-red-600" />
                    <div className="text-lg font-bold text-red-700 dark:text-red-300">
                      {bpmData.bpm || '--'}
                    </div>
                    <div className="text-xs text-muted-foreground">BPM</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-gradient-to-br from-orange-50 to-yellow-50 dark:from-orange-950 dark:to-yellow-950">
                    <TrendingUp className="h-5 w-5 mx-auto mb-1 text-orange-600" />
                    <div className="text-lg font-bold text-orange-700 dark:text-orange-300">
                      {bpmData.hrv || '--'}
                    </div>
                    <div className="text-xs text-muted-foreground">HRV (ms)</div>
                  </div>
                </div>

                {/* Brain Wave Powers */}
                <div className="space-y-3">
                  <div className="text-sm font-medium text-center">Brain Wave Activity</div>
                  {Object.entries(bandPowers.smooth0).map(([band, power]) => (
                    <div key={band} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="capitalize font-medium">{band}</span>
                        <span className="text-muted-foreground">{(power * 100).toFixed(1)}%</span>
                      </div>
                      <Progress value={power * 100} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Results Modal */}
        <Dialog open={showResults} onOpenChange={setShowResults}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-2xl">
                <Sparkles className="h-6 w-6 text-purple-600" />
                Detailed Session Results
              </DialogTitle>
              <DialogDescription>
                Comprehensive analysis of your meditation session
              </DialogDescription>
            </DialogHeader>
            {sessionResults && renderSessionResults(sessionResults)}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default EEGDataPlot;