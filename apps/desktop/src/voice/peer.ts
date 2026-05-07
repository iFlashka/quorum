/**
 * Обёртка над RTCPeerConnection для 1-на-1 звонка с поддержкой видео и
 * screenshare через perfect-negotiation pattern (Mozilla):
 *
 *   - Любая сторона может добавить/убрать track. RTCPeerConnection
 *     emit'ит `negotiationneeded` → мы делаем setLocalDescription и шлём
 *     offer через `onLocalSdp`.
 *   - При получении offer: если у нас уже есть outstanding offer и мы
 *     `impolite` (caller, init'нувший звонок) — игнорируем чужой.
 *     Если мы `polite` (callee) — делаем rollback и принимаем чужой.
 *   - ICE-кандидаты тоже фильтруем при collision.
 *
 * Различение camera vs screenshare на receiver-стороне делается через
 * `MediaStream.id`: сразу после addTrack peer шлёт WS-event `call.media`
 * с map'ой `{cameraStreamId, screenStreamId}`. На приёме в `RTCTrackEvent.streams[0].id`
 * сравниваем с remote-картой.
 */

export type RemoteVideoSource = 'camera' | 'screen' | 'unknown';

export interface VoicePeerOptions {
  iceServers: RTCIceServer[];
  /**
   * `true` для caller'а (того, кто инициировал invite). В perfect-negotiation
   * impolite peer выигрывает collision'ы.
   */
  impolite: boolean;
  /** Зовётся для каждого нового локального ICE-кандидата. */
  onLocalIce: (candidateJson: string) => void;
  /** Зовётся когда мы готовы отправить SDP offer/answer (после setLocalDescription). */
  onLocalSdp: (sdp: string, type: 'offer' | 'answer') => void;
  /** Зовётся при появлении remote-audio-track. */
  onRemoteAudio: (stream: MediaStream) => void;
  /** Зовётся при появлении/исчезании remote-video-track. source определяется по stream-id map. */
  onRemoteVideo: (stream: MediaStream | null, source: RemoteVideoSource) => void;
  /** Зовётся когда наша исходящая map streams изменилась — UI должен это broadcast'нуть. */
  onLocalStreamsChanged: (cameraStreamId: string | null, screenStreamId: string | null) => void;
  /** Уведомляет о смене RTCPeerConnectionState. */
  onStateChange: (state: RTCPeerConnectionState) => void;
}

export class VoicePeer {
  private readonly pc: RTCPeerConnection;
  /** ICE-кандидаты, пришедшие до remoteDescription — флушим после. */
  private pendingIce: RTCIceCandidateInit[] = [];

  // ---- Локальные tracks/streams ----
  private localAudioStream: MediaStream | null = null;
  private cameraStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private cameraSender: RTCRtpSender | null = null;
  private screenSender: RTCRtpSender | null = null;

  // ---- Remote-stream-id mapping (от другой стороны) ----
  private remoteCameraStreamId: string | null = null;
  private remoteScreenStreamId: string | null = null;
  /** Pending tracks, пришедшие до того как map был известен. */
  private pendingRemoteVideoStreams = new Map<string, MediaStream>();

  // ---- Perfect-negotiation state ----
  private makingOffer = false;
  private isSettingRemoteAnswerPending = false;
  private ignoreOffer = false;

  constructor(private readonly opts: VoicePeerOptions) {
    this.pc = new RTCPeerConnection({ iceServers: opts.iceServers });

    this.pc.addEventListener('icecandidate', (e) => {
      if (e.candidate) {
        opts.onLocalIce(JSON.stringify(e.candidate.toJSON()));
      }
    });

    this.pc.addEventListener('track', (e) => {
      const stream = e.streams[0];
      if (!stream) return;
      const track = e.track;
      if (track.kind === 'audio') {
        opts.onRemoteAudio(stream);
        return;
      }
      // video
      const source = this.classifyRemoteStream(stream.id);
      if (source === 'unknown') {
        // map ещё не пришёл — отложим.
        this.pendingRemoteVideoStreams.set(stream.id, stream);
      } else {
        opts.onRemoteVideo(stream, source);
      }
      // Когда remote-track ends — emit null в onRemoteVideo
      track.addEventListener('ended', () => {
        const sourceNow = this.classifyRemoteStream(stream.id);
        if (sourceNow !== 'unknown') {
          opts.onRemoteVideo(null, sourceNow);
        }
      });
    });

    this.pc.addEventListener('connectionstatechange', () => {
      opts.onStateChange(this.pc.connectionState);
    });

    // Fallback: iceconnectionstatechange надёжнее срабатывает в WebView2/Tauri.
    this.pc.addEventListener('iceconnectionstatechange', () => {
      const s = this.pc.iceConnectionState;
      if (s === 'connected' || s === 'completed') opts.onStateChange('connected');
      else if (s === 'failed') opts.onStateChange('failed');
      else if (s === 'disconnected') opts.onStateChange('disconnected');
    });

    this.pc.addEventListener('negotiationneeded', () => {
      void this.handleNegotiationNeeded();
    });
  }

  attachLocalAudio(stream: MediaStream): void {
    this.localAudioStream = stream;
    for (const track of stream.getAudioTracks()) {
      this.pc.addTrack(track, stream);
    }
  }

