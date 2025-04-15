import React, { useEffect, useRef, useState } from "react";

const Waveform = () => {
  // Core refs for audio processing
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const animationFrameIdRef = useRef(null);
  const audioStreamRef = useRef(null);
  const containerRef = useRef(null);
  const gainNodeRef = useRef(null);
  
  // Device management
  const [deviceId, setDeviceId] = useState(null);
  const currentDeviceIdRef = useRef(null);
  const defaultDeviceIdRef = useRef(null); // Track system default device ID
  const previousDefaultPhysicalDeviceRef = useRef(null); // Track the previous default physical device
  
  // Status flags
  const [initialized, setInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  
  // Utility refs
  const resizeObserverRef = useRef(null);
  const retryTimeoutRef = useRef(null);
  const retryCountRef = useRef(0);
  const lastDeviceChangeTime = useRef(0);
  const deviceChangeDebounceTimeout = useRef(null);
  
  // Constants
  const MAX_RETRIES = 3;
  const DEBOUNCE_TIME = 500; // ms to debounce device changes

  // Visualization function that uses refs instead of closure variables
  const startVisualization = () => {
    if (!canvasRef.current || !analyserRef.current || !dataArrayRef.current) return;
    
    const canvasContext = canvasRef.current.getContext("2d");
    const canvas = canvasRef.current;
    
    analyserRef.current.getFloatTimeDomainData(dataArrayRef.current);
    canvasContext.clearRect(0, 0, canvas.width, canvas.height);
    canvasContext.beginPath();
    
    const sliceWidth = canvas.width / (dataArrayRef.current.length / 10);
    const waveformHeight = canvas.height;
    const waveformOffset = (canvas.height - waveformHeight) / 2;
    
    let x = 0;
    let sum = 0;
    let count = 0;
    
    for (let i = 0; i < dataArrayRef.current.length; i++) {
      const v = (dataArrayRef.current[i] + 1) / 2;
      sum += v;
      count++;
      
      if (count === 10) {
        const avg = sum / count;
        const y = avg * waveformHeight * 2 + waveformOffset;
        
        if (i === 0) {
          canvasContext.moveTo(x, y);
        } else {
          canvasContext.lineTo(x, y);
        }
        
        x += sliceWidth;
        sum = 0;
        count = 0;
      }
    }
    
    // Choose color based on loading and muted state
    let strokeColor = "#78C072";  // Default green
    if (isLoading) {
      strokeColor = "#A8D2A9";  // Lighter green when loading
    } else if (isMuted) {
      strokeColor = "#BFC0C6";  // Grey when muted
    }
    
    canvasContext.strokeStyle = strokeColor;
    canvasContext.lineWidth = 1.5;
    canvasContext.stroke();
    
    animationFrameIdRef.current = requestAnimationFrame(startVisualization);
  };

  // Clean up all audio resources
  const cleanupAudio = async () => {
    console.log("Cleaning up audio resources");
    
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    if (deviceChangeDebounceTimeout.current) {
      clearTimeout(deviceChangeDebounceTimeout.current);
      deviceChangeDebounceTimeout.current = null;
    }
    
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
    
    if (audioStreamRef.current) {
      try {
        audioStreamRef.current.getTracks().forEach(track => {
          console.log("Stopping track:", track.kind, track.label);
          track.stop();
        });
      } catch (err) {
        console.error("Error stopping audio tracks:", err);
      }
      audioStreamRef.current = null;
    }
    
    if (audioContextRef.current) {
      console.log("Closing audio context");
      try {
        await audioContextRef.current.close();
        console.log("Audio context closed successfully");
      } catch (err) {
        console.error("Error when closing audio context:", err);
      }
      audioContextRef.current = null;
      analyserRef.current = null;
      dataArrayRef.current = null;
      gainNodeRef.current = null;
    }
    
    // Return a promise that resolves after a short delay
    return new Promise(resolve => setTimeout(resolve, 200));
  };

  // Initialize audio context and analyzer
  const initializeAudioContext = () => {
    console.log("Initializing audio context");
    
    try {
      // Create new audio context if it doesn't exist or is closed
      if (!audioContextRef.current || audioContextRef.current.state === "closed") {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      analyserRef.current.smoothingTimeConstant = 0.8;
      analyserRef.current.minDecibels = -90;
      analyserRef.current.maxDecibels = -10;
      dataArrayRef.current = new Float32Array(analyserRef.current.fftSize);
      
      // Resume audio context to prevent "The AudioContext was not allowed to start" error
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(err => {
          console.error("Failed to resume AudioContext:", err);
        });
      }
      
      console.log("Audio context initialized successfully");
      return true;
    } catch (error) {
      console.error("Failed to initialize audio context:", error);
      return false;
    }
  };

  // Refresh device list and log them for debugging purposes
  const logAvailableDevices = async () => {
    try {
      // Force browser to update device list by requesting permissions
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = devices.filter(device => device.kind === 'audioinput');
      
      console.log("Available audio devices:", audioDevices.map(device => ({
        id: device.deviceId,
        label: device.label,
        groupId: device.groupId
      })));
      
      // Find the system default device (either has 'default' ID or label contains 'default')
      const defaultDevice = audioDevices.find(d => 
        d.deviceId === 'default' || 
        (d.label && d.label.toLowerCase().includes('default'))
      );
      
      if (defaultDevice) {
        // Store the current default device's label before updating the reference
        const previousDefaultLabel = audioDevices.find(
          (d) => d.deviceId === defaultDeviceIdRef.current
        )?.label;

        // Update the reference
        defaultDeviceIdRef.current = defaultDevice.deviceId;

        // Compare labels to detect physical device changes
        if (previousDefaultLabel && previousDefaultLabel !== defaultDevice.label) {
          console.log("New default audio device detected:", defaultDevice);
        }
      }
      
      return audioDevices;
    } catch (error) {
      console.error("Error enumerating devices:", error);
      return [];
    }
  };

  // Connect the stream to the audio context with gain control for muting
  const connectAudioStreamToContext = (stream) => {
    if (!audioContextRef.current || !analyserRef.current) {
      console.error("Audio context not ready");
      return false;
    }
    
    try {
      const audioSource = audioContextRef.current.createMediaStreamSource(stream);
      
      // Create a gain node for muting control
      gainNodeRef.current = audioContextRef.current.createGain();
      gainNodeRef.current.gain.value = isMuted ? 0.0 : 1.0;
      
      audioSource.connect(gainNodeRef.current);
      gainNodeRef.current.connect(analyserRef.current);
      return true;
    } catch (err) {
      console.error("Error connecting audio stream:", err);
      return false;
    }
  };

  // Start audio capture with specified device or default
  const startAudioCapture = async (deviceIdToUse) => {
    // Prevent rapid consecutive device changes
    const now = Date.now();
    if (now - lastDeviceChangeTime.current < DEBOUNCE_TIME) {
      console.log("Debouncing device change request");
      
      if (deviceChangeDebounceTimeout.current) {
        clearTimeout(deviceChangeDebounceTimeout.current);
      }
      
      deviceChangeDebounceTimeout.current = setTimeout(() => {
        startAudioCapture(deviceIdToUse);
      }, DEBOUNCE_TIME);
      
      return;
    }
    
    lastDeviceChangeTime.current = now;
    currentDeviceIdRef.current = deviceIdToUse;
    console.log("Starting audio capture with device:", deviceIdToUse || "default");
    
    retryCountRef.current = 0;
    setIsLoading(true);
    
    try {
      // Clean up existing audio resources
      await cleanupAudio();
      
      // Get available devices
      const audioDevices = await logAvailableDevices();
      if (audioDevices.length === 0) {
        console.error("No audio devices found");
        setIsLoading(false);
        return;
      }
      
      // If no device ID provided, use default or first available
      if (!deviceIdToUse) {
        deviceIdToUse = audioDevices.find(d => 
          d.deviceId === 'default' || 
          d.label.toLowerCase().includes('default'))?.deviceId;
        
        if (!deviceIdToUse && audioDevices.length > 0) {
          deviceIdToUse = audioDevices[0].deviceId;
          console.log("Using first available device:", deviceIdToUse);
        }
      } else {
        // Validate if the requested device ID exists
        const deviceExists = audioDevices.some(d => d.deviceId === deviceIdToUse);
        if (!deviceExists) {
          console.warn(`Requested device ID ${deviceIdToUse} not found in available devices`);
          deviceIdToUse = audioDevices.find(d => 
            d.deviceId === 'default' || 
            d.label.toLowerCase().includes('default'))?.deviceId || audioDevices[0]?.deviceId;
          console.log("Using fallback device:", deviceIdToUse);
        }
      }
      
      // Ensure we have a device ID to use
      if (!deviceIdToUse) {
        console.error("No audio device ID available to use");
        setIsLoading(false);
        return;
      }
      
      // Initialize new audio context
      if (!initializeAudioContext()) {
        console.error("Failed to initialize audio context");
        setIsLoading(false);
        return;
      }
      
      // Try to get the audio stream
      console.log("Requesting media with device ID:", deviceIdToUse);
      let stream;
      
      try {
        // Try with exact constraint first
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: deviceIdToUse },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          },
          video: false
        });
      } catch (err) {
        console.warn("Failed with exact constraint, trying ideal:", err);
        
        try {
          // Try with ideal constraint
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: { ideal: deviceIdToUse },
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false
            },
            video: false
          });
        } catch (err2) {
          console.warn("Failed with ideal constraint, trying any device:", err2);
          
          // Last resort: try any audio device
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false
          });
        }
      }
      
      // Check if device selection changed during async operations
      if (currentDeviceIdRef.current !== deviceIdToUse) {
        console.log("Device selection changed during setup, stopping this capture");
        stream.getTracks().forEach(t => t.stop());
        setIsLoading(false);
        return;
      }
      
      audioStreamRef.current = stream;
      
      const audioTracks = stream.getAudioTracks();
      console.log("Audio stream acquired:", {
        tracks: audioTracks.length,
        trackInfo: audioTracks.map(t => ({
          label: t.label,
          id: t.id,
          settings: t.getSettings()
        }))
      });
      
      // Connect the stream to the audio context
      if (audioContextRef.current && analyserRef.current) {
        const connected = connectAudioStreamToContext(stream);
        if (!connected) {
          throw new Error("Failed to connect audio stream to context");
        }
        
        // Start visualization
        startVisualization();
        console.log("Audio visualization started for device:", deviceIdToUse);
        
        // Update the state
        setDeviceId(deviceIdToUse);
        
        // Notify parent
        window.parent.postMessage({
          type: 'waveform-device-active',
          deviceId: deviceIdToUse,
          deviceLabel: audioTracks[0]?.label || 'Unknown device',
          success: true
        }, '*');
      } else {
        console.error("Audio context not ready after getting stream");
        throw new Error("Audio context not ready");
      }
    } catch (error) {
      console.error("Error in startAudioCapture:", error);
      
      // Try to fall back to any available device
      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++;
        console.log(`Retrying (${retryCountRef.current}/${MAX_RETRIES}) with any available device`);
        
        retryTimeoutRef.current = setTimeout(() => {
          startAudioCapture(null); // Try without a specific device ID
        }, 1000);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Handle mic mute/unmute
  const handleMicrophoneStateChange = (active) => {
    console.log("Setting microphone state to:", active ? "active" : "muted");
    setIsMuted(!active);
    
    if (gainNodeRef.current) {
      // Smoothly transition volume
      const now = audioContextRef.current.currentTime;
      gainNodeRef.current.gain.cancelScheduledValues(now);
      gainNodeRef.current.gain.setValueAtTime(gainNodeRef.current.gain.value, now);
      gainNodeRef.current.gain.linearRampToValueAtTime(active ? 1.0 : 0.0, now + 0.1);
    }
    
    // Respond to parent
    window.parent.postMessage({
      type: 'waveform-state-changed',
      active: active,
      success: true
    }, '*');
  };

  // Handle messages from parent window
  const handleDeviceChangeMessage = async (event) => {
    try {
      if (event.data && event.data.type === 'microphone-changed') {
        const newDeviceId = event.data.deviceId;
        console.log("Received microphone change message for device:", newDeviceId);
        
        if (newDeviceId === currentDeviceIdRef.current) {
          console.log("Device already selected, no change needed");
          return;
        }
        
        // Update the current device ID reference
        currentDeviceIdRef.current = newDeviceId;
        
        try {
          // Stop and restart the audio capture with the new device
          await startAudioCapture(newDeviceId);
        } catch (error) {
          console.error("Error changing device:", error);
        }
      } else if (event.data && event.data.type === 'microphone-state-changed') {
        // Handle microphone mute/unmute
        const active = event.data.active !== undefined ? event.data.active : true;
        handleMicrophoneStateChange(active);
      } else if (event.data && event.data.type === 'waveform-check-ready') {
        // Let the parent know we're ready
        window.parent.postMessage({
          type: 'waveform-ready',
          initialized: initialized
        }, '*');
      } else if (event.data && event.data.type === 'waveform-refresh') {
        // Request to refresh the current device
        const currentDevice = currentDeviceIdRef.current;
        console.log("Refreshing waveform for current device:", currentDevice);
        await startAudioCapture(currentDevice);
      }
    } catch (err) {
      console.error("Error handling device change message:", err);
    }
  };

  // Handle Chrome storage changes
  const handleStorageChange = (changes, namespace) => {
    if (namespace === 'local') {
      if (changes.defaultAudioInput || changes.micActive) {
        const newDeviceId = changes.defaultAudioInput ? 
          changes.defaultAudioInput.newValue : 
          currentDeviceIdRef.current;
        
        const isMicActive = changes.micActive ?
          changes.micActive.newValue :
          true; // Default to true if not specified
          
        if (isMicActive && newDeviceId && newDeviceId !== currentDeviceIdRef.current) {
          console.log("Storage changed - switching audio device to:", newDeviceId);
          startAudioCapture(newDeviceId);
        } else if (changes.micActive) {
          handleMicrophoneStateChange(isMicActive);
        }
      }
    }
  };

  // Handle Chrome runtime messages
  const handleChromeMessage = (message) => {
    if (message.type === 'microphone-changed') {
      if (message.deviceId && message.deviceId !== currentDeviceIdRef.current) {
        console.log("Chrome message received - switching audio device to:", message.deviceId);
        startAudioCapture(message.deviceId);
      }
    }
  };

  // Effect to handle setup and cleanup
  useEffect(() => {
    console.log("Setting up waveform component");
    
    // Listen for device changes from system
    const handleDeviceChange = async () => {
      console.log("System device change detected");
      const audioDevices = await logAvailableDevices();
      
      if (audioDevices.length > 0) {
        // Check if our current device still exists
        const currentDeviceStillExists = currentDeviceIdRef.current ? 
          audioDevices.some(d => d.deviceId === currentDeviceIdRef.current) : false;
          
        // Get the system default device
        const defaultDevice = audioDevices.find(d => 
          d.deviceId === 'default' || 
          (d.label && d.label.toLowerCase().includes('default'))
        );
        
        if (defaultDevice) {
          // Extract the physical device name from the default label
          const extractPhysicalDevice = (label) => {
            if (!label) return null;
            const match = label.match(/Default\s*-\s*(.*)/i);
            return match ? match[1].trim() : label;
          };

          const defaultPhysicalDevice = extractPhysicalDevice(defaultDevice.label);

          // Compare with the stored previous default physical device
          const defaultDeviceChanged =
            previousDefaultPhysicalDeviceRef.current &&
            previousDefaultPhysicalDeviceRef.current !== defaultPhysicalDevice;

          console.log("Current default physical device:", defaultPhysicalDevice);
          console.log("Previous default physical device:", previousDefaultPhysicalDeviceRef.current);
          console.log("Default device changed:", defaultDeviceChanged);

          // Detect if we need to switch devices
          if (
            !currentDeviceStillExists ||
            (defaultDevice &&
              (currentDeviceIdRef.current === "default" ||
               currentDeviceIdRef.current === "communications" ||
               currentDeviceIdRef.current === defaultDevice.deviceId) &&
              defaultDeviceChanged)
          ) {
            console.log("Switching to new default device or replacing disconnected device");

            // Remember the new physical device
            previousDefaultPhysicalDeviceRef.current = defaultPhysicalDevice;

            // Use the default device or first available
            const deviceToUse = defaultDevice
              ? defaultDevice.deviceId
              : audioDevices.length > 0
              ? audioDevices[0].deviceId
              : null;

            if (deviceToUse) {
              // Update storage with new device
              chrome.storage.local.set({
                defaultAudioInput: deviceToUse,
              });

              // Start capture with the new device
              startAudioCapture(deviceToUse);
            }
          } else {
            // Always update our reference to the current default physical device
            previousDefaultPhysicalDeviceRef.current = defaultPhysicalDevice;
          }
        }
      }
    };
    
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    
    // Listen for messages from parent
    window.addEventListener('message', handleDeviceChangeMessage);
    
    // Listen for Chrome storage changes
    chrome.storage.onChanged.addListener(handleStorageChange);
    
    // Listen for Chrome runtime messages
    chrome.runtime.onMessage.addListener(handleChromeMessage);
    
    // Start with initial setup
    const initWaveform = async () => {
      try {
        // Get available devices first to identify the default device
        const audioDevices = await logAvailableDevices();
        const defaultDevice = audioDevices.find(d => 
          d.deviceId === 'default' || 
          (d.label && d.label.toLowerCase().includes('default'))
        );
        
        if (defaultDevice) {
          defaultDeviceIdRef.current = defaultDevice.deviceId;

          // Initialize the previous default physical device
          const extractPhysicalDevice = (label) => {
            if (!label) return null;
            const match = label.match(/Default\s*-\s*(.*)/i);
            return match ? match[1].trim() : label;
          };
          previousDefaultPhysicalDeviceRef.current = extractPhysicalDevice(defaultDevice.label);
        }
        
        // Check if there's already a device selected in storage
        chrome.storage.local.get(['defaultAudioInput', 'micActive', 'userSelectedAudioDevice'], (result) => {
          const deviceIdToUse = result.defaultAudioInput;
          const isActive = result.micActive !== false; // Default to true
          const userSelectedDevice = result.userSelectedAudioDevice;
          
          if (deviceIdToUse && isActive) {
            console.log("Initializing with device from storage:", deviceIdToUse);
            startAudioCapture(deviceIdToUse);
            
            // If this is a user-selected device, mark it as current
            if (userSelectedDevice) {
              currentDeviceIdRef.current = deviceIdToUse;
            }
          } else if (defaultDevice) {
            // If no device in storage but we have a default, use it
            console.log("No device in storage, using system default:", defaultDevice.deviceId);
            startAudioCapture(defaultDevice.deviceId);
            
            // Update storage with system default
            chrome.storage.local.set({
              defaultAudioInput: defaultDevice.deviceId,
              micActive: true
            });
          } else {
            // Otherwise start with first available device
            startAudioCapture(null);
          }
          
          // Mark as initialized
          setInitialized(true);
          
          // Notify parent that we're ready
          window.parent.postMessage({
            type: 'waveform-ready',
            initialized: true
          }, '*');
        });
      } catch (err) {
        console.error("Error initializing waveform:", err);
      }
    };
    
    // Initialize with a short delay to ensure DOM is ready
    setTimeout(initWaveform, 200);
    
    // Clean up on unmount
    return () => {
      console.log("Cleaning up waveform component");
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      window.removeEventListener('message', handleDeviceChangeMessage);
      chrome.storage.onChanged.removeListener(handleStorageChange);
      chrome.runtime.onMessage.removeListener(handleChromeMessage);
      cleanupAudio();
      
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    };
  }, []);

  // Set up resize observer
  useEffect(() => {
    const updateCanvasSize = () => {
      if (canvasRef.current) {
        const canvas = canvasRef.current;
        const parent = canvas.parentElement;
        if (parent) {
          // Set canvas to fill parent width
          canvas.width = parent.clientWidth;
          
          // If visualization is active, ensure it continues with new dimensions
          if (animationFrameIdRef.current) {
            cancelAnimationFrame(animationFrameIdRef.current);
            startVisualization();
          }
        }
      }
    };

    // Initialize canvas size
    updateCanvasSize();

    // Set up resize observer
    try {
      resizeObserverRef.current = new ResizeObserver(updateCanvasSize);
      if (canvasRef.current && canvasRef.current.parentElement) {
        resizeObserverRef.current.observe(canvasRef.current.parentElement);
      }
    } catch (err) {
      console.error("Error setting up ResizeObserver:", err);
    }

    return () => {
      if (resizeObserverRef.current) {
        try {
          resizeObserverRef.current.disconnect();
        } catch (err) {
          console.error("Error disconnecting ResizeObserver:", err);
        }
      }
    };
  }, []);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      <canvas
        ref={canvasRef}
        height="30"
        style={{ 
          background: "#f5f6fa", 
          width: "100%",
          transition: "opacity 0.3s ease"
        }}
      />
      {isLoading && (
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(245, 246, 250, 0.7)",
          fontSize: "10px",
          color: "#78C072",
          fontFamily: "sans-serif"
        }}>
          Connecting...
        </div>
      )}
      {isMuted && !isLoading && (
        <div style={{
          position: "absolute",
          top: 0,
          right: 5,
          padding: "2px 5px",
          fontSize: "8px",
          color: "#6E7684",
          fontFamily: "sans-serif",
          backgroundColor: "rgba(245, 246, 250, 0.7)",
          borderRadius: "2px"
        }}>
          Muted
        </div>
      )}
    </div>
  );
};

export default Waveform;
