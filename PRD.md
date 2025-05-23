# Screenity Camera Functionality - Product Requirements Document (PRD)

## 1. Overview

This document outlines the functional requirements for the camera integration within the Screenity Chrome Extension. The goal is to provide a seamless and reliable camera preview experience during screen recording setup and potentially during recording (Picture-in-Picture).

## 2. Core Features

### 2.1. Camera Selection & Preview

*   **Device Enumeration:** The extension must detect and list all available video input devices (cameras) connected to the user's system.
*   **Dropdown Menu:** A dropdown menu shall be presented to the user (e.g., in the extension popup or a dedicated setup page like `playground.html`) listing:
    *   All detected camera devices by their user-friendly labels (e.g., "Integrated Webcam", "Logitech C920").
    *   An option to explicitly turn the camera **"Off"**.
*   **Live Preview:** When a camera is selected from the dropdown, a live preview from that camera should be displayed in the designated preview area (`camera.html`).
*   **Turning Off:** Selecting "Off" from the dropdown must completely stop the current camera stream and clear the preview area. No camera device should be active or held by the extension.
*   **Default Selection:** The extension should remember the user's last selected camera (or the "Off" state) and automatically select it the next time the camera selection UI is opened within the same browser session or profile. On first use or if the last selected device is unavailable, a sensible default (e.g., the system default camera or the first available camera) should be chosen.

### 2.2. Camera State Management

*   **Reliable Switching:** Switching between different cameras in the dropdown, including switching to "Off" and back to a camera, must be reliable. This involves:
    *   Gracefully stopping the stream of the currently active camera.
    *   Allowing sufficient time for the hardware resource to be released by the system.
    *   Acquiring and starting the stream of the newly selected camera.
    *   Handling potential errors during stream acquisition (e.g., device busy, hardware error) gracefully, ideally by reverting to the "Off" state and providing user feedback if possible.
*   **Persistence:** The selected camera state (specific device ID or "Off") should persist across browser sessions for the user's profile using `chrome.storage.local`.
*   **Cross-Tab Consistency (Initialisation):** When the camera preview component (`camera.html`) loads (e.g., in the playground or potentially a PiP window), it should initialize using the persisted camera state from `chrome.storage.local`. If a specific camera was active, it should attempt to activate that same camera using its label or device ID for consistency.
*   **Cross-Tab Deactivation (Optional/Background):** When the user switches tabs or windows during recording setup, the background script may manage deactivating the camera in inactive tabs to prevent resource conflicts, although the primary control should be via the user's explicit selection.

### 2.3. Picture-in-Picture (PiP)

*   **Integration:** The camera preview element should support the standard browser Picture-in-Picture API.
*   **Activation/Deactivation:** Entering or leaving PiP mode should not disrupt the underlying camera stream selection. The same selected camera stream should continue playing in the PiP window or the original preview area.

## 3. Error Handling & Edge Cases

*   **Device Unavailable:** If the previously selected camera is disconnected or unavailable upon initialization, the extension should ideally fall back to a default camera or the "Off" state and update the dropdown accordingly.
*   **Permissions:** The extension must handle cases where camera permissions are denied or revoked. The UI should reflect the lack of permission.
*   **Device Busy/Error:** If acquiring a selected camera stream fails (e.g., `NotReadableError`, `OverconstrainedError`), the preview should revert to an "Off" or error state, and the error should be logged to the console. The system should not get stuck trying to access the failed device repeatedly.

## 4. Non-Goals (for this iteration)

*   Virtual background effects are handled separately.
*   Advanced camera controls (resolution, frame rate, zoom, pan, tilt) beyond basic device selection.
*   Simultaneous streaming from multiple cameras.

This document provides a baseline. Specific implementation details may evolve. 