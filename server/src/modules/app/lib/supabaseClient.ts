import { createClient } from "@supabase/supabase-js";

// Create a supabase client to connect with database
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);
