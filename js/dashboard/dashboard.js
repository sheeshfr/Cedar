/**
 * Cedar - Editorial Dashboard & Pipeline Coordinator
 * Orchestrates rendering and event dispatching across all modular dashboard subsystems.
 */
(function () {
  'use strict';

  window.Cedar = window.Cedar || window.Outpost || {};
  window.Outpost = window.Cedar;
  window.Cedar.dashboard = window.Cedar.dashboard || window.Outpost.dashboard || {};
  window.Outpost.dashboard = window.Cedar.dashboard;

  function renderDashboard() {
    if (typeof updateDashboardCounts === 'function') {
      updateDashboardCounts();
    }

    if (currentDashboardTab === 'home') {
      if (typeof window.renderHomeActivityStream === 'function') renderHomeActivityStream();
      else if (typeof renderPostsPipeline === 'function') renderPostsPipeline();
    } else if (currentDashboardTab === 'posts') {
      if (typeof renderAllPostsGrid === 'function') renderAllPostsGrid();
    } else if (currentDashboardTab === 'pages') {
      if (typeof renderStaticPages === 'function') renderStaticPages();
    } else if (currentDashboardTab === 'media') {
      if (typeof renderDerivedMediaLibrary === 'function') renderDerivedMediaLibrary();
    } else if (currentDashboardTab === 'categories' || currentDashboardTab === 'taxonomy') {
      if (typeof renderTaxonomy === 'function') renderTaxonomy();
    } else if (currentDashboardTab === 'designer') {
      if (typeof window.renderDesigner === 'function') window.renderDesigner();
    } else if (currentDashboardTab === 'export' || currentDashboardTab === 'settings') {
      if (typeof renderProjectSettings === 'function') renderProjectSettings();
    }
  }

  let isSubscribedToCedarStore = false;

  function setupDashboard() {
    if (!isSubscribedToCedarStore && window.CedarStore && typeof window.CedarStore.subscribe === 'function') {
      window.CedarStore.subscribe(() => {
        if (typeof window.currentView !== 'undefined' && window.currentView !== 'dashboard') {
          return;
        }
        renderDashboard();
      });
      isSubscribedToCedarStore = true;
    }

    if (typeof initNavigationEvents === 'function') initNavigationEvents();
    if (typeof initPipelineEvents === 'function') initPipelineEvents();
    if (typeof initPagesEvents === 'function') initPagesEvents();
    if (typeof initMediaEvents === 'function') initMediaEvents();
    if (typeof initTaxonomyEvents === 'function') initTaxonomyEvents();
    if (typeof initSettingsEvents === 'function') initSettingsEvents();
    if (typeof initDesigner === 'function') initDesigner();
    if (typeof renderProjectSettings === 'function') renderProjectSettings();

    renderDashboard();
  }

  window.renderDashboard = renderDashboard;
  window.setupDashboard = setupDashboard;

  Object.assign(window.Cedar.dashboard, {
    renderDashboard,
    setupDashboard
  });
})();
