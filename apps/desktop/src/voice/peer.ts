/**
 * Тонкая обёртка над RTCPeerConnection для 1-на-1 звонка.
 *
 * - Caller (offerer): `peer.start(stream)` → `peer.createOffer()` → шлёт sdp
 *   серверу → ждёт answer (`peer.applyAnswer(sdp)`).
 * - Callee (answerer): на полученный offer делает `peer.applyOffer(sdp)` →
 *   получает sdp answer обратно, шлёт серверу.
 * - Обмен ICE-кандидатами в обе стороны через `onLocalIce` callback.
 *
 * Single-track audio (видео — фаза 6).
 */

export interface VoicePeerOptions {
  iceServers: RTCIceServer[];
  /** Зовётся каждый раз когда у нас новый локальный ICE candidate. */
  onLocalIce: (candidateJson: string) => void;
  /** Зовётся когда remote-track появился — UI кладёт его в audio-элемент. */
  onRemoteTrack: (stream: MediaStream) => void;
  /** Уведомляет о смене состояния connection. */
  onStateChange: (state: RTCPeerConnectionState) => void;
}

export class VoicePeer {
  private readonly pc: RTCPeerConnection;
  private localStream: MediaStream | null = null;
  /** Очередь ICE-кандидатов которые пришли до setRemoteDescription. */
  private pendingIce: RTCIceCandidateInit[] = [];

  constructor(private readonly opts: VoicePeerOptions) {
    this.pc = new RTCPeerConnection({ iceServers: opts.iceServers });

    this.pc.addEventListener('icecandidate', (e) => {
      if (e.candidate) {
        opts.onLocalIce(JSON.stringify(e.candidate.toJSON()));
      }
    });
    this.pc.addEventListener('track', (e) => {
      if (e.streams[0]) opts.onRemoteTrack(e.streams[0]);
    });
    this.pc.addEventListener('connectionstatechange', () => {
      opts.onStateChange(this.pc.connectionState);
    });

    // Готовим transceiver под аудио. recvonly mode на answerer'е переключится
    // автоматически при applyOffer.
    this.pc.addTransceiver('audio', { direction: 'sendrecv' });
  }

  attachLocalStream(stream: MediaStream): void {
    this.localStream = stream;
    for (const track of stream.getTracks()) {
      this.pc.addTrack(track, stream);
    }
  }

  async createOffer(): Promise<string> {
    const offer = await this.pc.createOffer({ offerToReceiveAudio: true });
    await this.pc.setLocalDescription(offer);
    return offer.sdp ?? '';
  }

  async applyOffer(sdp: string): Promise<string> {
    await this.pc.setRemoteDescription({ type: 'offer', sdp });
    await this.flushPendingIce();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer.sdp ?? '';
  }

  async applyAnswer(sdp: string): Promise<void> {
    await this.pc.setRemoteDescription({ type: 'answer', sdp });
    await this.flushPendingIce();
  }

  async addRemoteIce(candidateJson: string): Promise<void> {
    let parsed: RTCIceCandidateInit;
    try {
      parsed = JSON.parse(candidateJson) as RTCIceCandidateInit;
    } catch {
      return;
    }
    if (!this.pc.remoteDescription) {
      this.pendingIce.push(parsed);
      return;
    }
    try {
      await this.pc.addIceCandidate(parsed);
    } catch {
      // Stale candidate after disconnect — норм, пропускаем.
    }
  }

  setMuted(muted: boolean): void {
    if (!this.localStream) return;
    for (const track of this.localStream.getAudioTracks()) {
      track.enabled = !muted;
    }
  }

  close(): void {
    try {
      this.pc.close();
    } catch {
      // ignore
    }
  }

  private async flushPendingIce(): Promise<void> {
    if (this.pendingIce.length === 0) return;
    const queue = this.pendingIce;
    this.pendingIce = [];
    for (const cand of queue) {
      try {
        await this.pc.addIceCandidate(cand);
      } catch {
        // ignore
      }
    }
  }
}
