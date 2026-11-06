/* Shared map collection: bridges existing V1/V2 saves and the map-card UI. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MumuMapCollection = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var KEY = 'mumujinjin-custom-maps-v2';
  var OLD_KEY = 'mumujinjin-custom-maps-v1';
  var REMOVED_KEY = 'mumujinjin-map-library-removed-v1';
  var BACKUP_KEY = 'mumujinjin-unfair-active-backup-v1';

  function safeParse(storage, key, fallback) {
    try { var raw = storage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (_) { return fallback; }
  }

  function createStore(storage, normalize, fingerprint) {
    if (!storage || typeof normalize !== 'function' || typeof fingerprint !== 'function') {
      throw new TypeError('Map storage and game rules must be available.');
    }
    function identity(map) {
      try { return fingerprint(map); } catch (_) { return null; }
    }
    function list() {
      var newer = safeParse(storage, KEY, []);
      var older = safeParse(storage, OLD_KEY, []);
      var backup = safeParse(storage, BACKUP_KEY, null);
      var removed = new Set(safeParse(storage, REMOVED_KEY, []));
      var result = [], ids = new Set();
      var inputs = (backup ? [backup] : []).concat(
        Array.isArray(newer) ? newer : [],
        Array.isArray(older) ? older : []
      );
      inputs.forEach(function (input) {
        var item;
        try { item = normalize(input); } catch (_) { return; }
        if (!item) return;
        var id = identity(item);
        if (!id || ids.has(id) || removed.has(id)) return;
        ids.add(id); result.push(item);
      });
      return result.slice(0, 30);
    }
    function save(input) {
      var item = normalize(input);
      if (!item || typeof item.name !== 'string' || !item.name.trim()) throw new Error('地图格式或名称无效');
      var id = identity(item);
      if (!id) throw new Error('地图编号无效');
      var newer = list().filter(function (map) { return identity(map) !== id; });
      storage.setItem(KEY, JSON.stringify([item].concat(newer).slice(0, 30)));
      var removed = safeParse(storage, REMOVED_KEY, []);
      storage.setItem(REMOVED_KEY, JSON.stringify((Array.isArray(removed) ? removed : []).filter(function (x) { return x !== id; })));
      return item;
    }
    function rename(id, newName) {
      var name = String(newName || '').trim().slice(0, 40);
      if (!name) throw new Error('请输入地图名称');
      var item = list().find(function (map) { return identity(map) === id; });
      if (!item) throw new Error('找不到地图');
      return save(Object.assign({}, item, {name: name}));
    }
    function remove(id) {
      if (!list().some(function (map) { return identity(map) === id; })) return false;
      var newer = list().filter(function (map) { return identity(map) !== id; });
      var removed = safeParse(storage, REMOVED_KEY, []);
      removed = Array.isArray(removed) ? removed : [];
      if (!removed.includes(id)) removed.push(id);
      storage.setItem(KEY, JSON.stringify(newer.slice(0, 30)));
      storage.setItem(REMOVED_KEY, JSON.stringify(removed.slice(-100)));
      return true;
    }
    return Object.freeze({list: list, save: save, rename: rename, remove: remove, identity: identity});
  }
  return Object.freeze({createStore: createStore, KEY: KEY});
});
