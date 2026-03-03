'use client';
import React, { Suspense, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
// @ts-ignore - Three.js examples/jsm paths may not have type declarations
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader';
import * as THREE from 'three';
import { AnnotationCallout } from '../dashboard/AnnotationCallout';

function HeartModel() {
    const fbx = useLoader(FBXLoader, '/models/heart/Heart.fbx');
    const meshRef = useRef<THREE.Group>(null!);
    const [texturesLoaded, setTexturesLoaded] = useState(false);

    useEffect(() => {
        if (!fbx) return;

        const textureLoader = new THREE.TextureLoader();

        const baseColor = textureLoader.load('/models/heart/textures/hart_UV_low01_BaseColor.hart_UV_low_defaultMat.png');
        const normalMap = textureLoader.load('/models/heart/textures/hart_UV_low01_Normal.hart_UV_low_defaultMat.png');
        const roughnessMap = textureLoader.load('/models/heart/textures/hart_UV_low01_Roughness.hart_UV_low_defaultMat.png');
        const metalnessMap = textureLoader.load('/models/heart/textures/hart_UV_low01_Metalness.hart_UV_low_defaultMat.png');

        // Apply PBR materials to all meshes
        fbx.traverse((child: any) => {
            if (child.isMesh) {
                child.material = new THREE.MeshStandardMaterial({
                    map: baseColor,
                    normalMap: normalMap,
                    roughnessMap: roughnessMap,
                    metalnessMap: metalnessMap,
                    roughness: 0.7,
                    metalness: 0.1,
                    envMapIntensity: 1.2,
                });
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        setTexturesLoaded(true);
    }, [fbx]);

    // Gentle pulse animation
    useFrame((state) => {
        if (meshRef.current) {
            const t = state.clock.getElapsedTime();
            // Heartbeat-like scale pulse
            const pulse = 1 + Math.sin(t * 1.5) * 0.02 + Math.sin(t * 3) * 0.01;
            meshRef.current.scale.setScalar(0.003 * pulse);
            // Slow rotation
            meshRef.current.rotation.y = Math.sin(t * 0.3) * 0.15;
        }
    });

    return (
        <group ref={meshRef} scale={0.003} position={[0, 0.1, 0]} rotation={[0, 0, 0]}>
            <primitive object={fbx} />
        </group>
    );
}

function LoadingFallback() {
    const meshRef = useRef<THREE.Mesh>(null!);

    useFrame((state) => {
        if (meshRef.current) {
            const t = state.clock.getElapsedTime();
            meshRef.current.rotation.y = t * 0.5;
            const pulse = 1 + Math.sin(t * 2) * 0.1;
            meshRef.current.scale.setScalar(pulse);
        }
    });

    return (
        <mesh ref={meshRef}>
            <sphereGeometry args={[0.6, 16, 16]} />
            <meshStandardMaterial
                color="#00f0ff"
                wireframe
                transparent
                opacity={0.3}
            />
        </mesh>
    );
}

export function HeartVisualization3D() {

    return (
        <div className="relative flex flex-col items-center justify-center h-full w-full">
            {/* Grid background */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(0,240,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,240,255,0.03)_1px,transparent_1px)] bg-[size:30px_30px]" />

            {/* Annotation callouts */}
            <div className="absolute top-[8%] left-[8%] z-20">
                <AnnotationCallout label="Analyzing..." variant="analyzing" />
            </div>
            <div className="absolute top-[15%] right-[5%] z-20">
                <AnnotationCallout
                    label="Cardiac Region"
                    description="Heart rhythm analysis active. Monitoring auscultation signals."
                    variant="analyzing"
                />
            </div>
            <div className="absolute bottom-[30%] left-[5%] z-20">
                <AnnotationCallout label="Analyzing..." variant="analyzing" />
            </div>
            <div className="absolute bottom-[25%] right-[8%] z-20">
                <AnnotationCallout
                    label="Signal Processing"
                    description="PCG signal buffering. Noise reduction pipeline active."
                    variant="warning"
                />
            </div>

            {/* Glow effects */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-red-500/8 blur-[100px] rounded-full" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] bg-hud-cyan/5 blur-[60px] rounded-full" />

            {/* Three.js Canvas */}
            <div className="relative z-10 w-full flex-1">
                <Canvas
                    camera={{ position: [0, 0, 6], fov: 45 }}
                    gl={{ antialias: true, alpha: true }}
                    style={{ background: 'transparent' }}
                    dpr={[1, 2]}
                >
                    {/* Lighting */}
                    <ambientLight intensity={0.4} />
                    <directionalLight
                        position={[5, 5, 5]}
                        intensity={1.2}
                        color="#ffffff"
                        castShadow
                    />
                    <directionalLight
                        position={[-3, 2, -2]}
                        intensity={0.4}
                        color="#00f0ff"
                    />
                    <pointLight position={[0, -2, 2]} intensity={0.3} color="#ff4444" />
                    <pointLight position={[2, 1, -1]} intensity={0.2} color="#00f0ff" />

                    {/* Heart model */}
                    <Suspense fallback={<LoadingFallback />}>
                        <HeartModel />
                    </Suspense>

                    {/* Controls */}
                    <OrbitControls
                        enableZoom={true}
                        enablePan={false}
                        minDistance={3}
                        maxDistance={6}
                        autoRotate
                        autoRotateSpeed={0.5}
                        minPolarAngle={Math.PI / 4}
                        maxPolarAngle={Math.PI * 3 / 4}
                    />

                    {/* Environment for reflections */}
                    <Environment preset="city" />

                    {/* Contact shadow below */}
                    <ContactShadows
                        position={[0, -2, 0]}
                        opacity={0.3}
                        scale={5}
                        blur={2.5}
                        far={4}
                        color="#00f0ff"
                    />
                </Canvas>
            </div>

            {/* Zoom controls */}
            <div className="relative z-20 flex justify-center gap-2 mt-2 mb-2 flex-shrink-0">
                <div className="flex gap-2">
                    <button className="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 border border-hud-border text-white/50 hover:text-white hover:bg-black/70 font-semibold transition-colors">−</button>
                    <button className="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 border border-hud-border text-white/50 hover:text-white hover:bg-black/70 font-semibold transition-colors">+</button>
                </div>
            </div>
        </div>
    );
}
