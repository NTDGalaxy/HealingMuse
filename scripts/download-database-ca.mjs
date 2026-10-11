import { X509Certificate } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

// Published in Supabase's official dashboard custom-content.json.
const source =
  "https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt";
const path = ".local/supabase-ca.crt";
try {
  const response = await fetch(source, { redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("certificate_download_failed");
  const pem = await response.text();
  if (Buffer.byteLength(pem) > 16384) throw new Error("certificate_invalid");
  const certificate = new X509Certificate(pem);
  if (
    !certificate.ca ||
    !certificate.subject.includes("Supabase Root") ||
    !certificate.verify(certificate.publicKey) ||
    Date.parse(certificate.validFrom) > Date.now() ||
    Date.parse(certificate.validTo) <= Date.now()
  )
    throw new Error("certificate_invalid");
  await mkdir(".local", { recursive: true });
  try {
    await writeFile(path, pem, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = new X509Certificate(await readFile(path, "utf8"));
    if (existing.fingerprint256 !== certificate.fingerprint256)
      throw new Error("existing_certificate_requires_review");
  }
  console.log(JSON.stringify({ downloaded: true, fingerprint256: certificate.fingerprint256 }));
} catch {
  console.error(JSON.stringify({ event: "database_ca_download_failed" }));
  process.exitCode = 1;
}
