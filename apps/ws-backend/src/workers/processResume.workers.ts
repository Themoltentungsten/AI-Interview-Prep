import { subscriber } from "../config/redis.config.js";
import { storeToDB } from "../worker-helper/storeDb.worker-helper.js";

subscriber.subscribe('resume:processed', (err) => {
    if (err) console.error('Subscribe failed:', err);
    console.log('Listening for resume events...');
});

subscriber.on('message', async (channel, message) => {
    const { event_type, payload } = JSON.parse(message);

    switch (event_type) {
        case 'neon.store':
            const result = await storeToDB(payload);
            if (result?.success) {
                console.log('Resume stored for user:', payload.user_id);
                const { io } = await import("../index.js");
                io.emit('resume_processed', { status: 'success', userId: payload.user_id });
            } else {
                console.log('Failed to store for user:', payload.user_id);
                const { io } = await import("../index.js");
                io.emit('resume_processed', { status: 'error', userId: payload.user_id });
            }
            break;

        default:
            console.warn('Unknown event type:', event_type);
    }
});
