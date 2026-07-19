import { useState } from 'react';
import { Mic2, Square, Users, Video } from 'lucide-react';
import { Brand, runOperation, type SurfaceProps } from './shared';

export function CallsSurface({ manifest, computer }: SurfaceProps) {
  const zoom = manifest.id === 'zoom';
  const [inCall, setInCall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [video, setVideo] = useState(true);
  const [showParticipants, setShowParticipants] = useState(false);
  const [sharing, setSharing] = useState(false);
  const join = async () => { if (await runOperation(manifest, computer, zoom ? 'join-call' : 'start-call', { meeting: 'simulator-review' })) setInCall(true); };
  const setMute = async () => { const next = !muted; if (await runOperation(manifest, computer, 'mute', { muted: next })) setMuted(next); };
  const setCamera = async () => { const next = !video; if (await runOperation(manifest, computer, 'set-video', { enabled: next })) setVideo(next); };
  const leave = async () => { if (await runOperation(manifest, computer, 'end-call', { meeting: 'simulator-review' })) setInCall(false); };
  if (!inCall) return <div className={`calls-app calls-lobby surface-${manifest.id}`}><header><Brand manifest={manifest}/><span>{zoom ? 'Workplace' : 'FaceTime'}</span></header><main><div className="camera-preview"><Video/><span>Seed Camera · 1080p</span></div><h1>{zoom ? 'Join the simulator review' : 'Recent calls'}</h1><p>Camera and microphone are virtual peripherals attached to this computer.</p><button className="primary" onClick={() => void join()}>{zoom ? 'Join meeting' : 'Start FaceTime'}</button></main></div>;
  const toggleShare = async () => { const next = !sharing; if (await runOperation(manifest, computer, next ? 'share-screen' : 'stop-share', { displayId: 'main' })) setSharing(next); };
  return <div className={`calls-app calls-active surface-${manifest.id}`}><div className="participant-grid"><article><span>MC</span><b>Maya Chen</b></article><article className={video ? 'local-video' : ''}><span>{sharing ? <Square/> : video ? <Video/> : 'A'}</span><b>{sharing ? 'You · sharing' : 'You'}</b></article></div>{showParticipants && <div style={{ position: 'absolute', right: 12, top: 12, background: 'rgba(20,20,24,0.92)', color: '#fff', borderRadius: 8, padding: 12, minWidth: 160, zIndex: 10 }}><b style={{ fontSize: 12 }}>Participants (2)</b>{['Maya Chen', muted ? 'You (muted)' : 'You'].map((name) => <p key={name} style={{ margin: '6px 0', fontSize: 12 }}>{name}</p>)}</div>}<div className="call-controls"><button className={muted ? 'off' : ''} onClick={() => void setMute()}><Mic2/><span>{muted ? 'Unmute' : 'Mute'}</span></button><button className={!video ? 'off' : ''} onClick={() => void setCamera()}><Video/><span>{video ? 'Stop video' : 'Start video'}</span></button><button className={showParticipants ? 'off' : ''} onClick={() => setShowParticipants((value) => !value)}><Users/><span>Participants</span></button><button className={sharing ? 'off' : ''} onClick={() => void toggleShare()}><Square/><span>{sharing ? 'Stop share' : 'Share'}</span></button><button className="hangup" onClick={() => void leave()}>Leave</button></div></div>;
}
