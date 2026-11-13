"use client";

import dynamic from "next/dynamic";

// The whole game runs client-only: PixiJS needs a live canvas/WebGL context.
const GameShell = dynamic(() => import("@/components/GameShell"), {
  ssr: false,
  loading: () => <div className="game-root" />,
});

export default function Page() {
  return <GameShell />;
}
