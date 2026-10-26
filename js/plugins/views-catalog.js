/**
 * Cedar Built-in Plugin: Views Catalog
 * Registers the standard dashboard views (Posts, Pages, Media, Categories, Export).
 */
(function () {
  'use strict';

  const host = window.Cedar || window.Outpost;
  if (!host || !host.registerPlugin) return;

  host.registerPlugin({
    id: 'cedar-views-catalog',
    name: 'Dashboard Catalog Views',
    version: '1.0.0',
    description: 'Registers the standard Posts, Pages, Media, Categories, and Export views.',

    init(api) {

      // 1. Posts Catalog
      api.views.register({
        id: 'posts',
        title: 'All Posts',
        sidebarTitle: 'Posts',
        order: 10,
        paneId: 'pane-posts',
        render() {
          if (typeof window.renderAllPostsGrid === 'function') {
            window.renderAllPostsGrid();
          }
        }
      });

      // 2. Pages Catalog
      api.views.register({
        id: 'pages',
        title: 'Pages',
        sidebarTitle: 'Pages',
        order: 20,
        paneId: 'pane-pages',
        render() {
          if (typeof window.renderStaticPages === 'function') {
            window.renderStaticPages();
          }
        }
      });


      // 3. Media Library
      api.views.register({
        id: 'media',
        title: 'Media',
        sidebarTitle: 'Media',
        order: 30,
        paneId: 'pane-media',
        render() {
          if (typeof window.renderDerivedMediaLibrary === 'function') {
            window.renderDerivedMediaLibrary();
          }
        }
      });

      // 4. Categories & Taxonomy
      api.views.register({
        id: 'categories',
        title: 'Categories',
        sidebarTitle: 'Categories',
        order: 40,
        paneId: 'pane-categories',
        render() {
          if (typeof window.renderCategoriesManager === 'function') {
            window.renderCategoriesManager();
          }
        }
      });

      // 5. Master Slice & Export
      api.views.register({
        id: 'export',
        title: 'Export',
        sidebarTitle: 'Export',
        order: 50,
        paneId: 'pane-export',
        render() {
          if (typeof window.renderExportPane === 'function') {
            window.renderExportPane();
          }
        }
      });

      // 6. Settings View
      api.views.register({
        id: 'settings',
        title: 'Settings',
        sidebarTitle: 'Settings',
        order: 60,
        paneId: 'pane-settings',
        render() {
          if (typeof window.renderProjectSettings === 'function') {
            window.renderProjectSettings();
          }
          if (typeof window.updateSettingsActiveSection === 'function') {
            setTimeout(window.updateSettingsActiveSection, 50);
          }
        }
      });
    }
  });
})();
