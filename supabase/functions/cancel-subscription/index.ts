
const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN') || 'APP_USR-6265238305428901-012722-15149a2c3d23eaa16f972ef607f58d7a-1693333949';

Deno.serve(async (req) => {
    // Dynamic CORS (simplified for debugging, but keeping reflective logic)
    const origin = req.headers.get('Origin') || '*';
    const reqHeaders = req.headers.get('Access-Control-Request-Headers') || 'authorization, x-client-info, apikey, content-type';

    const headers = {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': reqHeaders,
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
        'Access-Control-Allow-Credentials': 'true',
    }

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers });
    }

    try {
        const bodyText = await req.text();
        console.log("Raw Body:", bodyText);

        let body;
        try {
            body = JSON.parse(bodyText);
        } catch (e) {
            throw new Error("Invalid JSON body");
        }

        const { subscriptionId } = body;
        console.log("Received subscriptionId:", subscriptionId);

        if (!subscriptionId) {
            console.error("Missing subscriptionId in payload");
            throw new Error("Missing subscriptionId");
        }

        console.log(`Attempting to cancel subscription: ${subscriptionId}`);

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
        console.log("MP Response Status:", response.status);
        console.log("MP Response Data:", JSON.stringify(data));

        if (!response.ok) {
            console.error("MP Cancel Error", data);
            throw new Error(data.message || "Error cancelling subscription");
        }

        return new Response(JSON.stringify(data), {
            headers: { ...headers, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error("Edge Function Error:", error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...headers, 'Content-Type': 'application/json' }
        });
    }
});
