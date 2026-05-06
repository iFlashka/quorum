/**
 * Тонкая обёртка над LiveKit `Room` SDK для голосового канала.
 *
 * - `join` → connect + publish микрофона.
 * - `setMuted(muted)` — local audio mute.
 * - `setCameraEnabled(on)` — публикация камеры (LiveKit сам делает getUserMedia).
 * - `setScreenShareEnabled(on)` — `getDisplayMedia` через LiveKit.
 * - На событиях LiveKit Room зеркалим в `useChannelVoice`-store.
 */

import {
  Room,
  RoomEvent,
  Track,
  type LocalAudioTrack,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type ScreenShareCaptureOptions,
  type TrackPublishOptions,
} from 'livekit-client';
import type { ScreenQualitySettings } from '@quorum/shared';
import { useChannelVoice, type ChannelParticipant } from './channel-store';
import { useVoicePrefs } from './prefs';
import { registerOutputAudio } from './audio-output';

export interface JoinOptions {
  token: string;
  wsUrl: string;
  channelId: string;
  guildId: string;
  myUserId: string;
  myDisplayName: string;
}

export class LivekitRoom {
  private room: Room | null = null;
  private localAudioTrack: LocalAudioTrack | null = null;
  /** Audio-элементы для каждого remote-audio-track. */
  private readonly attachedAudio = new Map<string, HTMLAudioElement>();
  /** Unregister-функции для applied output-prefs (sink + volume). */
  private readonly outputUnregister = new Map<string, () => void>();

