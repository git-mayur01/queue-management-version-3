import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 1. Verify caller JWT is Admin
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization } } }
    );
    
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized user or invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: "Forbidden. Admin role required." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 2. Perform Account Creation / Password Updates using Administrative Client
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { cashier, kitchen, display } = await req.json();
    const roles = { cashier, kitchen, display };

    for (const [roleName, config] of Object.entries(roles)) {
      if (!config) continue;
      const username = config.username?.trim();
      if (!username) {
        return new Response(JSON.stringify({ error: `Username for ${roleName} cannot be empty.` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const { data: existingProfile } = await adminClient
        .from('profiles')
        .select('id')
        .eq('role', roleName)
        .maybeSingle();

      if (existingProfile) {
        const updateParams: any = {
          email: `${username.toLowerCase()}@restaurant.com`,
          user_metadata: { name: username, role: roleName }
        };
        if (config.password?.trim()) {
          updateParams.password = config.password.trim();
        }
        const { error: updateAuthErr } = await adminClient.auth.admin.updateUserById(existingProfile.id, updateParams);
        if (updateAuthErr) {
          throw new Error(`Failed to update Auth for ${roleName}: ${updateAuthErr.message}`);
        }

        const { error: updateProfileErr } = await adminClient
          .from('profiles')
          .update({ name: username })
          .eq('id', existingProfile.id);
        if (updateProfileErr) {
          throw new Error(`Failed to update profile for ${roleName}: ${updateProfileErr.message}`);
        }
      } else {
        if (!config.password?.trim()) {
          return new Response(JSON.stringify({ error: `A password is required to create a new role account for ${roleName}.` }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const { data: newUser, error: createAuthErr } = await adminClient.auth.admin.createUser({
          email: `${username.toLowerCase()}@restaurant.com`,
          password: config.password.trim(),
          email_confirm: true,
          user_metadata: { name: username, role: roleName }
        });

        if (createAuthErr || !newUser.user) {
          throw new Error(`Failed to create Auth account for ${roleName}: ${createAuthErr?.message}`);
        }

        const { error: insertProfileErr } = await adminClient.from('profiles').insert({
          id: newUser.user.id,
          name: username,
          role: roleName
        });

        if (insertProfileErr) {
          throw new Error(`Failed to save profile record for ${roleName}: ${insertProfileErr.message}`);
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
