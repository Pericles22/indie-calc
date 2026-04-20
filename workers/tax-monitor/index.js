/**
 * Tax Law Change Monitor
 *
 * Runs weekly (Sunday 12:00 UTC / 7am CT) via Cloudflare Cron Trigger.
 * Fetches key tax source pages, hashes their content, compares to
 * the last known hash stored in KV, and sends an email alert via
 * Cloudflare Email Workers (MailChannels) if any page changed.
 */

const SOURCES = [
  {
    name: 'Tax Foundation — Federal Brackets',
    url: 'https://taxfoundation.org/data/all/federal/2026-tax-brackets/',
  },
  {
    name: 'Tax Foundation — State Income Tax Rates',
    url: 'https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/',
  },
  {
    name: 'SSA — SS Wage Base',
    url: 'https://www.ssa.gov/oact/cola/cbb.html',
  },
  {
    name: 'IRS — Self-Employment Tax Center',
    url: 'https://www.irs.gov/businesses/small-businesses-self-employed/self-employed-individuals-tax-center',
  },
  {
    name: 'IRS — Newsroom',
    url: 'https://www.irs.gov/newsroom',
  },
  {
    name: 'IRS — Tax Inflation Adjustments',
    url: 'https://www.irs.gov/newsroom/irs-provides-tax-inflation-adjustments-for-tax-year-2027',
  },
  {
    name: 'Tax Foundation — 2027 Federal Brackets (watch for publication)',
    url: 'https://taxfoundation.org/data/all/federal/2027-tax-brackets/',
  },
];

/**
 * Hash a string using SHA-256
 * @param {string} text
 * @returns {Promise<string>}
 */
async function hashContent(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Strip volatile elements from HTML (scripts, styles, timestamps)
 * so we only detect meaningful content changes
 * @param {string} html
 * @returns {string}
 */
function normalizeHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Send alert email via MailChannels (free on Cloudflare Workers)
 * @param {object} env
 * @param {Array<{name: string, url: string}>} changes
 */
async function sendAlert(env, changes) {
  const changeList = changes
    .map(c => `- ${c.name}\n  ${c.url}\n  Status: ${c.status}`)
    .join('\n\n');

  const body = `IndieCalc Tax Monitor detected changes on ${changes.length} source(s):\n\n${changeList}\n\nReview these pages and update tax-data.js if rates or thresholds have changed.\n\nThis is an automated alert from your indie-calc.com tax monitor.`;

  const res = await fetch('https://api.mailchannels.net/tx/v1/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{
        to: [{ email: env.ALERT_EMAIL }],
      }],
      from: {
        email: env.FROM_EMAIL,
        name: 'IndieCalc Tax Monitor',
      },
      subject: `[IndieCalc] Tax source change detected (${changes.length} page${changes.length > 1 ? 's' : ''})`,
      content: [{
        type: 'text/plain',
        value: body,
      }],
    }),
  });

  return res.ok;
}

export default {
  async scheduled(event, env, ctx) {
    const changes = [];

    for (const source of SOURCES) {
      const kvKey = `hash:${source.url}`;

      try {
        const response = await fetch(source.url, {
          headers: {
            'User-Agent': 'IndieCalc-TaxMonitor/1.0 (tax data verification)',
          },
        });

        if (!response.ok) {
          // Page might not exist yet (e.g., 2027 brackets)
          const previousHash = await env.HASHES.get(kvKey);
          if (previousHash && previousHash !== 'NOT_FOUND') {
            // Page existed before but now returns error — flag it
            changes.push({
              name: source.name,
              url: source.url,
              status: `HTTP ${response.status} (was previously accessible)`,
            });
          } else {
            // Store that we know it's not found yet
            await env.HASHES.put(kvKey, 'NOT_FOUND');
          }
          continue;
        }

        const html = await response.text();
        const normalized = normalizeHtml(html);
        const currentHash = await hashContent(normalized);

        const previousHash = await env.HASHES.get(kvKey);

        if (previousHash === null) {
          // First run — store baseline, no alert
          await env.HASHES.put(kvKey, currentHash);
          continue;
        }

        if (previousHash === 'NOT_FOUND') {
          // Page just appeared — this is notable (e.g., 2027 brackets published)
          changes.push({
            name: source.name,
            url: source.url,
            status: 'NEW — page is now live (was previously 404)',
          });
          await env.HASHES.put(kvKey, currentHash);
          continue;
        }

        if (currentHash !== previousHash) {
          changes.push({
            name: source.name,
            url: source.url,
            status: 'Content changed since last check',
          });
          await env.HASHES.put(kvKey, currentHash);
        }
      } catch (err) {
        changes.push({
          name: source.name,
          url: source.url,
          status: `Fetch error: ${err.message}`,
        });
      }
    }

    if (changes.length > 0) {
      await sendAlert(env, changes);
    }
  },
};
