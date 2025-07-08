'use client';
import React, { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { WebglPlot, WebglLine, ColorRGBA } from 'webgl-plot';

export type HeartRateVariabilityHandle = {
    /** Force a redraw of the plot */
    refreshDisplay: () => void;
    /** Push a new HRV value into the ring buffer */
    addHRVData: (hrv: number) => void;
    /** Get the canvas element */
    getCanvasElement: () => HTMLCanvasElement | null;
    isDarkTheme: boolean;
};

type ComponentProperties = {
    /** Number of points to display */
    dataPointCount?: number;
    /** Hex color for the line */
    lineColor?: string;
    isDarkTheme?: boolean;
};


const HeartRateVariabilityCanvas = forwardRef<HeartRateVariabilityHandle, ComponentProperties>(
    ({ dataPointCount = 2000, lineColor = '#d97706', isDarkTheme = false }, ref) => {
        const canvasElementRef = useRef<HTMLCanvasElement>(null);
        const webglPlotRef = useRef<WebglPlot | null>(null);
        const plotLineRef = useRef<WebglLine | null>(null);
        const dataIndexRef = useRef(0);

        // convert hex to ColorRGBA
        function convertHexToRGBA(hexColor: string): ColorRGBA {
            const redValue = parseInt(hexColor.slice(1, 3), 16) / 255;
            const greenValue = parseInt(hexColor.slice(3, 5), 16) / 255;
            const blueValue = parseInt(hexColor.slice(5, 7), 16) / 255;
            return new ColorRGBA(redValue, greenValue, blueValue, 1);
        }

        // expose imperative methods
        useImperativeHandle(ref, () => ({
            refreshDisplay: () => webglPlotRef.current?.update() ?? undefined,
            addHRVData: (hrvValue: number) => {
                const clampedHRV = Math.max(0, Math.min(hrvValue, 1500));  // Clamp to safe range
                const normalizedValue = (clampedHRV - 750) * (2 / 1500);            // Normalize around 750ms

                const plotLine = plotLineRef.current;
                if (!plotLine) return;
                const currentIndex = dataIndexRef.current;
                plotLine.setY(currentIndex, normalizedValue);
                dataIndexRef.current = (currentIndex + 1) % plotLine.numPoints;
                webglPlotRef.current?.update();
            },
            getCanvasElement: () => canvasElementRef.current,
            isDarkTheme: isDarkTheme,
        }), [isDarkTheme]);
       
        const containerElementRef = useRef<HTMLDivElement>(null)
        // Constants (could be props if needed)
        const dataFrequency = 500
        const bitResolution = 10
        const visualTheme = 'dark'
        const gridInitializedRef = useRef(false) // Track if grid has been created
        
        const generateGridLines = useCallback(() => {
            if (!containerElementRef.current) return;

            // Clear existing grid lines if they exist
            const existingGridWrapper = containerElementRef.current.querySelector('.grid-lines-wrapper');
            if (existingGridWrapper) {
                containerElementRef.current.removeChild(existingGridWrapper);
            }

            const gridWrapper = document.createElement("div");
            gridWrapper.className = "grid-lines-wrapper absolute inset-0 pointer-events-none";

            const darkMajorOpacity = "0.2";
            const darkMinorOpacity = "0.05";
            const lightMajorOpacity = "0.2";
            const lightMinorOpacity = "0.1";
            const minorLineSpacing = dataFrequency * 0.04;
            const totalGridLines = (Math.pow(2, bitResolution) * 4 / minorLineSpacing);

            // Vertical lines - modified to show only one minor line between major lines
            const majorVerticalStep = 5; // Original major line spacing
            const verticalLinesPerSegment = 2; // 1 major + 1 minor line per segment
            const totalVerticalSegments = Math.ceil(totalGridLines / majorVerticalStep);
            const totalVerticalLines = totalVerticalSegments * verticalLinesPerSegment;
            
            for (let lineIndex = 1; lineIndex < totalVerticalLines; lineIndex++) {
                // Check if this is a major line (every verticalLinesPerSegment-th line)
                const isMajorVerticalLine = lineIndex % verticalLinesPerSegment === 0;

                // Calculate the original position index
                const originalVerticalIndex = (lineIndex / verticalLinesPerSegment) * majorVerticalStep;

                // Skip if we exceed the original totalGridLines
                if (originalVerticalIndex >= totalGridLines) continue;

                const verticalGridLine = document.createElement("div");
                verticalGridLine.className = "absolute bg-[rgb(128,128,128)]";
                verticalGridLine.style.width = "1px";
                verticalGridLine.style.height = "100%";
                verticalGridLine.style.left = `${((originalVerticalIndex / totalGridLines) * 100).toFixed(3)}%`;
                verticalGridLine.style.opacity = isMajorVerticalLine
                    ? (isDarkTheme ? darkMajorOpacity : lightMajorOpacity)
                    : (isDarkTheme ? darkMinorOpacity : lightMinorOpacity);
                gridWrapper.appendChild(verticalGridLine);
            }

            // Horizontal lines with labels
            const horizontalLineCount = 35;
            const maximumValue = 1400;
            // Calculate the step between major lines (5 units apart in your original code)
            const majorHorizontalStep = 5;
            // We want only one minor line between major lines, so total lines per major segment is 2 (1 major + 1 minor)
            const horizontalLinesPerSegment = 2;
            // Total major segments is horizontalLineCount / majorHorizontalStep
            const totalHorizontalSegments = Math.ceil(horizontalLineCount / majorHorizontalStep);
            // New total lines is totalHorizontalSegments * horizontalLinesPerSegment
            const totalHorizontalLines = totalHorizontalSegments * horizontalLinesPerSegment;

            for (let lineIndex = 1; lineIndex < totalHorizontalLines; lineIndex++) {
                // Check if this is a major line (every horizontalLinesPerSegment-th line)
                const isMajorHorizontalLine = lineIndex % horizontalLinesPerSegment === 0;

                // Calculate the original position index (lineIndex / horizontalLinesPerSegment * majorHorizontalStep)
                const originalHorizontalIndex = (lineIndex / horizontalLinesPerSegment) * majorHorizontalStep;

                // Only proceed if we haven't exceeded our original horizontalLineCount count
                if (originalHorizontalIndex >= horizontalLineCount) continue;

                const horizontalGridLine = document.createElement("div");
                horizontalGridLine.className = "absolute bg-[rgb(128,128,128)]";
                horizontalGridLine.style.height = "1px";
                horizontalGridLine.style.width = "100%";
                horizontalGridLine.style.top = `${((originalHorizontalIndex / horizontalLineCount) * 100).toFixed(3)}%`;

                horizontalGridLine.style.opacity = isMajorHorizontalLine
                    ? (isDarkTheme ? darkMajorOpacity : lightMajorOpacity)
                    : (isDarkTheme ? darkMinorOpacity : lightMinorOpacity);

                gridWrapper.appendChild(horizontalGridLine);
                if (isMajorHorizontalLine) {
                    const labelValue = Math.round(maximumValue - (originalHorizontalIndex / horizontalLineCount) * maximumValue);
                    if (labelValue % 200 === 0 || labelValue === 0 || labelValue === maximumValue) {
                        const valueLabel = document.createElement("div");
                        valueLabel.className = "absolute text-[0.65rem] pointer-events-none";
                        valueLabel.style.left = "4px";
                        valueLabel.style.top = `${((originalHorizontalIndex / horizontalLineCount) * 100).toFixed(3)}%`;
                        valueLabel.style.transform = "translateY(-50%)";
                        valueLabel.style.color = isDarkTheme ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.7)";
                        valueLabel.textContent = labelValue.toString();
                        gridWrapper.appendChild(valueLabel);
                    }
                }
            }

            containerElementRef.current.appendChild(gridWrapper);
        }, [isDarkTheme]);
        
        generateGridLines();
        
        useEffect(() => {
            const canvasElement = canvasElementRef.current!;
            const handleResize = () => {
                const { width, height } = canvasElement.getBoundingClientRect();

                const devicePixelRatio = window.devicePixelRatio || 1;
                canvasElement.width = width * devicePixelRatio;
                canvasElement.height = height * devicePixelRatio;

                const webglContext = canvasElement.getContext('webgl');
                if (webglContext) webglContext.viewport(0, 0, canvasElement.width, canvasElement.height);
                webglPlotRef.current?.update();
            };
            // observe container resizes
            const resizeObserver = new ResizeObserver(handleResize);
            resizeObserver.observe(canvasElement);
            // **initial** sizing
            handleResize();

            return () => {
                resizeObserver.disconnect();
            };
        }, []);

        useEffect(() => {
            const handleWindowResize = () => {
                generateGridLines();
            };
            window.addEventListener("resize", handleWindowResize);
            return () => {
                window.removeEventListener("resize", handleWindowResize);
            };
        }, [generateGridLines]);
        
        // Update the initialization part in HeartRateVariabilityCanvas.tsx
        useEffect(() => {
            if (!canvasElementRef.current) return;
            const canvasElement = canvasElementRef.current;
            const webglPlot = new WebglPlot(canvasElement);
            const dataLine = new WebglLine(convertHexToRGBA(lineColor), dataPointCount);

            // space X from -1 to 1
            dataLine.lineSpaceX(-1, 2 / dataPointCount);

            // Initialize with 0 instead of NaN
            for (let pointIndex = 0; pointIndex < dataLine.numPoints; pointIndex++) {
                dataLine.setY(pointIndex, 0); // Changed from NaN to 0
            }

            webglPlot.addLine(dataLine);
            webglPlotRef.current = webglPlot;
            plotLineRef.current = dataLine;
            dataIndexRef.current = 0;

            webglPlot.update();

            return () => {
                webglPlotRef.current = null;
                plotLineRef.current = null;
            };
        }, [dataPointCount, lineColor]);

        return (
            <div ref={containerElementRef} className="relative w-full h-full">
                <canvas
                    ref={canvasElementRef}
                    style={{ width: '100%', height: '100%' }}
                />
            </div>
        );
    }
);

HeartRateVariabilityCanvas.displayName = 'HeartRateVariabilityCanvas';

export default HeartRateVariabilityCanvas;
