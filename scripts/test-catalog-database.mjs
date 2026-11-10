import assert from "node:assert/strict";
import { after } from "node:test";
import { databaseFixture } from "./database-fixture.mjs";
import { databaseKit, databaseSuite } from "./db-kit.mjs";

// catalog_page as 202610100001_catalog_discovery defined it, before 202611090002 rewrote it.
const PREVIOUS_SCHEMA = "202611090001_release_item_track_index.sql";
const admin = "50000000-0000-4000-8000-000000000001",
  patient = "50000000-0000-4000-8000-000000000002";
const PUBLISHED_COLLECTION = "60000000-0000-4000-8000-000000000001",
  DRAFT_COLLECTION = "60000000-0000-4000-8000-000000000002",
  MISSING = "60000000-0000-4000-8000-000000000099";

const current = await databaseFixture();
const previous = await databaseFixture({ through: PREVIOUS_SCHEMA });
after(() => previous.close());
const scenario = databaseSuite(
  current,
  "catalog_page rewrite returns identical pages to the previous function across filters, accents, cursors, limits, roles and errors on an empty catalogue and at 1,000 and 10,000 rows; accent-insensitive Vietnamese search, retirement, bounded pages and human-review publication constraint.",
);
const kit = databaseKit(current);

// Deterministic synthetic catalogue: duplicate positions exercise the id tie-break, and
// every status, category, goal, tag, accent and LIKE metacharacter appears.
const CATALOG_COLUMNS = {
  title: `jsonb_build_object('vi', case n % 10 when 0 then 'Đàn bầu bên dòng sông '||n
    when 1 then 'Tiếng mưa đêm '||n when 2 then 'Sáo trúc 100% tự nhiên' when 3 then 'under_score '||n
    when 4 then 'Back\\slash '||n else 'Bản thu thử '||n end, 'en', 'Synthetic fixture '||n)`,
  description: `jsonb_build_object('vi', case when n % 7 = 0 then 'Gió qua dòng sông' else '' end,
    'en', case when n % 11 = 0 then 'River wind' else '' end)`,
  artist: "'Nghệ sĩ '||(n % 5)",
  category: "case when n % 2 = 0 then 'nature' else 'instrumental' end",
  goals:
    "case n % 3 when 0 then array['relax'] when 1 then array['rest','focus'] else array['focus'] end",
  genres:
    "case n % 4 when 0 then array['folk'] when 1 then array['ambient'] when 2 then array['folk','ambient'] else array[]::text[] end",
  instruments:
    "case n % 5 when 0 then array['strings'] when 1 then array['piano'] when 2 then array['flute'] when 3 then array['strings','piano'] else array[]::text[] end",
  traditions:
    "case n % 6 when 0 then array['vietnamese'] when 1 then array['western'] when 2 then array['vietnamese','western'] else array[]::text[] end",
  status: "case n % 9 when 0 then 'draft' when 1 then 'retired' else 'published' end",
  rights_verified: "true",
  listening_reviewed: "true",
  position: "(n * 7919) % 2500",
  created_at: "timestamptz '2026-01-01 00:00:00+00' + n * interval '1 minute'",
};

/** Accounts and both collections exist before any recording, so the empty catalogue is real. */
async function seedAccounts(db) {
  await databaseKit(db).asOwner();
  await db.query("insert into auth.users(id) values($1),($2)", [admin, patient]);
  await db.query("insert into content_admins values($1)", [admin]);
  await db.query(
    `insert into curated_collections(id,title,goal,position,published) values
     ($1,'{"vi":"Tuyển chọn","en":"Curated"}','relax',0,true),($2,'{"vi":"Bản nháp","en":"Draft"}','rest',1,false)`,
    [PUBLISHED_COLLECTION, DRAFT_COLLECTION],
  );
}
for (const db of [previous, current]) await seedAccounts(db);

