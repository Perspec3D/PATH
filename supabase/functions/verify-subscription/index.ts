import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    if (!MP_ACCESS_TOKEN) {
        return new Response(JSON.stringify({ error: "Missing MP_ACCESS_TOKEN" }), { status: 500, headers: corsHeaders });
    }

    try {
        const { companyId, subscriptionId } = await req.json();

        if (!companyId) throw new Error("Missing companyId");

        let targetSubscriptionId = subscriptionId;

        // If no subscriptionId provided, try to find it in the profile
        if (!targetSubscriptionId) {
            const { data: profile } = await supabase.from('profiles').select('subscription_id').eq('id', companyId).single();
            targetSubscriptionId = profile?.subscription_id;
        }

        if (!targetSubscriptionId) {
            throw new Error("No subscription ID found to verify");
        }

        console.log(`Verifying subscription ${targetSubscriptionId} for company ${companyId}`);

        const response = await fetch(`https://api.mercadopago.com/preapproval/${targetSubscriptionId}`, {
            headers: {
                'Authorization': `Bearer ${MP_ACCESS_TOKEN}`
            }
        });

        const subscription = await response.json();

        if (!response.ok) {
            throw new Error(subscription.message || "Failed to fetch from Mercado Pago");
        }

        let licenseStatus = 'TRIAL';
        if (subscription.status === 'authorized') licenseStatus = 'ACTIVE';
        if (subscription.status === 'cancelled') licenseStatus = 'CANCELLED';
        if (subscription.status === 'paused') licenseStatus = 'SUSPENDED';

        // Update database with fresh data from MP
        const { data: updatedProfile, error: updateError } = await supabase.from('profiles').update({
            license_status: licenseStatus,
            subscription_id: subscription.id,
            subscription_end: subscription.next_payment_date
        }).eq('id', companyId).select().single();

        if (updateError) throw updateError;

        return new Response(JSON.stringify({
            success: true,
            status: licenseStatus,
            profile: updatedProfile
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
