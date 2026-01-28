
const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN') || 'APP_USR-6265238305428901-012722-15149a2c3d23eaa16f972ef607f58d7a-1693333949';

Deno.serve(async (req) => {
    // Dynamic CORS: Reflect Origin and Headers
    const origin = req.headers.get('Origin') || '*';
    const reqHeaders = req.headers.get('Access-Control-Request-Headers') || 'authorization, x-client-info, apikey, content-type';

    const corsHeaders = {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': reqHeaders,
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
    }

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
        const { subscriptionId } = await req.json();

        if (!subscriptionId) {
            throw new Error("Missing subscriptionId");
        }

        const response = await fetch(`https://api.mercadopago.com/preapproval/${subscriptionId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${MP_ACCESS_TOKEN}`
            },
            body: JSON.stringify({
                status: 'cancelled'
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("MP Cancel Error", data);
            throw new Error(data.message || "Error cancelling subscription");
        }

        return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
