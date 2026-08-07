#!/usr/bin/env node
/**
 * Seed the Events demo data as real rows via the Hub API.
 *
 * This script is the source of truth for that content now that the app no
 * longer ships a mock EVENTS array. It creates the same four events the
 * Events screen used to fake, so the screen looks unchanged while being fully
 * live.
 *
 * WHY A SECOND ACCOUNT IS NEEDED
 * The `tab` a user sees an event under is derived, not stored
 * (EventsController: host + published -> "my", host + draft -> "drafts",
 * otherwise -> "invites"). You therefore cannot place an event in your own
 * invites tab -- somebody else has to host it and invite you. "Summer Rooftop
 * Party" is skipped unless you supply a second account's token.
 *
 * USAGE
 *   # Your token (browser: localStorage.getItem('footprint_access_token'))
 *   export FOOTPRINT_TOKEN="eyJ..."
 *
 *   # Optional: a second account that will host the invite, plus YOUR user id
 *   # so it can invite you.
 *   export FOOTPRINT_HOST_TOKEN="eyJ..."
 *   export FOOTPRINT_USER_ID="<your user id>"
 *
 *   node scripts/seed-events.mjs            # create
 *   node scripts/seed-events.mjs --dry-run  # print payloads, send nothing
 *
 * Re-running creates duplicates: the API has no upsert. Delete previous
 * seeds from the app first, or accept the copies.
 */

const API = process.env.FOOTPRINT_API_URL || 'https://api.aqrava.com';
const TOKEN = process.env.FOOTPRINT_TOKEN;
const HOST_TOKEN = process.env.FOOTPRINT_HOST_TOKEN;
const MY_USER_ID = process.env.FOOTPRINT_USER_ID;
const DRY_RUN = process.argv.includes('--dry-run');

const avatar = (kind, n) => `https://randomuser.me/api/portraits/${kind}/${n}.jpg`;

/**
 * Guests are stored as snapshots (EventGuestInput: userId, name, avatar,
 * status), so placeholder ids render correctly. Only the invite event needs a
 * real id -- yours -- so the backend files it under your invites tab.
 */
const guest = (userId, name, av, status) => ({ userId, name, avatar: av, status });

/** Events hosted by the signed-in user. */
const ownEvents = [
  {
    label: 'Shah & Rana (my)',
    body: {
      title: 'Shah & Rana',
      subtitle: 'Wedding Celebration',
      description: 'Join us to celebrate the wedding of Shah & Rana. Dinner and dancing to follow.',
      templateId: 'wedding',
      date: '2026-08-15T18:00:00.000Z',
      location: {
        name: 'The Grand Hall',
        address: '120 Park Avenue, New York',
        lat: 40.7549,
        lng: -73.984,
      },
      coverImage: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=800&h=1000&fit=crop',
      publish: true,
      guests: [
        guest('seed-g1', 'Sarah Chen', avatar('women', 50), 'going'),
        guest('seed-g2', 'Mike Johnson', avatar('men', 51), 'going'),
        guest('seed-g3', 'Emma Wilson', avatar('women', 52), 'maybe'),
        guest('seed-g4', 'James Brown', avatar('men', 53), 'invited'),
        guest('seed-g5', 'Lisa Park', avatar('women', 54), 'declined'),
        guest('seed-g6', 'David Lee', avatar('men', 45), 'going'),
      ],
    },
  },
  {
    label: "Ava's 5th Birthday (my)",
    body: {
      title: "Ava's 5th Birthday",
      subtitle: 'Backyard Party',
      description: 'Cake, games and lots of fun. Come celebrate Ava turning five!',
      templateId: 'birthday',
      date: '2026-07-30T15:00:00.000Z',
      location: {
        name: 'Home',
        address: '42 Maple Street, Brooklyn',
        lat: 40.6782,
        lng: -73.9442,
      },
      coverImage: 'https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?w=800&h=1000&fit=crop',
      publish: true,
      guests: [
        guest('seed-g7', 'Grandma', avatar('women', 61), 'going'),
        guest('seed-g8', 'Uncle Bob', avatar('men', 62), 'going'),
        guest('seed-g9', 'Aunt Mary', avatar('women', 63), 'maybe'),
      ],
    },
  },
  {
    label: 'New Year Reunion (draft)',
    body: {
      title: 'New Year Reunion',
      subtitle: 'Draft — not sent',
      description: 'Ring in the new year with the whole crew.',
      templateId: 'party',
      date: '2026-12-31T20:00:00.000Z',
      location: { name: null, address: null, lat: null, lng: null },
      coverImage: 'https://images.unsplash.com/photo-1467810563316-b5476525c0f9?w=800&h=1000&fit=crop',
      // publish:false is what puts it in the drafts tab.
      publish: false,
      guests: [],
    },
  },
];

/** Hosted by a second account, inviting you -- lands in your invites tab. */
const invitedEvent = {
  label: 'Summer Rooftop Party (invite)',
  body: {
    title: 'Summer Rooftop Party',
    subtitle: 'Hosted by Sarah Chen',
    description: 'Sunset drinks and music on the rooftop. Bring your friends!',
    templateId: 'party',
    date: '2026-08-02T19:30:00.000Z',
    location: {
      name: 'Skyline Rooftop',
      address: '8 Avenue, Manhattan',
      lat: 40.7484,
      lng: -73.9857,
    },
    coverImage: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&h=1000&fit=crop',
    publish: true,
    guests: [
      guest('seed-g2', 'Mike Johnson', avatar('men', 51), 'going'),
      guest('seed-g3', 'Emma Wilson', avatar('women', 52), 'going'),
      // MY_USER_ID is substituted at send time.
      guest('__ME__', 'You', avatar('men', 32), 'invited'),
    ],
  },
};

async function createEvent(token, label, body) {
  if (DRY_RUN) {
    console.log(`\n--- ${label} ---\n${JSON.stringify(body, null, 2)}`);
    return { ok: true, dryRun: true };
  }

  const res = await fetch(`${API}/api/v1/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    // Print the server's own message: a 400 here is almost always a contract
    // mismatch, and the body says which field.
    console.error(`  FAILED ${label}: HTTP ${res.status}`);
    console.error(`  ${text.slice(0, 500)}`);
    return { ok: false, status: res.status };
  }

  let id = '(unknown id)';
  try { id = JSON.parse(text).id ?? id; } catch { /* non-JSON success body */ }
  console.log(`  created ${label} -> ${id}`);
  return { ok: true };
}

async function main() {
  if (!TOKEN && !DRY_RUN) {
    console.error('FOOTPRINT_TOKEN is not set. See the header of this file.');
    process.exit(1);
  }

  console.log(`Seeding events against ${API}${DRY_RUN ? ' (dry run)' : ''}`);

  const results = [];
  for (const ev of ownEvents) {
    results.push(await createEvent(TOKEN, ev.label, ev.body));
  }

  if (HOST_TOKEN && MY_USER_ID) {
    const body = {
      ...invitedEvent.body,
      guests: invitedEvent.body.guests.map((g) =>
        g.userId === '__ME__' ? { ...g, userId: MY_USER_ID } : g
      ),
    };
    results.push(await createEvent(HOST_TOKEN, invitedEvent.label, body));
  } else {
    console.log(
      '\n  SKIPPED "Summer Rooftop Party" (the invites tab will stay empty).\n' +
      '  It must be hosted by a different account -- you cannot invite yourself.\n' +
      '  Set FOOTPRINT_HOST_TOKEN (second account) and FOOTPRINT_USER_ID (yours) to include it.'
    );
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nDone. ${results.length - failed} succeeded, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
