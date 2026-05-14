/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { socket } from '../services/socket';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Environment, Text, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Player } from '../types';

const TRACK_WIDTH = 1200;
const TRACK_HEIGHT = 850;

// Car physics constants
const ACCELERATION = 0.06;
const MAX_SPEED = 2.4;
const NITRO_SPEED = 4.125;
const NITRO_ACCEL = 0.12;
const FRICTION = 0.97;
const TURN_SPEED = 0.035;
const DRIFT_FACTOR = 0.94;

// Track Geometry
const TRACK_RADIUS = 50; // Slightly narrower for more technical turns
const TRACK_SEGMENTS = [
    { start: {x: 150, y: 500}, end: {x: 450, y: 500}, angle: 0 },
    { start: {x: 450, y: 500}, end: {x: 450, y: 300}, angle: -Math.PI/2 },
    { start: {x: 450, y: 300}, end: {x: 300, y: 300}, angle: Math.PI },
    { start: {x: 300, y: 300}, end: {x: 300, y: 100}, angle: -Math.PI/2 },
    { start: {x: 300, y: 100}, end: {x: 750, y: 100}, angle: 0 },
    { start: {x: 750, y: 100}, end: {x: 750, y: 400}, angle: Math.PI/2 },
    { start: {x: 750, y: 400}, end: {x: 600, y: 400}, angle: Math.PI },
    { start: {x: 600, y: 400}, end: {x: 600, y: 600}, angle: Math.PI/2 },
    { start: {x: 600, y: 600}, end: {x: 950, y: 600}, angle: 0 },
    { start: {x: 950, y: 600}, end: {x: 950, y: 150}, angle: -Math.PI/2 },
    { start: {x: 950, y: 150}, end: {x: 1100, y: 150}, angle: 0 },
    { start: {x: 1100, y: 150}, end: {x: 1100, y: 750}, angle: Math.PI/2 },
    { start: {x: 1100, y: 750}, end: {x: 150, y: 750}, angle: Math.PI },
    { start: {x: 150, y: 750}, end: {x: 150, y: 500}, angle: -Math.PI/2 }
];

// Math helpers for collision
function getClosestPointOnSegment(p: {x: number, y: number}, v: {x: number, y: number}, w: {x: number, y: number}) {
  const l2 = (v.x - w.x)**2 + (v.y - w.y)**2;
  if (l2 === 0) return v;
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
}

function distToSegmentSquared(p: {x: number, y: number}, v: {x: number, y: number}, w: {x: number, y: number}) {
  const l2 = (v.x - w.x)**2 + (v.y - w.y)**2;
  if (l2 === 0) return (p.x - v.x)**2 + (p.y - v.y)**2;
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return (p.x - (v.x + t * (w.x - v.x)))**2 + (p.y - (v.y + t * (w.y - v.y)))**2;
}

function distToSegment(p: {x: number, y: number}, v: {x: number, y: number}, w: {x: number, y: number}) {
  return Math.sqrt(distToSegmentSquared(p, v, w));
}

const isPointOnTrackMath = (x: number, y: number, buffer: number = 0): boolean => {
  const p = {x, y};
  let minDist = Infinity;
  
  for (const seg of TRACK_SEGMENTS) {
    const d = distToSegment(p, seg.start, seg.end);
    if (d < minDist) minDist = d;
  }

  return minDist <= (TRACK_RADIUS + buffer);
};