async function seedCatalogue(db, from, to) {
  await databaseKit(db).seedTracks({ count: to - from + 1, from, columns: CATALOG_COLUMNS });
  for (const [collection, every] of [
    [PUBLISHED_COLLECTION, 33],
    [DRAFT_COLLECTION, 47],
  ])
    await db.query(
      `insert into curated_collection_items(collection_id,track_id,position)
       select $1,('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,n
       from generate_series($2::integer,$3::integer) n where n % $4 = 0`,
      [collection, from, to, every],
    );
  // PGlite has no autovacuum; give both schemas the statistics and visibility map it maintains.
  await db.exec("vacuum analyze");
}

const MODES = {
  guest: { role: "anon", review: false },
  patient: { role: "authenticated", id: patient, review: false },
  service: { role: "service_role", review: false },
  adminPublic: { role: "authenticated", id: admin, review: false },
  adminReview: { role: "authenticated", id: admin, review: true },
  guestReview: { role: "anon", review: true },
  patientReview: { role: "authenticated", id: patient, review: true },
  serviceReview: { role: "service_role", review: true },
  ownerReview: { review: true },
};
const FILTERS = [
  {},
  { q: "dan bau" },
  { q: "Đàn bầu" },
  { q: "ĐÀN BẦU BÊN" },
  { q: "dong song" },
  { q: "mưa" },
  { q: "sáo trúc 100%" },
  { q: "100%" },
  { q: "%" },
  { q: "_" },
  { q: "under_score" },
  { q: "\\" },
  { q: "back\\slash" },
  { q: "nghe si 3" },
  { q: "river wind" },
  { q: "zzz no match" },
  { q: "" },
  { q: "  " },
  { q: "a".repeat(120) },
  { category: "nature" },
  { category: "instrumental" },
  { category: "" },
  { goal: "relax" },
  { goal: "rest" },
  { goal: "focus" },
  { genre: "folk" },
  { genre: "ambient" },
  { instrument: "strings" },
  { instrument: "piano" },
  { instrument: "flute" },
  { tradition: "vietnamese" },
  { tradition: "western" },
  { status: "published" },
  { status: "draft" },
  { status: "retired" },
  { status: "" },
  { collection: PUBLISHED_COLLECTION },
  { collection: DRAFT_COLLECTION },
  { collection: MISSING },
  { q: "dan bau", instrument: "strings", tradition: "vietnamese" },
  { category: "nature", goal: "relax", genre: "folk" },
  { q: "song", status: "draft" },
  { collection: PUBLISHED_COLLECTION, q: "mua" },
  { collection: DRAFT_COLLECTION, category: "instrumental", goal: "focus" },
  { cursor: "ignored by SQL", unknown: "ignored" },
];
const CORE = [
  {},
  { q: "Đàn bầu" },
  { category: "nature" },
  { status: "draft" },
  { collection: PUBLISHED_COLLECTION },
  { goal: "rest", instrument: "piano" },
];
const ERRORS = [
  ["guest", { limit: 0 }],
  ["guest", { limit: 49 }],
  ["guest", { limit: "abc" }],
  ["guest", { limit: 12.5 }],
  ["guest", { q: "a".repeat(121) }],
  ["guestReview", {}],
  ["guestReview", { limit: 49 }],
  ["patientReview", {}],
  ["serviceReview", {}],
  ["ownerReview", {}],
  ["guest", { collection: "not-a-uuid" }],
  ["guest", { after_id: "not-a-uuid", after_position: 1 }],
  ["guest", { after_id: "10000000-0000-4000-8000-000000000005", after_position: "x" }],
];

