import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Disc3,
  Heart,
  ListMusic,
  LoaderCircle,
  Music4,
  Pause,
  Play,
  Plus,
  Radio,
  Search,
  Settings2,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import ActionDialog from './ActionDialog';
import { authService } from '../lib/authApi';
import { musicService } from '../lib/databaseApi';
import { notify } from '../lib/notify';
import type {
  MusicCollectionPlaylistSummary,
  MusicCollectionsPayload,
  MusicLoginSession,
  MusicPlayerState,
  MusicSearchPayload,
  MusicSource,
  MusicTrack,
  User,
} from '../lib/types';

type MusicView = 'search' | 'favorites' | 'queue' | 'sources';

interface SourceDraft {
  id?: string;
  name: string;
  cookie: string;
  quality: 'm4a' | '128' | '320';
  is_enabled: boolean;
  is_default: boolean;
}

const VIEW_ITEMS: Array<{ key: MusicView; label: string; icon: typeof Search }> = [
  { key: 'search', label: '搜索', icon: Search },
  { key: 'favorites', label: '收藏', icon: Heart },
  { key: 'queue', label: '队列', icon: ListMusic },
  { key: 'sources', label: '音乐源', icon: Radio },
];

const QUALITY_OPTIONS: Array<{ value: SourceDraft['quality']; label: string }> = [
  { value: '128', label: '128k MP3' },
  { value: '320', label: '320k MP3' },
  { value: 'm4a', label: 'M4A' },
];

const TRACK_STALE_MS = 1000 * 60 * 20;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampIndex(index: number, length: number) {
  if (length <= 0) {
    return 0;
  }

  return clamp(index, 0, length - 1);
}

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function isTrackFresh(track: MusicTrack | null) {
  if (!track?.stream_url || !track.resolved_at) {
    return false;
  }

  const resolvedAt = new Date(track.resolved_at).getTime();
  if (!Number.isFinite(resolvedAt)) {
    return false;
  }

  return Date.now() - resolvedAt < TRACK_STALE_MS;
}

function createSourceDraft(source?: MusicSource | null): SourceDraft {
  if (!source) {
    return {
      name: '',
      cookie: '',
      quality: '128',
      is_enabled: true,
      is_default: false,
    };
  }

  return {
    id: source.id,
    name: source.name,
    cookie: source.config.cookie ?? '',
    quality: source.config.quality ?? '128',
    is_enabled: source.is_enabled,
    is_default: source.is_default,
  };
}

