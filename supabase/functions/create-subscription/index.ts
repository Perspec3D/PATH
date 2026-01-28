
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN') || 'APP_USR-6265238305428901-012722-15149a2c3d23eaa16f972ef607f58d7a-1693333949';

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
                'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
            }
        });
    }

    try {
        const { userCount, companyEmail, companyId } = await req.json();

        if (!userCount || !companyEmail || !companyId) {
            throw new Error("Missing params");
        }

        const pricePerUser = 29.90;
        const totalAmount = userCount * pricePerUser;

        const response = await fetch('https://api.mercadopago.com/preapproval', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${MP_ACCESS_TOKEN}`
            },
            body: JSON.stringify({
                reason: `PERSPEC PATH - Assinatura (${userCount} usuários)`,
                auto_recurring: {
                    frequency: 1,
                    frequency_type: 'months',
                    transaction_amount: totalAmount,
                    currency_id: 'BRL'
                },
                back_url: 'https://v0-perspec-path.vercel.app', // Update with actual URL
                payer_email: companyEmail,
                external_reference: JSON.stringify({ companyId, userCount }),
                status: 'pending'
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('MP Error:', data);
            throw new Error(data.message || 'Error creating subscription');
        }

        return new Response(JSON.stringify({ init_point: data.init_point }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    }
});
