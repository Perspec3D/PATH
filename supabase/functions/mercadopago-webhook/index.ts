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
        console.error("CRITICAL: MP_ACCESS_TOKEN not set in environment");
        return new Response("Config Error", { status: 500 });
    }

    const url = new URL(req.url);
    const topic = url.searchParams.get('topic') || url.searchParams.get('type');
    const id = url.searchParams.get('id') || url.searchParams.get('data.id');

    console.log(`Webhook Received: Topic=${topic}, ID=${id}`);

    // We care about subscription notifications
    if (topic === 'preapproval' || topic === 'subscription_preapproval' || topic === 'subscription_authorized_payment') {
        try {
            // If it's a payment, we might need a different endpoint, but focusing on Preapproval/Subscription state
            const targetId = id;
            const response = await fetch(`https://api.mercadopago.com/preapproval/${targetId}`, {
                headers: {
                    'Authorization': `Bearer ${MP_ACCESS_TOKEN}`
                }
            });
            const subscription = await response.json();

            if (!response.ok) {
                console.error("MP Fetch Error:", subscription);
                return new Response('fetch error');
            }

            if (subscription.external_reference) {
                let referenceData;
                try {
                    referenceData = JSON.parse(subscription.external_reference);
                } catch (e) {
                    console.error("Error parsing external_reference", e);
                    return new Response('ok');
                }

                const { companyId, userCount } = referenceData;
                console.log(`Syncing Company ${companyId} - Status: ${subscription.status}`);

                let licenseStatus = 'TRIAL';
                if (subscription.status === 'authorized') licenseStatus = 'ACTIVE';
                if (subscription.status === 'cancelled') licenseStatus = 'CANCELLED';
                if (subscription.status === 'paused') licenseStatus = 'SUSPENDED';

                const { error: updateError } = await supabase.from('profiles').update({
                    license_status: licenseStatus,
                    user_limit: userCount || 1,
                    subscription_id: subscription.id,
                    subscription_end: subscription.next_payment_date
                }).eq('id', companyId);

                if (updateError) {
                    console.error("Database Update Error:", updateError);
                } else {
                    console.log(`Successfully updated company ${companyId} to ${licenseStatus}`);
                }
            }
        } catch (error) {
            console.error('Webhook Internal Error:', error);
        }
    }

    return new Response('ok');
});
