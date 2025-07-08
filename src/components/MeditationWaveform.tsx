'use client'
import React, { useRef, useEffect, useState } from 'react';
import { Award } from 'lucide-react';

interface NeuralDataPoint {
  timestamp?: number;
  alpha: number;
  beta: number;
  theta: number;
  delta?: number;
}

interface ComponentProps {
  data: NeuralDataPoint[];
  sessionDuration: number;
  darkMode?: boolean;
  className?: string;
}

const MeditationWaveformVisualizer: React.FC<ComponentProps> = ({
  data,
  sessionDuration,
  darkMode = true,
  className = ''
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const calculateAnalytics = () => {
    if (!data.length) return {
      meanAlpha: 0,
      meanBeta: 0,
      meanTheta: 0,
      meanDelta: 0,
      peakTheta: 0,
      stability: 0,
      flowIndex: 0,
      distributionRatios: {
        Relaxed: 0,
        Focused: 0,
        'Deep Meditation': 0,
        Drowsy: 0
      },
      dominantState: 'Relaxed',
      segments: []
    };

    // Calculate means
    const meanAlpha = data.reduce((acc, sample) => acc + sample.alpha, 0) / data.length;
    const meanBeta = data.reduce((acc, sample) => acc + sample.beta, 0) / data.length;
    const meanTheta = data.reduce((acc, sample) => acc + sample.theta, 0) / data.length;
    const meanDelta = data.reduce((acc, sample) => acc + (sample.delta ?? 0), 0) / data.length;

    // Consistent state classification logic
    const determineBrainState = (alphaVal: number, betaVal: number, thetaVal: number, deltaVal: number) => {
      const waveValues = { alpha: alphaVal, beta: betaVal, theta: thetaVal, delta: deltaVal };
      const dominantWave = Object.keys(waveValues).reduce((prev, curr) => 
        waveValues[prev as keyof typeof waveValues] > waveValues[curr as keyof typeof waveValues] ? prev : curr
      );

      switch (dominantWave) {
        case 'alpha': return 'Relaxed';
        case 'beta': return 'Focused';
        case 'theta': return 'Deep Meditation';
        case 'delta': return 'Drowsy';
        default: return 'Relaxed';
      }
    };

    // Calculate state percentages for entire session
    const stateCounter = { Relaxed: 0, Focused: 0, 'Deep Meditation': 0, Drowsy: 0 };

    data.forEach(dataPoint => {
      const currentState = determineBrainState(dataPoint.alpha, dataPoint.beta, dataPoint.theta, dataPoint.delta ?? 0);
      stateCounter[currentState]++;
    });

    const totalDataPoints = data.length;
    const distributionRatios = {
      Relaxed: Math.round((stateCounter.Relaxed / totalDataPoints) * 100),
      Focused: Math.round((stateCounter.Focused / totalDataPoints) * 100),
      'Meditation': Math.round((stateCounter['Deep Meditation'] / totalDataPoints) * 100),
      Drowsy: Math.round((stateCounter.Drowsy / totalDataPoints) * 100)
    };

    // Most frequent state
    const dominantState = Object.entries(stateCounter).reduce((prev, curr) => prev[1] > curr[1] ? prev : curr)[0];

    // Create exactly 12 segments
    const segments: Array<{
      phase: string;
      alpha: number;
      theta: number;
      beta: number;
      delta: number;
      stateHeights: { relaxed: number; focused: number; deep: number; drowsy: number };
    }> = [];

    const segmentCount = 12;
    const segmentSize = Math.ceil(data.length / segmentCount);

    for (let idx = 0; idx < segmentCount; idx++) {
      const startIndex = idx * segmentSize;
      const endIndex = Math.min(startIndex + segmentSize, data.length);
      const segmentData = data.slice(startIndex, endIndex);

      if (segmentData.length === 0) continue;

      const avgAlpha = segmentData.reduce((acc, sample) => acc + sample.alpha, 0) / segmentData.length;
      const avgBeta = segmentData.reduce((acc, sample) => acc + sample.beta, 0) / segmentData.length;
      const avgTheta = segmentData.reduce((acc, sample) => acc + sample.theta, 0) / segmentData.length;
      const avgDelta = segmentData.reduce((acc, sample) => acc + (sample.delta ?? 0), 0) / segmentData.length;

      // Determine dominant segment
      const segmentType = determineBrainState(avgAlpha, avgBeta, avgTheta, avgDelta).toLowerCase().replace(' ', '');

      // Calculate heights for stacked bars (normalize to 0-1 range)
      const totalWaveActivity = avgAlpha + avgBeta + avgTheta + avgDelta;
      const normalizedHeights = {
        relaxed: totalWaveActivity > 0 ? avgAlpha / totalWaveActivity : 0,
        focused: totalWaveActivity > 0 ? avgBeta / totalWaveActivity : 0,
        deep: totalWaveActivity > 0 ? avgTheta / totalWaveActivity : 0,
        drowsy: totalWaveActivity > 0 ? avgDelta / totalWaveActivity : 0
      };

      segments.push({
        phase: segmentType,
        alpha: avgAlpha,
        theta: avgTheta,
        beta: avgBeta,
        delta: avgDelta,
        stateHeights: normalizedHeights
      });
    }

    return {
      meanAlpha,
      meanBeta,
      meanTheta,
      meanDelta,
      distributionRatios,
      dominantState,
      segments
    };
  };

  const analyticsData = calculateAnalytics();
  const sessionScore = Math.min(100, Math.round((analyticsData.flowIndex ?? 0) * 100));

  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 });

  // Set up resize observer to handle container size changes
  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;

    const dimensionObserver = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setCanvasDimensions({ width, height });
    });

    dimensionObserver.observe(canvasElement.parentElement!);

    return () => dimensionObserver.disconnect();
  }, []);

  // Replace the useEffect canvas rendering with this:
  useEffect(() => {
    const canvasElement = canvasRef.current;
    const renderContext = canvasElement?.getContext('2d');
    if (!canvasElement || !renderContext || !data.length || canvasDimensions.width === 0) return;

    // Get device pixel ratio for crisp rendering on high-DPI displays
    const pixelRatio = window.devicePixelRatio || 1;
    
    // Set canvas resolution to match display size
    canvasElement.width = canvasDimensions.width * pixelRatio;
    canvasElement.height = canvasDimensions.height * pixelRatio;
    
    // Scale the context to account for the higher resolution
    renderContext.scale(pixelRatio, pixelRatio);

    const canvasWidth = canvasDimensions.width;
    const canvasHeight = canvasDimensions.height;
    const chartPadding = 20;
    const columnWidth = (canvasWidth - chartPadding * 2) / 12; // Fixed 12 segments
    const maxColumnHeight = canvasHeight - chartPadding * 2;

    renderContext.clearRect(0, 0, canvasElement.width, canvasElement.height);

    // Background solid color
    renderContext.fillStyle = 'rgba(15, 23, 42, 0.7)';
    renderContext.fillRect(0, 0, canvasWidth, canvasHeight);

    const waveStateColors = {
      relaxed: '#34d399',
      focused: '#f97316',
      deep: '#6366f1',
      drowsy: '#9ca3af'
    };

    analyticsData.segments.forEach((segment, segmentIndex) => {
      const xPosition = chartPadding + segmentIndex * columnWidth;
      const baseYPosition = canvasHeight - chartPadding;

      // Draw stacked horizontal bars
      let currentYPosition = baseYPosition;
      const waveStates = ['drowsy', 'deep', 'focused', 'relaxed'] as const;

      waveStates.forEach((waveState, stateIndex) => {
        const barHeight = segment.stateHeights[waveState] * maxColumnHeight * 0.8;

        if (barHeight > 2) {
          renderContext.fillStyle = waveStateColors[waveState];
          renderContext.beginPath();
          renderContext.roundRect(xPosition + 2, currentYPosition - barHeight, columnWidth - 4, barHeight, 2);
          renderContext.fill();

          currentYPosition -= barHeight;
        }
      });
    });

    // Time labels
    renderContext.fillStyle = 'rgba(148, 163, 184, 0.6)';
    renderContext.font = '14px system-ui';
    renderContext.textAlign = 'center';
    
    let actualDurationInSeconds: number;
    if (data.length > 1 && data[0].timestamp && data[data.length - 1].timestamp) {
      actualDurationInSeconds = (data[data.length - 1].timestamp! - data[0].timestamp!) / 1000;
    } else {
      actualDurationInSeconds = sessionDuration * 60;
    }

    const timePerSegment = actualDurationInSeconds / 12;

    for (let timeIndex = 0; timeIndex <= 12; timeIndex += 3) {
      const xPos = chartPadding + (canvasWidth - chartPadding * 2) * (timeIndex / 12);
      const timeInSec = Math.round(timePerSegment * timeIndex);

      let timeDisplay: string;
      if (timeInSec < 60) {
        timeDisplay = `${timeInSec}s`;
      } else {
        const mins = Math.floor(timeInSec / 60);
        const secs = timeInSec % 60;
        timeDisplay = secs === 0 ? `${mins}m` : `${mins}m${secs}s`;
      }

      renderContext.fillText(timeDisplay, xPos, canvasHeight - 5);
    }
  }, [data, analyticsData.segments, sessionDuration, canvasDimensions]);

  const getStateColorClass = (stateType: string) => {
    switch (stateType.toLowerCase()) {
      case 'relaxed': return 'bg-emerald-400';  // closest to mint green (#34d399)
      case 'focused': return 'bg-orange-500';   // close to vibrant orange (#f97316)
      case 'meditation': return 'bg-indigo-500';// close to electric blue (#6366f1)
      case 'drowsy': return 'bg-gray-400';      // close to cool gray (#9ca3af)
      default: return 'bg-slate-500';
    }
  };

  return (
    <div className={`w-full h-full bg-slate-800 rounded-sm overflow-hidden shadow-2xl ${className}`}>
      <div className="p-6" style={{ padding: '10px' }}>
        {/* Segments Canvas */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2" style={{ padding: '10px' }}>
            <span className="text-sm text-slate-400">Session Phases</span>
            <span className="text-xs text-slate-500">{analyticsData.segments.length} phases detected</span>
          </div>
          <div className="w-full h-[120px]">
            <canvas 
              ref={canvasRef} 
              className="w-full h-full rounded-xl"
              style={{
                width: '100%',
                height: '100%',
                display: 'block' // Removes extra space below canvas
              }}
            />
          </div>
        </div>
        {/* Meditation Breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6 h-20">
          {Object.entries(analyticsData.distributionRatios).map(([stateType, percentage]) => (
            <div key={stateType} className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${getStateColorClass(stateType)}`}></div>
              <div className="text-xs text-slate-300">{stateType}</div>
            </div>
          ))}
        </div>

        {/* Session Insights */}
        <div className="mt-6 p-4 bg-emerald-900/20 rounded-xl border border-emerald-800/30" style={{ padding: '10px' }}>
          <div className="flex items-center space-x-2 mb-2">
            <Award className="w-4 h-10 text-emerald-400" />
            <span className="text-sm font-medium text-emerald-300">Session Insights</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            {sessionScore >= 80
              ? "Outstanding session! You maintained deep meditative states with excellent mind control."
              : sessionScore >= 60
                ? "Good progress! Your relaxation response is developing well. Try extending session time."
                : "Keep practicing! Focus on breathing techniques to improve alpha wave consistency."}
          </p>
        </div>
      </div>
    </div>
  );
};

export default MeditationWaveformVisualizer;