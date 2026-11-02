const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
const clone = value => JSON.parse(JSON.stringify(value));
export const STATIC_MODE = typeof __APEX_STATIC__ !== 'undefined' && __APEX_STATIC__;
export const runXP = run => Math.max(10, Math.floor((run.score || 0) * 2 + (run.likes || 0) + (run.defeats || 0) * 8));
export const newRunId = () => crypto.randomUUID();

/** Authenticated, account-scoped retry queues. Local-only runs are never imported. */
export class ArenaCloud {
  constructor({ onSession, onProgress, onStatus, onProfile } = {}) {
    this.handlers = { onSession, onProgress, onStatus, onProfile };
    this.userId = null; this.revision = 0; this.serverProfile = null;
    this.progress = { xp: 0, runs: 0, likes: 0, defeats: 0 }; this.records = [];
    this.pending = []; this.profileJob = null; this.busy = false; this.connected = false;
    this.status = 'connecting';
    this.retry = () => this.connect();
    window.addEventListener('online', this.retry);
    if (!STATIC_MODE) this.retryTimer = setInterval(() => { if (!document.hidden && (this.pending.length || this.profileJob || !this.connected)) this.connect(); }, 20000);
  }
  setStatus(status, message = '') { this.status = status; this.handlers.onStatus?.({ status, message, pending: this.pending.length, authenticated: !!this.userId }); }
  async request(path, options = {}) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options, headers: { 'Content-Type': 'application/json', ...options.headers }, signal: controller.signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { const error = new Error(body.error || `Request failed (${response.status})`); error.status = response.status; error.body = body; throw error; }
      return body;
    } finally { clearTimeout(timer); }
  }
  acceptSession(data) {
    const identity = data.authenticated && typeof data.userId === 'string' ? data.userId : null;
    const changed = identity !== this.userId || !this.connected;
    if (identity !== this.userId) {
      this.persistQueue(); this.persistProfileJob();
      clearTimeout(this.profileTimer); this.profileJob = null;
      this.userId = identity;
      this.progress = { xp: 0, runs: 0, likes: 0, defeats: 0 }; this.records = [];
      const cachedJob = identity ? read(`apex-profile-job:${identity}`, null) : null;
      if (cachedJob?.owner === identity && cachedJob.profile && Array.isArray(cachedJob.keys)) this.profileJob = cachedJob;
      const cached = identity ? read(`apex-pending:${identity}`, []) : [];
      this.pending = Array.isArray(cached) ? cached.filter(run => run && typeof run.runId === 'string') : [];
    }
    this.connected = true;
    if (!identity) { this.setStatus('local'); if (changed) this.handlers.onSession?.({ authenticated: false, userId: null }); return; }
    this.revision = Number(data.revision) || 0; this.serverProfile = data.profile || null;
    this.progress = data.progress || this.progress; this.records = Array.isArray(data.records) ? data.records : [];
    // A completed response may have been lost; known server records can safely remove retries.
    const accepted = new Set(this.records.map(run => run.runId));
    this.pending = this.pending.filter(run => !accepted.has(run.runId)); this.persistQueue();
    if (changed) this.handlers.onSession?.({ ...data, userId: identity, progress: this.combinedProgress() });
    this.emitProgress();
  }
  async connect() {
    if (STATIC_MODE) { this.acceptSession({authenticated:false,userId:null}); return; }
    if (this.busy) return;
    this.busy = true;
    try {
      this.acceptSession(await this.request('/api/player'));
      if (this.userId) {
        await this.flushProfile();
        const accepted = await this.flushRuns();
        // Edits made while runs were uploading should save in this connection too.
        await this.flushProfile();
        if (accepted !== false) this.setStatus('saved');
        else this.setStatus('rejected', 'A run stays on your device; it could not be added to the arena board.');
      }
    } catch (error) {
      if (error.status === 401 || error.status === 403) this.acceptSession({ authenticated: false });
      else this.setStatus('offline', 'Cloud unavailable. Your device records are safe.');
      this.connected = false;
    } finally { this.busy = false; }
  }
  combinedProgress() {
    const p = { xp: 0, runs: 0, likes: 0, defeats: 0, ...this.progress };
    for (const run of this.pending) { p.xp += runXP(run); p.runs++; p.likes += run.likes || 0; p.defeats += run.defeats || 0; }
    return p;
  }
  emitProgress() { if (this.userId) this.handlers.onProgress?.({ userId: this.userId, progress: this.combinedProgress(), records: this.records, pending: this.pending.length }); }
  persistQueue() { if (this.userId) write(`apex-pending:${this.userId}`, this.pending); }
  persistProfileJob() { if (this.userId) write(`apex-profile-job:${this.userId}`, this.profileJob); }
  destroy() { clearTimeout(this.profileTimer); clearInterval(this.retryTimer); window.removeEventListener('online', this.retry); }
  saveProfile(profile, editedKeys = Object.keys(profile)) {
    if (!this.userId) return;
    const keys = new Set([...(this.profileJob?.keys || []), ...editedKeys]);
    this.profileJob = { profile: clone(profile), keys: [...keys], owner: this.userId };
    this.persistProfileJob();
    this.setStatus('syncing'); clearTimeout(this.profileTimer);
    this.profileTimer = setTimeout(() => this.connect(), 500);
  }
  async flushProfile() {
    while (this.profileJob) {
      const job = this.profileJob;
      if (!job || job.owner !== this.userId) return;
      this.setStatus('syncing');
      for (let attempt = 0; attempt < 2; attempt++) {
        const merged = { ...(this.serverProfile || job.profile) };
        for (const key of job.keys) merged[key] = job.profile[key];
        try {
          const result = await this.request('/api/player', { method: 'PUT', body: JSON.stringify({ profile: merged, revision: this.revision }) });
          if (job.owner !== this.userId) return;
          this.revision = result.revision; this.serverProfile = result.profile;
          if (this.profileJob === job) { this.profileJob = null; this.persistProfileJob(); this.handlers.onProfile?.(result.profile); }
          break;
        } catch (error) {
          if (job.owner !== this.userId) return;
          if (error.status !== 409 || attempt) throw error;
          this.revision = Number(error.body.revision ?? error.body.current?.revision) || 0;
          this.serverProfile = error.body.profile || error.body.current?.profile || this.serverProfile;
        }
      }
    }
  }
  queueRun(run, owner) {
    if (!owner || owner !== this.userId) return false;
    if (!this.pending.some(item => item.runId === run.runId)) this.pending.push(clone(run));
    this.persistQueue(); this.emitProgress(); this.setStatus('syncing'); this.connect(); return true;
  }
  async flushRuns() {
    const owner = this.userId;
    let accepted = true;
    while (this.pending.length && owner === this.userId) {
      const run = this.pending[0]; this.setStatus('syncing');
      try {
        const result = await this.request('/api/runs', { method: 'POST', body: JSON.stringify(run) });
        if (owner !== this.userId) return false;
        this.pending = this.pending.filter(item => item.runId !== run.runId); this.persistQueue();
        if (result.progress) this.progress = result.progress;
        if (result.record) { this.records = [result.record, ...this.records.filter(item => item.runId !== run.runId)].sort((a,b) => b.score - a.score).slice(0,10); }
        this.emitProgress();
      } catch (error) {
        if (owner !== this.userId) return false;
        if (error.status === 400 || error.status === 422) {
          this.pending = this.pending.filter(item => item.runId !== run.runId); this.persistQueue(); this.emitProgress();
          accepted = false; continue;
        }
        throw error;
      }
    }
    if (!accepted) this.setStatus('rejected', 'A run stays on your device; it could not be added to the arena board.');
    return accepted;
  }
  async leaderboard(period = 'all', vehicle = 'all') {
    return this.request(`/api/leaderboard?period=${encodeURIComponent(period)}&vehicle=${encodeURIComponent(vehicle)}`);
  }
}
