"use client";
import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Utility function for class names
const cn = (...classes: (string | undefined | null | boolean)[]) => {
    return classes.filter(Boolean).join(' ');
};

// Import icons
import {
    Activity, Brain, Heart, Moon, Sun, Plug, PlugZap, 
    Signal, TrendingUp, Waves, Maximize2, Settings, 
    Download, Share2, Monitor, Sparkles, RotateCcw
} from 'lucide-react';

// BLE Configuration Constants
const BLE_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const SENSOR_DATA_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';
const CONTROL_CHAR_UUID = 'your-control-characteristic-uuid';

// Button component (keeping local until AppButton is confirmed to exist)
interface ButtonProps {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: 'default' | 'ghost' | 'outline' | 'accent';
    size?: 'sm' | 'md' | 'lg';
    className?: string;
    disabled?: boolean;
}

const Button: React.FC<ButtonProps> = ({ 
    children, 
    onClick, 
    variant = "default", 
    size = "md", 
    className = "", 
    disabled = false,
    ...props 
}) => {
    const baseStyles = "inline-flex items-center justify-center rounded-lg font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none";
    
    const variants = {
        default: "bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200",
        ghost: "hover:bg-slate-100 dark:hover:bg-slate-800",
        outline: "border border-slate-200 bg-transparent hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800",
        accent: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-500/20"
    };
    
    const sizes = {
        sm: "h-9 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base"
    };
    
    return (
        <button
            className={cn(baseStyles, variants[variant], sizes[size], className)}
            onClick={onClick}
            disabled={disabled}
            {...props}
        >
            {children}
        </button>
    );
};

// Static color mappings for MoodDisplay
const moodColorClasses = {
    slate: {
        container: "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300",
        dot: "bg-slate-500"
    },
    emerald: {
        container: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
        dot: "bg-emerald-500"
    },
    blue: {
        container: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
        dot: "bg-blue-500"
    },
    red: {
        container: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
        dot: "bg-red-500"
    },
    teal: {
        container: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300",
        dot: "bg-teal-500"
    }
};

// Minimalistic MoodDisplay component
const MoodDisplay = React.memo(({ state }: { state: string }) => {
    const stateConfig = {
        "no_data": { label: "NO DATA", color: "slate" },
        "relaxed": { label: "RELAXED", color: "emerald" },
        "focused": { label: "FOCUSED", color: "blue" },
        "stressed": { label: "STRESSED", color: "red" },
        "calm": { label: "CALM", color: "teal" }
    };
    
    const currentState = stateConfig[state as keyof typeof stateConfig] || stateConfig["no_data"];
    const colorClasses = moodColorClasses[currentState.color as keyof typeof moodColorClasses];
    
    return (
        <div className={cn(
            "text-xs px-3 py-1.5 rounded-full font-bold transition-colors duration-300 flex items-center gap-1.5",
            colorClasses.container
        )}>
            <div className={cn("w-2 h-2 rounded-full", colorClasses.dot)} />
            {currentState.label}
        </div>
    );
});
MoodDisplay.displayName = "MoodDisplay";

// SignalPlotPlaceholder component with proper typing
interface SignalPlotPlaceholderProps {
    channels?: number[];
    color?: string;
}

