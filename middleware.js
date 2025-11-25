import 'dotenv/config';

export async function apiKeyMiddleware(request, reply) {
    const apiKey = request.headers['x-api-key'];
    const validApiKey = process.env.APP_KEY;

    if (!apiKey) {
        return reply.code(401).send({
            error: 'Unauthorized',
            message: 'API key is required'
        });
    }

    if (apiKey !== validApiKey) {
        return reply.code(403).send({
            error: 'Forbidden',
            message: 'Invalid API key'
        });
    }
}