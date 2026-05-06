/**
 * Тонкая обёртка над LiveKit `Room` SDK для голосового канала.
 *
 * - `join(token, wsUrl, channelId, options)` → connect, publish microphone.
 * - `leave()` → disconnect.
 * - `setMuted(muted)` → enable/disable LocalAudioTrack.
 * - На события Room (participants connected/disconnected, speaking, mute)
 *   зеркалим в `useChannelVoice`-store, чтобы UI не зависел от SDK напрямую.
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
} from 'livekit-client';
import { useChannelVoice, type ChannelParticipant } from './channel-store';
import { useVoicePrefs } from './prefs';

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
  /** Audio-элементы для каждого remote-track, чтобы воспроизводить голос. */
  private readonly attachedAudio = new Map<string, HTMLAudioElement>();

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
    });
    this.room = room;
    this.bindEvents(room, opts.myUserId);

    // Сразу регистрируем себя в store — UI должен видеть «Подключение…».
    useChannelVoice.getState().upsertParticipant({
      userId: opts.myUserId,
      name: opts.myDisplayName,
      audioEnabled: false,
      speaking: false,
      isLocal: true,
    });

    await room.connect(opts.wsUrl, opts.token);

    // Публикуем микрофон сразу. PTT-режим всё равно включает publish;
    // mute управляется через track.mute (см. setMuted).
    await room.localParticipant.setMicrophoneEnabled(true);
    const audioPub = Array.from(room.localParticipant.audioTrackPublications.values())[0];
    if (audioPub?.track) {
      this.localAudioTrack = audioPub.track as LocalAudioTrack;
    }
    useChannelVoice.getState().patchParticipant(opts.myUserId, {
      audioEnabled: true,
    });

    // Если в комнате уже кто-то был — добавляем их в store.
    for (const remote of room.remoteParticipants.values()) {
      this.addRemoteParticipant(remote);
    }
  }

  async setMuted(muted: boolean): Promise<void> {
    if (!this.localAudioTrack || !this.room) return;
    if (muted) {
      await this.localAudioTrack.mute();
    } else {
      await this.localAudioTrack.unmute();
    }
    const myId = this.room.localParticipant.identity;
    useChannelVoice.getState().patchParticipant(myId, { audioEnabled: !muted });
  }

  async leave(): Promise<void> {
    for (const audio of this.attachedAudio.values()) {
      audio.srcObject = null;
      audio.remove();
    }
    this.attachedAudio.clear();
    this.localAudioTrack = null;
    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }
  }

  // ---- internals ----

  private bindEvents(room: Room, myUserId: string): void {
    room.on(RoomEvent.ParticipantConnected, (p) => this.addRemoteParticipant(p));
    room.on(RoomEvent.ParticipantDisconnected, (p) => {
      this.detachRemoteTracks(p);
      useChannelVoice.getState().removeParticipant(p.identity);
    });
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      const speakingIds = new Set(speakers.map((s) => s.identity));
      const all = new Set([
        ...room.remoteParticipants.values(),
      ].map((p) => p.identity));
      all.add(myUserId);
      for (const userId of all) {
        useChannelVoice.getState().patchParticipant(userId, {
          speaking: speakingIds.has(userId),
        });
      }
    });
    room.on(RoomEvent.TrackMuted, (_pub, p) => {
      useChannelVoice.getState().patchParticipant(p.identity, { audioEnabled: false });
    });
    room.on(RoomEvent.TrackUnmuted, (_pub, p) => {
      useChannelVoice.getState().patchParticipant(p.identity, { audioEnabled: true });
    });
    room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
      this.attachRemoteTrack(track, participant);
    });
    room.on(RoomEvent.TrackUnsubscribed, (_track, pub, p) => {
      this.detachAudio(pub.trackSid);
      void p;
    });
    room.on(RoomEvent.Disconnected, () => {
      // Само отвалилось — UI решит, переходим в idle.
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
    };
    useChannelVoice.getState().upsertParticipant(participant);
  }

  private attachRemoteTrack(track: RemoteTrack, _p: RemoteParticipant): void {
    if (track.kind !== Track.Kind.Audio) return;
    const audio = track.attach();
    audio.autoplay = true;
    document.body.appendChild(audio);
    this.attachedAudio.set(track.sid ?? `${Math.random()}`, audio);
  }

  private detachAudio(trackSid: string): void {
    const audio = this.attachedAudio.get(trackSid);
    if (!audio) return;
    audio.srcObject = null;
    audio.remove();
    this.attachedAudio.delete(trackSid);
  }

  private detachRemoteTracks(p: RemoteParticipant | Participant): void {
    for (const pub of p.trackPublications.values()) {
      if (pub instanceof Object && 'trackSid' in pub) {
        this.detachAudio((pub as RemoteTrackPublication).trackSid);
      }
    }
  }
}
