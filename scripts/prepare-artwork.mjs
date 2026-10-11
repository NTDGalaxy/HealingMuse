import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { atomicJson, plain, readJson, sourceFetch } from "./audio-common.mjs";
await mkdir("public/artwork", { recursive: true });
const credits = await readJson("content/artwork-credits.json", []);
const selected = process.argv.includes("--kinds")
  ? process.argv[process.argv.indexOf("--kinds") + 1].split(",")
  : null;
for (const [kind, search] of [
  [
    "forest",
    "intitle:forest intitle:trees -intitle:winter -intitle:painting -intitle:map -intitle:Shishkin",
  ],
  ["river", "intitle:river -intitle:house -intitle:building -intitle:bridge -intitle:painting"],
  ["sea", "intitle:sea intitle:waves -intitle:internal -intitle:Sulu -intitle:map"],
  ["rain", "intitle:rain intitle:leaves"],
  ["night", "intitle:night intitle:sky -intitle:painting -intitle:building"],
  ["piano", "intitle:piano intitle:keyboard"],
]) {
  if (selected && !selected.includes(kind)) continue;
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: search + " filetype:bitmap",
    gsrnamespace: "6",
    gsrlimit: "20",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "800",
  });
  const json = await (
    await sourceFetch("https://commons.wikimedia.org/w/api.php?" + params)
  ).json();
  let saved = false;
  for (const page of Object.values(json.query?.pages || {})) {
    const info = page.imageinfo?.[0],
      meta = info?.extmetadata || {};
    if (
      kind === "forest" &&
      /frog|bird|animal|flower|butterfly|insect|portrait|mushroom/i.test(page.title)
    )
      continue;
    const license = plain(meta.LicenseShortName?.value);
    if (
      !info ||
      !/^(CC BY(?:-SA)? [234]\.0|CC0|Public domain)$/.test(license) ||
      plain(meta.Restrictions?.value) ||
      !plain(meta.Artist?.value) ||
      /painting|painter|oil on canvas|art reproduction/i.test(
        plain(meta.ImageDescription?.value) +
          plain(meta.Artist?.value) +
          plain(meta.Categories?.value),
      )
    )
      continue;
    const url = info.thumburl || info.url;
    const response = await sourceFetch(url);
    if (!response.ok) continue;
    const original = Buffer.from(await response.arrayBuffer());
    const escape = (value) =>
      String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:source>${escape(info.descriptionurl)}</dc:source><dc:creator>${escape(plain(meta.Artist?.value))}</dc:creator><dc:rights>${escape(license)} ${escape(meta.LicenseUrl?.value || "Public domain")}</dc:rights></rdf:Description></rdf:RDF></x:xmpmeta>`;
    const bytes = await sharp(original)
      .rotate()
      .resize(800, 600, { fit: "cover" })
      .withXmp(xmp)
      .webp({ quality: 82 })
      .toBuffer();
    await writeFile(`public/artwork/${kind}.webp`, bytes);
    const credit = {
      kind,
      title: page.title,
      artist: plain(meta.Artist?.value),
      license,
      licenseUrl:
        meta.LicenseUrl?.value?.replace(/^\/\//, "https://") ||
        "https://creativecommons.org/publicdomain/mark/1.0/",
      provenanceUrl: info.descriptionurl,
      originalUrl: info.url,
      changes: "Resized, cropped and converted to WebP.",
      metadata: meta,
    };
    const existing = credits.findIndex((item) => item.kind === kind);
    if (existing < 0) credits.push(credit);
    else credits[existing] = credit;
    await atomicJson("content/artwork-credits.json", credits);
    console.log(JSON.stringify({ event: "artwork_prepared", kind, bytes: bytes.length }));
    saved = true;
    break;
  }
  if (!saved) throw new Error(`No verified artwork for ${kind}`);
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
