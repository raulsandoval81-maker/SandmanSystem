/* ============================================================
   VIDEO ENGINE — inline match player (B4)
   Supports:
     - HLS (.m3u8)
     - WebRTC (RTC downstream)
   ============================================================ */

export function startVideoStream(url) {
  const video = document.getElementById("liveVideo");

  // HLS Path
  if (url.endsWith(".m3u8")) {
    if (Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: true });
      hls.loadSource(url);
      hls.attachMedia(video);
      return;
    }
    // Native Safari support
    video.src = url;
    return;
  }

  // WebRTC fallback
  if (url.startsWith("webrtc://")) {
    const pc = new RTCPeerConnection();
    pc.ontrack = (ev) => (video.srcObject = ev.streams[0]);

    fetch(url)                  // backend SDP
      .then(r => r.text())
      .then(sdp => pc.setRemoteDescription({ type: "offer", sdp }))
      .then(() => pc.createAnswer())
      .then(ans => pc.setLocalDescription(ans))
      .catch(console.error);

    return;
  }

  console.warn("Unsupported stream:", url);
}
