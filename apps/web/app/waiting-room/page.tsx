"use client";

import { WaitingRoom } from "@/components/dashboard";
import { Suspense } from "react";


export default function WaitingRoomPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <WaitingRoom/>
    </Suspense>
  );
}