/**
 * Cedar Core — Event Emitter / Bus
 * Provides typed, decoupled pub/sub events across Cedar runtime and plugins.
 */
(function () {
  'use strict';

  window.Cedar = window.Cedar || window.Outpost || {};
  window.Outpost = window.Cedar;

  class EventEmitter {
    constructor() {
      this._events = new Map();
    }

    /**
     * Subscribe to an event
     * @param {string} eventName 
     * @param {Function} handler 
     * @returns {Function} Unsubscribe function
     */
    on(eventName, handler) {
      if (typeof handler !== 'function') return () => {};
      if (!this._events.has(eventName)) {
        this._events.set(eventName, new Set());
      }
      this._events.get(eventName).add(handler);
      return () => this.off(eventName, handler);
    }

    /**
     * Subscribe to an event once
     * @param {string} eventName 
     * @param {Function} handler 
     */
    once(eventName, handler) {
      const wrapper = (...args) => {
        this.off(eventName, wrapper);
        handler(...args);
      };
      return this.on(eventName, wrapper);
    }

    /**
     * Unsubscribe a handler from an event
     * @param {string} eventName 
     * @param {Function} handler 
     */
    off(eventName, handler) {
      if (!this._events.has(eventName)) return;
      this._events.get(eventName).delete(handler);
      if (this._events.get(eventName).size === 0) {
        this._events.delete(eventName);
      }
    }

    /**
     * Emit an event with arguments
     * @param {string} eventName 
     * @param  {...any} args 
     */
    emit(eventName, ...args) {
      if (!this._events.has(eventName)) return;
      const handlers = Array.from(this._events.get(eventName));
      for (const fn of handlers) {
        try {
          fn(...args);
        } catch (err) {
          console.error(`[Cedar Event Error] Failed executing handler for event "${eventName}":`, err);
        }
      }
    }

    /**
     * Remove all handlers or all handlers for a specific event
     * @param {string} [eventName] 
     */
    clear(eventName) {
      if (eventName) {
        this._events.delete(eventName);
      } else {
        this._events.clear();
      }
    }
  }

  const events = new EventEmitter();

  // Export on Cedar namespace (aliased to Outpost for compatibility)
  window.Cedar.events = events;
  window.Cedar.on = events.on.bind(events);
  window.Cedar.once = events.once.bind(events);
  window.Cedar.off = events.off.bind(events);
  window.Cedar.emit = events.emit.bind(events);

  window.Outpost.events = events;
  window.Outpost.on = window.Cedar.on;
  window.Outpost.once = window.Cedar.once;
  window.Outpost.off = window.Cedar.off;
  window.Outpost.emit = window.Cedar.emit;
})();
