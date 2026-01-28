const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN');

Deno.serve(async (req) => {
    // Dynamic CORS
    const origin = req.headers.get('Origin') || '*';
    const reqHeaders = req.headers.get('Access-Control-Request-Headers') || 'authorization, x-client-info, apikey, content-type';

    const corsHeaders = {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': reqHeaders,
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
        'Access-Control-Allow-Credentials': 'true',
    }

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (!MP_ACCESS_TOKEN) {
        return new Response(JSON.stringify({ error: "MP_ACCESS_TOKEN not set" }), { status: 500, headers: corsHeaders });
    }

    try {
        const { userCount, companyEmail, companyId, backUrl } = await req.json();

        if (!userCount || !companyEmail || !companyId) {
            throw new Error("Missing mandatory parameters (userCount, email, companyId)");
        }

        const pricePerUser = 29.90;
        const totalAmount = userCount * pricePerUser;

        // Using Preapproval (Subscriptions) API
        const response = await fetch('https://api.mercadopago.com/preapproval', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${MP_ACCESS_TOKEN}`
            },
            body: JSON.stringify({
                reason: `PERSPEC PATH - Assinatura Mensal (${userCount} usuários)`,
                auto_recurring: {
                    frequency: 1,
                    frequency_type: 'months',
                    transaction_amount: totalAmount,
                    currency_id: 'BRL'
                },
                // MP will return to these URLs
                back_url: backUrl || 'https://v0-perspec-path.vercel.app',
                payer_email: companyEmail,
                external_reference: JSON.stringify({ companyId, userCount }),
                status: 'pending'
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('MP Subscription Creation Error:', data);
            throw new Error(data.message || 'Error communicating with Mercado Pago');
        }

        return new Response(JSON.stringify({ init_point: data.init_point }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
