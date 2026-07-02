"use client";

import { useRTVIClientEvent as useReactRTVIClientEvent } from "@pipecat-ai/client-react";
import { RTVIEvent } from "@pipecat-ai/client-js";

// client-react@1.6 bundles its own (un-exported) copy of the RTVIEvent enum and
// PipecatClient class in its type definitions. They are identical at runtime to
// the ones exported by client-js, but nominally distinct at compile time. To
// avoid scattering casts across components, we bridge them in this one place.

const useEvent = useReactRTVIClientEvent as unknown as (
  event: RTVIEvent,
  handler: (...args: unknown[]) => void,
) => void;

export { RTVIEvent };
export { useEvent as useRTVIClientEvent };