// 3D Components
const CarModel = ({ color, isLocal, drifting }: { color: string, isLocal?: boolean, drifting?: boolean }) => {
  return (
    <group scale={[2, 2, 2]}>
      {/* Body */}
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[2, 1, 4]} />
        <meshStandardMaterial color={color} metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Cabin */}
      <mesh position={[0, 1.2, -0.5]} castShadow>
        <boxGeometry args={[1.8, 0.8, 2]} />
        <meshStandardMaterial color="#333" />
      </mesh>
      {/* Wheels */}
      <mesh position={[1.1, 0.4, 1.2]} rotation={[0, 0, Math.PI/2]}>
        <cylinderGeometry args={[0.4, 0.4, 0.4, 16]} />
        <meshStandardMaterial color="black" />
      </mesh>
      <mesh position={[-1.1, 0.4, 1.2]} rotation={[0, 0, Math.PI/2]}>
        <cylinderGeometry args={[0.4, 0.4, 0.4, 16]} />
        <meshStandardMaterial color="black" />
      </mesh>
      <mesh position={[1.1, 0.4, -1.2]} rotation={[0, 0, Math.PI/2]}>
        <cylinderGeometry args={[0.4, 0.4, 0.4, 16]} />
        <meshStandardMaterial color="black" />
      </mesh>
      <mesh position={[-1.1, 0.4, -1.2]} rotation={[0, 0, Math.PI/2]}>
        <cylinderGeometry args={[0.4, 0.4, 0.4, 16]} />
        <meshStandardMaterial color="black" />
      </mesh>
      {/* Headlights */}
      <mesh position={[0.6, 0.6, 2.05]}>
        <boxGeometry args={[0.5, 0.2, 0.1]} />
        <meshStandardMaterial color="yellow" emissive="yellow" emissiveIntensity={2} />
      </mesh>
      <mesh position={[-0.6, 0.6, 2.05]}>
        <boxGeometry args={[0.5, 0.2, 0.1]} />
        <meshStandardMaterial color="yellow" emissive="yellow" emissiveIntensity={2} />
      </mesh>
      {/* Taillights */}
      <mesh position={[0.6, 0.6, -2.05]}>
        <boxGeometry args={[0.5, 0.2, 0.1]} />
        <meshStandardMaterial color="red" emissive="red" emissiveIntensity={1} />
      </mesh>
      <mesh position={[-0.6, 0.6, -2.05]}>
        <boxGeometry args={[0.5, 0.2, 0.1]} />
        <meshStandardMaterial color="red" emissive="red" emissiveIntensity={1} />
      </mesh>
      
      {/* Drift Smoke Particles (Simple visual representation attached to car) */}
      {drifting && (
        <>
          <mesh position={[1.2, 0.2, -1.5]}>
             <sphereGeometry args={[0.3, 8, 8]} />
             <meshBasicMaterial color="#aaa" transparent opacity={0.6} />
          </mesh>
          <mesh position={[-1.2, 0.2, -1.5]}>
             <sphereGeometry args={[0.3, 8, 8]} />
             <meshBasicMaterial color="#aaa" transparent opacity={0.6} />
          </mesh>
        </>
      )}

      {isLocal && (
        <pointLight position={[0, 2, 4]} intensity={10} distance={20} color="white" />
      )}
    </group>
  );
};

const Tree = ({ position, scale = 1 }: { position: [number, number, number], scale?: number }) => {
  return (
    <group position={position} scale={scale}>
      {/* Trunk */}
      <mesh position={[0, 3, 0]} castShadow>
        <cylinderGeometry args={[0.6, 0.8, 6, 8]} />
        <meshStandardMaterial color="#4d2926" />
      </mesh>
      {/* Leaves */}
      <mesh position={[0, 9, 0]} castShadow>
        <coneGeometry args={[4, 10, 8]} />
        <meshStandardMaterial color="#2d5a27" />
      </mesh>
      <mesh position={[0, 13, 0]} castShadow>
        <coneGeometry args={[3, 7, 8]} />
        <meshStandardMaterial color="#3a7532" />
      </mesh>
    </group>
  );
};

const Rock = ({ position, scale = 1 }: { position: [number, number, number], scale?: number }) => {
  return (
    <mesh position={position} scale={scale} castShadow receiveShadow>
      <dodecahedronGeometry args={[1.5, 0]} />
      <meshStandardMaterial color="#666" roughness={0.9} />
    </mesh>
  );
};

