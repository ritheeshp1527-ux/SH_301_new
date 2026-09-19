import React, { useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { SelectionPanel } from './SelectionPanel';
import { Team1Scene } from './team1/Team1Scene';
import { SelectionState } from './team1/state/SelectionStore';

export const DigitalTwinScene: React.FC = () => {
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [selectedEntityType, setSelectedEntityType] = useState<string | null>(null);

  const handleSelect = (id: string, type: string) => {
    setSelectedEntityId(id);
    setSelectedEntityType(type ? type.toUpperCase() : null);
    SelectionState.select(type ? (type.toLowerCase() as any) : null, id);
  };

  const handleClosePanel = () => {
    setSelectedEntityId(null);
    setSelectedEntityType(null);
    SelectionState.clear();
  };

  const handlePointerMissed = () => {
    SelectionState.clear();
  };

  return (
    <div className="fixed inset-0 w-full h-screen z-0 bg-zinc-950 overflow-hidden pointer-events-auto">
      <SelectionPanel 
        entityId={selectedEntityId} 
        entityType={selectedEntityType} 
        onClose={handleClosePanel} 
      />
      
      <Canvas
        shadows
        camera={{ position: [25, 18, 35], fov: 45, near: 0.5, far: 300 }}
        onPointerMissed={handlePointerMissed}
        dpr={[1, 1.5]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <Suspense fallback={null}>
          <Team1Scene onSelect={handleSelect} />
          
          <OrbitControls 
            makeDefault 
            maxPolarAngle={Math.PI / 2 - 0.05} // Keep camera above ground
            minDistance={8}
            maxDistance={150}
            target={[-2, 0, 8]}
          />
        </Suspense>
      </Canvas>
    </div>
  );
};
