/**
 * Cedar Core — Plugin Manager & Extension API
 * Manages the lifecycle of Cedar plugins and provides a unified, safe API surface.
 */
(function () {
  'use strict';

  window.Cedar = window.Cedar || window.Outpost || {};
  window.Outpost = window.Cedar;

  class PluginManager {
    constructor() {
      this._plugins = new Map();
      this._initialized = false;
      this._pendingPlugins = [];
    }

    /**
     * Creates a scoped API object passed into plugin.init(api)
     * @param {string} pluginId 
     */
    createPluginApi(pluginId) {
      const reg = window.Cedar.registry || window.Outpost.registry || {};
      const events = window.Cedar.events || window.Outpost.events;

      return {
        pluginId,

        // Block Type Registration
        blocks: {
          register: (blockDef) => reg.blocks.register(blockDef),
          get: (id) => reg.blocks.get(id),
          list: (filter) => reg.blocks.list(filter)
        },

        // Dashboard View / Tab Registration
        views: {
          register: (viewDef) => reg.views.register(viewDef),
          get: (id) => reg.views.get(id),
          list: () => reg.views.list()
        },

        // Compiler Transformers
        compiler: {
          registerDomTransformer: (fn, priority) => reg.compiler.registerDomTransformer(fn, priority),
          registerMdTransformer: (fn, priority) => reg.compiler.registerMdTransformer(fn, priority)
        },

        // Toolbar Items
        toolbar: {
          register: (itemDef) => reg.toolbar.register(itemDef)
        },

        // Modal Management
        modals: {
          open: (modalId) => (typeof window.openModal === 'function' ? window.openModal(modalId) : null),
          close: (modalId) => (typeof window.closeModal === 'function' ? window.closeModal(modalId) : null),
          register: (modalDef) => reg.modals.register(modalDef)
        },

        // Pub/Sub Event Bus
        events: {
          on: (eventName, handler) => events.on(eventName, handler),
          once: (eventName, handler) => events.once(eventName, handler),
          off: (eventName, handler) => events.off(eventName, handler),
          emit: (eventName, ...args) => events.emit(eventName, ...args)
        },

        // State Access
        state: {
          get drafts() { return window.drafts || []; },
          get currentDraft() { return window.currentDraft || null; },
          get projectConfig() { return window.projectConfig || {}; },
          saveDrafts: () => (typeof window.saveDraftsToStorage === 'function' ? window.saveDraftsToStorage() : null),
          getCurrentDraftId: () => window.currentDraftId || (window.currentDraft ? window.currentDraft.id : null)
        },

        // UI Helpers
        ui: {
          showToast: (msg, type) => (typeof window.showToast === 'function' ? window.showToast(msg, type) : console.log(`[Toast ${type}] ${msg}`)),
          escapeHtml: (str) => (typeof window.escapeHtml === 'function' ? window.escapeHtml(str) : String(str))
        }
      };
    }

    /**
     * Register a new plugin
     * @param {Object} plugin 
     */
    register(plugin) {
      if (!plugin || !plugin.id) {
        throw new Error('[PluginManager] A plugin must have an "id" property.');
      }
      if (this._plugins.has(plugin.id)) {
        console.warn(`[PluginManager] Plugin "${plugin.id}" is already registered. Overwriting.`);
      }

      this._plugins.set(plugin.id, {
        ...plugin,
        enabled: true,
        initialized: false
      });

      // If app is already initialized, initialize this plugin immediately
      if (this._initialized) {
        this._initPlugin(plugin.id);
      } else {
        this._pendingPlugins.push(plugin.id);
      }

      if (window.Cedar.emit || window.Outpost.emit) {
        const emitter = window.Cedar.emit ? window.Cedar : window.Outpost;
        emitter.emit('plugin:registered', { id: plugin.id, name: plugin.name });
      }

      return plugin;
    }

    /**
     * Internal: Initialize a specific plugin
     * @param {string} pluginId 
     */
    _initPlugin(pluginId) {
      const p = this._plugins.get(pluginId);
      if (!p || p.initialized) return;

      try {
        if (typeof p.init === 'function') {
          const api = this.createPluginApi(pluginId);
          p.init(api);
        }
        p.initialized = true;
        if (window.Cedar.emit || window.Outpost.emit) {
        const emitter = window.Cedar.emit ? window.Cedar : window.Outpost;
          emitter.emit('plugin:initialized', { id: pluginId });
        }
      } catch (err) {
        console.error(`[PluginManager] Error initializing plugin "${pluginId}":`, err);
      }
    }

    /**
     * Initialize all registered plugins
     */
    initAll() {
      this._initialized = true;
      while (this._pendingPlugins.length > 0) {
        const id = this._pendingPlugins.shift();
        this._initPlugin(id);
      }
    }

    /**
     * Get a plugin by ID
     * @param {string} id 
     */
    get(id) {
      return this._plugins.get(id);
    }

    /**
     * List all plugins
     */
    list() {
      return Array.from(this._plugins.values());
    }
  }

  const manager = new PluginManager();

  window.Cedar.plugins = manager;
  window.Cedar.registerPlugin = manager.register.bind(manager);
  window.Outpost.plugins = manager;
  window.Outpost.registerPlugin = manager.register.bind(manager);
})();
