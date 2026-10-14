import assert from "node:assert/strict";
import { databaseFixture } from "./database-fixture.mjs";
const db = await databaseFixture();
try {
  await db.exec(`insert into tracks(id,title,artist,category,goals,genres,instruments,traditions,duration,source,attribution,license,license_url,provenance_url,status,rights_verified,human_created,listening_reviewed,position)
 select ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,jsonb_build_object('vi',case when n=1001 then 'Đàn bầu bên dòng sông' else 'Bản thu thử' end,'en','Synthetic fixture '||n),'Synthetic fixture',case when n%2=0 then 'nature' else 'instrumental' end,array['relax'],array['folk'],array['strings'],array['vietnamese'],60,'{"kind":"hosted","path":"fixture.mp3"}','Synthetic metadata only','Fixture','https://example.invalid','https://example.invalid','published',true,true,true,n from generate_series(1,10000)n;`);
  await db.exec("set role anon");
  for (const count of [1000, 10000]) {
    // Keep both scale scenarios isolated with a position-bound collection-free inventory.
    await db.exec("reset role");
    await db.query(
      "update tracks set status=case when position<=$1 then 'published' else 'draft' end",
      [count],
    );
    await db.exec("set role anon");
    let last = null,
      ids = [];
    const started = performance.now();
    do {
      const query = {
        limit: 48,
        ...(last ? { after_position: last.position, after_id: last.id } : {}),
      };
      const page = (
        await db.query("select catalog_page($1::jsonb,false) as page", [JSON.stringify(query)])
      ).rows[0].page;
      assert.equal(page.total, count);
      assert.ok(page.items.length <= 48);
      ids.push(...page.items.map((item) => item.id));
      last = page.hasMore ? page.items.at(-1) : null;
    } while (last);
    assert.equal(new Set(ids).size, count);
    console.log(
      JSON.stringify({
        event: "catalog_database_scale",
        records: count,
        pageSize: 48,
        allPagesMs: Math.round(performance.now() - started),
      }),
    );
  }
  for (const q of ["dan bau", "Đàn bầu", "dong song"]) {
    const page = (
      await db.query("select catalog_page($1::jsonb,false) as page", [
        JSON.stringify({ q, instrument: "strings", tradition: "vietnamese" }),
      ])
    ).rows[0].page;
    assert.equal(page.total, 1);
    assert.equal(page.items[0].position, 1001);
  }
  await assert.rejects(db.query("select catalog_page('{}',true)"), /forbidden/);
  await assert.rejects(
    db.query("select catalog_page('{\"limit\":49}',false)"),
    /invalid_catalog_query/,
  );
  await db.exec("reset role");
  await assert.rejects(
    db.exec("update tracks set listening_reviewed=false where position=1"),
    /published_listening_review/,
  );
  await db.exec("update tracks set status='retired' where position=1001;set role anon");
  assert.equal(
    (await db.query('select catalog_page(\'{"q":"dan bau"}\',false) as page')).rows[0].page.total,
    0,
  );
  console.log(
    "PASS: 1,000 and 10,000 rows, accent-insensitive Vietnamese search, retirement, bounded pages and human-review publication constraint.",
  );
} finally {
  await db.close();
}