const TrackMesh = () => {
  const segments = useMemo(() => {
    return TRACK_SEGMENTS.map((seg, i) => {
      const dx = seg.end.x - seg.start.x;
      const dy = seg.end.y - seg.start.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const centerX = (seg.start.x + seg.end.x) / 2;
      const centerY = (seg.start.y + seg.end.y) / 2;
      return { length, angle, centerX, centerY, id: i };
    });
  }, []);

  const corners = useMemo(() => {
    return TRACK_SEGMENTS.map((seg) => seg.start);
  }, []);

  return (
    <group rotation={[-Math.PI / 2, 0, 0]} scale={[1, -1, 1]}>
      {/* Grass/Off-track */}
      <mesh position={[TRACK_WIDTH/2, TRACK_HEIGHT/2, -0.1]} receiveShadow>
        <planeGeometry args={[3000, 3000]} />
        <meshStandardMaterial color="#1a472a" roughness={1} />
      </mesh>
      
      {/* Track Segments */}
      {segments.map((seg) => (
        <mesh key={seg.id} position={[seg.centerX, seg.centerY, 0.1]} rotation={[0, 0, seg.angle]} receiveShadow>
          <planeGeometry args={[seg.length, TRACK_RADIUS * 2]} />
          <meshStandardMaterial color="#333" roughness={0.8} />
        </mesh>
      ))}

      {/* Smooth Corners */}
      {corners.map((pos, i) => (
        <mesh key={i} position={[pos.x, pos.y, 0.1]} receiveShadow>
          <circleGeometry args={[TRACK_RADIUS, 32]} />
          <meshStandardMaterial color="#333" roughness={0.8} />
        </mesh>
      ))}
      
      {/* Start Line */}
      <mesh position={[625, 750, 0.11]} rotation={[0, 0, 0]}>
        <planeGeometry args={[10, TRACK_RADIUS * 2]} />
        <meshStandardMaterial color="white" />
      </mesh>
    </group>
  );
};

const GameScene = ({ 
  localPlayerRef, 
  players, 
  myId 
}: { 
  localPlayerRef: React.MutableRefObject<any>, 
  players: Record<string, Player>, 
  myId: string | null 
}) => {
  const { camera } = useThree();
  const carRef = useRef<THREE.Group>(null);

  const decorations = useMemo(() => {
    const items: { type: 'tree' | 'rock', pos: [number, number, number], scale: number }[] = [];
    const count = 350; // Increased for better density
    const seed = 42;
    const rng = (s: number) => {
        const x = Math.sin(s) * 10000;
        return x - Math.floor(x);
    };
    let s = seed;

    for (let i = 0; i < count; i++) {
      // Area large enough to fill the new draw distance
      const x = rng(s++) * 2400 - 800; 
      const z = rng(s++) * 2200 - 800;
      
      // Check if on track using the math helper with a buffer to account for decoration size
      if (!isPointOnTrackMath(x, z, 20)) {
        const type = rng(s++) > 0.4 ? 'tree' : 'rock';
        const scale = type === 'tree' ? 2.5 + rng(s++) * 3.5 : 3 + rng(s++) * 5;
        items.push({ type, pos: [x, 0, z], scale });
      }
    }
    return items;
  }, []);
  
  useFrame((state, delta) => {
    if (localPlayerRef.current && carRef.current) {
      const p = localPlayerRef.current;
      
      // Map 2D (x, y) to 3D (x, 0, z)
      carRef.current.position.set(p.x, 0, p.y);
      
      // Rotation: 2D angle 0 is Right (+X). 3D Box faces +Z.
      // We need to rotate Y.
      // If angle=0, we want car to face +X.
      // Box faces +Z. Rotate Y by +PI/2 faces +X.
      // 2D angle increases clockwise (screen Y down).
      // 3D Y-rotation increases counter-clockwise.
      // So rotation = -angle + PI/2.
      carRef.current.rotation.y = -p.angle + Math.PI/2; 

      // Camera Follow
      const dist = 40;
      const height = 20;
      const angle = p.angle;
      
      // Camera behind car
      // 2D velocity vector is (cos(angle), sin(angle))
      // Camera should be at p - velocity * dist
      const targetCamX = p.x - Math.cos(angle) * dist;
      const targetCamZ = p.y - Math.sin(angle) * dist;
      
      // Smooth camera
      camera.position.lerp(new THREE.Vector3(targetCamX, height, targetCamZ), 0.1);
      camera.lookAt(p.x, 0, p.y);
    }
  });

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight 
        position={[600, 300, 425]} 
        intensity={1} 
        castShadow 
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-700}
        shadow-camera-right={700}
        shadow-camera-top={700}
        shadow-camera-bottom={-700}
        shadow-camera-far={1000}
      />
      <Environment preset="sunset" />
      
      <TrackMesh />
      
      {/* Decorative Elements */}
      {decorations.map((item, i) => (
        item.type === 'tree' ? (
          <Tree key={i} position={item.pos} scale={item.scale} />
        ) : (
          <Rock key={i} position={item.pos} scale={item.scale} />
        )
      ))}
      
      {/* Local Player */}
      <group ref={carRef}>
        <CarModel color={players[myId || '']?.color || 'red'} isLocal drifting={localPlayerRef.current?.drifting} />
      </group>
      
      {/* Remote Players */}
      {Object.values(players).map(p => {
        if (p.id === myId) return null;
        return (
          <group key={p.id} position={[p.x, 0, p.y]} rotation={[0, -p.angle + Math.PI/2, 0]}>
            <CarModel color={p.color} drifting={p.drifting} />
            <Text position={[0, 3, 0]} fontSize={2} color="white" anchorX="center" anchorY="middle">
              {p.name}
            </Text>
          </group>
        );
      })}
    </>
  );
};

