// Revision-checked shared notes. Remote edits never silently replace a local draft.
export class NotesSync {
  constructor(send, changed, delay = 500) {
    this.send = send; this.changed = changed; this.delay = delay;
    this.text = ''; this.remoteText = ''; this.revision = 0; this.baseRevision = 0;
    this.dirty = false; this.conflict = false; this.status = 'Saved'; this.timer = null; this.inflight = null;
  }
  publish() { this.changed({text:this.text, status:this.status, conflict:this.conflict, dirty:this.dirty, remoteText:this.remoteText}); }
  attach(room, state) {
    if (this.room !== room) {
      this.cancel(); this.room = room; this.text = state.notes || ''; this.remoteText = this.text;
      this.revision = state.notesRevision || 0; this.baseRevision = this.revision;
      this.dirty = false; this.conflict = false; this.status = 'Saved'; this.publish();
    } else this.receive(state);
  }
  receive({notes, notesRevision = 0}) {
    if (notesRevision < this.revision) return;
    this.remoteText = notes || ''; this.revision = notesRevision;
    if (this.dirty) {
      if (notesRevision > this.baseRevision) { this.cancel(); this.conflict = true; this.status = 'Another participant edited the notes. Your draft is preserved.'; }
    } else { this.text = this.remoteText; this.baseRevision = notesRevision; this.status = 'Saved'; }
    this.publish();
  }
  edit(text) {
    if (!this.dirty) this.baseRevision = this.revision;
    this.text = text; this.dirty = true;
    if (!this.conflict) { this.status = 'Unsaved changes'; this.schedule(); }
    this.publish();
  }
  cancel() { clearTimeout(this.timer); this.timer = null; }
  schedule() { this.cancel(); this.timer = setTimeout(() => this.flush(), this.delay); }
  async flush() {
    this.cancel();
    if (this.inflight) { await this.inflight; if (this.dirty && !this.conflict) return this.flush(); return !this.dirty; }
    if (!this.dirty) return true;
    if (this.conflict) return false;
    const text = this.text, expectedRevision = this.baseRevision, room = this.room;
    this.status = 'Saving…'; this.publish();
    this.inflight = (async () => {
      try {
        const result = await this.send('notes', {text, expectedRevision});
        if (this.room !== room) return;
        if (result.conflict) { this.receive(result); this.conflict = true; this.status = 'Another participant edited the notes. Your draft is preserved.'; return; }
        if (result.notesRevision < this.revision) { this.conflict = true; this.status = 'Newer shared notes are available. Your draft is preserved.'; return; }
        this.revision = result.notesRevision; this.baseRevision = result.notesRevision; this.remoteText = result.notes;
        this.conflict = false; this.dirty = this.text !== text; this.status = this.dirty ? 'Unsaved changes' : 'Saved';
      } catch (e) { if (this.room === room) this.status = `Not saved: ${e.message}`; }
      finally { this.publish(); }
    })();
    await this.inflight; this.inflight = null;
    if (this.dirty && !this.conflict && this.status === 'Unsaved changes') return this.flush();
    return !this.dirty;
  }
  async useLatest() { if(this.inflight)await this.inflight; this.cancel(); this.text = this.remoteText; this.baseRevision = this.revision; this.dirty = false; this.conflict = false; this.status = 'Saved'; this.publish(); }
  async replaceWithDraft() { if(this.inflight)await this.inflight; this.baseRevision = this.revision; this.conflict = false; return this.flush(); }
}
