import 'dotenv/config';
import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { routes } from './route.js';
import { swaggerConfig, swaggerUiConfig } from './config.js';
import { db } from './db/db.js';

const fastify = Fastify({
    logger: true
});

// Make db available to routes
fastify.decorate('db', db);

console.log('Testing database connection...');
try {
    await db.execute('SELECT NOW()');
    console.log('✓ Database connected successfully');
} catch (err) {
    console.error('✗ Database connection failed:', err.message);
    process.exit(1);
}

// Register Swagger
await fastify.register(swagger, swaggerConfig);
await fastify.register(swaggerUi, swaggerUiConfig);

// Register routes
await fastify.register(routes);

// Start server
const start = async () => {
    try {
        const port = process.env.PORT || 3000;
        await fastify.listen({ port, host: '0.0.0.0' });
        console.log(`Server listening on port ${port}`);
        console.log(`Swagger documentation available at http://localhost:${port}/docs`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
