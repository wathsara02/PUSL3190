import { useCallback, useEffect, useState, useRef } from 'react';

// Basic mesh logic since we can have up to 4 players. We need one RTCPeerConnection *per* peer.
// For simplicity in this demo game setup, we'll establish a fully connected mesh network.
// A more robust scalable app would use an SFU (Selective Forwarding Unit) instead of mesh.

interface Peers {
    [token: string]: RTCPeerConnection;
}

export function useVoiceChat(
    wsRef: React.MutableRefObject<WebSocket | null>,
    myPeerId: string | null,
    connected: boolean,
) {
    const [muted, setMuted] = useState(false);
    const [deafened, setDeafened] = useState(false);
    const [audioStreams, setAudioStreams] = useState<{ [token: string]: MediaStream }>({});

    const localStreamRef = useRef<MediaStream | null>(null);
    const localStreamPromiseRef = useRef<Promise<MediaStream | null> | null>(null);
    const peersRef = useRef<Peers>({});
    const negotiatingPeersRef = useRef<Set<string>>(new Set());

    const ensureLocalStream = useCallback(async () => {
        if (localStreamRef.current) return localStreamRef.current;
        if (!localStreamPromiseRef.current) {
            localStreamPromiseRef.current = navigator.mediaDevices
                .getUserMedia({
                    audio: {
                        noiseSuppression: true,
                        echoCancellation: true,
                        autoGainControl: true,
                    },
                    video: false,
                })
                .then(stream => {
                    localStreamRef.current = stream;
                    return stream;
                })
                .catch(err => {
                    console.error("Mic access denied or unavailable", err);
                    return null;
                });
        }
        return localStreamPromiseRef.current;
    }, []);

    // Start mic logic
    useEffect(() => {
        void ensureLocalStream();

        return () => {
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(t => t.stop());
                localStreamRef.current = null;
            }
            localStreamPromiseRef.current = null;
        };
    }, [ensureLocalStream]);

    // Effect to toggle physical track enabled state when muted state changes
    useEffect(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(track => {
                track.enabled = !muted;
            });
        }
    }, [muted]);

    const sendAudioStatus = useCallback(() => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) return;
        wsRef.current.send(JSON.stringify({
            type: 'audio_status',
            muted,
            deafened,
        }));
    }, [wsRef, muted, deafened]);

    useEffect(() => {
        if (!connected) return;
        sendAudioStatus();
    }, [connected, sendAudioStatus]);

    const getOrCreatePeer = useCallback((peerId: string) => {
        const existing = peersRef.current[peerId];
        if (existing) {
            const dead = existing.connectionState === 'failed' || existing.connectionState === 'closed';
            if (!dead) return existing;
            existing.close();
            delete peersRef.current[peerId];
        }

        const rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
            ]
        };

        const peer = new RTCPeerConnection(rtcConfig);
        peersRef.current[peerId] = peer;

        peer.onicecandidate = (event) => {
            if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'webrtc_ice_candidate',
                    candidate: event.candidate,
                    target_peer_id: peerId
                }));
            }
        };

        peer.ontrack = (event) => {
            const stream = event.streams[0];
            setAudioStreams(prev => ({
                ...prev,
                [peerId]: stream
            }));
        };

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                peer.addTrack(track, localStreamRef.current!);
            });
        }

        return peer;
    }, [wsRef]);

    const initiateCall = useCallback(async (peerId: string) => {
        if (!peerId || peerId === myPeerId) return;
        await ensureLocalStream();

        const peer = getOrCreatePeer(peerId);
        if (negotiatingPeersRef.current.has(peerId)) return;
        if (peer.connectionState === 'connected' || peer.iceConnectionState === 'completed') return;
        if (peer.signalingState !== 'stable') return;

        negotiatingPeersRef.current.add(peerId);

        try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);

        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'webrtc_offer',
                offer,
                target_peer_id: peerId
            }));
        }
        } finally {
            negotiatingPeersRef.current.delete(peerId);
        }
    }, [ensureLocalStream, getOrCreatePeer, myPeerId, wsRef]);

    // Setup WebRTC Signal Handlers dynamically onto the WebSocket
    useEffect(() => {
        const ws = wsRef.current;
        if (!ws) return;

        const handleSignal = async (event: MessageEvent) => {
            try {
                const msg = JSON.parse(event.data);
                const senderPeerId = msg.sender_peer_id;

                if (!senderPeerId) return;

                if (msg.type === 'webrtc_offer') {
                    if (msg.target_peer_id !== myPeerId) return;

                    await ensureLocalStream();
                    const peer = getOrCreatePeer(senderPeerId);
                    await peer.setRemoteDescription(new RTCSessionDescription(msg.offer));
                    const answer = await peer.createAnswer();
                    await peer.setLocalDescription(answer);

                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'webrtc_answer',
                            answer,
                            target_peer_id: senderPeerId
                        }));
                    }
                }
                else if (msg.type === 'webrtc_answer') {
                    // Only process answers meant for us
                    if (msg.target_peer_id !== myPeerId) return;

                    const peer = peersRef.current[senderPeerId];
                    if (peer) {
                        await peer.setRemoteDescription(new RTCSessionDescription(msg.answer));
                    }
                }
                else if (msg.type === 'webrtc_ice_candidate') {
                    if (msg.target_peer_id !== myPeerId) return;

                    const peer = peersRef.current[senderPeerId];
                    if (peer && msg.candidate) {
                        await peer.addIceCandidate(new RTCIceCandidate(msg.candidate));
                    }
                }
            } catch (err) {
                console.error("WebRTC Signaling Error", err);
            }
        };

        ws.addEventListener('message', handleSignal);

        return () => {
            ws.removeEventListener('message', handleSignal);
        };
    }, [ensureLocalStream, getOrCreatePeer, myPeerId, wsRef]);

    const hasPeerConnection = useCallback((peerId: string) => {
        const peer = peersRef.current[peerId];
        if (!peer) return false;
        if (peer.connectionState === 'failed' || peer.connectionState === 'closed' || peer.connectionState === 'disconnected') return false;
        return peer.connectionState === 'connected'
            || peer.connectionState === 'connecting'
            || peer.iceConnectionState === 'completed'
            || (peer.signalingState !== 'stable' && peer.signalingState !== 'closed')
            || negotiatingPeersRef.current.has(peerId);
    }, []);

    return { muted, setMuted, deafened, setDeafened, audioStreams, initiateCall, hasPeerConnection };
}
