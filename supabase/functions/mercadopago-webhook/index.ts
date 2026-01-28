
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN') || 'APP_USR-6265238305428901-012722-15149a2c3d23eaa16f972ef607f58d7a-1693333949';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
    const url = new URL(req.url);
    const topic = url.searchParams.get('topic') || url.searchParams.get('type');
    const id = url.searchParams.get('id') || url.searchParams.get('data.id');

    if (topic === 'preapproval') {
        try {
            const response = await fetch(`https://api.mercadopago.com/preapproval/${id}`, {
                headers: {
                    'Authorization': `Bearer ${MP_ACCESS_TOKEN}`
                }
            });
            const subscription = await response.json();

            if (subscription.external_reference) {
                let referenceData;
                try {
                    referenceData = JSON.parse(subscription.external_reference);
                } catch (e) {
                    console.error("Error parsing external_reference", e);
                    return new Response('ok'); // Ignore if invalid
                }

                const { companyId, userCount } = referenceData;

                let licenseStatus = 'TRIAL';
                // Map MP status to App status
                if (subscription.status === 'authorized') licenseStatus = 'ACTIVE';
                if (subscription.status === 'cancelled') licenseStatus = 'CANCELLED';
                if (subscription.status === 'paused') licenseStatus = 'SUSPENDED'; // Or SUSPENDED

                // Se o pagamento falhou ou está pendente (não autorizado)
                // Precisamos verificar o status do pagamento, mas aqui estamos olhando a assinatura (preapproval)

                await supabase.from('profiles').update({
                    license_status: licenseStatus,
                    user_limit: userCount,
                    subscription_id: subscription.id,
                    subscription_end: subscription.next_payment_date
                }).eq('id', companyId);
            }
        } catch (error) {
            console.error('Webhook Error:', error);
        }
    }

    return new Response('ok');
});