function matrix({ fullWalk }) {
  const cases = [];
  const add = (mode, query, pages) =>
    cases.push({ label: `${mode} ${JSON.stringify(query)} pages<=${pages}`, mode, query, pages });
  for (const filter of FILTERS)
    for (const mode of ["guest", "adminReview", "adminPublic"]) add(mode, filter, 2);
  for (const filter of CORE) {
    for (const mode of ["guest", "adminReview"])
      for (const limit of [1, 12, 24, 48]) add(mode, { ...filter, limit }, 3);
    for (const mode of ["patient", "service"]) add(mode, filter, 2);
  }
  for (const [mode, query] of ERRORS) add(mode, query, 1);
  // Cursors the client could send: no position, an ignored empty id, past the end, mid-list.
  add("guest", { after_id: "10000000-0000-4000-8000-000000000005" }, 1);
  add("guest", { after_position: 10, after_id: "" }, 1);
  add("guest", { after_position: 2499, after_id: "ffffffff-ffff-4fff-bfff-ffffffffffff" }, 1);
  add(
    "adminReview",
    { after_position: 1200, after_id: "10000000-0000-4000-8000-000000000000", limit: 48 },
    3,
  );
  if (fullWalk)
    for (const mode of ["guest", "adminReview"]) add(mode, { limit: 48 }, Number.POSITIVE_INFINITY);
  return cases;
}

async function enter(db, mode) {
  const session = databaseKit(db);
  if (mode.role) await session.asRole(mode.id ?? null, mode.role);
  else await session.asOwner();
}
async function catalogPage(db, query, review) {
  try {
    return {
      page: (
        await db.query("select catalog_page($1::jsonb,$2) as page", [JSON.stringify(query), review])
      ).rows[0].page,
    };
  } catch (error) {
    return { error: { code: error.code, message: error.message } };
  }
}
/** Follows the cursor each page returns, as src/lib/catalog-query.ts encodes it. */
async function walk(db, query, review, pages) {
  const results = [];
  let cursor = {};
  while (results.length < pages) {
    const result = await catalogPage(db, { ...query, ...cursor }, review);
    results.push(result);
    if (!result.page?.hasMore) break;
    const last = result.page.items.at(-1);
    cursor = { after_position: last.position, after_id: last.id };
  }
  return results;
}
async function run(db, cases) {
  const outcomes = [];
  let ms = 0;
  for (const name of Object.keys(MODES)) {
    const group = cases.filter((entry) => entry.mode === name);
    if (!group.length) continue;
    await enter(db, MODES[name]);
    for (const entry of group) {
      const started = performance.now();
      const results = await walk(db, entry.query, MODES[name].review, entry.pages);
      const elapsed = performance.now() - started;
      ms += elapsed;
      outcomes.push({ label: entry.label, results, elapsed });
    }
  }
  await databaseKit(db).resetSession();
  return { outcomes, ms };
}

/** Runs the matrix on the previous and the current function and requires identical output. */
async function assertEquivalent(records, { fullWalk }) {
  const cases = matrix({ fullWalk });
  const before = await run(previous, cases);
  const now = await run(current, cases);
  for (const [index, outcome] of now.outcomes.entries()) {
    assert.equal(outcome.label, before.outcomes[index].label);
    assert.deepStrictEqual(outcome.results, before.outcomes[index].results, outcome.label);
  }
  const results = now.outcomes.flatMap((outcome) => outcome.results);
  // Guard against a vacuous matrix: it must cover full, partial, empty and failing pages.
  if (records > 0) assert.ok(results.some((result) => result.page?.hasMore));
  assert.ok(results.some((result) => result.page && !result.page.items.length));
  assert.ok(results.some((result) => result.error?.code === "22023"));
  assert.ok(results.some((result) => result.error?.code === "42501"));
  assert.ok(results.some((result) => result.error?.code === "22P02"));
  const walks = (outcomes) =>
    Math.round(
      outcomes
        .filter((outcome) => outcome.label.endsWith("pages<=Infinity"))
        .reduce((sum, outcome) => sum + outcome.elapsed, 0),
    );
  console.log(
    JSON.stringify({
      event: "catalog_page_equivalence",
      records,
      cases: cases.length,
      calls: results.length,
      previousMs: Math.round(before.ms),
      currentMs: Math.round(now.ms),
      ...(fullWalk && {
        allPagesPreviousMs: walks(before.outcomes),
        allPagesCurrentMs: walks(now.outcomes),
      }),
    }),
  );
  return now.outcomes;
}

