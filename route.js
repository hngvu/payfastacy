import { apiKeyMiddleware } from './middleware.js';
import { customAlphabet } from 'nanoid';
import { payment } from './db/schema.js';
import { eq, and, gte, lte, like, isNull } from 'drizzle-orm';

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', parseInt(process.env.CONTENT_LENGTH) || 11);

async function generateUniqueContent(db) {
    let content;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;

    while (!isUnique && attempts < maxAttempts) {
        content = nanoid();
        
        // Check if content already exists in database
        const existing = await db.select()
            .from(payment)
            .where(eq(payment.content, content))
            .limit(1);

        if (existing.length === 0) {
            isUnique = true;
        }
        attempts++;
    }

    if (!isUnique) {
        throw new Error('Failed to generate unique content after multiple attempts');
    }

    return content;
}

export async function routes(fastify, options) {
    
    // POST /init - Create payment request
    fastify.post('/init', {
        preHandler: apiKeyMiddleware,
        schema: {
            description: 'Initialize a new payment request',
            tags: ['Payment'],
            body: {
                type: 'object',
                required: ['amount', 'ref'],
                properties: {
                    amount: { type: 'number', description: 'Payment amount' }, // >= 2000 VND
                    ref: { type: 'string', description: 'Reference code' },
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: { type: 'object' }
                    }
                }
            },
            security: [{ apiKey: [] }]
        }
    }, async (request, reply) => {
        try {
            const { amount, ref } = request.body;

            // Check if ref already exists
            const existingRef = await request.server.db.select()
                .from(payment)
                .where(eq(payment.ref, ref))
                .limit(1);

            if (existingRef.length > 0) {
                return reply.code(400).send({
                    success: false,
                    error: 'Reference code already exists'
                });
            }

            // Generate unique content
            const content = await generateUniqueContent(request.server.db);

            await request.server.db.insert(payment).values({
                amount,
                ref,
                content
            });

            return reply.send({
                success: true,
                data: {
                    content,
                    ref,
                    amount
                }
            });
        } catch (error) {
            return reply.code(500).send({
                success: false,
                error: error.message
            });
        }
    });

    // POST /callback - SePay webhook callback
    fastify.post('/callback', {
        schema: {
            description: 'Webhook callback from SePay payment gateway',
            tags: ['Payment'],
            body: {
                type: 'object',
                properties: {
                    id: { type: 'number' },
                    gateway: { type: 'string' },
                    transactionDate: { type: 'string' },
                    accountNumber: { type: 'string' },
                    code: { type: ['string', 'null'] },
                    content: { type: 'string' },
                    transferType: { type: 'string' },
                    transferAmount: { type: 'number' },
                    accumulated: { type: 'number' },
                    subAccount: { type: ['string', 'null'] },
                    referenceCode: { type: 'string' },
                    description: { type: 'string' }
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' }
                    }
                }
            },
            security: [{ apiKey: [] }]
        }
    }, async (request, reply) => {
        try {
            const { content: webhookContent, transferAmount, referenceCode } = request.body;
            
            // Log SePay webhook origin
            request.log.info({
                event: 'sepay_webhook',
                ip: request.headers['x-forwarded-for'] || request.ip,
                origin: request.headers.origin,
                referer: request.headers.referer,
                userAgent: request.headers['user-agent'],
                body: request.body
            });

            // Find matching payment by content
            // Extract payment content from webhook content (webhook content contains more text)
            const payments = await request.server.db.select()
                .from(payment)
                .where(
                    and(
                        eq(payment.amount, transferAmount),
                        eq(payment.status, false)
                    )
                )
                .then(results => results.filter(p => webhookContent.includes(p.content)));

            if (payments.length === 0) {
                return reply.code(404).send({
                    success: false,
                    message: 'Payment not found or already processed'
                });
            }

            // Update payment with transaction ID
            await request.server.db.update(payment)
                .set({
                    txnId: referenceCode,
                    status: true,
                    updatedAt: new Date()
                })
                .where(eq(payment.id, payments[0].id));

            return reply.send({
                success: true,
                message: 'Payment processed successfully'
            });
        } catch (error) {
            return reply.code(500).send({
                success: false,
                error: error.message
            });
        }
    });

    // GET /search - Search payments
    fastify.get('/search', {
        preHandler: apiKeyMiddleware,
        schema: {
            description: 'Search payments with filters',
            tags: ['Payment'],
            querystring: {
                type: 'object',
                properties: {
                    ref: { type: 'string', description: 'Reference code' },
                    content: { type: 'string', description: 'Payment content' },
                    status: { type: 'string', enum: ['paid', 'unpaid'], description: 'Payment status' },
                    from: { type: 'string', format: 'date', description: 'Start date (YYYY-MM-DD)' },
                    to: { type: 'string', format: 'date', description: 'End date (YYYY-MM-DD)' }
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: { type: 'array' },
                        count: { type: 'number' }
                    }
                }
            },
            security: [{ apiKey: [] }]
        }
    }, async (request, reply) => {
        try {
            const { ref, content, status, from, to } = request.query;

            const conditions = [];

            if (ref) {
                conditions.push(like(payment.ref, `%${ref}%`));
            }

            if (content) {
                conditions.push(like(payment.content, `%${content}%`));
            }

            if (status === 'paid') {
                conditions.push(eq(payment.status, true));
            } else if (status === 'unpaid') {
                conditions.push(eq(payment.status, false));
            }

            if (from) {
                conditions.push(gte(payment.createdAt, new Date(from + "T00:00:00+07:00") ));
            }

            if (to) {
                conditions.push(lte(payment.createdAt, new Date(to + "T23:59:59+07:00")));
            }

            const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

            const payments = await request.server.db.select()
                .from(payment)
                .where(whereClause)
                .orderBy(payment.createdAt);

            return reply.send({
                success: true,
                data: payments.map(formatPaymentResponse),
                count: payments.length
            });
        } catch (error) {
            return reply.code(500).send({
                success: false,
                error: error.message
            });
        }
    });

    // GET /txn/:txnId - Get SePay transaction details
    fastify.get('/txn/:txnId', {
        preHandler: apiKeyMiddleware,
        schema: {
            description: 'Get transaction details from SePay',
            tags: ['Transaction'],
            params: {
                type: 'object',
                required: ['txnId'],
                properties: {
                    txnId: { type: 'string', description: 'SePay transaction ID' }
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: { type: 'object' }
                    }
                }
            },
            security: [{ apiKey: [] }]
        }
    }, async (request, reply) => {
        try {
            const { txnId } = request.params;
            const sepayApiKey = process.env.SEPAY_API_KEY;

            if (!sepayApiKey) {
                return reply.code(500).send({
                    success: false,
                    error: 'SEPAY_API_KEY not configured'
                });
            }

            // Call SePay API
            const response = await fetch(`https://my.sepay.vn/userapi/transactions/details/${txnId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${sepayApiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                return reply.code(response.status).send({
                    success: false,
                    error: `SePay API error: ${response.statusText}`
                });
            }

            const data = await response.json();

            if (data.status !== 200 || !data.messages?.success) {
                return reply.code(400).send({
                    success: false,
                    error: data.error || 'Failed to fetch transaction details'
                });
            }

            return reply.send({
                success: true,
                data: data.transaction
            });
        } catch (error) {
            return reply.code(500).send({
                success: false,
                error: error.message
            });
        }
    });
}
