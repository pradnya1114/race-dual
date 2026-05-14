/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

interface HandControlState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
}

interface HandTrackerProps {
  onControlUpdate: (p1: HandControlState, p2: HandControlState) => void;
}

export default function HandTracker({ onControlUpdate }: HandTrackerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const requestRef = useRef<number | null>(null);

  useEffect(() => {
    async function setupTracker() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        const handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.6,
          minTrackingConfidence: 0.6
        });
        landmarkerRef.current = handLandmarker;
        setIsActive(true);
      } catch (err) {
        console.error("Failed to setup hand tracker:", err);
        setError("Camera/Hand Tracking failed to initialize.");
      }
    }

    setupTracker();

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (landmarkerRef.current) landmarkerRef.current.close();
    };
  }, []);

  useEffect(() => {
    if (!isActive) return;

    async function setupCamera() {
      if (videoRef.current) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 320, height: 240 } 
          });
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          requestRef.current = requestAnimationFrame(predictWebcam);
        } catch (err) {
          setError("Webcam access denied.");
        }
      }
    }

    setupCamera();
  }, [isActive]);

  const predictWebcam = async () => {
    const video = videoRef.current;
    if (!video || !landmarkerRef.current || video.videoWidth === 0 || video.videoHeight === 0 || video.readyState < 2) {
      requestRef.current = requestAnimationFrame(predictWebcam);
      return;
    }

    const startTimeMs = performance.now();
    const results = landmarkerRef.current.detectForVideo(video, startTimeMs);

    const p1Controls: HandControlState = { forward: false, backward: false, left: false, right: false };
    const p2Controls: HandControlState = { forward: false, backward: false, left: false, right: false };

    if (results.landmarks && results.landmarks.length > 0) {
      const handCount = results.landmarks.length;
      // Sort hands by X descending so index 0 is the Screen-Left hand (High camera X)
      const sortedHands = [...results.landmarks].sort((a, b) => b[0].x - a[0].x);

      sortedHands.forEach((landmarks, index) => {
        const wrist = landmarks[0];
        
        // Finger fold logic
        const isFolded = (tipIdx: number, jointIdx: number) => {
            return landmarks[tipIdx].y > landmarks[jointIdx].y;
        };

        const isIndexFolded = isFolded(8, 6);
        const fingersFoldedCount = [
            isIndexFolded,
            isFolded(12, 10),
            isFolded(16, 14),
            isFolded(20, 18)
        ].filter(v => v).length;

        // Gestures
        const isFist = fingersFoldedCount >= 3;
        const isOpen = fingersFoldedCount <= 1;
        const isIndexPointing = !isIndexFolded && (fingersFoldedCount >= 2);
        
        const ctrl = index === 0 ? p1Controls : p2Controls;

        // Index finger or Fist to accelerate
        if (isFist || isIndexPointing) ctrl.forward = true;
        // Open hand to brake
        if (isOpen) ctrl.backward = true;

        // Steering: Intuitive Mirroring
        // If 1 hand: center is 0.5. If 2 hands: centers are 0.75 and 0.25.
        // Screen-Left sector center (higher camera X)
        // Screen-Right sector center (lower camera X)
        let sectorCenter = 0.5;
        if (handCount > 1) {
            sectorCenter = index === 0 ? 0.75 : 0.25;
        }
        
        const deadZone = 0.07; // Slightly tighter deadzone

        // Mirroring: physical left = screen left = higher camera X
        if (wrist.x > sectorCenter + deadZone) ctrl.left = true;
        if (wrist.x < sectorCenter - deadZone) ctrl.right = true;
      });
    }

    onControlUpdate(p1Controls, p2Controls);
    requestRef.current = requestAnimationFrame(predictWebcam);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      <div className="relative w-40 h-30 bg-slate-800 rounded-lg overflow-hidden border-2 border-slate-700 shadow-xl group">
        <video 
          ref={videoRef} 
          className="w-full h-full object-cover scale-x-[-1]" 
          muted 
          playsInline
        />
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-2 text-center text-[10px] text-red-400">
            {error}
          </div>
        )}
        {!isActive && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="w-5 h-5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <div className="absolute bottom-1 right-1 bg-black/60 px-1 rounded text-[8px] text-slate-400 uppercase font-bold">
            Hand Link
        </div>
      </div>
      <div className="bg-slate-800/80 backdrop-blur px-3 py-1 rounded-full text-[10px] font-bold text-slate-300 border border-slate-700 flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
        {isActive ? 'GESTURE CONTROL READY' : 'INIT CAMERA...'}
      </div>
    </div>
  );
}
