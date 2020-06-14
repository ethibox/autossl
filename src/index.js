import '@babel/polyfill';
import 'dotenv/config';
import amqp from 'amqplib';
import autoSsl from './autossl';

(async () => {
    const opt = { credentials: amqp.credentials.plain(process.env.RABBITMQ_USER || 'admin', process.env.RABBITMQ_PASSWORD || 'myp@ssw0rd') };

    const conn = await amqp.connect(`amqp://${process.env.RABBITMQ_HOST || 'localhost'}`, opt);

    const ch = await conn.createChannel();

    const queue = 'autossl';

    await ch.assertQueue(queue, { durable: false });

    await ch.prefetch(1);

    console.log(' [*] Waiting for messages in %s. To exit press CTRL+C', queue);

    await ch.consume(queue, async (msg) => {
        const data = msg.content.toString();
        const { json } = JSON.parse(data.substr(8));
        const { rootDomain, newDomain } = json.body;

        if (rootDomain && newDomain) {
            console.log({ rootDomain, newDomain });
            await autoSsl(rootDomain, newDomain);
        }

        ch.ack(msg);
    }, {
        noAck: false,
    });
})();
