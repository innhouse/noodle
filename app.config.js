/**
 * Extends app.json for one case the static file can't express: where the web
 * build lives.
 *
 * On GitHub Pages the site is served under /noodle, so every asset path needs
 * that prefix. Everywhere else (Firebase Hosting, EAS Hosting, local dev) it is
 * served from the root and the prefix must be absent. The deploy workflow sets
 * WEB_BASE_URL; nothing else does.
 */
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    baseUrl: process.env.WEB_BASE_URL || '',
  },
});