export default function GlobalMusicPlayer() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [sources, setSources] = useState<MusicSource[]>([]);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [queue, setQueue] = useState<MusicTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.82);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCoverOnlyMode, setIsCoverOnlyMode] = useState(false);
  const [showCompactVolumeSlider, setShowCompactVolumeSlider] = useState(false);
  const [activeView, setActiveView] = useState<MusicView>('search');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResult, setSearchResult] = useState<MusicSearchPayload | null>(null);
  const [collections, setCollections] = useState<MusicCollectionsPayload | null>(null);
  const [collectionsSourceId, setCollectionsSourceId] = useState<string | null>(null);
  const [isLoadingCollections, setIsLoadingCollections] = useState(false);
  const [collectionsError, setCollectionsError] = useState('');
  const [selectedCollectionPlaylist, setSelectedCollectionPlaylist] = useState<MusicCollectionPlaylistSummary | null>(null);
  const [selectedCollectionTracks, setSelectedCollectionTracks] = useState<MusicTrack[]>([]);
  const [isLoadingCollectionPlaylist, setIsLoadingCollectionPlaylist] = useState(false);
  const [collectionPlaylistError, setCollectionPlaylistError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [busyTrackId, setBusyTrackId] = useState<string | null>(null);
  const [showSourceForm, setShowSourceForm] = useState(false);
  const [sourceDraft, setSourceDraft] = useState<SourceDraft>(createSourceDraft());
  const [isSavingSource, setIsSavingSource] = useState(false);
  const [deleteSourceId, setDeleteSourceId] = useState<string | null>(null);
  const [wechatLoginSession, setWechatLoginSession] = useState<MusicLoginSession | null>(null);
  const [isWechatLoggingIn, setIsWechatLoggingIn] = useState(false);
  const [showCookieField, setShowCookieField] = useState(false);
  const [statusText, setStatusText] = useState('安静地放一首歌。');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hydratedRef = useRef(false);
  const queueRef = useRef<MusicTrack[]>([]);
  const currentIndexRef = useRef(0);
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const volumeRef = useRef(0.82);
  const mutedRef = useRef(false);
  const activeSourceIdRef = useRef<string | null>(null);
  const expandedRef = useRef(false);
  const playingRef = useRef(false);
  const persistTimerRef = useRef<number | null>(null);
  const playRequestIdRef = useRef(0);
  const lastProgressPersistRef = useRef(0);
  const compactVolumeRef = useRef<HTMLDivElement | null>(null);
  const compactVolumeTrackRef = useRef<HTMLDivElement | null>(null);
  const compactVolumeDraggingRef = useRef(false);
  const coverTapTimerRef = useRef<number | null>(null);

  const currentTrack = useMemo(() => queue[currentIndex] ?? null, [queue, currentIndex]);
  const enabledSources = useMemo(() => sources.filter((source) => source.is_enabled), [sources]);
  const collectionPlaylists = useMemo(() => {
    if (!collections) {
      return [];
    }

    return [
      ...(collections.liked_songs_playlist ? [collections.liked_songs_playlist] : []),
      ...collections.created_playlists,
      ...collections.collected_playlists,
    ];
  }, [collections]);
  const activeSource = useMemo(() => {
    return (
      enabledSources.find((source) => source.id === activeSourceId) ??
      enabledSources.find((source) => source.is_default) ??
      enabledSources[0] ??
      sources.find((source) => source.id === activeSourceId) ??
      sources[0] ??
      null
    );
  }, [activeSourceId, enabledSources, sources]);

  const syncRefs = useCallback(() => {
    queueRef.current = queue;
    currentIndexRef.current = currentIndex;
    currentTimeRef.current = currentTime;
    durationRef.current = duration;
    volumeRef.current = volume;
    mutedRef.current = isMuted;
    activeSourceIdRef.current = activeSourceId;
    expandedRef.current = isExpanded;
    playingRef.current = isPlaying;
  }, [activeSourceId, currentIndex, currentTime, duration, isExpanded, isMuted, isPlaying, queue, volume]);

  useEffect(() => {
    syncRefs();
  }, [syncRefs]);

  const persistPlayerState = useCallback(async (overrides: Partial<MusicPlayerState> = {}) => {
    if (!currentUser || !hydratedRef.current) {
      return;
    }

    try {
      const nextQueue = overrides.queue ?? queueRef.current;
      const safeIndex = nextQueue.length === 0 ? 0 : clampIndex(overrides.current_index ?? currentIndexRef.current, nextQueue.length);
      await musicService.updatePlayerState({
        active_source_id: overrides.active_source_id ?? activeSourceIdRef.current,
        queue: nextQueue,
        current_index: safeIndex,
        current_time: nextQueue.length === 0 ? 0 : overrides.current_time ?? currentTimeRef.current,
        volume: overrides.volume ?? volumeRef.current,
        is_muted: overrides.is_muted ?? mutedRef.current,
        is_expanded: overrides.is_expanded ?? expandedRef.current,
        is_playing: overrides.is_playing ?? playingRef.current,
      });
    } catch {
      // Ignore sync errors to keep playback responsive.
    }
  }, [currentUser]);

  const schedulePersist = useCallback((overrides: Partial<MusicPlayerState> = {}) => {
    if (!currentUser || !hydratedRef.current) {
      return;
    }

    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
    }

    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      void persistPlayerState(overrides);
    }, 700);
  }, [currentUser, persistPlayerState]);

  const replaceQueue = useCallback((nextQueue: MusicTrack[], nextIndex: number, resetTime = true) => {
    const safeIndex = clampIndex(nextIndex, nextQueue.length);
    queueRef.current = nextQueue;
    setQueue(nextQueue);
    currentIndexRef.current = safeIndex;
    setCurrentIndex(safeIndex);

    if (resetTime) {
      currentTimeRef.current = 0;
      setCurrentTime(0);
    }

    const nextDuration = nextQueue[safeIndex]?.duration ?? 0;
    durationRef.current = nextDuration;
    setDuration(nextDuration);
  }, []);

  const syncSourcesAndSelection = useCallback(async () => {
    const [nextSources, nextState] = await Promise.all([
      musicService.getSources(),
      musicService.getPlayerState(),
    ]);

    setSources(nextSources);
    const nextActiveSourceId =
      nextState.active_source_id ??
      nextSources.find((source) => source.is_default && source.is_enabled)?.id ??
      nextSources.find((source) => source.is_enabled)?.id ??
      nextSources[0]?.id ??
      null;

    activeSourceIdRef.current = nextActiveSourceId;
    setActiveSourceId(nextActiveSourceId);
    return { nextSources, nextState };
  }, []);

  const startPlayback = useCallback(async (
    index: number,
    options?: {
      queue?: MusicTrack[];
      startTime?: number;
      autoPlay?: boolean;
    },
  ) => {
    const incomingQueue = options?.queue ?? queueRef.current;
    if (incomingQueue.length === 0) {
      return;
    }

    const safeIndex = clampIndex(index, incomingQueue.length);
    const track = incomingQueue[safeIndex];
    if (!track) {
      return;
    }

    if (options?.queue) {
      replaceQueue(incomingQueue, safeIndex, true);
    } else {
      currentIndexRef.current = safeIndex;
      setCurrentIndex(safeIndex);
      currentTimeRef.current = options?.startTime ?? currentTimeRef.current;
      setCurrentTime(currentTimeRef.current);
    }

    const requestId = playRequestIdRef.current + 1;
    playRequestIdRef.current = requestId;
    setBusyTrackId(track.id);
    setStatusText(`正在准备 ${track.title}`);

    try {
      const resolvedTrack = isTrackFresh(track) ? track : await musicService.resolveTrack(track, track.source_id);

      if (playRequestIdRef.current !== requestId) {
        return;
      }

      const finalQueue = [...(options?.queue ?? queueRef.current)];
      finalQueue[safeIndex] = {
        ...finalQueue[safeIndex],
        ...resolvedTrack,
      };
      queueRef.current = finalQueue;
      setQueue(finalQueue);

      const finalTrack = finalQueue[safeIndex];
      if (!finalTrack?.stream_url) {
        throw new Error('当前歌曲暂时没有可用的播放地址。');
      }

      const audio = audioRef.current;
      if (!audio) {
        return;
      }

      const desiredTime = Math.max(0, options?.startTime ?? 0);
      const shouldReload = audio.src !== finalTrack.stream_url;

      if (shouldReload) {
        audio.src = finalTrack.stream_url;
        audio.load();
      }

      if (desiredTime > 0) {
        const applyTime = () => {
          try {
            audio.currentTime = desiredTime;
          } catch {
            // Ignore seek failure before metadata is ready.
          }
        };

        if (shouldReload) {
          audio.addEventListener('loadedmetadata', applyTime, { once: true });
        } else {
          applyTime();
        }
      }

      currentIndexRef.current = safeIndex;
      setCurrentIndex(safeIndex);
      currentTimeRef.current = desiredTime;
      setCurrentTime(desiredTime);
      durationRef.current = finalTrack.duration ?? 0;
      setDuration(finalTrack.duration ?? 0);
      setStatusText(`正在播放 ${finalTrack.title}`);

      if (options?.autoPlay === false) {
        setIsPlaying(false);
        playingRef.current = false;
        return;
      }

      try {
        await audio.play();
      } catch (error) {
        setIsPlaying(false);
        playingRef.current = false;

        const message =
          error instanceof Error && error.name === 'NotAllowedError'
            ? '歌曲已经准备好，再点一次播放即可开始。'
            : error instanceof Error
              ? error.message
              : '当前歌曲暂时无法播放。';
        notify.error('播放失败', message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '当前音乐源暂不可用。';
      notify.error('音乐加载失败', message);
      setStatusText('当前音乐源暂不可用。');
    } finally {
      if (playRequestIdRef.current === requestId) {
        setBusyTrackId(null);
      }
    }
  }, [replaceQueue]);

  const handleStepTrack = useCallback(async (direction: -1 | 1) => {
    const activeQueue = queueRef.current;
    if (activeQueue.length === 0) {
      return;
    }

    const nextIndex = (currentIndexRef.current + direction + activeQueue.length) % activeQueue.length;
    await startPlayback(nextIndex, { startTime: 0 });
  }, [startPlayback]);

  const handleTogglePlay = useCallback(async () => {
    const audio = audioRef.current;

    if (!currentTrack) {
      if (searchResult?.tracks.length) {
        setActiveView('queue');
        await startPlayback(0, { queue: searchResult.tracks, startTime: 0 });
        return;
      }

      setIsExpanded(true);
      setStatusText('先搜索一首喜欢的歌。');
      return;
    }

    if (audio && !audio.paused) {
      audio.pause();
      return;
    }

    if (audio && currentTrack.stream_url && isTrackFresh(currentTrack) && audio.src === currentTrack.stream_url) {
      try {
        if (currentTimeRef.current > 0 && Math.abs(audio.currentTime - currentTimeRef.current) > 1) {
          audio.currentTime = currentTimeRef.current;
        }
        await audio.play();
      } catch (error) {
        const message = error instanceof Error ? error.message : '无法继续播放当前歌曲。';
        notify.error('播放失败', message);
      }
      return;
    }

    await startPlayback(currentIndexRef.current, { startTime: currentTimeRef.current || 0 });
  }, [currentTrack, searchResult, startPlayback]);

  const clearCoverTapTimer = useCallback(() => {
    if (coverTapTimerRef.current) {
      window.clearTimeout(coverTapTimerRef.current);
      coverTapTimerRef.current = null;
    }
  }, []);

  const enterCoverOnlyMode = useCallback(() => {
    clearCoverTapTimer();
    setShowCompactVolumeSlider(false);
    setIsExpanded(false);
    setIsCoverOnlyMode(true);
  }, [clearCoverTapTimer]);

  const exitCoverOnlyMode = useCallback(() => {
    clearCoverTapTimer();
    setIsCoverOnlyMode(false);
  }, [clearCoverTapTimer]);

  const handleSearch = useCallback(async () => {
    const keyword = searchKeyword.trim();
    if (!keyword) {
      return;
    }

    if (!activeSource) {
      notify.error('没有可用音乐源', '请先添加或启用一个音乐源。');
      setActiveView('sources');
      return;
    }

    setIsSearching(true);
    setStatusText(`正在搜索 ${keyword}`);

    try {
      const result = await musicService.search(keyword, activeSource.id);
      setSearchResult(result);
      setStatusText(result.tracks.length > 0 ? `找到 ${result.tracks.length} 首歌曲` : '没有找到匹配的歌曲');
    } catch (error) {
      const message = error instanceof Error ? error.message : '搜索失败。';
      notify.error('搜索失败', message);
      setStatusText('搜索失败，请稍后重试。');
    } finally {
      setIsSearching(false);
    }
  }, [activeSource, searchKeyword]);

  const handlePlaySearchResult = useCallback(async (trackIndex: number) => {
    if (!searchResult?.tracks.length) {
      return;
    }

    setActiveView('queue');
    await startPlayback(trackIndex, {
      queue: searchResult.tracks,
      startTime: 0,
    });
  }, [searchResult, startPlayback]);

  const handleAppendTrack = useCallback((track: MusicTrack) => {
    const nextQueue = [...queueRef.current, track];
    queueRef.current = nextQueue;
    setQueue(nextQueue);

    if (nextQueue.length === 1) {
      setActiveView('queue');
      void startPlayback(0, { queue: nextQueue, startTime: 0 });
      return;
    }

    notify.success('已加入播放队列', track.title);
    schedulePersist({ queue: nextQueue });
  }, [schedulePersist, startPlayback]);

  const handlePlayCollectionTrack = useCallback(async (trackIndex: number) => {
    if (!selectedCollectionTracks.length) {
      return;
    }

    setActiveView('queue');
    await startPlayback(trackIndex, {
      queue: selectedCollectionTracks,
      startTime: 0,
    });
  }, [selectedCollectionTracks, startPlayback]);

  const handleClearQueue = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }

    setIsPlaying(false);
    playingRef.current = false;
    replaceQueue([], 0, true);
    setStatusText('播放队列已清空。');
    void persistPlayerState({
      queue: [],
      current_index: 0,
      current_time: 0,
      is_playing: false,
    });
  }, [persistPlayerState, replaceQueue]);

  const handleBackToCollectionOverview = useCallback(() => {
    setSelectedCollectionPlaylist(null);
    setSelectedCollectionTracks([]);
    setCollectionPlaylistError('');
  }, []);

  const handleOpenCollectionPlaylist = useCallback(async (playlist: MusicCollectionPlaylistSummary) => {
    if (!activeSource) {
      return;
    }

    setSelectedCollectionPlaylist(playlist);
    setSelectedCollectionTracks([]);
    setCollectionPlaylistError('');
    setIsLoadingCollectionPlaylist(true);

    try {
      if (playlist.kind === 'liked_songs' && collections?.liked_tracks?.length) {
        setSelectedCollectionTracks(collections.liked_tracks);
      } else {
        const detail = await musicService.getCollectionPlaylist(activeSource.id, playlist);
        setSelectedCollectionTracks(detail.tracks);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '读取歌单失败';
      setCollectionPlaylistError(message);
      notify.error('歌单读取失败', message);
    } finally {
      setIsLoadingCollectionPlaylist(false);
    }
  }, [activeSource, collections]);

  const openCreateSourceForm = useCallback(() => {
    setShowSourceForm(true);
    setWechatLoginSession(null);
    setShowCookieField(false);
    setSourceDraft({
      name: sources.length > 0 ? `QQ音乐 ${sources.length + 1}` : 'QQ音乐',
      cookie: '',
      quality: '128',
      is_enabled: true,
      is_default: false,
    });
  }, [sources.length]);

  const handleOpenWechatLogin = useCallback(async () => {
    setIsWechatLoggingIn(true);

    try {
      const session = await musicService.createQQLoginSession('wechat');
      setWechatLoginSession(session);
      notify.info('二维码已生成', '请使用微信扫码并在手机上确认登录。');
    } catch (error) {
      const message = error instanceof Error ? error.message : '微信登录初始化失败。';
      notify.error('无法发起登录', message);
    } finally {
      setIsWechatLoggingIn(false);
    }
  }, []);

  const openEditSourceForm = useCallback((source: MusicSource) => {
    setActiveView('sources');
    setShowSourceForm(true);
    setWechatLoginSession(null);
    setShowCookieField(false);
    setSourceDraft(createSourceDraft(source));
  }, []);

  const closeSourceForm = useCallback(() => {
    setShowSourceForm(false);
    setWechatLoginSession(null);
    setShowCookieField(false);
    setSourceDraft(createSourceDraft());
  }, []);

  const handleSaveSource = useCallback(async () => {
    const name = sourceDraft.name.trim();
    if (!name) {
      notify.error('请输入音乐源名称');
      return;
    }

    setIsSavingSource(true);

    try {
      if (sourceDraft.id) {
        await musicService.updateSource(sourceDraft.id, {
          name,
          config: {
            cookie: sourceDraft.cookie.trim() || null,
            quality: sourceDraft.quality,
          },
          is_enabled: sourceDraft.is_enabled,
          is_default: sourceDraft.is_default,
        });
      } else {
        await musicService.createSource({
          name,
          type: 'qq_music',
          config: {
            cookie: sourceDraft.cookie.trim() || null,
            quality: sourceDraft.quality,
          },
          is_enabled: sourceDraft.is_enabled,
          is_default: sourceDraft.is_default,
        });
      }

      const { nextState } = await syncSourcesAndSelection();
      if (nextState.active_source_id) {
        setActiveSourceId(nextState.active_source_id);
      }
      closeSourceForm();
      notify.success(sourceDraft.id ? '音乐源已更新' : '音乐源已添加');
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存音乐源失败。';
      notify.error('保存失败', message);
    } finally {
      setIsSavingSource(false);
    }
  }, [closeSourceForm, sourceDraft, syncSourcesAndSelection]);

  const handleConfirmDeleteSource = useCallback(async () => {
    if (!deleteSourceId) {
      return;
    }

    try {
      await musicService.deleteSource(deleteSourceId);

      const activeQueue = queueRef.current.filter((track) => track.source_id !== deleteSourceId);
      if (activeQueue.length !== queueRef.current.length) {
        const currentTrackUsesDeletedSource = queueRef.current[currentIndexRef.current]?.source_id === deleteSourceId;
        if (currentTrackUsesDeletedSource) {
          const audio = audioRef.current;
          if (audio) {
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
          }
          setIsPlaying(false);
          playingRef.current = false;
        }

        replaceQueue(activeQueue, Math.min(currentIndexRef.current, Math.max(0, activeQueue.length - 1)), true);
      }

      await syncSourcesAndSelection();
      notify.success('音乐源已删除');
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除音乐源失败。';
      notify.error('删除失败', message);
    } finally {
      setDeleteSourceId(null);
    }
  }, [deleteSourceId, replaceQueue, syncSourcesAndSelection]);

  const loadCollections = useCallback(async (force = false) => {
    if (!activeSource) {
      setCollections(null);
      setCollectionsSourceId(null);
      setCollectionsError('');
      setSelectedCollectionPlaylist(null);
      setSelectedCollectionTracks([]);
      setCollectionPlaylistError('');
      return;
    }

    if (!activeSource.config.cookie?.trim()) {
      setCollections(null);
      setCollectionsSourceId(null);
      setCollectionsError('');
      setSelectedCollectionPlaylist(null);
      setSelectedCollectionTracks([]);
      setCollectionPlaylistError('');
      return;
    }

    if (!force && collectionsSourceId === activeSource.id && collections) {
      return;
    }

    setIsLoadingCollections(true);
    setCollectionsError('');
    setSelectedCollectionPlaylist(null);
    setSelectedCollectionTracks([]);
    setCollectionPlaylistError('');

    try {
      const nextCollections = await musicService.getCollections(activeSource.id);
      setCollections(nextCollections);
      setCollectionsSourceId(activeSource.id);
      setStatusText(nextCollections.liked_tracks.length > 0 ? '已同步 QQ 音乐收藏' : '收藏歌单已同步');
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取 QQ 音乐收藏失败。';
      setCollections(null);
      setCollectionsSourceId(null);
      setCollectionsError(message);
      setSelectedCollectionPlaylist(null);
      setSelectedCollectionTracks([]);
      setCollectionPlaylistError(message);
      notify.error('收藏加载失败', message);
    } finally {
      setIsLoadingCollections(false);
    }
  }, [activeSource, collections, collectionsSourceId]);

  useEffect(() => {
    const syncUser = async () => {
      const user = await authService.init();
      setCurrentUser(user);
    };

    void syncUser();
    const unsubscribe = authService.subscribe((user) => {
      setCurrentUser(user);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'none';
    audio.volume = volumeRef.current;
    audio.muted = mutedRef.current;
    audioRef.current = audio;

    return () => {
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
      }

      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!currentUser) {
      hydratedRef.current = false;
      setSources([]);
      setSearchResult(null);
      setCollections(null);
      setCollectionsSourceId(null);
      setCollectionsError('');
      setQueue([]);
      setCurrentIndex(0);
      setCurrentTime(0);
      setDuration(0);
      setIsPlaying(false);
      setActiveSourceId(null);
      setShowSourceForm(false);
      setDeleteSourceId(null);
      setStatusText('登录后即可使用背景音乐。');

      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
      return;
    }

    let cancelled = false;

    const loadMusicState = async () => {
      setIsInitializing(true);

      try {
        const [nextSources, nextState] = await Promise.all([
          musicService.getSources(),
          musicService.getPlayerState(),
        ]);

        if (cancelled) {
          return;
        }

        const resolvedActiveSourceId =
          nextState.active_source_id ??
          nextSources.find((source) => source.is_default && source.is_enabled)?.id ??
          nextSources.find((source) => source.is_enabled)?.id ??
          nextSources[0]?.id ??
          null;
        const safeIndex = clampIndex(nextState.current_index, nextState.queue.length);
        const restoredQueue = Array.isArray(nextState.queue) ? nextState.queue : [];
        const restoredTrack = restoredQueue[safeIndex] ?? null;

        setSources(nextSources);
        setActiveSourceId(resolvedActiveSourceId);
        setQueue(restoredQueue);
        setCurrentIndex(safeIndex);
        setCurrentTime(nextState.current_time ?? 0);
        setDuration(restoredTrack?.duration ?? 0);
        setVolume(nextState.volume ?? 0.82);
        setIsMuted(Boolean(nextState.is_muted));
        setIsExpanded(Boolean(nextState.is_expanded));
        setIsPlaying(false);
        setStatusText(restoredTrack ? `已恢复 ${restoredTrack.title}` : '搜索一首歌，让页面慢下来。');

        queueRef.current = restoredQueue;
        currentIndexRef.current = safeIndex;
        currentTimeRef.current = nextState.current_time ?? 0;
        durationRef.current = restoredTrack?.duration ?? 0;
        volumeRef.current = nextState.volume ?? 0.82;
        mutedRef.current = Boolean(nextState.is_muted);
        activeSourceIdRef.current = resolvedActiveSourceId;
        expandedRef.current = Boolean(nextState.is_expanded);
        playingRef.current = false;
        lastProgressPersistRef.current = nextState.current_time ?? 0;

        const audio = audioRef.current;
        if (audio) {
          audio.pause();
          audio.volume = nextState.volume ?? 0.82;
          audio.muted = Boolean(nextState.is_muted);

          if (restoredTrack?.stream_url && isTrackFresh(restoredTrack)) {
            audio.src = restoredTrack.stream_url;
            audio.load();
            if ((nextState.current_time ?? 0) > 0) {
              const resumeTime = nextState.current_time;
              audio.addEventListener(
                'loadedmetadata',
                () => {
                  try {
                    audio.currentTime = resumeTime;
                  } catch {
                    // Ignore seek failure on restore.
                  }
                },
                { once: true },
              );
            }
          } else {
            audio.removeAttribute('src');
            audio.load();
          }
        }

        hydratedRef.current = true;
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : '背景音乐初始化失败。';
          notify.error('音乐加载失败', message);
          setStatusText('背景音乐初始化失败。');
        }
      } finally {
        if (!cancelled) {
          setIsInitializing(false);
        }
      }
    };

    void loadMusicState();

    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const handlePlay = () => {
      setIsPlaying(true);
      playingRef.current = true;
      setStatusText(currentTrack ? `正在播放 ${currentTrack.title}` : '开始播放');
      schedulePersist({ is_playing: true });
    };

    const handlePause = () => {
      setIsPlaying(false);
      playingRef.current = false;
      setStatusText(currentTrack ? `已暂停 ${currentTrack.title}` : '播放已暂停');
      void persistPlayerState({ is_playing: false });
    };

    const handleLoadedMetadata = () => {
      const nextDuration =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : queueRef.current[currentIndexRef.current]?.duration ?? 0;
      durationRef.current = nextDuration;
      setDuration(nextDuration);
    };

    const handleTimeUpdate = () => {
      const nextTime = audio.currentTime || 0;
      currentTimeRef.current = nextTime;
      setCurrentTime(nextTime);

      if (Math.abs(nextTime - lastProgressPersistRef.current) >= 15) {
        lastProgressPersistRef.current = nextTime;
        void persistPlayerState({ current_time: nextTime });
      }
    };

    const handleEnded = () => {
      void handleStepTrack(1);
    };

    const handleError = () => {
      setIsPlaying(false);
      playingRef.current = false;
      setStatusText('当前歌曲播放中断。');
      notify.error('播放中断', '这首歌暂时无法播放，请切换下一首。');
      void persistPlayerState({ is_playing: false });
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [currentTrack, handleStepTrack, persistPlayerState, schedulePersist]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.muted = isMuted;
  }, [isMuted]);

  useEffect(() => {
    if (!currentUser || !hydratedRef.current) {
      return;
    }

    schedulePersist();
  }, [activeSourceId, currentUser, isExpanded, isMuted, queue, currentIndex, schedulePersist, volume]);

  useEffect(() => {
    if (!currentUser || !hydratedRef.current || !isPlaying || !currentTrack) {
      return;
    }

    const intervalId = window.setInterval(() => {
      lastProgressPersistRef.current = currentTimeRef.current;
      void persistPlayerState({ current_time: currentTimeRef.current, is_playing: true });
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [currentTrack, currentUser, isPlaying, persistPlayerState]);

  useEffect(() => {
    if (!activeSource) {
      setCollections(null);
      setCollectionsSourceId(null);
      setCollectionsError('');
      return;
    }

    if (collectionsSourceId && collectionsSourceId !== activeSource.id) {
      setCollections(null);
      setCollectionsSourceId(null);
      setCollectionsError('');
    }
  }, [activeSource, collectionsSourceId]);

  useEffect(() => {
    if (activeView !== 'favorites') {
      return;
    }

    if (!activeSource?.config.cookie?.trim()) {
      return;
    }

    if (collectionsSourceId === activeSource.id && collections) {
      return;
    }

    void loadCollections();
  }, [activeSource, activeView, collections, collectionsSourceId, loadCollections]);

  useEffect(() => {
    if (!showSourceForm || !wechatLoginSession?.id) {
      return;
    }

    if (
      wechatLoginSession.status === 'authorized'
      || wechatLoginSession.status === 'expired'
      || wechatLoginSession.status === 'failed'
    ) {
      return;
    }

    let cancelled = false;
    const timerId = window.setInterval(async () => {
      try {
        const nextSession = await musicService.getQQLoginSessionStatus(wechatLoginSession.id);
        if (cancelled) {
          return;
        }

        setWechatLoginSession(nextSession);
        if (nextSession.status === 'authorized' && nextSession.cookie) {
          setSourceDraft((prev) => ({
            ...prev,
            cookie: nextSession.cookie || '',
          }));
          setShowCookieField(false);
          notify.success('微信登录成功', '授权已自动写入当前音乐源。');
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : '登录状态获取失败。';
        setWechatLoginSession((prev) => (
          prev
            ? {
                ...prev,
                status: 'failed',
                message,
              }
            : prev
        ));
      }
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(timerId);
    };
  }, [showSourceForm, wechatLoginSession]);

  useEffect(() => {
    if (!showCompactVolumeSlider) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (compactVolumeRef.current?.contains(event.target as Node)) {
        return;
      }

      setShowCompactVolumeSlider(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [showCompactVolumeSlider]);

  const updateCompactVolumeFromClientY = useCallback((clientY: number) => {
    const track = compactVolumeTrackRef.current;
    if (!track) {
      return;
    }

    const rect = track.getBoundingClientRect();
    const ratio = 1 - clamp((clientY - rect.top) / rect.height, 0, 1);
    setVolume(ratio);
    setIsMuted(ratio <= 0.01);
  }, []);

  useEffect(() => {
    if (!showCompactVolumeSlider) {
      compactVolumeDraggingRef.current = false;
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      if (!compactVolumeDraggingRef.current) {
        return;
      }

      updateCompactVolumeFromClientY(event.clientY);
    };

    const handleMouseUp = () => {
      compactVolumeDraggingRef.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [showCompactVolumeSlider, updateCompactVolumeFromClientY]);

  useEffect(() => {
    return () => {
      if (coverTapTimerRef.current) {
        window.clearTimeout(coverTapTimerRef.current);
      }
    };
  }, []);

  const playbackDuration = duration > 0 ? duration : currentTrack?.duration ?? 0;
  const compactTitle = currentTrack?.title ?? '背景音乐';
  const compactArtist = currentTrack?.artist ?? '搜索 QQ 音乐后开始播放';
  const canControlPlayback = Boolean(currentTrack);
  const lyricLines = currentTrack?.lyric_lines ?? [];
  let activeLyricIndex = -1;
  for (let i = 0; i < lyricLines.length; i += 1) {
    if (currentTime >= lyricLines[i].time) {
      activeLyricIndex = i;
    } else {
      break;
    }
  }
  const currentLyric = activeLyricIndex >= 0 ? lyricLines[activeLyricIndex] : null;
  const showCompactLoader = Boolean(busyTrackId) && !isPlaying;
  const hasSourceCookie = Boolean(sourceDraft.cookie.trim());
  const activeSourceName = activeSource?.name ?? 'QQ音乐';
  const activeSourceHasCookie = Boolean(activeSource?.config.cookie?.trim());
  const shouldScrollCompactTitle = compactTitle.length > 12;
  const playbackProgressPercent = playbackDuration > 0 ? Math.min(100, Math.max(0, (currentTime / playbackDuration) * 100)) : 0;
  const compactVolumeValue = isMuted ? 0 : volume;

  if (!currentUser) {
    return null;
  }

  return (
    <>
      <style>
        {`
          @keyframes musicCompactMarquee {
            0% { transform: translateX(0); }
            100% { transform: translateX(calc(-50% - 0.9rem)); }
          }
        `}
      </style>
      <div
        className={`fixed bottom-3 left-3 z-[75] transition-[width] duration-300 ease-out sm:bottom-4 sm:left-3 ${
          isCoverOnlyMode
            ? 'w-[72px] sm:w-[72px]'
            : isExpanded
            ? 'w-[min(348px,calc(100vw-24px))] sm:w-[340px]'
            : 'w-[min(228px,calc(100vw-24px))] sm:w-[228px]'
        }`}
      >
        {isCoverOnlyMode ? (
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => {
                clearCoverTapTimer();
                coverTapTimerRef.current = window.setTimeout(() => {
                  coverTapTimerRef.current = null;
                  void handleTogglePlay();
                }, 220);
              }}
              onDoubleClick={() => {
                clearCoverTapTimer();
                exitCoverOnlyMode();
              }}
              className="group relative h-[64px] w-[64px] overflow-hidden rounded-full border border-white/80 bg-white/60 shadow-[0_18px_36px_rgba(15,23,42,0.18),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl transition hover:-translate-y-0.5"
              aria-label="单击播放或暂停，双击展开播放器"
            >
              {currentTrack?.cover_url ? (
                <img src={currentTrack.cover_url} alt={currentTrack.title} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-sky-100 via-white to-emerald-50 text-slate-500">
                  <Music4 className="h-7 w-7" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/18 via-transparent to-transparent" />
              {showCompactLoader ? (
                <div className="absolute inset-0 flex items-center justify-center text-white drop-shadow-[0_3px_10px_rgba(15,23,42,0.35)]">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                </div>
              ) : isPlaying ? (
                <div className="absolute bottom-3 right-3 flex h-5 items-end justify-center gap-0.5 rounded-full px-1.5 py-1">
                  <span className="h-2.5 w-0.5 animate-pulse rounded-full bg-white/95 shadow-[0_2px_6px_rgba(15,23,42,0.28)]" />
                  <span className="h-4 w-0.5 animate-pulse rounded-full bg-white/95 shadow-[0_2px_6px_rgba(15,23,42,0.28)] [animation-delay:120ms]" />
                  <span className="h-3 w-0.5 animate-pulse rounded-full bg-white/95 shadow-[0_2px_6px_rgba(15,23,42,0.28)] [animation-delay:240ms]" />
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-white drop-shadow-[0_3px_10px_rgba(15,23,42,0.38)]">
                  <Play className="ml-0.5 h-5 w-5" />
                </div>
              )}
            </button>
          </div>
        ) : (
        <div className="overflow-hidden rounded-[26px] border border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.7),rgba(255,255,255,0.42))] shadow-[0_18px_40px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl">
          <div className="relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(244,114,182,0.16),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.5),rgba(255,255,255,0.18))]" />

            <div className="relative px-2.5 pb-2.5 pt-2.5">
              <div className="rounded-[22px] border border-white/65 bg-white/34 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur-md">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onDoubleClick={() => {
                      enterCoverOnlyMode();
                    }}
                    className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[16px] bg-white/70 shadow-[0_10px_20px_rgba(15,23,42,0.16)] ring-1 ring-white/90"
                    aria-label="双击收起为封面模式"
                  >
                    {currentTrack?.cover_url ? (
                      <img src={currentTrack.cover_url} alt={currentTrack.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-sky-100 to-emerald-50 text-slate-500">
                        <Music4 className="h-6 w-6" />
                      </div>
                    )}
                    {isPlaying ? (
                      <div className="absolute inset-x-0 bottom-0 flex h-5 items-end justify-center gap-0.5 bg-gradient-to-t from-slate-900/40 to-transparent pb-1">
                        <span className="h-2.5 w-0.5 animate-pulse rounded-full bg-white/90" />
                        <span className="h-4 w-0.5 animate-pulse rounded-full bg-white/90 [animation-delay:120ms]" />
                        <span className="h-3 w-0.5 animate-pulse rounded-full bg-white/90 [animation-delay:240ms]" />
                      </div>
                    ) : null}
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsExpanded((prev) => !prev)}
                    className="flex min-w-0 flex-1 items-start text-left"
                    aria-label={isExpanded ? '收起播放器' : '展开播放器'}
                  >
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="flex items-start gap-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="overflow-hidden">
                            {shouldScrollCompactTitle ? (
                              <div
                                className="flex min-w-max items-center gap-4 whitespace-nowrap text-[13px] font-semibold leading-5 text-slate-900"
                                style={{ animation: 'musicCompactMarquee 14s linear infinite' }}
                              >
                                <span>{compactTitle}</span>
                                <span aria-hidden="true">{compactTitle}</span>
                              </div>
                            ) : (
                              <div className="whitespace-nowrap text-[13px] font-semibold leading-5 text-slate-900">{compactTitle}</div>
                            )}
                          </div>
                        </div>
                        {busyTrackId === currentTrack?.id ? (
                          <LoaderCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-sky-500" />
                        ) : null}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[10px] leading-4 text-slate-500">
                        <div className="min-w-0 truncate">{compactArtist}</div>
                        <span className="text-slate-300">•</span>
                        <span className="shrink-0 font-medium text-slate-400">
                          {activeSourceName}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/55">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,#f59e0b,#f97316,#ec4899)] transition-[width] duration-300 ease-out"
                          style={{ width: `${playbackProgressPercent}%` }}
                        />
                      </div>
                    </div>
                  </button>
                </div>

                <div className="mt-2.5">
                  <div className="flex w-full items-center gap-2.5 rounded-full border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(255,255,255,0.6))] px-3 py-1.5 shadow-[0_12px_24px_rgba(15,23,42,0.1),inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-md">
                    <div className="flex flex-1 items-center justify-center gap-4 pl-1">
                      <button
                        type="button"
                        onClick={() => void handleStepTrack(-1)}
                        disabled={!canControlPlayback}
                        className="flex h-7.5 w-7.5 items-center justify-center rounded-full bg-white/58 text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition hover:bg-white/90 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
                        aria-label="上一首"
                      >
                        <SkipBack className="h-3.5 w-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleTogglePlay()}
                        className="flex h-8.5 w-8.5 items-center justify-center rounded-full bg-[linear-gradient(180deg,#ffffff,#eef2f7)] text-slate-900 shadow-[0_8px_18px_rgba(15,23,42,0.16)] ring-1 ring-white transition hover:-translate-y-0.5"
                        aria-label={isPlaying ? '暂停播放' : '开始播放'}
                      >
                        {showCompactLoader ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : isPlaying ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="ml-0.5 h-4 w-4" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleStepTrack(1)}
                        disabled={!canControlPlayback}
                        className="flex h-7.5 w-7.5 items-center justify-center rounded-full bg-white/58 text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition hover:bg-white/90 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
                        aria-label="下一首"
                      >
                        <SkipForward className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div ref={compactVolumeRef} className="relative shrink-0">
                      {showCompactVolumeSlider ? (
                        <div className="absolute bottom-[calc(100%+6px)] right-0 flex h-[84px] w-[28px] items-center justify-center rounded-[12px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,255,255,0.74))] shadow-[0_10px_18px_rgba(15,23,42,0.1),inset_0_1px_0_rgba(255,255,255,0.94)] backdrop-blur-md">
                          <div
                            ref={compactVolumeTrackRef}
                            className="relative flex h-[56px] w-4 cursor-pointer items-center justify-center"
                            onMouseDown={(event) => {
                              compactVolumeDraggingRef.current = true;
                              updateCompactVolumeFromClientY(event.clientY);
                            }}
                            aria-label="调节音量"
                            role="slider"
                            aria-orientation="vertical"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(compactVolumeValue * 100)}
                          >
                            <div className="relative h-full w-[2px] rounded-full bg-sky-100">
                              <div
                                className="absolute bottom-0 left-0 w-full rounded-full bg-sky-400"
                                style={{ height: `${compactVolumeValue * 100}%` }}
                              />
                              <div
                                className="absolute left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border border-white/90 bg-sky-500 shadow-[0_2px_6px_rgba(59,130,246,0.35)]"
                                style={{ bottom: `calc(${compactVolumeValue * 100}% - 6px)` }}
                              />
                            </div>
                          </div>
                        </div>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => setShowCompactVolumeSlider((prev) => !prev)}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white/60 text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition hover:bg-white/90 hover:text-slate-800"
                        aria-label="调节音量"
                      >
                        {isMuted || volume <= 0.01 ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {isExpanded ? (
                <div className="app-section-enter mt-2.5 h-[512px] rounded-[20px] border border-white/70 bg-white/92 p-3 shadow-[0_14px_32px_rgba(15,23,42,0.07)]">
                  <div className="flex h-full flex-col">
                    <div>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(1, playbackDuration)}
                        step={1}
                        value={Math.min(currentTime, Math.max(1, playbackDuration))}
                        onChange={(event) => {
                          const nextTime = Number(event.target.value);
                          currentTimeRef.current = nextTime;
                          setCurrentTime(nextTime);

                          const audio = audioRef.current;
                          if (audio && audio.src) {
                            try {
                              audio.currentTime = nextTime;
                            } catch {
                              // Ignore seek failure while the source is still loading.
                            }
                          }

                          schedulePersist({ current_time: nextTime });
                        }}
                        className="w-full cursor-pointer accent-sky-600"
                      />

                      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                        <span>{formatDuration(currentTime)}</span>
                        <span>{formatDuration(playbackDuration)}</span>
                      </div>
                    </div>

                    <div className="mt-3 rounded-[18px] border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white px-3.5 py-3">
                      {lyricLines.length === 0 ? (
                        <div className="truncate text-center text-sm leading-7 text-slate-500">
                          当前歌曲还没有可用歌词。
                        </div>
                      ) : (
                        <div className="min-h-[28px] truncate text-center text-base font-semibold leading-7 text-slate-900">
                            {currentLyric?.text ?? '前奏中…'}
                        </div>
                      )}
                    </div>

                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {VIEW_ITEMS.map(({ key, label, icon: Icon }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setActiveView(key)}
                          className={`flex min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-2xl px-2 py-2 text-[11px] transition sm:text-[12px] ${
                            activeView === key
                              ? 'bg-slate-900 text-white shadow-sm'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {label}
                        </button>
                      ))}
                    </div>

                    <div className="mt-3 min-h-0 flex-1 overflow-hidden">
                      <div className="h-full overflow-y-auto pr-1">
                      {activeView === 'search' ? (
                        <div className="space-y-3">
                          <form
                            onSubmit={(event) => {
                              event.preventDefault();
                              void handleSearch();
                            }}
                            className="flex items-center gap-2"
                          >
                            <div className="relative flex-1">
                              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                              <input
                                value={searchKeyword}
                                onChange={(event) => setSearchKeyword(event.target.value)}
                                placeholder="搜索歌曲、歌手或专辑"
                                className="w-full rounded-2xl border border-slate-200 bg-white px-10 py-2.5 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                              />
                            </div>
                            <button
                              type="submit"
                              disabled={isSearching}
                              className="inline-flex items-center gap-2 rounded-2xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-60"
                            >
                              {isSearching ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                              搜索
                            </button>
                          </form>

                          {!searchResult ? (
                            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center">
                              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm">
                                <Disc3 className="h-5 w-5" />
                              </div>
                              <div className="mt-3 text-sm font-medium text-slate-700">搜索后会直接建立播放队列</div>
                              <div className="mt-1 text-xs leading-6 text-slate-500">
                                当前支持 QQ音乐，选好音乐源后即可搜歌播放。
                              </div>
                            </div>
                          ) : searchResult.tracks.length === 0 ? (
                            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-500">
                              没有找到匹配结果，换个关键词再试试。
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {searchResult.tracks.map((track, index) => (
                                <div
                                  key={`${track.source_id}-${track.provider_track_id}-${index}`}
                                  className="group flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-3 py-2.5 transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-sm"
                                >
                                  <button
                                    type="button"
                                    onClick={() => void handlePlaySearchResult(index)}
                                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                  >
                                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
                                      {track.cover_url ? (
                                        <img src={track.cover_url} alt={track.title} className="h-full w-full object-cover" />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center text-slate-400">
                                          <Music4 className="h-4.5 w-4.5" />
                                        </div>
                                      )}
                                    </div>

                                    <div className="min-w-0 flex-1">
                                      <div className="truncate text-sm font-medium text-slate-800">{track.title}</div>
                                      <div className="mt-0.5 truncate text-xs text-slate-500">
                                        {track.artist} · {track.album}
                                      </div>
                                    </div>

                                    <div className="shrink-0 text-xs text-slate-400">{formatDuration(track.duration)}</div>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleAppendTrack(track)}
                                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-600"
                                    aria-label="加入队列"
                                  >
                                    <Plus className="h-4 w-4" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : null}

                      {activeView === 'favorites' ? (
                        <div className="space-y-3">
                          {!activeSourceHasCookie ? (
                            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center">
                              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm">
                                <Heart className="h-5 w-5" />
                              </div>
                              <div className="mt-3 text-sm font-medium text-slate-700">先登录 QQ 音乐再查看收藏</div>
                              <div className="mt-1 text-xs leading-6 text-slate-500">
                                在音乐源里完成微信扫码登录后，这里会显示你的我喜欢和收藏歌单。
                              </div>
                              <button
                                type="button"
                                onClick={() => setActiveView('sources')}
                                className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                              >
                                去登录
                              </button>
                            </div>
                          ) : isLoadingCollections && !collections ? (
                            <div className="rounded-3xl border border-slate-200/80 bg-slate-50/80 px-4 py-8 text-center">
                              <LoaderCircle className="mx-auto h-5 w-5 animate-spin text-sky-500" />
                              <div className="mt-3 text-sm font-medium text-slate-700">正在同步 QQ 音乐收藏</div>
                              <div className="mt-1 text-xs leading-6 text-slate-500">
                                会读取当前音源账号下的我喜欢歌曲和歌单。
                              </div>
                            </div>
                          ) : collectionsError && !collections ? (
                            <div className="rounded-3xl border border-rose-200 bg-rose-50/80 px-4 py-6 text-center">
                              <div className="text-sm font-medium text-rose-700">收藏读取失败</div>
                              <div className="mt-1 text-xs leading-6 text-rose-600">{collectionsError}</div>
                              <button
                                type="button"
                                onClick={() => void loadCollections(true)}
                                className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
                              >
                                重新获取
                              </button>
                            </div>
                          ) : collections ? (
                            <div className="space-y-3">
                              {!selectedCollectionPlaylist ? (
                                <div className="rounded-[24px] border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white px-4 py-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex min-w-0 items-center gap-3">
                                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
                                      {collections.avatar_url ? (
                                        <img src={collections.avatar_url} alt={collections.nickname ?? 'QQ音乐'} className="h-full w-full object-cover" />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center text-slate-400">
                                          <Heart className="h-4.5 w-4.5" />
                                        </div>
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-medium text-slate-900">
                                        {collections.nickname || activeSourceName}
                                      </div>
                                      <div className="mt-1 text-xs text-slate-500">
                                        {collections.liked_songs_playlist?.title || '我喜欢'} · {collections.liked_tracks.length} 首歌曲
                                      </div>
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => void loadCollections(true)}
                                    className="shrink-0 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 transition hover:bg-slate-50"
                                  >
                                    刷新
                                  </button>
                                </div>

                                <div className="mt-3 grid grid-cols-3 gap-2">
                                  <div className="rounded-2xl bg-white/80 px-3 py-2">
                                    <div className="text-[11px] text-slate-400">喜欢的歌</div>
                                    <div className="mt-1 text-sm font-semibold text-slate-900">{collections.liked_tracks.length}</div>
                                  </div>
                                  <div className="rounded-2xl bg-white/80 px-3 py-2">
                                    <div className="text-[11px] text-slate-400">创建歌单</div>
                                    <div className="mt-1 text-sm font-semibold text-slate-900">{collections.created_playlists.length}</div>
                                  </div>
                                  <div className="rounded-2xl bg-white/80 px-3 py-2">
                                    <div className="text-[11px] text-slate-400">收藏歌单</div>
                                    <div className="mt-1 text-sm font-semibold text-slate-900">{collections.collected_playlists.length}</div>
                                  </div>
                                </div>
                                </div>
                              ) : null}

                              {!selectedCollectionPlaylist ? (
                                <div className="rounded-[24px] border border-slate-200/80 bg-white px-3 py-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="text-sm font-medium text-slate-800">全部歌单</div>
                                    <div className="text-xs text-slate-400">{collectionPlaylists.length} 个</div>
                                  </div>

                                  <div className="mt-3 space-y-2">
                                    {collectionPlaylists.length === 0 ? (
                                      <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-500">
                                        当前还没有可展示的收藏歌单。
                                      </div>
                                    ) : (
                                      collectionPlaylists.map((playlist) => (
                                        <button
                                          key={`${playlist.kind}-${playlist.id}`}
                                          type="button"
                                          onClick={() => void handleOpenCollectionPlaylist(playlist)}
                                          className="flex w-full items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2.5 text-left transition hover:bg-slate-100"
                                        >
                                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
                                            {playlist.cover_url ? (
                                              <img src={playlist.cover_url} alt={playlist.title} className="h-full w-full object-cover" />
                                            ) : (
                                              <div className="flex h-full w-full items-center justify-center text-slate-400">
                                                {playlist.kind === 'liked_songs' ? <Heart className="h-4 w-4" /> : <Disc3 className="h-4 w-4" />}
                                              </div>
                                            )}
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-medium text-slate-800">{playlist.title}</div>
                                            <div className="mt-0.5 text-xs text-slate-500">
                                              {playlist.kind === 'liked_songs'
                                                ? '我的喜欢'
                                                : playlist.kind === 'created'
                                                  ? '我的歌单'
                                                  : '收藏歌单'} · {playlist.song_count} 首
                                            </div>
                                          </div>
                                        </button>
                                      ))
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <button
                                        type="button"
                                        onClick={handleBackToCollectionOverview}
                                        className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                                      >
                                        返回全部歌单
                                      </button>
                                      <div className="mt-2 text-sm font-medium text-slate-800">{selectedCollectionPlaylist.title}</div>
                                      <div className="mt-0.5 text-xs text-slate-500">点击歌曲即可播放，右侧可以加入当前队列</div>
                                    </div>
                                    <div className="text-xs text-slate-400">
                                      {isLoadingCollectionPlaylist ? '读取中' : `${selectedCollectionTracks.length} 首`}
                                    </div>
                                  </div>

                                  {isLoadingCollectionPlaylist ? (
                                    <div className="rounded-3xl border border-slate-200 bg-slate-50/80 px-4 py-8 text-center">
                                      <LoaderCircle className="mx-auto h-5 w-5 animate-spin text-sky-500" />
                                      <div className="mt-3 text-sm font-medium text-slate-700">正在读取歌单</div>
                                    </div>
                                  ) : collectionPlaylistError ? (
                                    <div className="rounded-3xl border border-rose-200 bg-rose-50/80 px-4 py-6 text-center">
                                      <div className="text-sm font-medium text-rose-700">歌单读取失败</div>
                                      <div className="mt-1 text-xs leading-6 text-rose-600">{collectionPlaylistError}</div>
                                      <button
                                        type="button"
                                        onClick={() => void handleOpenCollectionPlaylist(selectedCollectionPlaylist)}
                                        className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
                                      >
                                        重新获取
                                      </button>
                                    </div>
                                  ) : selectedCollectionTracks.length === 0 ? (
                                    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-500">
                                      这个歌单里暂时没有可播放的歌曲。
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      {selectedCollectionTracks.map((track, index) => (
                                        <div
                                          key={`${track.source_id}-${track.provider_track_id}-${index}`}
                                          className="group flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-3 py-2.5 transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-sm"
                                        >
                                          <button
                                            type="button"
                                            onClick={() => void handlePlayCollectionTrack(index)}
                                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                          >
                                            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
                                              {track.cover_url ? (
                                                <img src={track.cover_url} alt={track.title} className="h-full w-full object-cover" />
                                              ) : (
                                                <div className="flex h-full w-full items-center justify-center text-slate-400">
                                                  <Music4 className="h-4.5 w-4.5" />
                                                </div>
                                              )}
                                            </div>

                                            <div className="min-w-0 flex-1">
                                              <div className="truncate text-sm font-medium text-slate-800">{track.title}</div>
                                              <div className="mt-0.5 truncate text-xs text-slate-500">
                                                {track.artist} · {track.album}
                                              </div>
                                            </div>

                                            <div className="shrink-0 text-xs text-slate-400">{formatDuration(track.duration)}</div>
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => handleAppendTrack(track)}
                                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-600"
                                            aria-label="加入队列"
                                          >
                                            <Plus className="h-4 w-4" />
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {activeView === 'queue' ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-medium text-slate-800">当前播放队列</div>
                              <div className="mt-0.5 text-xs text-slate-500">共 {queue.length} 首歌曲</div>
                            </div>

                            <button
                              type="button"
                              onClick={handleClearQueue}
                              disabled={queue.length === 0}
                              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-xs text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              清空
                            </button>
                          </div>

                          {queue.length === 0 ? (
                            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-500">
                              队列还是空的，去搜索页选一首歌吧。
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {queue.map((track, index) => {
                                const isActive = index === currentIndex;
                                return (
                                  <button
                                    key={`${track.id}-${index}`}
                                    type="button"
                                    onClick={() => void startPlayback(index, { startTime: 0 })}
                                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${
                                      isActive
                                        ? 'bg-slate-900 text-white shadow-sm'
                                        : 'border border-slate-200/80 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-sm'
                                    }`}
                                  >
                                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                                      isActive ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-400'
                                    }`}>
                                      {busyTrackId === track.id ? (
                                        <LoaderCircle className="h-4 w-4 animate-spin" />
                                      ) : isActive && isPlaying ? (
                                        <Pause className="h-4 w-4" />
                                      ) : (
                                        <Play className="ml-0.5 h-4 w-4" />
                                      )}
                                    </div>

                                    <div className="min-w-0 flex-1">
                                      <div className="truncate text-sm font-medium">{track.title}</div>
                                      <div className={`mt-0.5 truncate text-xs ${isActive ? 'text-white/70' : 'text-slate-500'}`}>
                                        {track.artist}
                                      </div>
                                    </div>

                                    <div className={`shrink-0 text-xs ${isActive ? 'text-white/70' : 'text-slate-400'}`}>
                                      {formatDuration(track.duration)}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ) : null}

                      {activeView === 'sources' ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-medium text-slate-800">音乐源管理</div>
                              <div className="mt-0.5 text-xs text-slate-500">点击卡片即可切换当前使用的音乐源。</div>
                            </div>

                            <button
                              type="button"
                              onClick={openCreateSourceForm}
                              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-800"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              新增
                            </button>
                          </div>

                          <div className="space-y-2">
                            {sources.map((source) => (
                              <div
                                key={source.id}
                                className={`rounded-2xl border px-3 py-3 ${
                                  source.id === activeSource?.id
                                    ? 'border-sky-300 bg-sky-50/70 ring-1 ring-sky-100'
                                    : source.is_enabled
                                      ? 'border-slate-200 bg-white'
                                      : 'border-slate-200 bg-slate-50/80 opacity-75'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!source.is_enabled) {
                                        return;
                                      }

                                      setActiveSourceId(source.id);
                                      activeSourceIdRef.current = source.id;
                                      schedulePersist({ active_source_id: source.id });
                                    }}
                                    className="min-w-0 flex-1 text-left"
                                  >
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="truncate text-sm font-medium text-slate-800">{source.name}</div>
                                      {source.id === activeSource?.id ? (
                                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] text-sky-700">当前使用</span>
                                      ) : null}
                                      {source.is_default ? (
                                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] text-sky-600">默认</span>
                                      ) : null}
                                      {!source.is_enabled ? (
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">已停用</span>
                                      ) : null}
                                    </div>
                                    <div className="mt-1 text-xs text-slate-500">
                                      音质 {source.config.quality ?? '128'} {source.config.cookie ? '· 已登录' : '· 未登录'}
                                    </div>
                                  </button>

                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => openEditSourceForm(source)}
                                      className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                                      aria-label="编辑音乐源"
                                    >
                                      <Settings2 className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDeleteSourceId(source.id)}
                                      className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                                      aria-label="删除音乐源"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                </div>
              ) : null}

              {!isExpanded && isInitializing ? (
                <div className="mt-3 flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/85 px-3 py-2 text-xs text-slate-500">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin text-sky-500" />
                  正在加载背景音乐
                </div>
              ) : null}
            </div>
          </div>
        </div>
        )}
      </div>

      {showSourceForm ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/24 p-3 backdrop-blur-[2px] sm:items-center"
          onClick={closeSourceForm}
        >
          <div
            className="app-section-enter w-full max-w-[560px] overflow-hidden rounded-[28px] border border-white/80 bg-white/96 shadow-[0_30px_80px_rgba(15,23,42,0.24)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex max-h-[min(84vh,760px)] flex-col">
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-4">
                <div>
                  <div className="text-base font-semibold text-slate-900">
                    {sourceDraft.id ? '编辑音乐源' : '新增音乐源'}
                  </div>
                  <div className="mt-1 text-xs leading-6 text-slate-500">
                    支持微信扫码登录，授权成功后会自动写入当前音乐源。
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeSourceForm}
                  className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                  aria-label="关闭音乐源弹窗"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 space-y-4 overflow-y-auto px-4 py-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">名称</label>
                  <input
                    value={sourceDraft.name}
                    onChange={(event) =>
                      setSourceDraft((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                    placeholder="例如：QQ音乐"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr,116px]">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <label className="block text-xs font-medium text-slate-600">登录状态</label>
                      <button
                        type="button"
                        onClick={() => void handleOpenWechatLogin()}
                        disabled={isWechatLoggingIn}
                        className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isWechatLoggingIn ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
                        微信扫码登录
                      </button>
                    </div>

                    {hasSourceCookie && !showCookieField ? (
                      <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 text-sm text-emerald-700">
                        <span className="font-medium">已登录</span>
                        <button
                          type="button"
                          onClick={() => setShowCookieField(true)}
                          className="text-xs text-emerald-700 transition hover:text-emerald-900"
                        >
                          查看 Cookie
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <textarea
                          value={sourceDraft.cookie}
                          onChange={(event) =>
                            setSourceDraft((prev) => ({
                              ...prev,
                              cookie: event.target.value,
                            }))
                          }
                          placeholder="登录成功后会自动回填，也支持手动补充。"
                          rows={3}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                        />
                        {hasSourceCookie ? (
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>当前已回填授权 Cookie</span>
                            <button
                              type="button"
                              onClick={() => setShowCookieField(false)}
                              className="transition hover:text-slate-800"
                            >
                              隐藏
                            </button>
                          </div>
                        ) : (
                          <div className="text-xs leading-5 text-slate-500">未登录时可手动粘贴 Cookie。</div>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600">音质</label>
                    <select
                      value={sourceDraft.quality}
                      onChange={(event) =>
                        setSourceDraft((prev) => ({
                          ...prev,
                          quality: event.target.value as SourceDraft['quality'],
                        }))
                      }
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    >
                      {QUALITY_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {wechatLoginSession ? (
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-slate-800">微信登录</div>
                        <div className="mt-1 text-xs leading-6 text-slate-500">
                          {wechatLoginSession.message || '请使用微信扫码，并在手机上确认登录。'}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setWechatLoginSession(null)}
                        className="flex h-8 w-8 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                        aria-label="关闭微信登录"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="flex h-40 w-40 shrink-0 items-center justify-center overflow-hidden rounded-[24px] border border-slate-200 bg-white">
                        {wechatLoginSession.qr_image_data_url ? (
                          <img
                            src={wechatLoginSession.qr_image_data_url}
                            alt="微信登录二维码"
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <LoaderCircle className="h-6 w-6 animate-spin text-slate-400" />
                        )}
                      </div>

                      <div className="flex-1 space-y-2 text-sm text-slate-600">
                        <div className="rounded-2xl bg-white px-3 py-2">
                          当前状态：
                          <span className="ml-1 font-medium text-slate-900">
                            {wechatLoginSession.status === 'pending'
                              ? '等待扫码'
                              : wechatLoginSession.status === 'scanned'
                                ? '等待确认'
                                : wechatLoginSession.status === 'authorized'
                                  ? '已完成授权'
                                  : wechatLoginSession.status === 'expired'
                                    ? '二维码已过期'
                                    : '登录失败'}
                          </span>
                        </div>
                        <div className="leading-6 text-slate-500">
                          登录完成后，当前音乐源的 Cookie 会自动填入，不需要手动复制。
                        </div>
                        {(wechatLoginSession.status === 'expired' || wechatLoginSession.status === 'failed') ? (
                          <button
                            type="button"
                            onClick={() => void handleOpenWechatLogin()}
                            disabled={isWechatLoggingIn}
                            className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                          >
                            {isWechatLoggingIn ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
                            重新获取二维码
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={sourceDraft.is_enabled}
                      onChange={(event) =>
                        setSourceDraft((prev) => ({
                          ...prev,
                          is_enabled: event.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300 text-sky-600"
                    />
                    启用此音乐源
                  </label>

                  <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={sourceDraft.is_default}
                      onChange={(event) =>
                        setSourceDraft((prev) => ({
                          ...prev,
                          is_default: event.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300 text-sky-600"
                    />
                    设为默认源
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-4">
                <button
                  type="button"
                  onClick={closeSourceForm}
                  className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-600 transition hover:bg-white"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveSource()}
                  disabled={isSavingSource}
                  className="inline-flex items-center gap-2 rounded-2xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-60"
                >
                  {isSavingSource ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ActionDialog
        isOpen={!!deleteSourceId}
        title="删除音乐源"
        message="删除后将无法继续使用该配置搜索或解析歌曲。确定继续吗？"
        tone="danger"
        confirmText="删除"
        onClose={() => setDeleteSourceId(null)}
        onConfirm={handleConfirmDeleteSource}
      />
    </>
  );
}