const SignalPlotPlaceholder = React.memo(React.forwardRef<HTMLDivElement, SignalPlotPlaceholderProps>(({ channels, color = 'emerald' }, ref) => {
    const getWaveColorClass = (color: string) => {
        switch (color) {
            case 'emerald': return 'text-emerald-500';
            case 'blue': return 'text-blue-500';
            case 'red': return 'text-red-500';
            default: return 'text-emerald-500';
        }
    };
    
    return (
        <div ref={ref} className="w-full h-full bg-slate-50 dark:bg-slate-900 rounded-lg flex items-center justify-center relative overflow-hidden backdrop-blur-sm">
            <div className="absolute inset-0 opacity-10">
                <svg width="100%" height="100%" className="absolute inset-0">
                    <defs>
                        <pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse">
                            <path d="M 25 0 L 0 0 0 25" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-slate-300 dark:text-slate-700"/>
                        </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid)" />
                </svg>
            </div>
            <motion.div
                className="relative z-10"
                animate={{ opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
                <Waves className={cn("h-6 w-6", getWaveColorClass(color))} />
            </motion.div>
        </div>
    );
}));
SignalPlotPlaceholder.displayName = "SignalPlotPlaceholder";

// Static color mappings for stats
const statColorClasses = {
    slate: {
        background: "bg-slate-100 dark:bg-slate-900",
        text: "text-slate-600 dark:text-slate-400"
    },
    emerald: {
        background: "bg-emerald-100 dark:bg-emerald-900",
        text: "text-emerald-600 dark:text-emerald-400"
    },
    red: {
        background: "bg-red-100 dark:bg-red-900",
        text: "text-red-600 dark:text-red-400"
    },
    blue: {
        background: "bg-blue-100 dark:bg-blue-900",
        text: "text-blue-600 dark:text-blue-400"
    }
};

// Helper function for signal dot colors
const getSignalDotClass = (color: string) => {
    switch (color) {
        case 'emerald': return 'bg-emerald-500';
        case 'blue': return 'bg-blue-500';
        case 'red': return 'bg-red-500';
        default: return 'bg-emerald-500';
    }
};

// Main component
export default function BrainSignalVisualizer() {
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [isDeviceConnected, setIsDeviceConnected] = useState(false);
    const [bluetoothDevice, setBluetoothDevice] = useState<BluetoothDevice | null>(null);
    const [bluetoothSupported, setBluetoothSupported] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    
    const [currentBPM, setCurrentBPM] = useState("--");
    const [currentHRV, setCurrentHRV] = useState("--");
    const [currentMentalState, setCurrentMentalState] = useState("no_data");

    // Check Bluetooth support
    useEffect(() => {
        if ('bluetooth' in navigator) {
            navigator.bluetooth.getAvailability().then(available => {
                setBluetoothSupported(available);
            });
        }
    }, []);

    // Memoized data
    const radarData = useMemo(() => ({
        left: [
            { subject: "Alpha", value: 35 }, 
            { subject: "Beta", value: 20 }, 
            { subject: "Theta", value: 25 }, 
            { subject: "Delta", value: 15 }, 
            { subject: "Gamma", value: 5 }
        ],
        right: [
            { subject: "Alpha", value: 32 }, 
            { subject: "Beta", value: 23 }, 
            { subject: "Theta", value: 22 }, 
            { subject: "Delta", value: 18 }, 
            { subject: "Gamma", value: 5 }
        ]
    }), []);
    
    // Web Bluetooth connection function
    const connectDevice = useCallback(async () => {
        if (!bluetoothSupported) {
            alert('Web Bluetooth is not supported on this device/browser');
            return;
        }

        setIsConnecting(true);

        try {
            const device = await navigator.bluetooth.requestDevice({
                filters: [
                    { services: [BLE_SERVICE_UUID] },
                    { namePrefix: 'EEG' },
                    { namePrefix: 'Neural' },
                    { namePrefix: 'Brain' }
                ],
                optionalServices: [
                    'battery_service',
                    'device_information',
                    BLE_SERVICE_UUID
                ]
            });

            console.log('Selected device:', device);
            const server = await device.gatt?.connect();
            console.log('Connected to GATT server');

            const service = await server?.getPrimaryService(BLE_SERVICE_UUID);
            const sensorCharacteristic = await service?.getCharacteristic(SENSOR_DATA_UUID);
            
            await sensorCharacteristic?.startNotifications();
            sensorCharacteristic?.addEventListener('characteristicvaluechanged', handleSensorDataReceived);

            setBluetoothDevice(device);
            setIsDeviceConnected(true);
            setCurrentMentalState("focused");

            device.addEventListener('gattserverdisconnected', handleDeviceDisconnected);

        } catch (error) {
            console.error('Bluetooth connection failed:', error);
            if (error instanceof Error) {
                alert('Failed to connect to device: ' + error.message);
            }
        } finally {
            setIsConnecting(false);
        }
    }, [bluetoothSupported]);

    // Handle incoming sensor data
    const handleSensorDataReceived = useCallback((event: Event) => {
        const target = event.target as BluetoothRemoteGATTCharacteristic;
        const value = target.value;
        
        if (value) {
            const rawData = new Uint8Array(value.buffer);
            
            try {
                const bpm = rawData[0] + 60;
                const hrv = rawData[1] + 30;
                
                setCurrentBPM(bpm.toString());
                setCurrentHRV(hrv.toString());
                
                if (bpm < 70 && hrv > 40) {
                    setCurrentMentalState("relaxed");
                } else if (bpm > 80) {
                    setCurrentMentalState("stressed");
                } else {
                    setCurrentMentalState("focused");
                }
            } catch (error) {
                console.error('Error parsing sensor data:', error);
            }
        }
    }, []);

    // Handle device disconnection
    const handleDeviceDisconnected = useCallback(() => {
        console.log('Device disconnected');
        setIsDeviceConnected(false);
        setBluetoothDevice(null);
        setCurrentBPM("--");
        setCurrentHRV("--");
        setCurrentMentalState("no_data");
    }, []);

    // Disconnect function
    const disconnectDevice = useCallback(() => {
        if (bluetoothDevice && bluetoothDevice.gatt?.connected) {
            bluetoothDevice.gatt.disconnect();
        }
        setBluetoothDevice(null);
        setIsDeviceConnected(false);
        setCurrentBPM("--");
        setCurrentHRV("--");
        setCurrentMentalState("no_data");
    }, [bluetoothDevice]);

    const statsConfig = useMemo(() => [
        { title: "Device Status", icon: Signal, value: isDeviceConnected ? "ONLINE" : "OFFLINE", color: isDeviceConnected ? "emerald" : "slate" },
        { title: "Heart Rate", icon: Heart, value: currentBPM, unit: "BPM", color: "red" },
        { title: "HRV", icon: Activity, value: currentHRV, unit: "MS", color: "blue" },
        { title: "Mental State", icon: Brain, value: <MoodDisplay state={currentMentalState} />, color: "emerald" }
    ], [isDeviceConnected, currentBPM, currentHRV, currentMentalState]);

    const signalsConfig = useMemo(() => [
        { title: "EEG Channel 1", subtitle: "FRONTAL", color: "emerald" },
        { title: "EEG Channel 2", subtitle: "PARIETAL", color: "blue" },
        { title: "ECG Signal", subtitle: "CARDIAC", color: "red" }
    ], []);

    return (
        <div className={cn("h-screen overflow-hidden font-sans", isDarkMode ? "dark" : "")}>
            <div className="h-full w-full bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 transition-colors duration-300">
                {/* Background Decor */}
                <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-50">
                    <div className="absolute -top-1/4 -left-1/4 w-1/2 h-1/2 rounded-full bg-emerald-300/10 blur-3xl animate-pulse" />
                    <div className="absolute -bottom-1/4 -right-1/4 w-1/2 h-1/2 rounded-full bg-emerald-300/10 blur-3xl animate-pulse" style={{ animationDelay: '2s' }}/>
                </div>

                {/* Main Grid Layout */}
                <div className="relative h-full w-full p-4 grid grid-cols-12 grid-rows-6 gap-4">
                    
                    {/* Header */}
                    <motion.header 
                        className="col-span-12 row-span-1 flex items-center justify-between"
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                    >
                        <div className="flex items-center gap-4">
                            <motion.div 
                                className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 dark:bg-white shadow-lg"
                                whileHover={{ scale: 1.1 }}
                            >
                                <Brain className="h-6 w-6 text-white dark:text-slate-900" />
                            </motion.div>
                            <div>
                                <h1 className="text-2xl font-bold">Neural<span className="text-emerald-600 dark:text-emerald-400">Flow</span></h1>
                                <p className="text-sm text-slate-500 dark:text-slate-400">Brain Monitoring Dashboard</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Button
                                onClick={isDeviceConnected ? disconnectDevice : connectDevice}
                                variant={isDeviceConnected ? "outline" : "accent"}
                                size="md"
                                className="gap-2"
                                disabled={isConnecting}
                            >
                                {isConnecting ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                                        Connecting...
                                    </>
                                ) : (
                                    <>
                                        {isDeviceConnected ? <PlugZap className="h-4 w-4" /> : <Plug className="h-4 w-4" />}
                                        {isDeviceConnected ? "Disconnect" : "Connect"}
                                    </>
                                )}
                            </Button>
                            <Button
                                onClick={() => setIsDarkMode(p => !p)}
                                variant="ghost"
                                size="md"
                                className="h-10 w-10 p-0"
                            >
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={isDarkMode ? "moon" : "sun"}
                                        initial={{ y: -20, opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        exit={{ y: 20, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                                    </motion.div>
                                </AnimatePresence>
                            </Button>
                        </div>
                    </motion.header>
                    
                    {/* Stats */}
                    {statsConfig.map((stat, index) => {
                        const colorClasses = statColorClasses[stat.color as keyof typeof statColorClasses];
                        return (
                            <motion.div 
                                key={stat.title}
                                className="col-span-3 row-span-1 rounded-2xl bg-white/50 dark:bg-slate-800/50 backdrop-blur-md border border-slate-200/80 dark:border-slate-700/80 p-4 flex flex-col justify-between transition-all duration-300 hover:shadow-xl hover:border-emerald-300/50 dark:hover:border-emerald-600/50"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.4, delay: 0.2 + index * 0.1 }}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={cn("p-2 rounded-lg", colorClasses.background)}>
                                        <stat.icon className={cn("h-5 w-5", colorClasses.text)} />
                                    </div>
                                    <h3 className="font-semibold text-slate-600 dark:text-slate-300">{stat.title}</h3>
                                </div>
                                <div className="text-right">
                                    <div className="text-3xl font-bold">
                                        {stat.value}
                                    </div>
                                    {stat.unit && <p className="text-sm text-slate-500">{stat.unit}</p>}
                                </div>
                            </motion.div>
                        );
                    })}

                    {/* Signal Plots */}
                    {signalsConfig.map((signal, index) => (
                        <motion.div 
                            key={signal.title}
                            className="col-span-4 row-span-2 rounded-2xl bg-white/50 dark:bg-slate-800/50 backdrop-blur-md border border-slate-200/80 dark:border-slate-700/80 p-4 flex flex-col transition-all duration-300 hover:shadow-xl hover:border-emerald-300/50 dark:hover:border-emerald-600/50"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, delay: 0.3 + index * 0.1 }}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <div className={cn("w-2.5 h-2.5 rounded-full", getSignalDotClass(signal.color))} />
                                    <h4 className="font-semibold">{signal.title}</h4>
                                    <span className="text-xs text-slate-500">{signal.subtitle}</span>
                                </div>
                                <div className="flex gap-1">
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Maximize2 className="h-4 w-4" /></Button>
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Settings className="h-4 w-4" /></Button>
                                </div>
                            </div>
                            <div className="flex-1">
                                <SignalPlotPlaceholder color={signal.color} />
                            </div>
                        </motion.div>
                    ))}

                    {/* Brain Wave Analysis */}
                    <motion.div 
                        className="col-span-8 row-span-3 rounded-2xl bg-white/50 dark:bg-slate-800/50 backdrop-blur-md border border-slate-200/80 dark:border-slate-700/80 p-6 flex flex-col transition-all duration-300 hover:shadow-xl hover:border-emerald-300/50 dark:hover:border-emerald-600/50"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.4 }}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
                                    <Waves className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold">Brain Wave Analysis</h3>
                                    <p className="text-sm text-slate-500">Real-time frequency distribution</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                                <motion.div 
                                    className="w-2.5 h-2.5 rounded-full bg-emerald-500"
                                    animate={{ scale: [1, 1.2, 1] }}
                                    transition={{ duration: 1.5, repeat: Infinity }}
                                />
                                {isDeviceConnected ? "ACTIVE" : "STANDBY"}
                            </div>
                        </div>
                        <div className="flex-1 grid grid-cols-2 gap-8">
                            {['left', 'right'].map((hemisphere, hIndex) => (
                                <div key={hemisphere} className="space-y-4">
                                    <h5 className="font-semibold text-center">{hemisphere.charAt(0).toUpperCase() + hemisphere.slice(1)} Hemisphere</h5>
                                    <div className="space-y-4">
                                        {(hemisphere === 'left' ? radarData.left : radarData.right).map((band, bIndex) => (
                                            <motion.div 
                                                key={band.subject} 
                                                className="space-y-1.5"
                                                initial={{ opacity: 0, x: hIndex === 0 ? -20 : 20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ duration: 0.4, delay: 0.5 + bIndex * 0.1 }}
                                            >
                                                <div className="flex justify-between text-sm font-medium">
                                                    <span>{band.subject}</span>
                                                    <span>{isDeviceConnected ? band.value.toFixed(1) : '--'}%</span>
                                                </div>
                                                <div className="relative h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                                    <motion.div
                                                        className="h-full bg-emerald-500"
                                                        initial={{ width: 0 }}
                                                        animate={{ width: isDeviceConnected ? `${band.value}%` : '0%' }}
                                                        transition={{ duration: 0.8, delay: 0.6 + bIndex * 0.1, ease: "easeOut" }}
                                                    />
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>

                    {/* Quick Actions */}
                    <motion.div 
                        className="col-span-4 row-span-3 rounded-2xl bg-white/50 dark:bg-slate-800/50 backdrop-blur-md border border-slate-200/80 dark:border-slate-700/80 p-6 flex flex-col gap-4 transition-all duration-300 hover:shadow-xl hover:border-emerald-300/50 dark:hover:border-emerald-600/50"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.5 }}
                    >
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
                                <Sparkles className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <h3 className="text-xl font-bold">Session Control</h3>
                        </div>
                        <div className="flex-1 flex flex-col justify-end gap-3">
                            <Button variant="outline" size="lg" className="gap-2 w-full"><Download className="h-5 w-5"/>Export Data</Button>
                            <Button variant="outline" size="lg" className="gap-2 w-full"><Share2 className="h-5 w-5"/>Share Session</Button>
                            <Button variant="outline" size="lg" className="gap-2 w-full"><RotateCcw className="h-5 w-5"/>Reset Session</Button>
                        </div>
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