scenario("identical pages before and after the rewrite on an empty catalogue", async () => {
  await assertEquivalent(0, { fullWalk: true });
});

scenario("identical pages before and after the rewrite at 1,000 rows", async () => {
  for (const db of [previous, current]) await seedCatalogue(db, 1, 1000);
  await assertEquivalent(1000, { fullWalk: true });
});

let fullWalks;
scenario("identical pages before and after the rewrite at 10,000 rows", async () => {
  for (const db of [previous, current]) await seedCatalogue(db, 1001, 10000);
  fullWalks = (await assertEquivalent(10000, { fullWalk: true })).filter((outcome) =>
    outcome.label.endsWith("pages<=Infinity"),
  );
});

scenario("every visible recording appears exactly once across 48-row pages", async () => {
  await kit.asOwner();
  const published = await kit.count("tracks", "status='published'");
  const all = await kit.count("tracks");
  assert.equal(fullWalks.length, 2);
  for (const [outcome, expected] of [
    [fullWalks[0], published],
    [fullWalks[1], all],
  ]) {
    const items = outcome.results.flatMap((result) => result.page.items);
    assert.ok(outcome.results.every((result) => result.page.total === expected));
    assert.ok(outcome.results.every((result) => result.page.items.length <= 48));
    assert.equal(items.length, expected);
    assert.equal(new Set(items.map((item) => item.id)).size, expected);
    assert.ok(
      items.every(
        (item, index) =>
          index === 0 ||
          items[index - 1].position < item.position ||
          (items[index - 1].position === item.position && items[index - 1].id < item.id),
      ),
    );
    assert.ok(items.every((item) => !("search_text" in item)));
  }
});

scenario("accent-insensitive Vietnamese search", async () => {
  await kit.asOwner();
  const expected = await kit.count(
    "tracks",
    "status='published' and title->>'vi' like 'Đàn bầu%' and instruments @> '{strings}' and traditions @> '{vietnamese}'",
  );
  assert.ok(expected > 0);
  await kit.asRole(null, "anon");
  for (const q of ["dan bau", "Đàn bầu", "ĐÀN BẦU", "đàn BẦU"]) {
    const { page } = await catalogPage(
      current,
      { q, instrument: "strings", tradition: "vietnamese", limit: 48 },
      false,
    );
    assert.equal(page.total, expected, q);
    assert.ok(page.items.every((item) => item.title.vi.startsWith("Đàn bầu bên dòng sông")));
  }
  const { page } = await catalogPage(current, { q: "dong song" }, false);
  await kit.asOwner();
  assert.equal(
    page.total,
    await kit.count(
      "tracks",
      "status='published' and (title->>'vi' like '%dòng sông%' or description->>'vi' like '%dòng sông%')",
    ),
  );
});

scenario("guests cannot review and pages stay bounded", async () => {
  await kit.asRole(null, "anon");
  await assert.rejects(current.query("select catalog_page('{}',true)"), /forbidden/);
  await assert.rejects(
    current.query("select catalog_page('{\"limit\":49}',false)"),
    /invalid_catalog_query/,
  );
});

scenario("published recordings require a human listening review", async () => {
  await kit.asOwner();
  await assert.rejects(
    current.exec("update tracks set listening_reviewed=false where status='published'"),
    /published_listening_review/,
  );
});

scenario("retired recordings leave search with identical pages", async () => {
  const retire =
    "update tracks set status='retired' where status='published' and title->>'vi' like 'Đàn bầu%' and instruments @> '{strings}' and traditions @> '{vietnamese}'";
  for (const db of [previous, current]) {
    await databaseKit(db).asOwner();
    await db.exec(retire);
  }
  await kit.asRole(null, "anon");
  const { page } = await catalogPage(
    current,
    { q: "dan bau", instrument: "strings", tradition: "vietnamese" },
    false,
  );
  assert.equal(page.total, 0);
  await assertEquivalent(10000, { fullWalk: false });
});