  /**
   * Включает/выключает камеру. Передай `MediaStream` с video-track'ом или
   * `null` чтобы убрать. После — onLocalStreamsChanged триггерится с
   * актуальной map'ой stream-id'шек.
   */
  setCameraStream(stream: MediaStream | null): void {
    if (stream) {
      const track = stream.getVideoTracks()[0] ?? null;
      if (!track) return;
      if (this.cameraSender) {
        // Просто заменяем track, без renegotiation.
        void this.cameraSender.replaceTrack(track);
        // Обновляем stream-ref на случай если новый stream.
        this.cameraStream = stream;
      } else {
        this.cameraStream = stream;
        this.cameraSender = this.pc.addTrack(track, stream);
      }
    } else if (this.cameraSender) {
      try {
        this.pc.removeTrack(this.cameraSender);
      } catch {
        // ignore
      }
      this.cameraSender = null;
      this.cameraStream = null;
    }
    this.notifyStreamsChanged();
  }

  setScreenStream(stream: MediaStream | null): void {
    if (stream) {
      const track = stream.getVideoTracks()[0] ?? null;
      if (!track) return;
      if (this.screenSender) {
        void this.screenSender.replaceTrack(track);
        this.screenStream = stream;
      } else {
        this.screenStream = stream;
        this.screenSender = this.pc.addTrack(track, stream);
      }
    } else if (this.screenSender) {
      try {
        this.pc.removeTrack(this.screenSender);
      } catch {
        // ignore
      }
      this.screenSender = null;
      this.screenStream = null;
    }
    this.notifyStreamsChanged();
  }

  /**
   * Применить maxBitrate к screen-sender'у через RTCRtpSender.setParameters.
   * Возвращает true при успехе, false — если sender ещё не создан или браузер
   * отверг параметры.
   */
  async applyScreenShareBitrate(bitrateKbps: number): Promise<boolean> {
    const sender = this.screenSender;
    if (!sender) return false;
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    for (const enc of params.encodings) {
      enc.maxBitrate = bitrateKbps * 1000;
    }
    try {
      await sender.setParameters(params);
      return true;
    } catch {
      return false;
    }
  }

  /** Принять map от другой стороны и переклассифицировать pending streams. */
  setRemoteStreamMap(cameraStreamId: string | null, screenStreamId: string | null): void {
    const prevCamera = this.remoteCameraStreamId;
    const prevScreen = this.remoteScreenStreamId;
    this.remoteCameraStreamId = cameraStreamId;
    this.remoteScreenStreamId = screenStreamId;

    // Pending streams — теперь можем доставить.
    for (const [streamId, stream] of this.pendingRemoteVideoStreams) {
      const source = this.classifyRemoteStream(streamId);
      if (source !== 'unknown') {
        this.opts.onRemoteVideo(stream, source);
        this.pendingRemoteVideoStreams.delete(streamId);
      }
    }

    // Если remote убрал stream-id — emit null.
    if (prevCamera && cameraStreamId !== prevCamera) {
      this.opts.onRemoteVideo(null, 'camera');
    }
    if (prevScreen && screenStreamId !== prevScreen) {
      this.opts.onRemoteVideo(null, 'screen');
    }
  }

  // ---- SDP negotiation ----

  /** Применить offer от другой стороны (perfect-negotiation). */
  async applyRemoteOffer(sdp: string): Promise<void> {
    const offerCollision = this.makingOffer || this.pc.signalingState !== 'stable';
    this.ignoreOffer = this.opts.impolite && offerCollision;
    if (this.ignoreOffer) return;

    await this.pc.setRemoteDescription({ type: 'offer', sdp });
    await this.flushPendingIce();
    await this.pc.setLocalDescription();
    if (this.pc.localDescription) {
      this.opts.onLocalSdp(this.pc.localDescription.sdp, 'answer');
    }
  }

  /** Применить answer от другой стороны. */
  async applyRemoteAnswer(sdp: string): Promise<void> {
    if (this.ignoreOffer) return;
    this.isSettingRemoteAnswerPending = true;
    try {
      await this.pc.setRemoteDescription({ type: 'answer', sdp });
      await this.flushPendingIce();
    } finally {
      this.isSettingRemoteAnswerPending = false;
    }
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
      if (!this.ignoreOffer) {
        // Stale candidate — игнор.
      }
    }
  }

  /** Принудительно создать offer (используется при initial setup caller'ом). */
  async forceOffer(): Promise<void> {
    try {
      this.makingOffer = true;
      await this.pc.setLocalDescription();
      if (this.pc.localDescription) {
        this.opts.onLocalSdp(this.pc.localDescription.sdp, 'offer');
      }
    } finally {
      this.makingOffer = false;
    }
  }

  setMuted(muted: boolean): void {
    for (const sender of this.pc.getSenders()) {
      if (sender.track?.kind === 'audio') {
        sender.track.enabled = !muted;
      }
    }
    if (this.localAudioStream) {
      for (const track of this.localAudioStream.getAudioTracks()) {
        track.enabled = !muted;
      }
    }
  }

  close(): void {
    try {
      this.pc.close();
    } catch {
      // ignore
    }
  }

  // ---- internals ----

  private async handleNegotiationNeeded(): Promise<void> {
    try {
      this.makingOffer = true;
      await this.pc.setLocalDescription();
      if (this.pc.localDescription) {
        this.opts.onLocalSdp(this.pc.localDescription.sdp, 'offer');
      }
    } catch {
      // setLocalDescription может упасть если parallel renegotiation.
    } finally {
      this.makingOffer = false;
    }
  }

  private notifyStreamsChanged(): void {
    this.opts.onLocalStreamsChanged(
      this.cameraStream?.id ?? null,
      this.screenStream?.id ?? null,
    );
  }

  private classifyRemoteStream(streamId: string): RemoteVideoSource {
    if (streamId === this.remoteCameraStreamId) return 'camera';
    if (streamId === this.remoteScreenStreamId) return 'screen';
    return 'unknown';
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
