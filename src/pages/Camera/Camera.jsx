import React, { useEffect, useState, useRef, useCallback } from "react";
import Background from "./modules/Background";

// Context
import { contentStateContext } from "../Content/context/ContentState";

const Camera = () => {
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [backgroundEffects, setBackgroundEffects] = useState(false);
  const backgroundEffectsRef = useRef(false);
  const streamRef = useRef(null);
  const videoRef = useRef(null);
  const [imageDataState, setImageDataState] = useState(null);
  const [pipMode, setPipMode] = useState(false);
  const recordingTypeRef = useRef("screen");
  const [isCapturing, setIsCapturing] = useState(false);

  // Offscreen canvas for getting video frame
  const offScreenCanvasRef = useRef(null);
  const offScreenCanvasContextRef = useRef(null);

  // Add a utility function to show toast notifications via chrome messaging
  const showToast = useCallback((message) => {
    try {
      if (chrome.runtime && chrome.runtime.id) {
        chrome.runtime.sendMessage({
          type: "show-toast",
          message: message
        });
      }
    } catch (error) {
      console.log("Extension context invalidated, cannot show toast");
    }
  }, []);

  // Add a utility function to safely send chrome messages
  const safeChromeMessage = useCallback((message, callback = null) => {
    try {
      if (chrome.runtime && chrome.runtime.id) {
        if (callback) {
          chrome.runtime.sendMessage(message, callback);
        } else {
          chrome.runtime.sendMessage(message);
        }
      }
    } catch (error) {
      console.log("Extension context invalidated, skipping message:", message.type);
    }
  }, []);

  // Add a utility function to safely access chrome storage
  const safeChromeStorage = useCallback((operation, data = null, callback = null) => {
    try {
      if (chrome.runtime && chrome.runtime.id) {
        if (operation === 'set' && data) {
          chrome.storage.local.set(data, callback);
        } else if (operation === 'get' && data) {
          chrome.storage.local.get(data, callback);
        }
      }
    } catch (error) {
      console.log("Extension context invalidated, skipping storage operation");
    }
  }, []);

  useEffect(() => {
    offScreenCanvasRef.current = document.createElement("canvas");
  }, []);

  // Add a function to find a device by label
  const findDeviceByLabel = (devices, targetLabel) => {
    if (!targetLabel) return null;
    return devices.find(device => device.label === targetLabel);
  };

  // Enhanced stopCameraStream to properly clean up resources and wait for virtual cameras
  const stopCameraStream = useCallback(() => {
    console.log("Stopping camera stream and cleaning up resources");
    
    // Stop the capture loop first
    setIsCapturing(false);
    
    try {
      // First check if there's a stream reference
      if (streamRef.current) {
        const tracks = streamRef.current.getTracks();
        console.log(`Stopping ${tracks.length} tracks from streamRef`);
        
        tracks.forEach((track) => {
          console.log(`Stopping track: ${track.kind} (${track.id})`);
          track.stop();
        });
        
        streamRef.current = null;
      }
      
      // Also check videoRef's srcObject separately
      if (videoRef.current && videoRef.current.srcObject) {
        const videoTracks = videoRef.current.srcObject.getTracks();
        console.log(`Stopping ${videoTracks.length} tracks from videoRef.srcObject`);
        
        videoTracks.forEach((track) => {
          console.log(`Stopping track from video.srcObject: ${track.kind} (${track.id})`);
          track.stop();
        });
        
        videoRef.current.srcObject = null;
      }
      
      // Notify background that camera is no longer active in this tab
      safeChromeMessage({
        type: "set-camera-active-tab",
        active: false
      });
    } catch (error) {
      console.error("Error while stopping camera stream:", error);
    }
    
    // Extended delay to ensure virtual camera software (like NVIDIA Broadcast) releases the device
    return new Promise(resolve => {
      setTimeout(() => {
        console.log("Camera resources should now be released (extended delay for virtual cameras)");
        resolve();
      }, 800); // Increased from 100ms to 800ms for virtual cameras
    });
  }, [safeChromeMessage]);

  // Enhanced getCameraStream to handle device conflicts and virtual cameras
  const getCameraStream = useCallback(async (constraints = { video: true }, retryCount = 0, reuseExisting = false) => {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000; // 1 second between retries
    
    try {
      // Check if we can reuse existing stream (for tab switching during recording)
      if (reuseExisting && streamRef.current) {
        const existingTracks = streamRef.current.getVideoTracks();
        if (existingTracks.length > 0) {
          const existingTrack = existingTracks[0];
          const existingSettings = existingTrack.getSettings();
          
          // Check if the existing stream matches the requested constraints
          if (constraints.video && constraints.video.deviceId && constraints.video.deviceId.exact) {
            if (existingSettings.deviceId === constraints.video.deviceId.exact) {
              console.log("Reusing existing camera stream for same device");
              
              // Ensure video element is connected
              if (videoRef.current && videoRef.current.srcObject !== streamRef.current) {
                videoRef.current.srcObject = streamRef.current;
                videoRef.current.play();
              }
              
              // Update active tab info
              safeChromeMessage({
                type: "set-camera-active-tab",
                active: true,
                defaultVideoInput: existingSettings.deviceId,
                label: existingTrack.label
              });
              
              return streamRef.current;
            }
          }
        }
      }
      
      // Only stop existing stream if we're not reusing it
      if (!reuseExisting) {
        await stopCameraStream();
        // Add extra delay for virtual camera software to release devices
        await new Promise(resolve => setTimeout(resolve, 300)); // Reduced from 500ms
      }
      
      console.log("Getting camera stream with constraints:", constraints, `(attempt ${retryCount + 1})`);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Success! Set up the stream
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      // Show success notification for camera switching (but not for initial load)
      if (retryCount > 0) {
        showToast("Camera switched successfully");
      }
      
      // Get video track details for sizing
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const { width: trackWidth, height: trackHeight } = videoTrack.getSettings();
        setWidth(trackWidth / trackHeight < 1 ? "100%" : "auto");
        setHeight(trackWidth / trackHeight < 1 ? "auto" : "100%");
      }
      
      if (videoRef.current) {
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          
          // Set up offscreen canvas for frame capture (if needed)
          const canvas = offScreenCanvasRef.current;
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          offScreenCanvasContextRef.current = canvas.getContext("2d");
          
          // Start the frame capture process if using background effects
          setIsCapturing(true);
          if (backgroundEffectsRef.current) {
            requestAnimationFrame(captureFrame);
          }
        };
        
        // Store the selected camera's label for cross-tab identification
        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length > 0) {
          const videoTrack = videoTracks[0];
          const settings = videoTrack.getSettings();
          safeChromeMessage({
            type: "set-camera-active-tab",
            active: true,
            defaultVideoInput: settings.deviceId,
            label: videoTrack.label
          });
        }
      }
      
      console.log("Camera stream obtained successfully");
      return stream;
    } catch (error) {
      console.error("Error accessing camera:", error);
      
      // Handle specific device conflict errors
      if (error.name === 'NotReadableError' || 
          error.message.includes('already in use') || 
          error.message.includes('Could not start video source')) {
        
        if (retryCount < MAX_RETRIES) {
          console.log(`Camera device conflict detected, retrying in ${RETRY_DELAY}ms... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
          
          // Wait longer before retry to allow virtual camera software to release the device
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          
          // Retry with exponential backoff
          return getCameraStream(constraints, retryCount + 1, false);
        } else {
          console.error("Camera device still in use after maximum retries. This may be due to virtual camera software like NVIDIA Broadcast.");
          
          // Show user-friendly error notification
          showToast("Camera is in use by another application. Please close other camera apps and try again.");
          
          // Try fallback to any available camera as last resort
          if (constraints.video && constraints.video.deviceId && constraints.video.deviceId.exact) {
            console.log("Trying fallback to any available camera...");
            try {
              await new Promise(resolve => setTimeout(resolve, 1000)); // Extra delay before fallback
              await getCameraStream({ video: true }, 0, false);
            } catch (fallbackError) {
              console.error("Fallback camera also failed:", fallbackError);
            }
          }
        }
      } else {
        // For other types of errors, try fallback immediately
        if (constraints.video && constraints.video.deviceId && constraints.video.deviceId.exact) {
          console.log("Trying fallback to any camera...");
          try {
            await getCameraStream({ video: true }, 0, false);
          } catch (fallbackError) {
            console.error("Fallback camera also failed:", fallbackError);
          }
        }
      }
    }
  }, [stopCameraStream, safeChromeMessage, showToast]);

  // Function to activate camera by label (for cross-tab consistency)
  const activateCameraByLabel = useCallback(async (cameraLabel, isTabSwitch = false) => {
    try {
      console.log(`Attempting to activate camera with label: ${cameraLabel}${isTabSwitch ? ' (tab switch)' : ''}`);
      
      // For tab switches during recording, try to reuse existing stream first
      if (isTabSwitch && streamRef.current) {
        const existingTracks = streamRef.current.getVideoTracks();
        if (existingTracks.length > 0 && existingTracks[0].label === cameraLabel) {
          console.log("Reusing existing stream for tab switch - same camera already active");
          
          // Ensure video element is connected and playing
          if (videoRef.current) {
            if (videoRef.current.srcObject !== streamRef.current) {
              videoRef.current.srcObject = streamRef.current;
            }
            videoRef.current.play();
          }
          
          // Update active tab info
          const settings = existingTracks[0].getSettings();
          safeChromeMessage({
            type: "set-camera-active-tab",
            active: true,
            defaultVideoInput: settings.deviceId,
            label: existingTracks[0].label
          });
          
          return;
        }
      }
      
      // Request access to camera to get device list with labels
      const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      // Stop the temporary stream
      tempStream.getTracks().forEach(track => track.stop());
      
      // Find the camera with matching label
      const videoInputs = devices.filter(device => device.kind === 'videoinput');
      const matchedDevice = findDeviceByLabel(videoInputs, cameraLabel);
      
      if (matchedDevice) {
        console.log(`Found matching camera: ${matchedDevice.label} with ID: ${matchedDevice.deviceId}`);
        await getCameraStream({
          video: {
            deviceId: { exact: matchedDevice.deviceId }
          }
        }, 0, isTabSwitch);
      } else {
        console.warn(`No camera found matching label: ${cameraLabel}`);
        // Fall back to first available camera
        if (videoInputs.length > 0) {
          console.log(`Falling back to first available camera: ${videoInputs[0].label}`);
          await getCameraStream({
            video: {
              deviceId: { exact: videoInputs[0].deviceId }
            }
          }, 0, false);
        }
      }
    } catch (error) {
      console.error("Error activating camera by label:", error);
    }
  }, [getCameraStream, safeChromeMessage]);

  useEffect(() => {
    backgroundEffectsRef.current = backgroundEffects;
  }, [backgroundEffects]);

  const captureFrame = () => {
    if (
      backgroundEffectsRef.current &&
      offScreenCanvasContextRef.current &&
      offScreenCanvasRef.current &&
      videoRef.current
    ) {
      const video = videoRef.current;
      offScreenCanvasContextRef.current.drawImage(
        video,
        0,
        0,
        offScreenCanvasRef.current.width,
        offScreenCanvasRef.current.height
      );
      setImageDataState(
        offScreenCanvasContextRef.current.getImageData(
          0,
          0,
          offScreenCanvasRef.current.width,
          offScreenCanvasRef.current.height
        )
      );
    }
    
    // Only continue the animation loop if capturing is active
    if (isCapturing) {
      requestAnimationFrame(captureFrame);
    }
  };

  // Enhanced message listener with better error handling
  useEffect(() => {
    const handleMessage = async (request, sender, sendResponse) => {
      // Check if extension context is still valid
      if (!chrome.runtime || !chrome.runtime.id) {
        console.log("Extension context invalidated, removing message listener");
        try {
          chrome.runtime.onMessage.removeListener(handleMessage);
        } catch (error) {
          console.log("Error removing message listener:", error);
        }
        return;
      }
      
      console.log("Camera component received message:", request.type, request);
      
      try {
        // Add a small delay to prevent race conditions
        await new Promise(resolve => setTimeout(resolve, 10));
        
        if (request.type === "switch-camera") {
          console.log("Received switch-camera request:", request);
          
          if (request.id === "none") {
            console.log("Switch-camera request: none. Stopping camera stream.");
            await stopCameraStream();
          } else {
            console.log("Switch-camera request with deviceId:", request.id);
            
            // Show toast notification for camera switching
            showToast("Switching camera...");
            
            // Stop stream completely before starting a new one
            await stopCameraStream();
            
            // Extended delay for virtual camera switching (NVIDIA Broadcast, OBS, etc.)
            setTimeout(() => {
              getCameraStream({
                video: {
                  deviceId: {
                    exact: request.id,
                  },
                },
              });
            }, 1200); // Increased from 300ms to 1200ms for virtual camera switching
          }
        } else if (request.type === "activate-camera-by-label") {
          console.log("Received activate-camera-by-label request:", request);
          if (request.cameraLabel) {
            // Detect if this is a tab switch during recording for faster activation
            const isTabSwitch = request.isTabSwitch || false;
            
            // Reduced delay for tab switches, no delay for stream reuse
            const delay = isTabSwitch ? 50 : 100;
            setTimeout(() => {
              activateCameraByLabel(request.cameraLabel, isTabSwitch);
            }, delay);
          }
        } else if (request.type === "deactivate-camera") {
          console.log("Received deactivate-camera request");
          
          // For explicit deactivation (like recording end), always stop the camera
          if (request.force || !streamRef.current) {
            console.log("Force deactivating camera or no stream active");
            await stopCameraStream();
            return;
          }
          
          // Check if we're recording - if so, only deactivate if explicitly requested
          // This prevents unnecessary camera stops during tab switches
          try {
            if (chrome.runtime && chrome.runtime.id) {
              const result = await chrome.storage.local.get(["recording"]);
              if (result.recording) {
                console.log("Recording in progress - camera deactivation will be handled by tab switch logic");
                return; // Don't stop the camera during recording tab switches
              }
            }
          } catch (error) {
            console.log("Extension context invalidated during recording check");
          }
          
          await stopCameraStream();
        } else if (request.type === "popup-closed") {
          console.log("Received popup-closed request - stopping camera stream");
          await stopCameraStream();
        } else if (request.type === "background-effects-active") {
          setBackgroundEffects(true);
        } else if (request.type === "background-effects-inactive") {
          setBackgroundEffects(false);
        } else if (request.type === "set-background-effect") {
          // Handle background effect changes
        } else if (request.type === "camera-flip") {
          // Handle camera flip
        } else if (request.type === "capture-frame") {
          if (typeof captureFrame === 'function') {
            captureFrame();
          }
        } else if (request.type === "get-recording-type") {
          if (typeof sendResponse === 'function') {
            sendResponse({ recordingType: recordingTypeRef.current });
          }
        } else if (request.type === "camera-only-update") {
          setWidth("auto");
          setHeight("100%");
          recordingTypeRef.current = "camera";
        } else if (request.type === "screen-update") {
          // Needs to fit 100% width and height but considering aspect ratio
          const video = videoRef.current;
          if (video && video.videoWidth && video.videoHeight) {
            const videoWidth = video.videoWidth;
            const videoHeight = video.videoHeight;

            if (videoWidth > videoHeight) {
              setWidth("auto");
              setHeight("100%");
            } else {
              setWidth("100%");
              setHeight("auto");
            }
          }
          recordingTypeRef.current = "screen";
        } else if (request.type === "toggle-pip") {
          // If picture in picture is active, close it, otherwise open it
          if (document.pictureInPictureElement) {
            document.exitPictureInPicture().catch(console.error);
          } else if (videoRef.current) {
            try {
              videoRef.current.requestPictureInPicture().catch(() => {
                // Cancel pip mode if it fails
                setPipMode(false);
                safeChromeMessage({ type: "pip-ended" });
              });
            } catch (error) {
              // Cancel pip mode if it fails
              setPipMode(false);
              safeChromeMessage({ type: "pip-ended" });
            }
          }
        } else if (request.type === "set-surface") {
          if (request.surface === "monitor" && videoRef.current) {
            try {
              videoRef.current.requestPictureInPicture().catch(() => {
                // Cancel pip mode if it fails
                setPipMode(false);
                safeChromeMessage({ type: "pip-ended" });
              });
            } catch (error) {
              // Cancel pip mode if it fails
              setPipMode(false);
              safeChromeMessage({ type: "pip-ended" });
            }
          }
        } else if (request.type === "camera-toggled-toolbar") {
          console.log("Camera toggled from toolbar:", request);
          if (request.active) {
            await stopCameraStream();
            setTimeout(() => {
              getCameraStream({
                video: {
                  deviceId: {
                    exact: request.id,
                  },
                },
              });
            }, 1200); // Extended delay for virtual camera switching
            setPipMode(false);
          } else {
            stopCameraStream();
          }
        } else if (request.type === "camera-selection-changed") {
          console.log("Camera selection changed in another tab:", request);
          if (request.cameraLabel) {
            // Add delay to prevent race conditions
            setTimeout(() => {
              activateCameraByLabel(request.cameraLabel);
            }, 150);
          }
        }
      } catch (error) {
        console.error("Error handling camera message:", error);
        // Don't re-throw the error to prevent uncaught exceptions
        // Also check if it's a React/DOM related error and handle gracefully
        if (error.message && error.message.includes('call is not a function')) {
          console.log("Detected React/DOM function call error, component may be in invalid state");
          // Try to recover by stopping any ongoing operations
          try {
            setIsCapturing(false);
            if (streamRef.current) {
              streamRef.current.getTracks().forEach(track => track.stop());
              streamRef.current = null;
            }
          } catch (recoveryError) {
            console.log("Error during recovery:", recoveryError);
          }
        }
      }
    };

    try {
      if (chrome.runtime && chrome.runtime.id) {
        chrome.runtime.onMessage.addListener(handleMessage);
      }
    } catch (error) {
      console.log("Extension context invalidated, cannot add message listener");
    }
    
    return () => {
      try {
        if (chrome.runtime && chrome.runtime.id) {
          chrome.runtime.onMessage.removeListener(handleMessage);
        }
      } catch (error) {
        console.log("Extension context invalidated during cleanup");
      }
    };
  }, [getCameraStream, stopCameraStream, activateCameraByLabel, safeChromeMessage]);

  // Check chrome local storage on component mount
  useEffect(() => {
    const initializeCamera = async () => {
      try {
        // Use direct chrome.storage.local.get with error handling for initialization
        let result;
        try {
          if (chrome.runtime && chrome.runtime.id) {
            result = await chrome.storage.local.get([
              "defaultVideoInput", 
              "cameraActive", 
              "cameraLabel", 
              "recording", 
              "cameraActiveTab"
            ]);
          } else {
            console.log("Extension context invalidated during initialization");
            return;
          }
        } catch (error) {
          console.log("Extension context invalidated during storage access");
          return;
        }
        
        console.log("Initial storage state:", result);
        
        // Check if camera should be inactive (either explicitly inactive OR set to none)
        if (result.cameraActive === false || result.defaultVideoInput === "none") {
          console.log("Camera is inactive or set to none, stopping stream.");
          stopCameraStream();
          return;
        }

        // Get current tab ID to check if this tab should have the camera
        let currentTabId = null;
        try {
          if (chrome.runtime && chrome.runtime.id) {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length > 0) {
              currentTabId = tabs[0].id;
            }
          }
        } catch (error) {
          console.log("Could not get current tab ID");
        }

        // During recording, if we have a camera label, always try to activate it
        // The background script will handle deactivating cameras in other tabs
        if (result.recording && result.cameraLabel && result.cameraActive !== false) {
          console.log("Recording in progress and camera should be active, activating by label:", result.cameraLabel);
          activateCameraByLabel(result.cameraLabel);
          return;
        }

        // If we have a stored camera label, try to use that for consistency across tabs
        if (result.cameraLabel) {
          console.log("Found stored camera label, activating by label:", result.cameraLabel);
          activateCameraByLabel(result.cameraLabel);
        }
        // Otherwise initialize by deviceId if available
        else if (result.defaultVideoInput) {
          console.log("No label found, using deviceId:", result.defaultVideoInput);
          getCameraStream({
            video: {
              deviceId: {
                exact: result.defaultVideoInput,
              },
            },
          });
        } else {
          console.log("No default video input specified, using any camera.");
          getCameraStream({
            video: true,
          });
        }
      } catch (error) {
        console.error("Error initializing camera:", error);
      }
    };

    initializeCamera();
    
    // Request stored camera on mount
    safeChromeMessage(
      { type: "get-stored-camera" },
      (response) => {
        if (response && response.cameraLabel) {
          console.log("Retrieved stored camera label:", response.cameraLabel);
          activateCameraByLabel(response.cameraLabel);
        }
      }
    );
  }, [getCameraStream, stopCameraStream, activateCameraByLabel, safeChromeMessage]);

  // Add storage change listener to react to external changes
  useEffect(() => {
    const handleStorageChange = (changes, area) => {
      // Check if extension context is still valid
      if (!chrome.runtime || !chrome.runtime.id) {
        console.log("Extension context invalidated, removing storage listener");
        chrome.storage.onChanged.removeListener(handleStorageChange);
        return;
      }
      
      if (area === "local") {
        // Check if cameraActive property changed and has a newValue property
        if (changes.cameraActive && changes.cameraActive.hasOwnProperty("newValue")) {
          console.log("Camera active state changed:", changes.cameraActive.newValue);
          if (changes.cameraActive.newValue === false) {
            stopCameraStream();
          } else if (changes.cameraActive.newValue === true) {
            // Attempt to turn on the camera if we know it should be on
            try {
              if (chrome.runtime && chrome.runtime.id) {
                chrome.storage.local.get(["defaultVideoInput", "cameraLabel"], (result) => {
                  if (result.cameraLabel) {
                    activateCameraByLabel(result.cameraLabel);
                  } else if (result.defaultVideoInput && result.defaultVideoInput !== "none") {
                    getCameraStream({
                      video: {
                        deviceId: {
                          exact: result.defaultVideoInput,
                        },
                      },
                    });
                  }
                });
              }
            } catch (error) {
              console.log("Extension context invalidated during storage change handling");
            }
          }
        }
      }
    };

    try {
      if (chrome.runtime && chrome.runtime.id) {
        chrome.storage.onChanged.addListener(handleStorageChange);
      }
    } catch (error) {
      console.log("Extension context invalidated, cannot add storage listener");
    }
    
    return () => {
      try {
        if (chrome.runtime && chrome.runtime.id) {
          chrome.storage.onChanged.removeListener(handleStorageChange);
        }
      } catch (error) {
        console.log("Extension context invalidated during storage cleanup");
      }
    };
  }, [getCameraStream, stopCameraStream, activateCameraByLabel]);

  // Detect when Pip mode switches
  useEffect(() => {
    if (!videoRef.current) return;
    
    const handleEnterPip = () => {
      setPipMode(true);
      safeChromeMessage({ type: "pip-started" });
    };
    const handleLeavePip = () => {
      setPipMode(false);
      safeChromeMessage({ type: "pip-ended" });
    };

    videoRef.current.addEventListener("enterpictureinpicture", handleEnterPip);
    videoRef.current.addEventListener("leavepictureinpicture", handleLeavePip);

    return () => {
      if (videoRef.current) {
        videoRef.current.removeEventListener("enterpictureinpicture", handleEnterPip);
        videoRef.current.removeEventListener("leavepictureinpicture", handleLeavePip);
      }
    };
  }, [safeChromeMessage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log("Camera component unmounting - releasing all resources");
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, []);

  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      {backgroundEffects && <Background frame={imageDataState} />}
      <video
        style={{
          height: height,
          width: width,
          position: "absolute",
          top: "50%",
          left: "50%",
          right: 0,
          transform: "translateY(-50%) translateX(-50%)",
          margin: "auto",
          zIndex: 99,
          display: !backgroundEffects ? "block" : "none",
        }}
        ref={videoRef}
        autoPlay
        playsInline
      ></video>
      {recordingTypeRef.current != "camera" && (
        <div
          style={{
            width: "100%",
            height: "100%",
            backgroundColor: "#CBD0D8",
            zIndex: 9,
            position: "absolute",
            top: "0px",
            left: "0px",
            margin: "auto",
            display: "flex",
            alignContent: "center",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div className="loader"></div>
        </div>
      )}
      {pipMode && (
        <img
          src={chrome.runtime.getURL("assets/pip-mode.svg")}
          style={{
            width: "100%",
            height: "100%",
            position: "absolute",
            top: "0px",
            left: "0px",
            margin: "auto",
            zIndex: 999,
          }}
          alt="PiP Mode"
        />
      )}
      <style>
        {`.loader {
  font-size: 10px;
  width: 1em;
  height: 1em;
	margin: auto;
  border-radius: 50%;
  position: relative;
  text-indent: -9999em;
  animation: mulShdSpin 1.1s infinite ease;
  transform: translateZ(0);
}
@keyframes mulShdSpin {
  0%,
  100% {
    box-shadow: 0em -2.6em 0em 0em #ffffff, 1.8em -1.8em 0 0em rgba(255,255,255, 0.2), 2.5em 0em 0 0em rgba(255,255,255, 0.2), 1.75em 1.75em 0 0em rgba(255,255,255, 0.2), 0em 2.5em 0 0em rgba(255,255,255, 0.2), -1.8em 1.8em 0 0em rgba(255,255,255, 0.2), -2.6em 0em 0 0em rgba(255,255,255, 0.5), -1.8em -1.8em 0 0em rgba(255,255,255, 0.7);
  }
  12.5% {
    box-shadow: 0em -2.6em 0em 0em rgba(255,255,255, 0.7), 1.8em -1.8em 0 0em #ffffff, 2.5em 0em 0 0em rgba(255,255,255, 0.2), 1.75em 1.75em 0 0em rgba(255,255,255, 0.2), 0em 2.5em 0 0em rgba(255,255,255, 0.2), -1.8em 1.8em 0 0em rgba(255,255,255, 0.2), -2.6em 0em 0 0em rgba(255,255,255, 0.2), -1.8em -1.8em 0 0em rgba(255,255,255, 0.5);
  }
  25% {
    box-shadow: 0em -2.6em 0em 0em rgba(255,255,255, 0.5), 1.8em -1.8em 0 0em rgba(255,255,255, 0.7), 2.5em 0em 0 0em #ffffff, 1.75em 1.75em 0 0em rgba(255,255,255, 0.2), 0em 2.5em 0 0em rgba(255,255,255, 0.2), -1.8em 1.8em 0 0em rgba(255,255,255, 0.2), -2.6em 0em 0 0em rgba(255,255,255, 0.2), -1.8em -1.8em 0 0em rgba(255,255,255, 0.2);
  }
  37.5% {
    box-shadow: 0em -2.6em 0em 0em rgba(255,255,255, 0.2), 1.8em -1.8em 0 0em rgba(255,255,255, 0.5), 2.5em 0em 0 0em rgba(255,255,255, 0.7), 1.75em 1.75em 0 0em #ffffff, 0em 2.5em 0 0em rgba(255,255,255, 0.2), -1.8em 1.8em 0 0em rgba(255,255,255, 0.2), -2.6em 0em 0 0em rgba(255,255,255, 0.2), -1.8em -1.8em 0 0em rgba(255,255,255, 0.2);
  }
  50% {
    box-shadow: 0em -2.6em 0em 0em rgba(255,255,255, 0.2), 1.8em -1.8em 0 0em rgba(255,255,255, 0.2), 2.5em 0em 0 0em rgba(255,255,255, 0.5), 1.75em 1.75em 0 0em rgba(255,255,255, 0.7), 0em 2.5em 0 0em #ffffff, -1.8em 1.8em 0 0em rgba(255,255,255, 0.2), -2.6em 0em 0 0em rgba(255,255,255, 0.2), -1.8em -1.8em 0 0em rgba(255,255,255, 0.2);
  }
  62.5% {
    box-shadow: 0em -2.6em 0em 0em rgba(255,255,255, 0.2), 1.8em -1.8em 0 0em rgba(255,255,255, 0.2), 2.5em 0em 0 0em rgba(255,255,255, 0.2), 1.75em 1.75em 0 0em rgba(255,255,255, 0.5), 0em 2.5em 0 0em rgba(255,255,255, 0.7), -1.8em 1.8em 0 0em #ffffff, -2.6em 0em 0 0em rgba(255,255,255, 0.2), -1.8em -1.8em 0 0em rgba(255,255,255, 0.2);
  }
  75% {
    box-shadow: 0em -2.6em 0em 0em rgba(255,255,255, 0.2), 1.8em -1.8em 0 0em rgba(255,255,255, 0.2), 2.5em 0em 0 0em rgba(255,255,255, 0.2), 1.75em 1.75em 0 0em rgba(255,255,255, 0.2), 0em 2.5em 0 0em rgba(255,255,255, 0.5), -1.8em 1.8em 0 0em rgba(255,255,255, 0.7), -2.6em 0em 0 0em #ffffff, -1.8em -1.8em 0 0em rgba(255,255,255, 0.2);
  }
  87.5% {
    box-shadow: 0em -2.6em 0em 0em rgba(255,255,255, 0.2), 1.8em -1.8em 0 0em rgba(255,255,255, 0.2), 2.5em 0em 0 0em rgba(255,255,255, 0.2), 1.75em 1.75em 0 0em rgba(255,255,255, 0.2), 0em 2.5em 0 0em rgba(255,255,255, 0.2), -1.8em 1.8em 0 0em rgba(255,255,255, 0.5), -2.6em 0em 0 0em rgba(255,255,255, 0.7), -1.8em -1.8em 0 0em #ffffff;
  }
}`}
      </style>
    </div>
  );
};

export default Camera;
