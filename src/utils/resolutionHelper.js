export async function detectOptimalResolution() {
  try {
    const resolutions = [
      { width: 3840, height: 2160 }, // 4K
      { width: 2560, height: 1440 }, // 2K
      { width: 1920, height: 1080 }, // Full HD
      { width: 1280, height: 720 },  // HD
      { width: 854, height: 480 },   // SD
    ];

    for (const resolution of resolutions) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: resolution.width },
            height: { ideal: resolution.height },
          },
        });
        stream.getTracks().forEach((track) => track.stop());
        return resolution;
      } catch {
        continue;
      }
    }

    return { width: 640, height: 480 }; // Fallback resolution
  } catch (error) {
    console.error("Error detecting optimal resolution:", error);
    return { width: 1280, height: 720 }; // Default fallback
  }
}

/**
 * Detects the optimal resolution for screen capture based on display capabilities
 * @returns {Promise<{width: number, height: number}>} The optimal resolution
 */
export async function detectOptimalScreenResolution() {
  try {
    // Get the screen dimensions
    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;
    
    // Define common recording resolutions
    const resolutions = [
      { width: 3840, height: 2160 }, // 4K
      { width: 2560, height: 1440 }, // 2K
      { width: 1920, height: 1080 }, // Full HD
      { width: 1280, height: 720 },  // HD
      { width: 854, height: 480 },   // SD
    ];
    
    // Find the highest resolution that fits within the screen dimensions
    // We add a buffer to account for UI elements and scaling
    const scaleFactor = window.devicePixelRatio || 1;
    const effectiveWidth = screenWidth * scaleFactor;
    const effectiveHeight = screenHeight * scaleFactor;
    
    // Try to match screen aspect ratio for best results
    const screenAspectRatio = effectiveWidth / effectiveHeight;
    
    for (const resolution of resolutions) {
      // Check if this resolution is supportable on this screen
      if (resolution.width <= effectiveWidth && resolution.height <= effectiveHeight) {
        return resolution;
      }
    }
    
    // If no predefined resolution fits, return a custom one based on the screen
    // Cap at 1080p to prevent performance issues on high-DPI displays
    return {
      width: Math.min(1920, effectiveWidth),
      height: Math.min(1080, effectiveHeight)
    };
  } catch (error) {
    console.error("Error detecting optimal screen resolution:", error);
    return { width: 1280, height: 720 }; // Default to HD as fallback
  }
}
