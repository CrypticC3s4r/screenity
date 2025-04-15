import React, { useEffect, useState, useContext, useRef, useCallback } from "react";

import * as Select from "@radix-ui/react-select";
import {
  DropdownIcon,
  CheckWhiteIcon,
  CameraOnIcon,
  CameraOffIcon,
  MicOnIcon,
  MicOffIcon,
} from "../../images/popup/images";

// Context
import { contentStateContext } from "../../context/ContentState";

const Dropdown = (props) => {
  const [contentState, setContentState] = useContext(contentStateContext);
  const [label, setLabel] = useState(chrome.i18n.getMessage("None"));
  const [open, setOpen] = useState(false);
  const [deviceList, setDeviceList] = useState([]);
  const previousDeviceRef = useRef(null);

  const updateItems = () => {
    if (props.type === "camera") {
      if (
        contentState.defaultVideoInput === "none" ||
        !contentState.cameraActive
      ) {
        setLabel(chrome.i18n.getMessage("noCameraDropdownLabel"));
      } else {
        // Check if defaultVideoInput is in camdevices, if not set to none
        if (
          contentState.videoInput.find(
            (device) => device.deviceId === contentState.defaultVideoInput
          )
        ) {
          setLabel(
            contentState.videoInput.find(
              (device) => device.deviceId === contentState.defaultVideoInput
            ).label
          );
        } else {
          setLabel(chrome.i18n.getMessage("noCameraDropdownLabel"));
        }
      }
    } else {
      if (
        contentState.defaultAudioInput === "none" ||
        (!contentState.micActive && !contentState.pushToTalk)
      ) {
        setLabel(chrome.i18n.getMessage("noMicrophoneDropdownLabel"));
      } else {
        // Check if defaultAudioInput is in micdevices, if not set to none
        if (
          contentState.audioInput.find(
            (device) => device.deviceId === contentState.defaultAudioInput
          )
        ) {
          setLabel(
            contentState.audioInput.find(
              (device) => device.deviceId === contentState.defaultAudioInput
            ).label
          );
        } else {
          setLabel(chrome.i18n.getMessage("noMicrophoneDropdownLabel"));
        }
      }
    }
  };

  const handleDeviceError = useCallback((deviceType, error) => {
    console.error(`Error accessing ${deviceType} device:`, error);

    if (deviceType === "camera") {
      setContentState((prevState) => ({
        ...prevState,
        cameraActive: false,
        defaultVideoInput: "none",
      }));
      chrome.storage.local.set({
        cameraActive: false,
        defaultVideoInput: "none",
      });
      setLabel(chrome.i18n.getMessage("noCameraDropdownLabel"));
    } else {
      setContentState((prevState) => ({
        ...prevState,
        micActive: false,
        defaultAudioInput: "none",
      }));
      chrome.storage.local.set({
        micActive: false,
        defaultAudioInput: "none",
      });
      setLabel(chrome.i18n.getMessage("noMicrophoneDropdownLabel"));
    }
  }, [setContentState]);

  const refreshDeviceList = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const filteredDevices = devices
        .filter((device) => device.kind === (props.type === "camera" ? "videoinput" : "audioinput"))
        .map((device) => ({
          deviceId: device.deviceId,
          label: device.label || `Device ${device.deviceId.substr(0, 5)}...`,
        }));

      console.log("Devices fetched:", filteredDevices); // Debug log

      setDeviceList(filteredDevices);

      if (props.type === "camera") {
        setContentState((prevState) => {
          const updatedState = { ...prevState, videoInput: filteredDevices };
          console.log("Updated contentState (camera):", updatedState); // Debug log
          return updatedState;
        });
      } else {
        setContentState((prevState) => {
          const updatedState = { ...prevState, audioInput: filteredDevices };
          console.log("Updated contentState (mic):", updatedState); // Debug log
          return updatedState;
        });
      }
    } catch (error) {
      handleDeviceError(props.type, error);
    }
  }, [props.type, setContentState, handleDeviceError]);

  useEffect(() => {
    const handleDeviceChange = () => {
      refreshDeviceList();
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    refreshDeviceList();

    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [refreshDeviceList]);

  useEffect(() => {
    if (props.type === "camera" && contentState.defaultVideoInput !== "none") {
      previousDeviceRef.current = contentState.defaultVideoInput;
    } else if (props.type === "mic" && contentState.defaultAudioInput !== "none") {
      previousDeviceRef.current = contentState.defaultAudioInput;
    }
  }, [props.type, contentState.defaultAudioInput, contentState.defaultVideoInput]);

  useEffect(() => {
    if (open) {
      refreshDeviceList();
    }
  }, [open, refreshDeviceList]);

  useEffect(() => {
    refreshDeviceList();
  }, [refreshDeviceList]);

  useEffect(() => {
    updateItems();
  }, [
    contentState.defaultAudioInput,
    contentState.defaultVideoInput,
    contentState.audioInput,
    contentState.videoInput,
    contentState.cameraActive,
    contentState.micActive,
  ]);

  useEffect(() => {
    updateItems();
  }, []);

  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const cameraPermission = await navigator.permissions.query({ name: "camera" });
        const micPermission = await navigator.permissions.query({ name: "microphone" });
        console.log("Camera permissions:", cameraPermission.state); // Debug log
        console.log("Microphone permissions:", micPermission.state); // Debug log

        if (cameraPermission.state === "prompt" || micPermission.state === "prompt") {
          console.log("Triggering permission prompt...");
          navigator.mediaDevices.getUserMedia({ audio: true, video: true })
            .then((stream) => {
              console.log("Permissions granted");
              stream.getTracks().forEach((track) => track.stop());
              refreshDeviceList(); // Refresh device list after permissions are granted
            })
            .catch((error) => {
              console.error("Permission denied:", error);
            });
        }
      } catch (error) {
        console.error("Error checking permissions:", error);
      }
    };

    checkPermissions();
    console.log("Dropdown opened, refreshing device list"); // Debug log
    refreshDeviceList();
  }, [refreshDeviceList]);

  const onValueChange = (newValue) => {
    if (props.type === "camera") {
      if (newValue === "none") {
        setContentState((prevContentState) => ({
          ...prevContentState,
          cameraActive: false,
        }));
        chrome.storage.local.set({
          cameraActive: false,
        });
        setLabel(chrome.i18n.getMessage("noCameraDropdownLabel"));
      } else {
        const selectedDevice = contentState.videoInput.find(
          (device) => device.deviceId === newValue
        );
        
        setContentState((prevContentState) => ({
          ...prevContentState,
          defaultVideoInput: newValue,
          cameraActive: true,
        }));
        chrome.storage.local.set({
          defaultVideoInput: newValue,
          cameraActive: true,
        });
        chrome.runtime.sendMessage({
          type: "switch-camera",
          id: newValue,
          label: selectedDevice?.label  // Send the camera label for cross-tab identification
        });
        setLabel(selectedDevice?.label || "Camera");
      }
    } else {
      if (newValue === "none") {
        setContentState((prevContentState) => ({
          ...prevContentState,
          micActive: false,
        }));
        chrome.storage.local.set({
          micActive: false,
        });
        setLabel(chrome.i18n.getMessage("noMicrophoneDropdownLabel"));
      } else {
        previousDeviceRef.current = newValue;
        setContentState((prevContentState) => ({
          ...prevContentState,
          defaultAudioInput: newValue,
          micActive: true,
        }));
        chrome.storage.local.set({
          defaultAudioInput: newValue,
          micActive: true,
          userSelectedAudioDevice: true  // Mark this as a user selection
        });
        setLabel(
          contentState.audioInput.find(
            (device) => device.deviceId === newValue
          ).label
        );
        
        // Notify waveform about device change using Chrome messaging
        chrome.runtime.sendMessage({
          type: 'microphone-changed',
          deviceId: newValue,
          timestamp: Date.now() // Add timestamp to ensure the message is treated as new
        });
      }
    }
  };

  const toggleActive = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
    if (props.type === "camera") {
      if (contentState.cameraActive) {
        setContentState((prevContentState) => ({
          ...prevContentState,
          cameraActive: false,
        }));
        chrome.storage.local.set({
          cameraActive: false,
        });
        setLabel(chrome.i18n.getMessage("noCameraDropdownLabel"));
      } else {
        refreshDeviceList().then(() => {
          if (contentState.videoInput.length > 0) {
            const deviceToUse = previousDeviceRef.current &&
              contentState.videoInput.some(d => d.deviceId === previousDeviceRef.current)
              ? previousDeviceRef.current
              : contentState.videoInput[0]?.deviceId;
            
            const selectedDevice = contentState.videoInput.find(
              device => device.deviceId === deviceToUse
            );

            setContentState(prevState => ({
              ...prevState,
              cameraActive: true,
              defaultVideoInput: deviceToUse
            }));
            chrome.storage.local.set({
              cameraActive: true,
              defaultVideoInput: deviceToUse
            });
            
            // Send the device label for cross-tab identification
            chrome.runtime.sendMessage({
              type: "switch-camera",
              id: deviceToUse,
              label: selectedDevice?.label
            });
            
            setLabel(selectedDevice?.label || "Camera");
          }
        });
      }
    } else {
      if (contentState.micActive) {
        setContentState((prevContentState) => ({
          ...prevContentState,
          micActive: false,
        }));
        chrome.storage.local.set({
          micActive: false,
        });
        setLabel(chrome.i18n.getMessage("noMicrophoneDropdownLabel"));
      } else {
        refreshDeviceList().then(() => {
          if (contentState.audioInput.length > 0) {
            const deviceToUse = previousDeviceRef.current &&
              contentState.audioInput.some(d => d.deviceId === previousDeviceRef.current)
              ? previousDeviceRef.current
              : contentState.audioInput[0].deviceId;

            setContentState(prevState => ({
              ...prevState,
              micActive: true,
              defaultAudioInput: deviceToUse
            }));
            chrome.storage.local.set({
              micActive: true,
              defaultAudioInput: deviceToUse,
              userSelectedAudioDevice: true
            });
            setLabel(contentState.audioInput.find(d => d.deviceId === deviceToUse)?.label || "Microphone");
            chrome.runtime.sendMessage({
              type: 'microphone-changed',
              deviceId: deviceToUse,
              timestamp: Date.now()
            });
          }
        });
      }
    }
  };

  useEffect(() => {
    const handleMessage = (request, sender, sendResponse) => {
      if (request.type === "camera-selection-changed" && props.type === "camera") {
        refreshDeviceList().then(() => {
          // Find device by label
          const matchedDevice = contentState.videoInput.find(
            device => device.label === request.cameraLabel
          );
          
          if (matchedDevice) {
            setContentState(prevState => ({
              ...prevState,
              cameraActive: true,
              defaultVideoInput: matchedDevice.deviceId
            }));
            setLabel(matchedDevice.label);
          }
        });
      }
    };
    
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [contentState.videoInput, refreshDeviceList]);

  const clickedIcon = useRef(false);

  return (
    <Select.Root
      open={open}
      onOpenChange={(open) => {
        if (clickedIcon.current) return;
        setOpen(open);
      }}
      value={
        props.type === "camera" && contentState.cameraActive
          ? contentState.defaultVideoInput
          : props.type === "camera" && !contentState.cameraActive
          ? "none"
          : props.type === "mic" &&
            (contentState.micActive || contentState.pushToTalk)
          ? contentState.defaultAudioInput
          : props.type === "mic" && !contentState.micActive
          ? "none"
          : "none"
      }
      onValueChange={onValueChange}
    >
      <Select.Trigger className="SelectTrigger" aria-label="Food">
        <Select.Icon
          className="SelectIconType"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setOpen(false);
            clickedIcon.current = true;
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setOpen(false);
            clickedIcon.current = true;
          }}
          onMouseUp={(e) => {
            clickedIcon.current = false;
          }}
        >
          <div
            className="SelectIconButton"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              toggleActive(e);
              clickedIcon.current = true;
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setOpen(false);
              clickedIcon.current = true;
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onMouseUp={(e) => {
              clickedIcon.current = false;
            }}
          >
            {props.type == "camera" && (
              <img
                src={
                  contentState.defaultVideoInput === "none" ||
                  !contentState.cameraActive
                    ? CameraOffIcon
                    : CameraOnIcon
                }
              />
            )}
            {props.type == "mic" && (
              <img
                src={
                  contentState.defaultAudioInput === "none" ||
                  !contentState.micActive
                    ? MicOffIcon
                    : MicOnIcon
                }
              />
            )}
          </div>
        </Select.Icon>
        <div className="SelectValue">
          <Select.Value
            placeholder={chrome.i18n.getMessage(
              "selectSourceDropdownPlaceholder"
            )}
          >
            {label}
          </Select.Value>
        </div>
        {props.type == "camera" &&
          (contentState.defaultVideoInput == "none" ||
            !contentState.cameraActive) && (
            <div className="SelectOff">
              {chrome.i18n.getMessage("offLabel")}
            </div>
          )}
        {props.type == "mic" &&
          (contentState.defaultAudioInput == "none" ||
            (!contentState.micActive && !contentState.pushToTalk)) && (
            <div className="SelectOff">
              {chrome.i18n.getMessage("offLabel")}
            </div>
          )}
        <Select.Icon className="SelectIconDrop">
          <img src={DropdownIcon} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal
        container={
          props.shadowRef?.current?.shadowRoot?.querySelector(".container") || document.body
        }
      >
        <Select.Content position="popper" className="SelectContent">
          <Select.ScrollUpButton className="SelectScrollButton"></Select.ScrollUpButton>
          <Select.Viewport className="SelectViewport">
            <Select.Group>
              <SelectItem value="none">
                {props.type == "camera"
                  ? chrome.i18n.getMessage("noCameraDropdownLabel")
                  : chrome.i18n.getMessage("noMicrophoneDropdownLabel")}
              </SelectItem>
            </Select.Group>
            {props.type == "camera" && contentState.videoInput.length > 0 && (
              <Select.Separator className="SelectSeparator" />
            )}
            {props.type == "mic" && contentState.audioInput.length > 0 && (
              <Select.Separator className="SelectSeparator" />
            )}
            <Select.Group>
              {props.type == "camera" &&
                contentState.videoInput.map((device) => (
                  <SelectItem value={device.deviceId} key={device.deviceId}>
                    {device.label}
                  </SelectItem>
                ))}
              {props.type == "mic" &&
                contentState.audioInput.map((device) => (
                  <SelectItem value={device.deviceId} key={device.deviceId}>
                    {device.label}
                  </SelectItem>
                ))}
            </Select.Group>
          </Select.Viewport>
          <Select.ScrollDownButton className="SelectScrollButton"></Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
};

const SelectItem = React.forwardRef(
  ({ children, className, ...props }, forwardedRef) => {
    return (
      <Select.Item className="SelectItem" {...props} ref={forwardedRef}>
        <Select.ItemText>{children}</Select.ItemText>
        <Select.ItemIndicator className="SelectItemIndicator">
          <img src={CheckWhiteIcon} />
        </Select.ItemIndicator>
      </Select.Item>
    );
  }
);

export default Dropdown;
