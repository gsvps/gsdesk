import { Hono } from 'hono';
import type { Env } from '../env';
import { clientDownloadURL, clientReleaseNotes, compareVersions, latestClientVersion } from '../lib/client-release';
import { jsonOk } from '../lib/response';

const clientUpdate = new Hono<{ Bindings: Env }>();

clientUpdate.get('/update', (c) => {
  const platform = (c.req.query('platform') || 'windows').toLowerCase();
  const current = (c.req.query('version') || '0.0.0').trim();
  const latest = latestClientVersion(c.env);
  const updateAvailable = compareVersions(current, latest) < 0;

  return jsonOk(c, {
    platform,
    current_version: current,
    latest_version: latest,
    update_available: updateAvailable,
    download_url: clientDownloadURL(c.env, platform),
    release_notes: clientReleaseNotes(c.env),
  });
});

export default clientUpdate;