  async join(opts: JoinOptions): Promise<void> {
    const prefs = useVoicePrefs.getState();
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        autoGainControl: prefs.autoGainControl,
        echoCancellation: prefs.echoCancellation,
        noiseSuppression: prefs.noiseSuppression,
      },
      videoCaptureDefaults: {
        resolution: { width: 1280, height: 720, frameRate: 30 },
      },
    });
    this.room = room;
    this.bindEvents(room, opts.myUserId);

    useChannelVoice.getState().upsertParticipant({
      userId: opts.myUserId,
      name: opts.myDisplayName,
      audioEnabled: false,
      speaking: false,
      isLocal: true,
      cameraTrack: null,
      screenTrack: null,
    });

    await room.connect(opts.wsUrl, opts.token);

    await room.localParticipant.setMicrophoneEnabled(true);
    const audioPub = Array.from(room.localParticipant.audioTrackPublications.values())[0];
    if (audioPub?.track) {
      this.localAudioTrack = audioPub.track as LocalAudioTrack;
    }
    useChannelVoice.getState().patchParticipant(opts.myUserId, {
      audioEnabled: true,
    });

    for (const remote of room.remoteParticipants.values()) {
      this.addRemoteParticipant(remote);
    }
  }

  async setMuted(muted: boolean): Promise<void> {
    if (!this.localAudioTrack || !this.room) return;
    if (muted) await this.localAudioTrack.mute();
    else await this.localAudioTrack.unmute();
    const myId = this.room.localParticipant.identity;
    useChannelVoice.getState().patchParticipant(myId, { audioEnabled: !muted });
  }

  async setCameraEnabled(on: boolean): Promise<void> {
    if (!this.room) return;
    await this.room.localParticipant.setCameraEnabled(on);
    const myId = this.room.localParticipant.identity;
    const stream = on ? this.collectLocalCameraStream() : null;
    useChannelVoice.getState().patchParticipant(myId, { cameraTrack: stream });
  }

  /**
   * Включить/выключить screen-share. При on=true применяется `quality` к
   * capture (resolution/fps) и publish (codec=h264, simulcast=false,
   * maxBitrate из bitrateKbps). При on=false — выключение, без quality.
   */
  async setScreenShareEnabled(
    on: boolean,
    quality?: ScreenQualitySettings,
  ): Promise<void> {
    if (!this.room) return;
    if (!on) {
      await this.room.localParticipant.setScreenShareEnabled(false);
      const myId = this.room.localParticipant.identity;
      useChannelVoice.getState().patchParticipant(myId, { screenTrack: null });
      return;
    }

    const captureOptions: ScreenShareCaptureOptions | undefined = quality
      ? {
          resolution: {
            width: quality.width,
            height: quality.height,
            frameRate: quality.frameRate,
          },
          // Audio из системы — оставляем дефолт (LiveKit предложит чекбокс).
        }
      : undefined;

    const publishOptions: TrackPublishOptions | undefined = quality
      ? {
          videoCodec: 'h264',
          simulcast: false,
          videoEncoding: {
            maxBitrate: quality.bitrateKbps * 1000,
            maxFramerate: quality.frameRate,
          },
        }
      : undefined;

    await this.room.localParticipant.setScreenShareEnabled(
      true,
      captureOptions,
      publishOptions,
    );
    const myId = this.room.localParticipant.identity;
    const stream = this.collectLocalScreenStream();
    useChannelVoice.getState().patchParticipant(myId, { screenTrack: stream });
  }

  /**
   * Deafen — мьютим все attach'нутые audio-элементы локально. Не делаем
   * `setSubscribed(false)` потому что это рвёт sub-протокол; локальный
   * mute достаточен и быстрее реагирует.
   */
  setDeafened(deafened: boolean): void {
    for (const audio of this.attachedAudio.values()) {
      audio.muted = deafened;
    }
  }

  async leave(): Promise<void> {
    for (const audio of this.attachedAudio.values()) {
      audio.srcObject = null;
      audio.remove();
    }
    for (const off of this.outputUnregister.values()) off();
    this.outputUnregister.clear();
    this.attachedAudio.clear();
    this.localAudioTrack = null;
    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }
  }

  // ---- internals ----

  private collectLocalCameraStream(): MediaStream | null {
    if (!this.room) return null;
    for (const pub of this.room.localParticipant.videoTrackPublications.values()) {
      if (pub.source === Track.Source.Camera && pub.track) {
        return pub.track.mediaStream ?? null;
      }
    }
    return null;
  }

  private collectLocalScreenStream(): MediaStream | null {
    if (!this.room) return null;
    for (const pub of this.room.localParticipant.videoTrackPublications.values()) {
      if (pub.source === Track.Source.ScreenShare && pub.track) {
        return pub.track.mediaStream ?? null;
      }
    }
    return null;
  }

  private bindEvents(room: Room, myUserId: string): void {
    room.on(RoomEvent.ParticipantConnected, (p) => this.addRemoteParticipant(p));
    room.on(RoomEvent.ParticipantDisconnected, (p) => {
      this.detachRemoteTracks(p);
      useChannelVoice.getState().removeParticipant(p.identity);
    });
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      const speakingIds = new Set(speakers.map((s) => s.identity));
      const all = new Set(
        [...room.remoteParticipants.values()].map((p) => p.identity),
      );
      all.add(myUserId);
      for (const userId of all) {
        useChannelVoice.getState().patchParticipant(userId, {
          speaking: speakingIds.has(userId),
        });
      }
    });
    room.on(RoomEvent.TrackMuted, (pub, p) => {
      if (pub.kind === Track.Kind.Audio) {
        useChannelVoice.getState().patchParticipant(p.identity, { audioEnabled: false });
      }
    });
    room.on(RoomEvent.TrackUnmuted, (pub, p) => {
      if (pub.kind === Track.Kind.Audio) {
        useChannelVoice.getState().patchParticipant(p.identity, { audioEnabled: true });
      }
    });
    room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
      this.attachRemoteTrack(track, pub, participant);
    });
    room.on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => {
      this.detachRemoteTrack(track, pub, participant);
    });
    room.on(RoomEvent.Disconnected, () => {
      useChannelVoice.getState().reset();
    });
  }

  private addRemoteParticipant(p: RemoteParticipant | Participant): void {
    const audioPub = Array.from(p.audioTrackPublications.values())[0];
    const participant: ChannelParticipant = {
      userId: p.identity,
      name: p.name ?? p.identity,
      audioEnabled: audioPub ? !audioPub.isMuted : false,
      speaking: p.isSpeaking,
      isLocal: false,
      cameraTrack: null,
      screenTrack: null,
    };
    useChannelVoice.getState().upsertParticipant(participant);
  }

  private attachRemoteTrack(
    track: RemoteTrack,
    pub: RemoteTrackPublication,
    p: RemoteParticipant,
  ): void {
    if (track.kind === Track.Kind.Audio) {
      const audio = track.attach();
      audio.autoplay = true;
      document.body.appendChild(audio);
      const key = track.sid ?? `${Math.random()}`;
      this.attachedAudio.set(key, audio);
      this.outputUnregister.set(key, registerOutputAudio(audio));
      return;
    }
    if (track.kind === Track.Kind.Video) {
      const stream = track.mediaStream ?? null;
      if (pub.source === Track.Source.Camera) {
        useChannelVoice.getState().patchParticipant(p.identity, { cameraTrack: stream });
      } else if (pub.source === Track.Source.ScreenShare) {
        useChannelVoice.getState().patchParticipant(p.identity, { screenTrack: stream });
      }
    }
  }

  private detachRemoteTrack(
    track: RemoteTrack,
    pub: RemoteTrackPublication,
    p: RemoteParticipant,
  ): void {
    if (track.kind === Track.Kind.Audio) {
      this.detachAudio(track.sid ?? '');
      return;
    }
    if (track.kind === Track.Kind.Video) {
      if (pub.source === Track.Source.Camera) {
        useChannelVoice.getState().patchParticipant(p.identity, { cameraTrack: null });
      } else if (pub.source === Track.Source.ScreenShare) {
        useChannelVoice.getState().patchParticipant(p.identity, { screenTrack: null });
      }
    }
  }

  private detachAudio(trackSid: string): void {
    const audio = this.attachedAudio.get(trackSid);
    if (!audio) return;
    audio.srcObject = null;
    audio.remove();
    this.attachedAudio.delete(trackSid);
    this.outputUnregister.get(trackSid)?.();
    this.outputUnregister.delete(trackSid);
  }

  private detachRemoteTracks(p: RemoteParticipant | Participant): void {
    for (const pub of p.trackPublications.values()) {
      if ('trackSid' in pub) {
        this.detachAudio((pub as RemoteTrackPublication).trackSid);
      }
    }
  }
}
