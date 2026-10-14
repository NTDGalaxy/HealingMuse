"use client";
import { createBrowserClient } from "@supabase/ssr";
import { isConfigured, supabaseKey, supabaseUrl } from "./config";

export function browserClient() {
  return isConfigured ? createBrowserClient(supabaseUrl!, supabaseKey!) : null;
}
