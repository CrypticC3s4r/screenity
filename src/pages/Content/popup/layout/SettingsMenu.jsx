// Work in progress - settings for the recording

import React, { useState, useContext, useRef, useEffect } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { MoreIconPopup } from "../../toolbar/components/SVG";

import TooltipWrap from "../components/TooltipWrap";

import { CheckWhiteIcon, DropdownGroup } from "../../images/popup/images";

import JSZip from "jszip";

// Context
import { contentStateContext } from "../../context/ContentState";

const SettingsMenu = (props) => {
  const [contentState, setContentState] = useContext(contentStateContext);
  const [restore, setRestore] = useState(false);
  const [oldChrome, setOldChrome] = useState(false);
  const [openQuality, setOpenQuality] = useState(false);
  const [openResize, setOpenResize] = useState(false);
  const [openFPS, setOpenFPS] = useState(false);
  const [RAM, setRAM] = useState(0);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    // Check chrome version
    const chromeVersion = navigator.userAgent.match(/Chrom(e|ium)\/([0-9]+)\./);
    const MIN_CHROME_VERSION = 110;

    if (chromeVersion && parseInt(chromeVersion[2], 10) < MIN_CHROME_VERSION) {
      setOldChrome(true);
    }
  }, []);

  // Check if user has enough RAM to record for each quality option
  useEffect(() => {
    if (width === 0 || height === 0) return;
    const checkRAM = () => {
      const ram = navigator.deviceMemory;

      // Check if ramValue needs to be updated
      if (
        (ram < 2 || width < 1280 || height < 720) &&
        (contentState.qualityValue === "720p" ||
          contentState.qualityValue === "4k" ||
          contentState.qualityValue === "1080p")
      ) {
        setContentState((prevContentState) => ({
          ...prevContentState,
          qualityValue: "480p",
        }));
        chrome.storage.local.set({
          qualityValue: "480p",
        });
      } else if (
        (ram < 8 || width < 3840 || height < 2160) &&
        contentState.qualityValue === "4k"
      ) {
        setContentState((prevContentState) => ({
          ...prevContentState,
          qualityValue: "720p",
        }));
        chrome.storage.local.set({
          qualityValue: "720p",
        });
      }

      setRAM(ram);
    };
    checkRAM();
  }, [contentState.qualityValue, width, height]);

  const handleTroubleshooting = () => {
    if (typeof contentState.openModal === "function") {
      contentState.openModal(
        chrome.i18n.getMessage("troubleshootModalTitle"),
        chrome.i18n.getMessage("troubleshootModalDescription"),
        chrome.i18n.getMessage("troubleshootModalButton"),
        chrome.i18n.getMessage("sandboxEditorCancelButton"),
        () => {
          // Need to create a file with the original data, any console logs, and system info
          const userAgent = navigator.userAgent;
          let platformInfo = {};
          chrome.runtime
            .sendMessage({ type: "get-platform-info" })
            .then((response) => {
              platformInfo = response;
              const manifestInfo = chrome.runtime.getManifest().version;

              // Now we need to create a file with all of this data
              const data = {
                userAgent: userAgent,
                platformInfo: platformInfo,
                manifestInfo: manifestInfo,
                defaultAudioInput: contentState.defaultAudioInput,
                defaultAudioOutput: contentState.defaultAudioOutput,
                defaultVideoInput: contentState.defaultVideoInput,
                quality: contentState.quality,
                systemAudio: contentState.systemAudio,
                audioInput: contentState.audioInput,
                audioOutput: contentState.audioOutput,
                backgroundEffectsActive: contentState.backgroundEffectsActive,
                recording: contentState.recording,
                recordingType: contentState.recordingType,
                askForPermissions: contentState.askForPermissions,
                cameraPermission: contentState.cameraPermission,
                microphonePermission: contentState.microphonePermission,
                askMicrophone: contentState.askMicrophone,
                cursorMode: contentState.cursorMode,
                zoomEnabled: contentState.zoomEnabled,
                offscreenRecording: contentState.offscreenRecording,
                updateChrome: contentState.updateChrome,
                permissionsChecked: contentState.permissionsChecked,
                permissionsLoaded: contentState.permissionsLoaded,
                hideUI: contentState.hideUI,
                alarm: contentState.alarm,
                alarmTime: contentState.alarmTime,
                surface: contentState.surface,
                blurMode: contentState.blurMode,
                //contentState: contentStateData,
              };
              // Create a zip file with the original recording and the data
              const zip = new JSZip();
              zip.file("troubleshooting.json", JSON.stringify(data));
              zip.generateAsync({ type: "blob" }).then(function (blob) {
                const url = window.URL.createObjectURL(blob);

                // Download file
                const a = document.createElement("a");
                a.href = url;
                a.download = "screenity-troubleshooting.zip";
                a.click();
                window.URL.revokeObjectURL(url);

                chrome.runtime.sendMessage({
                  type: "indexed-db-download",
                });
              });
            });
        },
        () => {}
      );
    }
  };

  useEffect(() => {
    setWidth(Math.round(window.screen.width * window.devicePixelRatio));
    setHeight(Math.round(window.screen.height * window.devicePixelRatio));
  }, []);

  // Function to determine optimal resolution based on screen and RAM
  const determineOptimalResolution = () => {
    if (width === 0 || height === 0) return "1080p";
    
    const ram = navigator.deviceMemory || 4; // Default to 4GB if not available
    
    console.log("DEBUG - Screen resolution detection:");
    console.log(`Screen dimensions: ${width}x${height} (with pixel ratio: ${window.devicePixelRatio})`);
    console.log(`Raw screen dimensions: ${window.screen.width}x${window.screen.height}`);
    console.log(`Available RAM: ${ram}GB`);
    
    // Check hardware capabilities and select appropriate resolution
    if (ram >= 8 && width >= 3840 && height >= 2160) {
      console.log("Selected resolution: 4k (based on 4K display capabilities)");
      return "4k";
    } else if (ram >= 6 && width >= 2560 && height >= 1440) {
      console.log("Selected resolution: 2k (based on 2K display capabilities)");
      return "2k";
    } else if (ram >= 4 && width >= 1920 && height >= 1080) {
      console.log("Selected resolution: 1080p (based on FHD display capabilities)");
      return "1080p";
    } else if (ram >= 2 && width >= 1280 && height >= 720) {
      console.log("Selected resolution: 720p (based on HD display capabilities)");
      return "720p";
    } else if (width >= 854 && height >= 480) {
      console.log("Selected resolution: 480p (based on limited display capabilities)");
      return "480p";
    } else if (width >= 640 && height >= 360) {
      console.log("Selected resolution: 360p (based on minimal display capabilities)");
      return "360p";
    } else {
      console.log("Selected resolution: 240p (fallback for very small displays)");
      return "240p";
    }
  };

  // Fix screen resolution detection
  useEffect(() => {
    // Get the actual screen dimensions, not just the window dimensions
    const actualWidth = Math.round(window.screen.width * window.devicePixelRatio);
    const actualHeight = Math.round(window.screen.height * window.devicePixelRatio);
    
    console.log(`Setting screen dimensions to: ${actualWidth}x${actualHeight}`);
    
    setWidth(actualWidth);
    setHeight(actualHeight);
  }, []);

  // Update contentState with stored quality value when component mounts
  useEffect(() => {
    chrome.storage.local.get(["qualityValue"], (result) => {
      if (result.qualityValue) {
        console.log(`Initializing UI with stored resolution: ${result.qualityValue}`);
        setContentState((prevContentState) => ({
          ...prevContentState,
          qualityValue: result.qualityValue,
        }));
      }
    });
  }, []);

  // Initialize resolution automatically when the component first loads
  useEffect(() => {
    if (width === 0 || height === 0) return;
    
    try {
      // Force determine the optimal resolution for debugging purposes
      const debugOptimalRes = determineOptimalResolution();
      console.log(`Debug: Optimal resolution would be: ${debugOptimalRes}`);
      
      // Check if the current resolution makes sense for this display
      const currentRes = contentState.qualityValue;
      console.log(`Current resolution setting: ${currentRes}`);
      
      // Get the resolution from storage
      chrome.storage.local.get(["qualityValue", "autoResolutionChecked"], (result) => {
        console.log(`Storage resolution: ${result.qualityValue}`);
        console.log(`Auto resolution checked before: ${result.autoResolutionChecked}`);
        
        // If resolution isn't set or we haven't done auto check yet, set optimal resolution
        if (!result.qualityValue || !result.autoResolutionChecked) {
          const optimalRes = determineOptimalResolution();
          console.log(`Setting optimal resolution: ${optimalRes}`);
          
          // Update both local state and storage
          setContentState((prevContentState) => ({
            ...prevContentState,
            qualityValue: optimalRes,
          }));
          
          chrome.storage.local.set({
            qualityValue: optimalRes,
            autoResolutionChecked: true
          });
        } else {
          console.log(`Using user-selected resolution: ${result.qualityValue}`);
          
          // If screen resolution has increased significantly, suggest a better option
          if (result.qualityValue === "480p" && width >= 2560 && height >= 1440) {
            console.log("Display is capable of 2K resolution but using 480p!");
            
            // Update to better resolution
            const optimalRes = determineOptimalResolution();
            console.log(`Updating to better resolution: ${optimalRes}`);
            
            // Update both local state and storage
            setContentState((prevContentState) => ({
              ...prevContentState,
              qualityValue: optimalRes,
            }));
            
            chrome.storage.local.set({
              qualityValue: optimalRes,
              autoResolutionChecked: true
            });
          }
          
          // Ensure UI reflects the stored value even if not changing it
          if (currentRes !== result.qualityValue) {
            console.log(`Syncing UI state with storage value: ${result.qualityValue}`);
            setContentState((prevContentState) => ({
              ...prevContentState,
              qualityValue: result.qualityValue,
            }));
          }
        }
      });
    } catch (error) {
      console.error("Error determining resolution:", error);
    }
  }, [width, height]);

  // Add a debug function to manually reset UI to match storage
  const resyncUIWithStorage = () => {
    chrome.storage.local.get(["qualityValue"], (result) => {
      if (result.qualityValue) {
        console.log(`Manually resyncing UI with storage value: ${result.qualityValue}`);
        setContentState((prevContentState) => ({
          ...prevContentState,
          qualityValue: result.qualityValue,
        }));
      }
    });
  };

  // Call this function once when component mounts to ensure UI is correct
  useEffect(() => {
    // Add a small delay to ensure storage has been updated
    const timer = setTimeout(() => {
      resyncUIWithStorage();
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);

  return (
    <DropdownMenu.Root
      open={props.open}
      onOpenChange={(open) => {
        props.setOpen(open);

        chrome.runtime
          .sendMessage({ type: "check-restore" })
          .then((response) => {
            setRestore(response.restore);
          });
      }}
    >
      <DropdownMenu.Trigger asChild>
        <button className="IconButton" aria-label="Customise options">
          <MoreIconPopup />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal
        container={props.shadowRef.current.shadowRoot.querySelector(
          ".container"
        )}
      >
        <DropdownMenu.Content className="DropdownMenuContent" sideOffset={5}>
          <DropdownMenu.Sub
            open={openResize}
            onOpenChange={(open) => {
              if (open) {
                setOpenFPS(false);
                setOpenQuality(false);
              }
              setOpenResize(open);
            }}
          >
            <DropdownMenu.SubTrigger className="DropdownMenuItem">
              {chrome.i18n.getMessage("resizeWindowLabel")}
              <div className="ItemIndicatorArrow">
                <img src={DropdownGroup} />
              </div>
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                className="ScreenityDropdownMenuContent"
                sideOffset={0}
                alignOffset={-3}
              >
                <TooltipWrap
                  content={
                    width < 3840 || height < 2160
                      ? chrome.i18n.getMessage("screenTooSmallTooltip")
                      : ""
                  }
                >
                  <DropdownMenu.Item
                    className="ScreenityDropdownMenuItem"
                    onClick={(e) => {
                      chrome.runtime.sendMessage({
                        type: "resize-window",
                        width: 3840,
                        height: 2160,
                      });
                    }}
                    disabled={width < 3840 || height < 2160}
                  >
                    3840 x 2160 (4k)
                  </DropdownMenu.Item>
                </TooltipWrap>
                <TooltipWrap
                  content={
                    width < 2560 || height < 1440
                      ? chrome.i18n.getMessage("screenTooSmallTooltip")
                      : ""
                  }
                >
                  <DropdownMenu.Item
                    className="ScreenityDropdownMenuItem"
                    onClick={(e) => {
                      chrome.runtime.sendMessage({
                        type: "resize-window",
                        width: 2560,
                        height: 1440,
                      });
                    }}
                    disabled={width < 2560 || height < 1440}
                  >
                    2560 x 1440 (2k)
                  </DropdownMenu.Item>
                </TooltipWrap>
                <TooltipWrap
                  content={
                    width < 1920 || height < 1080
                      ? chrome.i18n.getMessage("screenTooSmallTooltip")
                      : ""
                  }
                >
                  <DropdownMenu.Item
                    className="ScreenityDropdownMenuItem"
                    onClick={(e) => {
                      chrome.runtime.sendMessage({
                        type: "resize-window",
                        width: 1920,
                        height: 1080,
                      });
                    }}
                    disabled={width < 1920 || height < 1080}
                  >
                    1920 x 1080 (1080p)
                  </DropdownMenu.Item>
                </TooltipWrap>
                <TooltipWrap
                  content={
                    width < 1280 || height < 720
                      ? chrome.i18n.getMessage("screenTooSmallTooltip")
                      : ""
                  }
                >
                  <DropdownMenu.Item
                    className="ScreenityDropdownMenuItem"
                    onClick={(e) => {
                      chrome.runtime.sendMessage({
                        type: "resize-window",
                        width: 1280,
                        height: 720,
                      });
                    }}
                    disabled={width < 1280 || height < 720}
                  >
                    1280 x 720 (720p)
                  </DropdownMenu.Item>
                </TooltipWrap>
                <TooltipWrap
                  content={
                    width < 640 || height < 480
                      ? chrome.i18n.getMessage("screenTooSmallTooltip")
                      : ""
                  }
                >
                  <DropdownMenu.Item
                    className="ScreenityDropdownMenuItem"
                    onClick={(e) => {
                      chrome.runtime.sendMessage({
                        type: "resize-window",
                        width: 640,
                        height: 480,
                      });
                    }}
                    disabled={width < 640 || height < 480}
                  >
                    640 x 480 (480p)
                  </DropdownMenu.Item>
                </TooltipWrap>
                <TooltipWrap
                  content={
                    width < 480 || height < 360
                      ? chrome.i18n.getMessage("screenTooSmallTooltip")
                      : ""
                  }
                >
                  <DropdownMenu.Item
                    className="ScreenityDropdownMenuItem"
                    onClick={(e) => {
                      chrome.runtime.sendMessage({
                        type: "resize-window",
                        width: 480,
                        height: 360,
                      });
                    }}
                    disabled={width < 480 || height < 360}
                  >
                    480 x 360 (360p)
                  </DropdownMenu.Item>
                </TooltipWrap>
                <TooltipWrap
                  content={
                    width < 320 || height < 240
                      ? chrome.i18n.getMessage("screenTooSmallTooltip")
                      : ""
                  }
                >
                  <DropdownMenu.Item
                    className="ScreenityDropdownMenuItem"
                    onClick={(e) => {
                      chrome.runtime.sendMessage({
                        type: "resize-window",
                        width: 320,
                        height: 240,
                      });
                    }}
                    disabled={width < 320 || height < 240}
                  >
                    320 x 240 (240p)
                  </DropdownMenu.Item>
                </TooltipWrap>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          <DropdownMenu.Sub
            open={openQuality}
            onOpenChange={(open) => {
              if (open) {
                setOpenFPS(false);
                setOpenResize(false);
              }
              setOpenQuality(open);
            }}
          >
            <DropdownMenu.SubTrigger className="DropdownMenuItem">
              {chrome.i18n.getMessage("maxResolutionLabel") +
                " (" +
                contentState.qualityValue +
                ")"}
              <div className="ItemIndicatorArrow">
                <img src={DropdownGroup} />
              </div>
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                className="ScreenityDropdownMenuContent"
                sideOffset={0}
                alignOffset={-3}
              >
                <DropdownMenu.RadioGroup
                  value={contentState.qualityValue}
                  onValueChange={(value) => {
                    console.log(`User selected resolution: ${value}`);
                    setContentState((prevContentState) => ({
                      ...prevContentState,
                      qualityValue: value,
                    }));
                    chrome.storage.local.set({
                      qualityValue: value,
                      autoResolutionChecked: true, // User has now explicitly set a resolution
                    });
                  }}
                >
                  {/* Auto option removed - automatic resolution is now handled by determineOptimalResolution() */}
                  <TooltipWrap
                    content={
                      RAM < 8 || width < 3840 || height < 2160
                        ? chrome.i18n.getMessage("maxResolutionTooltip")
                        : ""
                    }
                  >
                    <DropdownMenu.RadioItem
                      className="ScreenityDropdownMenuItem"
                      value="4k"
                      disabled={RAM < 8 || width < 3840 || height < 2160}
                    >
                      4k
                      <DropdownMenu.ItemIndicator className="ScreenityItemIndicator">
                        <img src={CheckWhiteIcon} />
                      </DropdownMenu.ItemIndicator>
                    </DropdownMenu.RadioItem>
                  </TooltipWrap>
                  <TooltipWrap
                    content={
                      RAM < 6 || width < 2560 || height < 1440
                        ? chrome.i18n.getMessage("maxResolutionTooltip")
                        : ""
                    }
                  >
                    <DropdownMenu.RadioItem
                      className="ScreenityDropdownMenuItem"
                      value="2k"
                      disabled={RAM < 6 || width < 2560 || height < 1440}
                    >
                      2k
                      <DropdownMenu.ItemIndicator className="ScreenityItemIndicator">
                        <img src={CheckWhiteIcon} />
                      </DropdownMenu.ItemIndicator>
                    </DropdownMenu.RadioItem>
                  </TooltipWrap>
                  <TooltipWrap
                    content={
                      RAM < 4 || width < 1920 || height < 1080
                        ? chrome.i18n.getMessage("maxResolutionTooltip")
                        : ""
                    }
                  >
                    <DropdownMenu.RadioItem
                      className="ScreenityDropdownMenuItem"
                      value="1080p"
                      disabled={RAM < 4 || width < 1920 || height < 1080}
                    >
                      1080p
                      <DropdownMenu.ItemIndicator className="ScreenityItemIndicator">
                        <img src={CheckWhiteIcon} />
                      </DropdownMenu.ItemIndicator>
                    </DropdownMenu.RadioItem>
                  </TooltipWrap>
                  <TooltipWrap
                    content={
                      RAM < 2 || width < 1280 || height < 720
                        ? chrome.i18n.getMessage("maxResolutionTooltip")
                        : ""
                    }
                  >
                    <DropdownMenu.RadioItem
                      className="ScreenityDropdownMenuItem"
                      value="720p"
                      disabled={RAM < 2 || width < 1280 || height < 720}
                    >
                      720p
                      <DropdownMenu.ItemIndicator className="ScreenityItemIndicator">
                        <img src={CheckWhiteIcon} />
                      </DropdownMenu.ItemIndicator>
                    </DropdownMenu.RadioItem>
                  </TooltipWrap>
                  <DropdownMenu.RadioItem
                    className="ScreenityDropdownMenuItem"
                    value="480p"
                  >
                    480p
                    <DropdownMenu.ItemIndicator className="ScreenityItemIndicator">
                      <img src={CheckWhiteIcon} />
                    </DropdownMenu.ItemIndicator>
                  </DropdownMenu.RadioItem>
                  <DropdownMenu.RadioItem
                    className="ScreenityDropdownMenuItem"
                    value="360p"
                  >
                    360p
                    <DropdownMenu.ItemIndicator className="ScreenityItemIndicator">
                      <img src={CheckWhiteIcon} />
                    </DropdownMenu.ItemIndicator>
                  </DropdownMenu.RadioItem>
                  <DropdownMenu.RadioItem
                    className="ScreenityDropdownMenuItem"
                    value="240p"
                  >
                    240p
                    <DropdownMenu.ItemIndicator className="ScreenityItemIndicator">
                      <img src={CheckWhiteIcon} />
                    </DropdownMenu.ItemIndicator>
                  </DropdownMenu.RadioItem>
                </DropdownMenu.RadioGroup>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          {/*
          <DropdownMenu.Sub
            open={openFPS}
            onOpenChange={(open) => {
              if (open) {
                setOpenQuality(false);
              }
              setOpenFPS(open);
            }}
          >
            <DropdownMenu.SubTrigger className="DropdownMenuItem">
              {chrome.i18n.getMessage("maxFPSLabel") +
                " (" +
                contentState.fpsValue +
                ")"}
              <div className="ItemIndicatorArrow">
                <img src={DropdownGroup} />
              </div>
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                className="ScreenityDropdownMenuContent"
                sideOffset={0}
                alignOffset={-3}
              >
                <DropdownMenu.RadioGroup
                  value={contentState.fpsValue}
                  onValueChange={(value) => {
                    setContentState((prevContentState) => ({
                      ...prevContentState,
                      fpsValue: value,
                    }));
                    chrome.storage.local.set({
                      fpsValue: value,
                    });
                  }}
                >
                  <DropdownMenu.RadioItem
                    className="ScreenityDropdownMenuItem"
                    value="60"
                  >
                    60
                    <DropdownMenu.ItemIndicator className="ScreenityItemIndicator">
                      <img src={CheckWhiteIcon} />
                    </DropdownMenu.ItemIndicator>
                  </DropdownMenu.RadioItem>
                  <DropdownMenu.RadioItem
                    className="ScreenityDropdownMenuItem"
                    value="30"
                  >
                    30
                    <DropdownMenu.ItemIndicator className="ScreenityItemIndicator">
                      <img src={CheckWhiteIcon} />
                    </DropdownMenu.ItemIndicator>
                  </DropdownMenu.RadioItem>
                  <DropdownMenu.RadioItem
                    className="ScreenityDropdownMenuItem"
                    value="24"
                  >
                    24
                    <DropdownMenu.ItemIndicator className="ScreenityItemIndicator">
                      <img src={CheckWhiteIcon} />
                    </DropdownMenu.ItemIndicator>
                  </DropdownMenu.RadioItem>
                  <DropdownMenu.RadioItem
                    className="ScreenityDropdownMenuItem"
                    value="10"
                  >
                    10
                    <DropdownMenu.ItemIndicator className="ScreenityItemIndicator">
                      <img src={CheckWhiteIcon} />
                    </DropdownMenu.ItemIndicator>
                  </DropdownMenu.RadioItem>
                  <DropdownMenu.RadioItem
                    className="ScreenityDropdownMenuItem"
                    value="5"
                  >
                    5
                    <DropdownMenu.ItemIndicator className="ScreenityItemIndicator">
                      <img src={CheckWhiteIcon} />
                    </DropdownMenu.ItemIndicator>
                  </DropdownMenu.RadioItem>
                  <DropdownMenu.RadioItem
                    className="ScreenityDropdownMenuItem"
                    value="1"
                  >
                    1
                    <DropdownMenu.ItemIndicator className="ScreenityItemIndicator">
                      <img src={CheckWhiteIcon} />
                    </DropdownMenu.ItemIndicator>
                  </DropdownMenu.RadioItem>
                </DropdownMenu.RadioGroup>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
					*/}
          <DropdownMenu.CheckboxItem
            className="DropdownMenuItem"
            onSelect={(e) => {
              e.preventDefault();
            }}
            onCheckedChange={(checked) => {
              setContentState((prevContentState) => ({
                ...prevContentState,
                systemAudio: checked,
              }));
              chrome.storage.local.set({
                systemAudio: checked,
              });
            }}
            checked={contentState.systemAudio}
          >
            {chrome.i18n.getMessage("systemAudioLabel")}
            <DropdownMenu.ItemIndicator className="ItemIndicator">
              <img src={CheckWhiteIcon} />
            </DropdownMenu.ItemIndicator>
          </DropdownMenu.CheckboxItem>
          {!oldChrome && (
            <DropdownMenu.CheckboxItem
              className="DropdownMenuItem"
              onSelect={(e) => {
                e.preventDefault();
              }}
              onCheckedChange={(checked) => {
                if (!checked) {
                  chrome.runtime.sendMessage({ type: "close-backup-tab" });
                }
                setContentState((prevContentState) => ({
                  ...prevContentState,
                  backup: checked,
                  backupSetup: false,
                }));
                chrome.storage.local.set({
                  backup: checked,
                  backupSetup: false,
                });
              }}
              checked={contentState.backup}
            >
              {chrome.i18n.getMessage("backupsToggle")}
              <DropdownMenu.ItemIndicator className="ItemIndicator">
                <img src={CheckWhiteIcon} />
              </DropdownMenu.ItemIndicator>
            </DropdownMenu.CheckboxItem>
          )}
          <DropdownMenu.Item
            className="DropdownMenuItem"
            onSelect={(e) => {
              e.preventDefault();
              chrome.runtime.sendMessage({ type: "restore-recording" });
            }}
            disabled={!restore}
          >
            {chrome.i18n.getMessage("restoreRecording")}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="DropdownMenuItem"
            onSelect={(e) => {
              e.preventDefault();
              handleTroubleshooting();
            }}
          >
            {chrome.i18n.getMessage("downloadForTroubleshootingOption")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};

export default SettingsMenu;
