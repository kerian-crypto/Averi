/* ==========================================================
   AVERI LICENSING — Journal local
   ----------------------------------------------------------
   Alimente l'onglet « Logs » de la console privée et facilite
   le support : un client peut lire son journal au téléphone.
   Volontairement borné et dépourvu de donnée personnelle.
   ========================================================== */

const MAX_ENTRIES = 120;

export class Journal {
  constructor(storage) {
    this.storage = storage;
    this._entries = null;
  }

  _load() {
    if (this._entries) return this._entries;
    const rec = this.storage ? this.storage.loadJournal() : null;
    this._entries = (rec && Array.isArray(rec.data)) ? rec.data.slice(-MAX_ENTRIES) : [];
    return this._entries;
  }

  append(event, detail) {
    const entries = this._load();
    entries.push({ at: Date.now(), event: String(event), detail: detail || {} });
    while (entries.length > MAX_ENTRIES) entries.shift();
    if (this.storage) this.storage.saveJournal(entries);
    return entries[entries.length - 1];
  }

  list() { return this._load().slice().reverse(); }

  clear() {
    this._entries = [];
    if (this.storage) this.storage.saveJournal([]);
  }
}
