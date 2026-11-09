import { readFile, writeFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import prettier from "prettier";
import { MIGRATIONS, databaseFixture, migrationNames } from "./database-fixture.mjs";

/**
 * Static migration rules plus a privilege/RLS snapshot of the fully migrated PGlite schema.
 * `node scripts/lint-migrations.mjs --update-snapshot` rewrites the snapshot after review.
 */
const SNAPSHOT = "scripts/fixtures/db-privileges.json";
const FILE_NAME = /^(\d{4})(\d{2})(\d{2})(\d{4})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;
const EXTENSIONS = new Set(["pg_cron", "pg_trgm"]);
// Applied migrations are immutable. This one replaced two existing functions, keeping their
// ACLs, without restating the revoke; the snapshot still pins the resulting privileges.
const REPLACED_WITHOUT_REVOKE = new Map([
  [
    "202610090006_consent_serialization.sql",
    new Set(["public.start_listening(uuid,integer)", "public.end_listening(uuid,integer)"]),
  ],
]);
const TYPE_ALIASES = new Map([
  ["int", "integer"],
  ["int4", "integer"],
  ["int8", "bigint"],
  ["int2", "smallint"],
  ["bool", "boolean"],
  ["float8", "double precision"],
  ["float4", "real"],
  ["decimal", "numeric"],
  ["varchar", "character varying"],
  ["timestamptz", "timestamp with time zone"],
]);
const MULTI_WORD_TYPES = /^(double|character|char|timestamp|time|bit|interval|national)\b/;

/** Splits SQL into top-level statements, blanking comments and dollar-quoted bodies. */
export function statements(sql) {
  const result = [];
  let code = "";
  let line = 1;
  let startLine = 1;
  const push = () => {
    const text = code.replace(/\s+/g, " ").trim();
    if (text) result.push({ code: text, line: startLine });
    code = "";
  };
  for (let i = 0; i < sql.length;) {
    const rest = sql.slice(i);
    if (!code.trim()) startLine = line;
    const dollar = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(rest);
    let end;
    if (rest.startsWith("--")) end = rest.indexOf("\n") < 0 ? rest.length : rest.indexOf("\n");
    else if (rest.startsWith("/*")) {
      let depth = 0;
      for (end = 0; end < rest.length; end++) {
        if (rest.startsWith("/*", end)) {
          depth++;
          end++;
        } else if (rest.startsWith("*/", end) && --depth === 0) {
          end += 2;
          break;
        }
      }
    } else if (dollar) {
      const close = rest.indexOf(dollar[0], dollar[0].length);
      if (close < 0) throw new Error(`Unterminated dollar quote at line ${line}`);
      end = close + dollar[0].length;
      code += " $$ ";
    } else if (rest[0] === "'" || rest[0] === '"') {
      const escaped = rest[0] === "'" && /(^|[^\w$])[eE]$/.test(code);
      for (end = 1; end < rest.length; end++) {
        if (escaped && rest[end] === "\\") end++;
        else if (rest[end] === rest[0]) {
          if (rest[end + 1] === rest[0]) end++;
          else break;
        }
      }
      if (end >= rest.length) throw new Error(`Unterminated quote at line ${line}`);
      end++;
      code += rest.slice(0, end);
    } else if (rest[0] === ";") {
      end = 1;
      push();
    } else {
      end = 1;
      code += rest[0];
    }
    if (rest.startsWith("--") || rest.startsWith("/*")) code += " ";
    line += (rest.slice(0, end).match(/\n/g) ?? []).length;
    i += end;
  }
  push();
  return result;
}

/** Splits on commas outside parentheses and quotes. */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = "";
  for (const char of text) {
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === "'" || char === '"') quote = char;
    else if (char === "(") depth++;
    else if (char === ")") depth--;
    else if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function normalizeName(name) {
  const plain = name.replace(/"/g, "").toLowerCase().trim();
  return plain.includes(".") ? plain : `public.${plain}`;
}

/** Identity argument types, as `revoke ... on function name(types)` spells them. */
function argumentTypes(list) {
  return splitTopLevel(list)
    .map((argument) => {
      let text = argument
        .replace(/\s+default\s+[\s\S]*$/i, "")
        .replace(/\s*=[\s\S]*$/, "")
        .trim()
        .toLowerCase();
      const mode = /^(in|out|inout|variadic)\s+/.exec(text);
      if (mode?.[1] === "out") return null;
      if (mode) text = text.slice(mode[0].length);
      const words = text.split(/\s+/);
      if (words.length > 1 && !MULTI_WORD_TYPES.test(text)) text = words.slice(1).join(" ");
      text = text.replace(/"/g, "").replace(/\s*([.[\]])\s*/g, "$1");
      const base = text.replace(/(\[\])+$/, "");
      return (TYPE_ALIASES.get(base) ?? base) + text.slice(base.length);
    })
    .filter((type) => type !== null)
    .join(",");
}

/** Reads `name(args)` at the start of `text`, returning the signature and the remainder. */
function signatureAt(text) {
  const open = text.indexOf("(");
  if (open < 0) return null;
  let depth = 0;
  for (let close = open; close < text.length; close++) {
    if (text[close] === "(") depth++;
    else if (text[close] === ")" && --depth === 0)
      return {
        signature: `${normalizeName(text.slice(0, open))}(${argumentTypes(text.slice(open + 1, close))})`,
        rest: text.slice(close + 1),
      };
  }
  return null;
}

/** Returns the rule violations of one migration file. */
export function lintMigration(name, sql, replacedWithoutRevoke = new Set()) {
  const problems = [];
  const date = FILE_NAME.exec(name);
  if (!date) problems.push("file name must match YYYYMMDDNNNN_snake_name.sql");
  else if (+date[2] < 1 || +date[2] > 12 || +date[3] < 1 || +date[3] > 31)
    problems.push("file name must start with a real date");
  // scripts/migrate.mjs strips exactly these, so nothing may precede begin; or follow commit;.
  if (!/^begin;/i.test(sql)) problems.push("file must start with 'begin;'");
  if (!/commit;\s*$/i.test(sql)) problems.push("file must end with 'commit;'");
  let parsed;
  try {
    parsed = statements(sql);
  } catch (error) {
    return [...problems, error.message];
  }
  const control = /^(begin|commit|rollback|end|abort|start transaction|savepoint|release)\b/i;
  for (const [index, statement] of parsed.entries()) {
    const expected = index === 0 ? "begin" : index === parsed.length - 1 ? "commit" : null;
    if (expected ? statement.code.toLowerCase() !== expected : control.test(statement.code))
      problems.push(
        `line ${statement.line}: ${expected ? `statement must be '${expected};'` : "transaction control inside a migration"}`,
      );
  }
  const revoked = parsed.map((statement) => {
    const match = /^revoke all (?:privileges )?on function (.+?) from /i.exec(statement.code);
    return new Set(
      match ? splitTopLevel(match[1]).map((entry) => signatureAt(entry.trim())?.signature) : [],
    );
  });
  const exempt = new Set();
  for (const [index, statement] of parsed.entries()) {
    const extension = /^create extension (?:if not exists )?"?([\w-]+)"?/i.exec(statement.code);
    if (extension && !EXTENSIONS.has(extension[1].toLowerCase()))
      problems.push(`line ${statement.line}: extension '${extension[1]}' is not allowlisted`);
    const created = /^create (?:or replace )?function (.+)$/i.exec(statement.code);
    if (!created) continue;
    const parsedSignature = signatureAt(created[1]);
    if (!parsedSignature) {
      problems.push(`line ${statement.line}: cannot parse the function signature`);
      continue;
    }
    const { signature, rest } = parsedSignature;
    if (/\bsecurity definer\b/i.test(rest) && !/\bset search_path\s*(?:=|to)\s*''/i.test(rest))
      problems.push(
        `line ${statement.line}: ${signature} is security definer without set search_path = ''`,
      );
    if (revoked.slice(index + 1).some((set) => set.has(signature))) continue;
    if (replacedWithoutRevoke.has(signature)) exempt.add(signature);
    else
      problems.push(`line ${statement.line}: ${signature} needs a later 'revoke all on function'`);
  }
  for (const signature of replacedWithoutRevoke)
    if (!exempt.has(signature)) problems.push(`stale revoke exemption for ${signature}`);
  return problems;
}

/** Proves each rule still rejects what it is meant to reject. */
function selfTest() {
  const cases = [
    ["202611090099_Bad-Name.sql", "begin;\ncommit;\n", /file name/],
    ["202613090099_bad_month.sql", "begin;\ncommit;\n", /real date/],
    ["202611090099_comment.sql", "-- note\nbegin;\ncommit;\n", /start with 'begin;'/],
    ["202611090099_tail.sql", "begin;\ncommit;\nselect 1;\n", /end with 'commit;'/],
    ["202611090099_nested.sql", "begin;\ncommit;\nbegin;\ncommit;\n", /transaction control/],
    ["202611090099_extension.sql", "begin;\ncreate extension pgcrypto;\ncommit;\n", /allowlisted/],
    [
      "202611090099_definer.sql",
      "begin;\ncreate function public.f(p_id uuid) returns void language sql security definer as $$ select 1; $$;\nrevoke all on function public.f(uuid) from public;\ncommit;\n",
      /without set search_path/,
    ],
    [
      "202611090099_revoke.sql",
      "begin;\ncreate function public.f(p_id uuid, p_n int default 1) returns void language sql as $body$ select 1; $body$;\nrevoke all on function public.f(uuid) from public;\ncommit;\n",
      /needs a later 'revoke all on function'/,
    ],
    [
      "202611090099_order.sql",
      "begin;\nrevoke all on function public.f(uuid) from public;\ncreate or replace function public.f(p uuid) returns void language sql as $$ select 1; $$;\ncommit;\n",
      /needs a later 'revoke all on function'/,
    ],
  ];
  for (const [name, sql, expected] of cases)
    if (!lintMigration(name, sql).some((problem) => expected.test(problem)))
      throw new Error(`lint-migrations self-test: ${name} was not rejected by ${expected}`);
  const valid =
    "begin;\n-- ; inside a comment\ncreate function public.f(p_id uuid, p_n integer default 1, out p_r text) returns text language plpgsql security definer set search_path = '' as $$ begin; select ';'; end $$;\nrevoke all on function public.f(uuid,int4) from public, anon;\ncommit;\n";
  const problems = lintMigration("202611090099_valid.sql", valid);
  if (problems.length) throw new Error(`lint-migrations self-test: ${problems.join("; ")}`);
}

/** Every public table's RLS flags and API privileges, and every public function's ACL. */
async function privilegeSnapshot() {
  const db = await databaseFixture();
  try {
    // Without a search path, regprocedure and type names print schema-qualified.
    await db.exec("set search_path = ''");
    const grants = (rows) => {
      const result = {};
      for (const row of rows)
        (result[row.grantee] ??= []).push(
          row.privilege_type + (row.is_grantable ? " WITH GRANT OPTION" : ""),
        );
      for (const list of Object.values(result)) list.sort();
      return result;
    };
    const userObject = (alias, catalog) =>
      `not exists(select 1 from pg_catalog.pg_depend d where d.classid='pg_catalog.${catalog}'::pg_catalog.regclass and d.objid=${alias}.oid and d.deptype='e')`;
    const grantee =
      "case when a.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(a.grantee) end";
    const tables = {};
    for (const table of (
      await db.query(
        `select c.oid, 'public.'||c.relname as name, c.relrowsecurity, c.relforcerowsecurity
         from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
         where n.nspname='public' and c.relkind in ('r','p','v','m','f') and ${userObject("c", "pg_class")}
         order by c.relname`,
      )
    ).rows) {
      const tablePrivileges = await db.query(
        `select ${grantee} as grantee, a.privilege_type, a.is_grantable
         from pg_catalog.pg_class c, pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) a
         where c.oid=$1 and a.grantee <> c.relowner order by 1, 2`,
        [table.oid],
      );
      const columnPrivileges = await db.query(
        `select att.attname, ${grantee} as grantee, a.privilege_type, a.is_grantable
         from pg_catalog.pg_attribute att join pg_catalog.pg_class c on c.oid=att.attrelid,
         pg_catalog.aclexplode(att.attacl) a
         where att.attrelid=$1 and att.attnum > 0 and not att.attisdropped and a.grantee <> c.relowner
         order by 1, 2, 3`,
        [table.oid],
      );
      const columns = {};
      for (const name of new Set(columnPrivileges.rows.map((row) => row.attname)))
        columns[name] = grants(columnPrivileges.rows.filter((row) => row.attname === name));
      tables[table.name] = {
        rowLevelSecurity: table.relrowsecurity,
        forceRowLevelSecurity: table.relforcerowsecurity,
        privileges: grants(tablePrivileges.rows),
        ...(Object.keys(columns).length && { columnPrivileges: columns }),
      };
    }
    const functions = {};
    for (const fn of (
      await db.query(
        `select p.oid, p.oid::pg_catalog.regprocedure::text as signature, p.prosecdef, p.proconfig
         from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and ${userObject("p", "pg_proc")} order by 2`,
      )
    ).rows) {
      const privileges = await db.query(
        `select ${grantee} as grantee, a.privilege_type, a.is_grantable
         from pg_catalog.pg_proc p, pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
         where p.oid=$1 and a.grantee <> p.proowner order by 1, 2`,
        [fn.oid],
      );
      functions[fn.signature] = {
        securityDefiner: fn.prosecdef,
        config: fn.proconfig ?? [],
        privileges: grants(privileges.rows),
      };
    }
    return { tables, functions };
  } finally {
    await db.close();
  }
}

function flatten(value, path = "", into = new Map()) {
  if (value && typeof value === "object" && !Array.isArray(value))
    for (const [key, child] of Object.entries(value))
      flatten(child, path ? `${path} > ${key}` : key, into);
  else into.set(path, JSON.stringify(value));
  return into;
}

selfTest();
const names = await migrationNames();
const problems = [];
const versions = new Set();
for (const name of names) {
  const version = name.slice(0, 12);
  if (versions.has(version)) problems.push(`${name}: duplicate version ${version}`);
  versions.add(version);
  const sql = await readFile(`${MIGRATIONS}/${name}`, "utf8");
  for (const problem of lintMigration(name, sql, REPLACED_WITHOUT_REVOKE.get(name)))
    problems.push(`${name}: ${problem}`);
}
for (const name of REPLACED_WITHOUT_REVOKE.keys())
  if (!names.includes(name)) problems.push(`stale revoke exemption for missing ${name}`);
if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`FAIL: ${problems.length} migration rule violation(s).`);
  process.exit(1);
}

const snapshot = await privilegeSnapshot();
if (process.argv.includes("--update-snapshot")) {
  const text = await prettier.format(JSON.stringify(snapshot), {
    ...(await prettier.resolveConfig(SNAPSHOT)),
    filepath: SNAPSHOT,
  });
  await writeFile(SNAPSHOT, text);
  console.log(`Wrote ${SNAPSHOT}; review the diff before committing it.`);
}
const committed = JSON.parse(await readFile(SNAPSHOT, "utf8"));
if (!isDeepStrictEqual(snapshot, committed)) {
  const actual = flatten(snapshot);
  const expected = flatten(committed);
  for (const path of new Set([...expected.keys(), ...actual.keys()]))
    if (actual.get(path) !== expected.get(path))
      console.error(
        `${path}: committed ${expected.get(path) ?? "(absent)"}, migrated ${actual.get(path) ?? "(absent)"}`,
      );
  console.error(
    `FAIL: privileges or RLS differ from ${SNAPSHOT}. If intended, run node scripts/lint-migrations.mjs --update-snapshot and review the diff.`,
  );
  process.exit(1);
}
console.log(
  `PASS: ${names.length} migrations follow naming, begin/commit framing, security definer search_path, revoke-after-create and extension rules; privileges and RLS of ${Object.keys(snapshot.tables).length} tables and ${Object.keys(snapshot.functions).length} functions match ${SNAPSHOT}.`,
);
