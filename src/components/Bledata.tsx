'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

const BLUETOOTH_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const DATA_CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';
const CONTROL_CHARACTERISTIC_UUID = '0000ff01-0000-1000-8000-00805f9b34fb';

const INDIVIDUAL_SAMPLE_LENGTH = 7;
const DATA_BLOCK_COUNT = 10;
const COMPLETE_PACKET_LENGTH = INDIVIDUAL_SAMPLE_LENGTH * DATA_BLOCK_COUNT;

export function useBluetoothDataStream(dataStreamHandler?: (data: number[]) => void) {

  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const bluetoothDeviceRef = useRef<BluetoothDevice | null>(null);
  const controlCharacteristicRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const dataCharacteristicRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  let receivedSampleCount = 0;

  const handleSampleData = useCallback((dataBuffer: DataView) => {
    if (dataBuffer.byteLength !== INDIVIDUAL_SAMPLE_LENGTH) return;

    dataStreamHandler?.([
      dataBuffer.getUint8(0),      // counter
      dataBuffer.getInt16(1, false), // raw0 (EEG 1)
      dataBuffer.getInt16(3, false), // raw1 (EEG 2)
      dataBuffer.getInt16(5, false)  // raw2 (ECG)
    ]);

  }, [dataStreamHandler]);

  const processNotificationEvent = (event: Event) => {
    const eventTarget = event.target as BluetoothRemoteGATTCharacteristic;
    if (!eventTarget.value) return;
    const receivedValue = eventTarget.value;

    if (receivedValue.byteLength === COMPLETE_PACKET_LENGTH) {
      for (let byteIndex = 0; byteIndex < COMPLETE_PACKET_LENGTH; byteIndex += INDIVIDUAL_SAMPLE_LENGTH) {
        const sampleDataBuffer = receivedValue.buffer.slice(byteIndex, byteIndex + INDIVIDUAL_SAMPLE_LENGTH);
        const sampleDataView = new DataView(sampleDataBuffer);
        handleSampleData(sampleDataView);
        receivedSampleCount++;
      }
    } else if (receivedValue.byteLength === INDIVIDUAL_SAMPLE_LENGTH) {
      handleSampleData(new DataView(receivedValue.buffer));
      receivedSampleCount++;
    }
  };

  const establishConnection = async () => {
    try {
      const bluetoothDevice = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'NPG' }],
        optionalServices: [BLUETOOTH_SERVICE_UUID],
      });
      bluetoothDeviceRef.current = bluetoothDevice;
      const gattServer = await bluetoothDevice.gatt!.connect();
      const bluetoothService = await gattServer.getPrimaryService(BLUETOOTH_SERVICE_UUID);
      controlCharacteristicRef.current = await bluetoothService.getCharacteristic(CONTROL_CHARACTERISTIC_UUID);
      dataCharacteristicRef.current = await bluetoothService.getCharacteristic(DATA_CHARACTERISTIC_UUID);
      setIsConnected(true);
      setInterval(() => {
        if (receivedSampleCount === 0) {
          terminateConnection();
          window.location.reload();
        }
        receivedSampleCount = 0;
      }, 1000);
      // Automatically send START command after successful connection
      await initiateStreaming();
    } catch (error) {
      // Error handling can be added here if needed
    }
  };

  const initiateStreaming = async () => {
    if (!controlCharacteristicRef.current || !dataCharacteristicRef.current) return;
    try {
      await controlCharacteristicRef.current.writeValue(new TextEncoder().encode('START'));
      await dataCharacteristicRef.current.startNotifications();
      dataCharacteristicRef.current.addEventListener('characteristicvaluechanged', processNotificationEvent);
      setIsStreaming(true);
    } catch (error) {
      console.error("Failed to start:", error);
    }
  };

  // Stop notifications and streaming
  const haltStreaming = async () => {
    dataCharacteristicRef.current?.removeEventListener('characteristicvaluechanged', processNotificationEvent);

    try {
      if (dataCharacteristicRef.current?.service.device.gatt?.connected) {
        await dataCharacteristicRef.current.stopNotifications();
      }
    } catch (err) {
      console.warn('stopNotifications failed:', err);
    }

    try {
      if (controlCharacteristicRef.current?.service.device.gatt?.connected) {
        await controlCharacteristicRef.current.writeValue(new TextEncoder().encode('STOP'));
      }
    } catch (err) {
      console.warn('write STOP failed:', err);
    }

    setIsStreaming(false);
  };

  // Disconnect and clean up everything
  const terminateConnection = async () => {
    if (isStreaming && bluetoothDeviceRef.current?.gatt?.connected) {
      await haltStreaming();
      bluetoothDeviceRef.current.gatt.disconnect();
    }

    // State update triggers clearCanvas via effect
    setIsStreaming(false);
    setIsConnected(false);
    window.location.reload();
  };

  // Handle unexpected disconnections
  useEffect(() => {
    const bluetoothDevice = bluetoothDeviceRef.current;
    const handleDisconnectionEvent = () => {
      console.warn('Device unexpectedly disconnected.');
      setIsConnected(false);
      setIsStreaming(false);
    };

    bluetoothDevice?.addEventListener('gattserverdisconnected', handleDisconnectionEvent);
    return () => {
      bluetoothDevice?.removeEventListener('gattserverdisconnected', handleDisconnectionEvent);
      terminateConnection();
    };
  }, []);

  return {
    connected: isConnected,
    streaming: isStreaming,
    connect: establishConnection,
    start: initiateStreaming,
    stop: haltStreaming,
    disconnect: terminateConnection,
  };
}