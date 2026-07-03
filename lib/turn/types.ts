/** WebRTC ICE server entry — matches RTCIceServer / Metered API shape. */
export type IceServerEntry = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type IceConfigResponse = {
  ok: boolean;
  iceServers: IceServerEntry[];
  source?: string;
  error?: string;
};
