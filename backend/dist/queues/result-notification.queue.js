"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RESULT_NOTIFICATION_QUEUE_NAME = void 0;
exports.getResultNotificationQueue = getResultNotificationQueue;
exports.enqueueResultNotification = enqueueResultNotification;
exports.startResultNotificationWorker = startResultNotificationWorker;
exports.closeResultNotificationQueue = closeResultNotificationQueue;
const bullmq_1 = require("bullmq");
const redis_1 = require("../config/redis");
exports.RESULT_NOTIFICATION_QUEUE_NAME = 'result-whatsapp-notifications';
let queue = null;
let worker = null;
function getResultNotificationQueue() {
    if (!queue) {
        queue = new bullmq_1.Queue(exports.RESULT_NOTIFICATION_QUEUE_NAME, {
            connection: (0, redis_1.getRedisConnectionOptions)(),
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 2000,
                },
                removeOnComplete: 1000,
                removeOnFail: 5000,
            },
        });
    }
    return queue;
}
async function enqueueResultNotification(data) {
    try {
        const job = await getResultNotificationQueue().add('send-result-notification', data, {
            jobId: data.notificationLogId,
        });
        console.log(`[result-notification-queue] Enqueued job ${job.id} for log ${data.notificationLogId}`);
        return job.id ?? null;
    }
    catch (err) {
        console.error('[result-notification-queue] Failed to enqueue job:', err);
        return null;
    }
}
function startResultNotificationWorker(processor) {
    if (worker)
        return worker;
    try {
        worker = new bullmq_1.Worker(exports.RESULT_NOTIFICATION_QUEUE_NAME, processor, {
            connection: (0, redis_1.getRedisConnectionOptions)(),
            concurrency: 5,
        });
        worker.on('completed', (job) => {
            console.log(`[result-notification-queue] Job ${job.id} completed`);
        });
        worker.on('failed', (job, err) => {
            console.error(`[result-notification-queue] Job ${job?.id ?? 'unknown'} failed after ${job?.attemptsMade ?? 0} attempt(s):`, err.message);
        });
        worker.on('error', (err) => {
            console.error('[result-notification-queue] Worker error:', err);
        });
        console.log('[result-notification-queue] Worker started (concurrency=5, retries=3, exponential backoff)');
        return worker;
    }
    catch (err) {
        console.error('[result-notification-queue] Failed to start worker:', err);
        return null;
    }
}
async function closeResultNotificationQueue() {
    await worker?.close();
    await queue?.close();
    worker = null;
    queue = null;
}
