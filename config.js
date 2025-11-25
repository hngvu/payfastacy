export const swaggerConfig = {
    swagger: {
        info: {
            title: 'PayFastacy API',
            description: 'Payment processing API documentation',
            version: '1.0.0'
        },
        schemes: ['http', 'https'],
        consumes: ['application/json'],
        produces: ['application/json'],
        securityDefinitions: {
            apiKey: {
                type: 'apiKey',
                name: 'x-api-key',
                in: 'header',
                description: 'API Key for authentication'
            }
        },
        security: [
            {
                apiKey: []
            }
        ]
    }
};

export const swaggerUiConfig = {
    routePrefix: '/docs',
    uiConfig: {
        docExpansion: 'list',
        deepLinking: false
    },
    staticCSP: true,
    transformStaticCSP: (header) => header
};