export default function GameCanvas({ initialPlayers, isOffline }: { initialPlayers?: Record<string, Player>, isOffline?: boolean }) {
  // Sanitize initial players to handle Infinity/null issue
  const sanitizedInitial = useMemo(() => {
      if (!initialPlayers) return {};
      return Object.entries(initialPlayers).reduce((acc, [id, p]) => {
        acc[id] = { ...p, bestLapTime: p.bestLapTime || Infinity };
        return acc;
      }, {} as Record<string, Player>);
  }, [initialPlayers]);

  const [players, setPlayers] = useState<Record<string, Player>>(sanitizedInitial);
  const [myId, setMyId] = useState<string | null>(isOffline ? 'local-1' : (socket.id || null));
  const [laps, setLaps] = useState(0);
  const [lastLapTime, setLastLapTime] = useState<number | null>(null);
  const [currentLapStart, setCurrentLapStart] = useState<number>(Date.now());
  const [nitro, setNitro] = useState(100);
  const [wrongWay, setWrongWay] = useState(false);
  const timerRef = useRef<HTMLDivElement>(null);
  
  // HUD Helper
  const formatTime = (ms: number) => {
      if (ms === Infinity || !ms) return "--:--";
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const rs = s % 60;
      const msPart = Math.floor((ms % 1000) / 10);
      return `${m}:${rs.toString().padStart(2, '0')}.${msPart.toString().padStart(2, '0')}`;
  };
  
  // Track if we should add a second local player
  useEffect(() => {
    if (isOffline && !players['local-2']) {
      // Add a second player automatically in offline mode for local 2-player
      const p2: Player = {
        id: 'local-2',
        name: 'Player 2',
        color: 'hsl(210, 70%, 50%)',
        x: 650,
        y: 770,
        angle: Math.PI,
        speed: 0,
        laps: 0,
        bestLapTime: Infinity,
        nitro: 100,
        drifting: false
      };
      setPlayers(prev => ({ ...prev, 'local-2': p2 }));
    }
  }, [isOffline]);

  // Local state for smooth physics (Now as a Map for multiple local players)
  const localPlayersRef = useRef<Record<string, {
    x: number;
    y: number;
    angle: number;
    speed: number;
    keys: Record<string, boolean>;
    checkpoint: number;
    nitro: number;
    drifting: boolean;
    wrongWayTimer: number | null;
    lapCount: number;
  }>>({});

  // Initialize local players
  useEffect(() => {
      const ids = isOffline ? ['local-1', 'local-2'] : [myId || ''];
      ids.forEach(id => {
          if (id && !localPlayersRef.current[id]) {
              localPlayersRef.current[id] = {
                  x: 650,
                  y: 750 + (id === 'local-2' ? 20 : 0),
                  angle: Math.PI,
                  speed: 0,
                  keys: {},
                  checkpoint: 3,
                  nitro: 100,
                  drifting: false,
                  wrongWayTimer: null,
                  lapCount: 0,
              };
          }
      });
  }, [isOffline, myId]);

  // Input handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      Object.values(localPlayersRef.current).forEach(p => {
          p.keys[e.code] = true;
      });
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      Object.values(localPlayersRef.current).forEach(p => {
          p.keys[e.code] = false;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Socket event listeners
  useEffect(() => {
    if (isOffline) return;

    const handleConnect = () => {
      setMyId(socket.id || null);
    };

    const handlePlayerMoved = (p: Player) => {
      setPlayers((prev) => {
        if (p.id === socket.id) return prev;
        return { ...prev, [p.id]: { ...p, bestLapTime: p.bestLapTime || Infinity } };
      });
    };

    const handleLapUpdate = (data: {id: string, laps: number, bestLapTime: number}) => {
        setPlayers(prev => {
            if (!prev[data.id]) return prev;
            const serverBest = data.bestLapTime || Infinity;
            if (data.id === socket.id) {
                 const currentBest = prev[data.id].bestLapTime || Infinity;
                 if (serverBest > currentBest && currentBest !== Infinity) {
                     return prev;
                 }
            }
            return {
                ...prev,
                [data.id]: {
                    ...prev[data.id],
                    laps: data.laps,
                    bestLapTime: serverBest
                }
            };
        });
    };

    const handlePlayerDisconnected = (id: string) => {
      setPlayers((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    };

    socket.on('connect', handleConnect);
    socket.on('playerMoved', handlePlayerMoved);
    socket.on('lapUpdate', handleLapUpdate);
    socket.on('playerDisconnected', handlePlayerDisconnected);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('playerMoved', handlePlayerMoved);
      socket.off('lapUpdate', handleLapUpdate);
      socket.off('playerDisconnected', handlePlayerDisconnected);
    };
  }, [isOffline]);

  // Update HUD helper to handle local-1 specifically for solo HUD
  const localPlayerState = localPlayersRef.current[myId || ''] || { nitro: 100 };

  // Particle System
  const [particles, setParticles] = useState<{id: number, x: number, y: number, life: number}[]>([]);
  const particleIdCounter = useRef(0);

  // Physics Loop (runs independently of 3D render loop)
  useEffect(() => {
    let animationFrameId: number;

    const updatePhysics = () => {
      const ids = Object.keys(localPlayersRef.current);
      
      ids.forEach(id => {
        const p = localPlayersRef.current[id];
        const oldX = p.x;
        const oldY = p.y;
        
        // Input mapping for each player
        let up = false, down = false, left = false, right = false, nitroKey = false, driftKey = false;
        
        if (id === 'local-1' || (!isOffline && id === myId)) {
          up = p.keys['KeyW'] || p.keys['ArrowUp'];
          down = p.keys['KeyS'] || p.keys['ArrowDown'];
          left = p.keys['KeyA'] || p.keys['ArrowLeft'];
          right = p.keys['KeyD'] || p.keys['ArrowRight'];
          nitroKey = p.keys['ShiftLeft'] || p.keys['ShiftRight'];
          driftKey = p.keys['Space'];
        } else if (id === 'local-2' && isOffline) {
          // Player 2 controls: IJKL or similar if arrows are taken?
          // Let's use Arrows for P1 if WASD is P2? Or vice versa.
          // Appears P1 uses both in current code. Let's split them.
          // P1: WASD, Shift, Space
          // P2: Arrows, Enter, R-Ctrl
          up = p.keys['ArrowUp'];
          down = p.keys['ArrowDown'];
          left = p.keys['ArrowLeft'];
          right = p.keys['ArrowRight'];
          nitroKey = p.keys['Enter'];
          driftKey = p.keys['ControlRight'];

          // Adjust P1 to ONLY WASD
          const p1 = localPlayersRef.current['local-1'];
          if (p1) {
            up = p === p1 ? (p.keys['KeyW']) : up;
            down = p === p1 ? (p.keys['KeyS']) : down;
            left = p === p1 ? (p.keys['KeyA']) : left;
            right = p === p1 ? (p.keys['KeyD']) : right;
            nitroKey = p === p1 ? (p.keys['ShiftLeft'] || p.keys['ShiftRight']) : nitroKey;
            driftKey = p === p1 ? (p.keys['Space']) : driftKey;
          }
        }

        // Acceleration
        if (up) {
          p.speed += ACCELERATION;
        } else if (down) {
          p.speed -= ACCELERATION;
        } else {
          p.speed *= FRICTION;
        }

        // Nitro
        if (nitroKey && p.nitro > 0) {
            p.speed += NITRO_ACCEL;
            p.nitro = Math.max(0, p.nitro - 1);
        } else {
            p.nitro = Math.min(100, p.nitro + 0.2);
        }
        
        if (id === myId) setNitro(p.nitro);

        // Drifting Logic
        const isTurning = left || right;
        if (driftKey && isTurning && Math.abs(p.speed) > 1.5) {
            p.drifting = true;
        } else {
            p.drifting = false;
        }

        // Max Speed Cap
        const isNitroActive = nitroKey && p.nitro > 0;
        const currentMaxSpeed = isNitroActive ? NITRO_SPEED : MAX_SPEED;
        
        if (p.speed > currentMaxSpeed) {
            if (isNitroActive) {
                p.speed = currentMaxSpeed;
            } else {
                p.speed = Math.max(currentMaxSpeed, p.speed * 0.98);
            }
        }
        if (p.speed < -MAX_SPEED / 2) p.speed = -MAX_SPEED / 2;

        // Turning
        if (Math.abs(p.speed) > 0.1) {
          let turn = TURN_SPEED * (p.speed / MAX_SPEED);
          if (p.drifting) {
              turn *= 1.5;
              p.speed *= 0.98;
              if (Math.random() > 0.5) {
                  setParticles(prev => [
                      ...prev, 
                      {
                          id: particleIdCounter.current++, 
                          x: p.x + (Math.random() - 0.5) * 2, 
                          y: p.y + (Math.random() - 0.5) * 2, 
                          life: 1.0
                      }
                  ]);
              }
          }
          if (left) p.angle -= turn;
          if (right) p.angle += turn;
        }

        p.x += Math.cos(p.angle) * p.speed;
        p.y += Math.sin(p.angle) * p.speed;

        // Collision & Sector Logic (same as before but per player)
        let closestPt = {x: p.x, y: p.y};
        let minD2 = Infinity;
        let targetAngle = 0;
        TRACK_SEGMENTS.forEach(seg => {
            const pt = getClosestPointOnSegment({x: p.x, y: p.y}, seg.start, seg.end);
            const d2 = (pt.x - p.x)**2 + (pt.y - p.y)**2;
            if (d2 < minD2) {
                minD2 = d2;
                closestPt = pt;
                targetAngle = seg.angle;
            }
        });

        if (Math.sqrt(minD2) > TRACK_RADIUS) {
          p.speed *= 0.9;
          if (p.speed > 1.2) p.speed = 1.2;
          if (p.speed < -0.75) p.speed = -0.75;
          p.drifting = false;
        }

        // Lap Logic
        let currentSector = -1;
        const d0 = distToSegment({x: p.x, y: p.y}, TRACK_SEGMENTS[0].start, TRACK_SEGMENTS[0].end);
        const d1 = distToSegment({x: p.x, y: p.y}, TRACK_SEGMENTS[4].start, TRACK_SEGMENTS[4].end);
        const d2 = distToSegment({x: p.x, y: p.y}, TRACK_SEGMENTS[8].start, TRACK_SEGMENTS[8].end);
        const d3 = distToSegment({x: p.x, y: p.y}, TRACK_SEGMENTS[11].start, TRACK_SEGMENTS[11].end);

        if (d0 < TRACK_RADIUS * 1.5) currentSector = 0;
        else if (d1 < TRACK_RADIUS * 1.5) currentSector = 1;
        else if (d2 < TRACK_RADIUS * 1.5) currentSector = 2;
        else if (d3 < TRACK_RADIUS * 1.5) currentSector = 3;
        
        if (currentSector !== -1) {
            const nextCheckpoint = (p.checkpoint + 1) % 4;
            if (currentSector === nextCheckpoint) p.checkpoint = currentSector;
        }

        const onFinishStraight = p.y > 700 && p.y < 800;
        if (p.checkpoint === 3 && onFinishStraight && oldX >= 625 && p.x < 625) {
            const now = Date.now();
            const lapTime = now - currentLapStart;
            p.lapCount++;
            if (id === myId) {
              setLaps(p.lapCount);
              setCurrentLapStart(now);
              if (p.lapCount > 1) setLastLapTime(lapTime);
            }
            
            setPlayers(prev => {
                if (!prev[id]) return prev;
                const currentBest = prev[id].bestLapTime;
                if (!currentBest || lapTime < currentBest) {
                    return { ...prev, [id]: { ...prev[id], laps: p.lapCount, bestLapTime: (p.lapCount > 1 ? lapTime : currentBest) } };
                }
                return { ...prev, [id]: { ...prev[id], laps: p.lapCount } };
            });

            if (!isOffline && id === socket.id && p.lapCount > 1) {
                socket.emit('lapFinished', lapTime);
            }
            p.checkpoint = -1;
        }

        // Update wrong way warning for main player
        if (id === myId) {
          let pAngle = p.angle % (Math.PI * 2);
          if (pAngle > Math.PI) pAngle -= Math.PI * 2;
          if (pAngle < -Math.PI) pAngle += Math.PI * 2;
          let diff = Math.abs(pAngle - targetAngle);
          if (diff > Math.PI) diff = Math.PI * 2 - diff;
          const isWrongWayConditionMet = diff > 2.0 && p.speed > 0.5;
          if (isWrongWayConditionMet) {
              if (p.wrongWayTimer === null) p.wrongWayTimer = Date.now();
              else if (Date.now() - p.wrongWayTimer > 100) setWrongWay(true);
          } else {
              p.wrongWayTimer = null;
              setWrongWay(false);
          }
        }

        // Sync local players to players state for rendering others
        if (isOffline) {
            setPlayers(prev => ({
                ...prev,
                [id]: {
                    ...prev[id],
                    x: p.x,
                    y: p.y,
                    angle: p.angle,
                    speed: p.speed,
                    drifting: p.drifting
                }
            }));
        }
      });

      // Update Particles
      setParticles(prev => prev.map(pt => ({...pt, life: pt.life - 0.05})).filter(pt => pt.life > 0));

      // Send update
      if (!isOffline && socket.connected) {
        const pid = myId || socket.id;
        const p = localPlayersRef.current[pid || ''];
        if (p) {
            socket.emit('playerMovement', {
              x: p.x, y: p.y, angle: p.angle, speed: p.speed, nitro: p.nitro, drifting: p.drifting
            });
        }
      }

      if (timerRef.current) {
          timerRef.current.innerText = formatTime(Date.now() - currentLapStart);
      }

      animationFrameId = requestAnimationFrame(updatePhysics);
    };

    updatePhysics();

    return () => cancelAnimationFrame(animationFrameId);
  }, [currentLapStart, isOffline, myId]);

  // Combined Scene Component to handle multiple localRefs if needed
  // For now, GameScene follows myId.
  const localPlayerRefProxy = {
      get current() {
          return localPlayersRef.current[myId || ''];
      }
  };

  return (
    <div className="relative w-full h-[850px] bg-slate-900 rounded-xl overflow-hidden shadow-2xl border-4 border-slate-700">
      <Canvas shadows>
        <color attach="background" args={['#0f172a']} />
        <PerspectiveCamera makeDefault position={[0, 50, 50]} fov={60} far={1000} />
        <fog attach="fog" args={['#0f172a', 100, 900]} />
        <GameScene localPlayerRef={localPlayerRefProxy as any} players={players} myId={myId} />
        
        {/* Particles */}
        {particles.map(pt => (
            <mesh key={pt.id} position={[pt.x, 2, pt.y]} rotation={[-Math.PI/2, 0, 0]}>
                <planeGeometry args={[1.5 * pt.life, 1.5 * pt.life]} />
                <meshBasicMaterial color="#888" transparent opacity={0.4 * pt.life} />
            </mesh>
        ))}

        <OrbitControls enabled={false} />
      </Canvas>
      
      {/* HUD Overlay */}
      {/* Top Left: Leaderboard */}
      <div className="absolute top-6 left-6 flex flex-col gap-3 pointer-events-none">
          <div className="bg-black/50 text-white p-5 rounded-xl border border-white/10 backdrop-blur-md w-56">
              <div className="text-xs text-slate-400 uppercase tracking-wider mb-2 font-bold">Leaderboard</div>
              <div className="space-y-2">
                  {Object.values(players)
                    .map(p => p as Player)
                    .sort((a, b) => (a.bestLapTime || Infinity) - (b.bestLapTime || Infinity))
                    .slice(0, 5)
                    .map((p, i) => (
                      <div key={p.id} className="flex justify-between text-sm">
                          <span className={`${p.id === myId ? 'text-yellow-400 font-bold' : 'text-slate-300'} truncate max-w-[120px]`}>
                              {i+1}. {p.name}
                          </span>
                          <span className="font-mono text-slate-400">
                              {p.bestLapTime !== Infinity ? formatTime(p.bestLapTime) : '-'}
                          </span>
                      </div>
                  ))}
              </div>
          </div>
      </div>

      {/* Top Center: Lap Timer */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 pointer-events-none">
          <div className="bg-black/50 text-white px-8 py-4 rounded-full border border-white/10 backdrop-blur-md flex items-center gap-8">
              <div className="text-center">
                  <div className="text-xs text-slate-400 uppercase tracking-wider font-bold">Current</div>
                  <div ref={timerRef} className="text-3xl font-mono font-bold text-yellow-400 leading-none">
                      {formatTime(Date.now() - currentLapStart)}
                  </div>
              </div>
              <div className="w-px h-12 bg-white/20"></div>
              <div className="text-center">
                  <div className="text-xs text-slate-400 uppercase tracking-wider font-bold">Best</div>
                  <div className="text-2xl font-mono text-slate-300 leading-none">
                      {players[myId || '']?.bestLapTime !== Infinity ? formatTime(players[myId || '']?.bestLapTime || 0) : '--:--'}
                  </div>
              </div>
              <div className="w-px h-12 bg-white/20"></div>
               <div className="text-center">
                  <div className="text-xs text-slate-400 uppercase tracking-wider font-bold">Lap</div>
                  <div className="text-2xl font-mono text-slate-300 leading-none">
                      {laps}
                  </div>
              </div>
          </div>
      </div>

      {/* Bottom Center: Nitro Bar */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 pointer-events-none w-80">
          <div className="flex justify-between text-xs text-slate-400 uppercase tracking-wider font-bold mb-2">
              <span>Nitro</span>
              <span>{Math.round(nitro)}%</span>
          </div>
          <div className="w-full h-4 bg-slate-800/50 rounded-full overflow-hidden border border-white/20 backdrop-blur-md">
              <div 
                className="h-full bg-gradient-to-r from-blue-600 via-blue-400 to-cyan-300 shadow-[0_0_15px_rgba(59,130,246,0.6)]"
                style={{ width: `${nitro}%` }}
              />
          </div>
      </div>

      {/* Wrong Way Warning */}
      {wrongWay && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <div className="bg-red-600/90 text-white px-12 py-8 rounded-2xl border-8 border-white shadow-2xl animate-pulse">
                <div className="text-6xl font-black italic uppercase tracking-widest">WRONG WAY</div>
            </div>
        </div>
      )}

      {/* Bottom Left: Controls (Faded) */}
      <div className="absolute bottom-6 left-6 text-white pointer-events-none opacity-50 hover:opacity-100 transition-opacity duration-300">
        <div className="bg-black/40 p-5 rounded-xl backdrop-blur-md border border-white/10">
            <h3 className="font-bold text-sm mb-2 text-yellow-400/80">Controls</h3>
            <div className="flex gap-8">
              <ul className="text-xs space-y-1 font-mono text-slate-300">
                <li className="text-yellow-400 font-bold mb-1 underline">PLAYER 1</li>
                <li>W / S : Gas/Brake</li>
                <li>A / D : Turn</li>
                <li>SHIFT : Nitro</li>
                <li>SPACE : Drift</li>
              </ul>
              {isOffline && (
                <ul className="text-xs space-y-1 font-mono text-slate-300">
                  <li className="text-blue-400 font-bold mb-1 underline">PLAYER 2</li>
                  <li>UP/DOWN: Gas/Brake</li>
                  <li>L/R ARW: Turn</li>
                  <li>ENTER  : Nitro</li>
                  <li>R-CTRL : Drift</li>
                </ul>
              )}
            </div>
        </div>
      </div>
    </div>
  );
}
