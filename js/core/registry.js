/**
 * Cedar Core — Registry Engine
 * Central catalog managing extensible extension points:
 * Blocks, Dashboard Views, Compiler Rules, Toolbar Items, and Modals.
 */
(function () {
  'use strict';

  window.Cedar = window.Cedar || window.Outpost || {};
  window.Outpost = window.Cedar;

  class Registry {
    constructor(name) {
      this.name = name;
      this._items = new Map();
    }

    register(id, def) {
      if (typeof id === 'object' && id !== null && id.id) {
        def = id;
        id = def.id;
      }
      if (!id || typeof id !== 'string') {
        throw new Error(`[Cedar Registry: ${this.name}] Invalid item ID.`);
      }
      this._items.set(id, { id, ...def });
      if (window.Cedar.emit || window.Outpost.emit) {
        const emitter = window.Cedar.emit ? window.Cedar : window.Outpost;
        emitter.emit(`registry:${this.name}:registered`, { id, item: def });
      }
      return def;
    }

    get(id) {
      return this._items.get(id);
    }

    has(id) {
      return this._items.has(id);
    }

    remove(id) {
      const existed = this._items.delete(id);
      if (existed && (window.Cedar.emit || window.Outpost.emit)) {
        const emitter = window.Cedar.emit ? window.Cedar : window.Outpost;
        emitter.emit(`registry:${this.name}:removed`, { id });
      }
      return existed;
    }

    list(filterFn) {
      const all = Array.from(this._items.values());
      if (typeof filterFn === 'function') {
        return all.filter(filterFn);
      }
      return all;
    }

    clear() {
      this._items.clear();
    }
  }

  // Specialized Registry Subclasses with Domain Helpers
  class BlockRegistry extends Registry {
    constructor() {
      super('blocks');
    }

    /**
     * Get all blocks intended for the Block Type dropdown (strictly 5 allowed block types)
     */
    getDropdownBlocks() {
      const allowed = ['text', 'images', 'media', 'quote', 'share'];
      return this.list(b => allowed.includes(b.id)).sort((a, b) => (a.order || 100) - (b.order || 100));
    }
  }

  class ViewRegistry extends Registry {
    constructor() {
      super('views');
    }

    getOrderedViews() {
      return this.list().sort((a, b) => (a.order || 100) - (b.order || 100));
    }
  }

  class CompilerRegistry extends Registry {
    constructor() {
      super('compiler');
      this._domTransformers = [];
      this._mdTransformers = [];
    }

    registerDomTransformer(fn, priority = 100) {
      this._domTransformers.push({ fn, priority });
      this._domTransformers.sort((a, b) => a.priority - b.priority);
    }

    registerMdTransformer(fn, priority = 100) {
      this._mdTransformers.push({ fn, priority });
      this._mdTransformers.sort((a, b) => a.priority - b.priority);
    }

    getDomTransformers() {
      return this._domTransformers.map(t => t.fn);
    }

    getMdTransformers() {
      return this._mdTransformers.map(t => t.fn);
    }
  }

  const registries = {
    blocks: new BlockRegistry(),
    views: new ViewRegistry(),
    compiler: new CompilerRegistry(),
    toolbar: new Registry('toolbar'),
    modals: new Registry('modals'),
    tools: new Registry('tools')
  };

  window.Cedar.registry = registries;
  window.Outpost.registry = registries;
})();
